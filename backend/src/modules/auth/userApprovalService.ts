import fs from 'fs';
import path from 'path';

export const MASTER_ADMIN_EMAIL = 'vardaansaxena096@gmail.com';
export const SUPER_ADMIN_EMAILS = [
  'vardaansaxena096@gmail.com',
  'cicrinventory@gmail.com'
];

export const isSuperAdminEmail = (email: string): boolean => {
  const norm = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.some((admin) => admin.toLowerCase() === norm);
};

export interface UserApprovalRecord {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  role: 'ADMIN' | 'MEMBER';
  approvedAt?: string;
  approvedBy?: string;
  username?: string | null;
  batch?: string | null;
  name?: string | null;
  roll_number?: string | null;
}

const resolveStoragePath = (fileName: string) => {
  const localPath = path.resolve(process.cwd(), fileName);
  if (fs.existsSync(localPath)) return localPath;
  const backendPath = path.resolve(process.cwd(), 'backend', fileName);
  if (fs.existsSync(backendPath)) return backendPath;
  return path.resolve(__dirname, '..', '..', '..', fileName);
};

const STORAGE_FILE = resolveStoragePath('user_approval_data.json');

let approvalState: Record<string, UserApprovalRecord> = {};
let purgedEmails: Set<string> = new Set();

// Load persisted approval state
try {
  if (fs.existsSync(STORAGE_FILE)) {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.approvalState) {
      approvalState = parsed.approvalState;
      purgedEmails = new Set(parsed.purgedEmails || []);
    } else {
      approvalState = parsed;
    }
  }
} catch (err) {
  console.warn('[USER APPROVAL] Failed to load user approval file, using memory:', err);
}

const saveState = () => {
  try {
    fs.writeFileSync(
      STORAGE_FILE,
      JSON.stringify(
        {
          approvalState,
          purgedEmails: Array.from(purgedEmails)
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch (err) {
    console.warn('[USER APPROVAL] Failed to save user approval file:', err);
  }
};

export const isManagedUser = (email: string): boolean => {
  const normEmail = email.trim().toLowerCase();
  if (isSuperAdminEmail(normEmail)) return true;
  if (purgedEmails.has(normEmail)) return false;
  return Boolean(approvalState[normEmail]);
};

export const isPurgedUser = (email: string): boolean => {
  const normEmail = email.trim().toLowerCase();
  if (isSuperAdminEmail(normEmail)) return false;
  return purgedEmails.has(normEmail);
};

export const unpurgeEmail = (email: string) => {
  purgedEmails.delete(email.trim().toLowerCase());
  saveState();
};

export const getUserApproval = (email: string, initialRole: 'ADMIN' | 'MEMBER' = 'MEMBER'): UserApprovalRecord => {
  const normEmail = email.trim().toLowerCase();
  
  if (isSuperAdminEmail(normEmail)) {
    return {
      status: 'APPROVED',
      role: 'ADMIN',
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM'
    };
  }

  if (normEmail === 'mahakkatahara.mk@gmail.com') {
    return {
      status: 'REJECTED',
      role: 'MEMBER'
    };
  }

  if (!approvalState[normEmail]) {
    const isStudent = normEmail.endsWith('@mail.jiit.ac.in') || normEmail.endsWith('@jiit.ac.in');
    approvalState[normEmail] = {
      status: 'PENDING',
      role: isStudent ? 'MEMBER' : (initialRole === 'ADMIN' ? 'ADMIN' : 'MEMBER')
    };
    saveState();
  }

  return approvalState[normEmail];
};

export const setUserApproval = (
  email: string,
  status: 'PENDING' | 'APPROVED' | 'REJECTED',
  approvedBy?: string,
  metadata?: { username?: string | null; batch?: string | null; name?: string | null; roll_number?: string | null }
): UserApprovalRecord => {
  const normEmail = email.trim().toLowerCase();
  
  if (isSuperAdminEmail(normEmail)) {
    return {
      status: 'APPROVED',
      role: 'ADMIN',
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM',
      username: normEmail === 'vardaansaxena096@gmail.com' ? 'vardaan' : 'cicradmin',
      name: normEmail === 'vardaansaxena096@gmail.com' ? 'Vardaan' : 'CICR Admin'
    };
  }

  purgedEmails.delete(normEmail);

  const current = approvalState[normEmail] || { status: 'PENDING', role: 'MEMBER' };
  current.status = status;
  if (status === 'APPROVED') {
    current.approvedAt = new Date().toISOString();
    current.approvedBy = approvedBy || 'ADMIN';
  } else {
    current.approvedAt = undefined;
    current.approvedBy = undefined;
  }

  if (metadata) {
    if (metadata.username) current.username = metadata.username.trim();
    if (metadata.batch) current.batch = metadata.batch.trim();
    if (metadata.name) current.name = metadata.name.trim();
    if (metadata.roll_number) current.roll_number = metadata.roll_number.trim();
  }

  approvalState[normEmail] = current;
  saveState();
  return current;
};

export const setUserRole = (
  email: string,
  role: 'ADMIN' | 'MEMBER'
): UserApprovalRecord => {
  const normEmail = email.trim().toLowerCase();
  
  if (isSuperAdminEmail(normEmail)) {
    return {
      status: 'APPROVED',
      role: 'ADMIN',
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM'
    };
  }

  purgedEmails.delete(normEmail);

  if (normEmail === 'mahakkatahara.mk@gmail.com') {
    role = 'MEMBER';
  }

  const current = approvalState[normEmail] || { status: 'APPROVED', role: 'MEMBER' };
  current.role = role;
  approvalState[normEmail] = current;
  saveState();
  return current;
};

export const deleteUserApproval = (email: string): void => {
  const normEmail = email.trim().toLowerCase();
  if (isSuperAdminEmail(normEmail)) return;
  
  delete approvalState[normEmail];
  purgedEmails.add(normEmail);
  saveState();
};

export const getAllUserApprovals = (): Record<string, UserApprovalRecord> => {
  const base: Record<string, UserApprovalRecord> = {};
  SUPER_ADMIN_EMAILS.forEach((adm) => {
    base[adm.toLowerCase()] = {
      status: 'APPROVED',
      role: 'ADMIN',
      approvedAt: '2026-09-08T00:00:00.000Z',
      approvedBy: 'SYSTEM',
      username: adm.toLowerCase() === 'vardaansaxena096@gmail.com' ? 'vardaan' : 'cicradmin',
      name: adm.toLowerCase() === 'vardaansaxena096@gmail.com' ? 'Vardaan' : 'CICR Admin'
    };
  });
  return {
    ...approvalState,
    ...base
  };
};

export const findUserApprovalByIdentifier = (identifier: string): { email: string; record: UserApprovalRecord } | null => {
  const norm = identifier.trim().toLowerCase();
  
  if (norm === 'vardaan' || norm === 'vardaansaxena' || norm === 'vardaansaxena096@gmail.com') {
    return {
      email: 'vardaansaxena096@gmail.com',
      record: { status: 'APPROVED', role: 'ADMIN', username: 'vardaan', name: 'Vardaan' }
    };
  }
  if (norm === 'cicradmin' || norm === 'cicrinventory' || norm === 'cicr admin' || norm === 'cicrinventory@gmail.com') {
    return {
      email: 'cicrinventory@gmail.com',
      record: { status: 'APPROVED', role: 'ADMIN', username: 'cicradmin', name: 'CICR Admin' }
    };
  }

  for (const [email, rec] of Object.entries(approvalState)) {
    if (purgedEmails.has(email.toLowerCase())) continue;
    if (
      email.toLowerCase() === norm ||
      rec.username?.toLowerCase() === norm ||
      rec.name?.toLowerCase() === norm ||
      rec.roll_number?.toLowerCase() === norm
    ) {
      return { email, record: rec };
    }
  }

  return null;
};

