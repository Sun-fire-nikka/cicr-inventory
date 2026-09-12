// Neon management API client (v2.0.0).
//
// Provides HTTP client for Neon's REST management API to:
// 1. List compute endpoints (discover primary + replica)
// 2. Promote replica to primary (create new read-write endpoint)
// 3. Fence old primary (disable old endpoint)
//
// All credentials come from environment variables — never hardcoded.
import { neonConfig } from './neonPool';

// ------------------------------------------------------------ types
export interface NeonEndpoint {
  id: string;
  host: string;
  branch_id: string;
  type: 'read_write' | 'read_only';
  current_state: 'init' | 'active' | 'idle';
  region_id: string;
}

export interface NeonListEndpointsResponse {
  endpoints: NeonEndpoint[];
}

export interface NeonCreateEndpointResponse {
  endpoint: NeonEndpoint;
  operations: Array<{
    id: string;
    action: string;
    status: string;
    endpoint_id: string;
  }>;
}

// ------------------------------------------------------------ HTTP helpers
const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const REQUEST_TIMEOUT_MS = 30_000;

async function neonFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { method = 'GET', body, timeoutMs = REQUEST_TIMEOUT_MS } = options;

  if (!neonConfig.apiKey || !neonConfig.projectId) {
    throw new Error('Neon API key or project ID not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${NEON_API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${neonConfig.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Neon API ${method} ${path} failed: ${response.status} ${response.statusText} — ${errorBody}`,
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------ API operations
export async function listEndpoints(): Promise<NeonEndpoint[]> {
  const data = await neonFetch<NeonListEndpointsResponse>(
    `/projects/${neonConfig.projectId}/endpoints`,
  );
  return data.endpoints || [];
}

export async function findCurrentPrimary(): Promise<NeonEndpoint | null> {
  const endpoints = await listEndpoints();
  return endpoints.find((ep) => ep.type === 'read_write') || null;
}

export async function findReadReplica(): Promise<NeonEndpoint | null> {
  const endpoints = await listEndpoints();
  return endpoints.find((ep) => ep.type === 'read_only') || null;
}

export async function promoteReplica(branchId: string): Promise<{
  success: boolean;
  newEndpoint?: NeonEndpoint;
  error?: string;
}> {
  try {
    // Create a new read-write endpoint on the branch.
    // Neon enforces max 1 read-write endpoint per branch, so if one
    // already exists, this will fail — which is expected (old primary still up).
    const data = await neonFetch<NeonCreateEndpointResponse>(
      `/projects/${neonConfig.projectId}/endpoints`,
      {
        method: 'POST',
        body: {
          endpoint: {
            branch_id: branchId,
            type: 'read_write',
          },
        },
      },
    );

    // Wait for the endpoint to become active (up to 30s)
    const endpoint = data.endpoint;
    if (endpoint.current_state !== 'active') {
      console.log(`[NEON-API] Endpoint ${endpoint.id} state: ${endpoint.current_state} — waiting for active...`);
      const active = await waitForEndpointActive(endpoint.id, 30_000);
      if (!active) {
        return { success: false, error: `Endpoint ${endpoint.id} did not become active` };
      }
    }

    console.log(`[NEON-API] Promoted replica — new primary endpoint: ${endpoint.host}`);
    return { success: true, newEndpoint: endpoint };
  } catch (err: any) {
    console.error(`[NEON-API] Promotion failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function disableEndpoint(endpointId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await neonFetch(
      `/projects/${neonConfig.projectId}/endpoints/${endpointId}`,
      {
        method: 'PATCH',
        body: {
          endpoint: {
            disabled: true,
          },
        },
      },
    );
    console.log(`[NEON-API] Disabled endpoint ${endpointId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[NEON-API] Failed to disable endpoint ${endpointId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function deleteEndpoint(endpointId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await neonFetch(
      `/projects/${neonConfig.projectId}/endpoints/${endpointId}`,
      {
        method: 'DELETE',
      },
    );
    console.log(`[NEON-API] Deleted endpoint ${endpointId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[NEON-API] Failed to delete endpoint ${endpointId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ------------------------------------------------------------ helpers
async function waitForEndpointActive(
  endpointId: string,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const endpoints = await listEndpoints();
      const ep = endpoints.find((e) => e.id === endpointId);
      if (ep?.current_state === 'active') return true;
    } catch {
      // Transient API error — retry
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return false;
}
