import { supabase } from '../app';

export interface AuditEventPayload {
  action: string;
  userId?: string | null;
  itemId?: string | null;
  description: string;
}

/**
 * Persists an event to the public.audit_logs table.
 * Guaranteed not to throw or block the caller.
 */
export const logAuditEvent = async ({
  action,
  userId,
  itemId,
  description
}: AuditEventPayload): Promise<void> => {
  try {
    const { error } = await supabase.from('audit_logs').insert([
      {
        action,
        user_id: userId || null,
        item_id: itemId || null,
        description,
        timestamp: new Date().toISOString()
      }
    ]);

    if (error) {
      console.warn('[AUDIT SERVICE] Supabase write error:', error.message);
    }
  } catch (err: any) {
    console.warn('[AUDIT SERVICE] Exception while writing audit log:', err?.message || err);
  }
};
