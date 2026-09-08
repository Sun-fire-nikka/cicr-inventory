import fs from 'fs';
import path from 'path';

export const MASTER_ADMIN_EMAIL = 'cicrinventory@gmail.com';
export const SUPER_ADMIN_EMAILS = [
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
}

const STORAGE_FILE = path.resolve(process.cwd(), 'user_approval_data.json');

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

  if (!approvalState[normEmail]) {
    approvalState[normEmail] = {
      status: 'PENDING',
      role: initialRole === 'ADMIN' ? 'ADMIN' : 'MEMBER'
    };
    saveState();
  }

  return approvalState[normEmail];
};

export const setUserApproval = (
  email: string,
  status: 'PENDING' | 'APPROVED' | 'REJECTED',
  approvedBy?: string
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

  const current = approvalState[normEmail] || { status: 'PENDING', role: 'MEMBER' };
  current.status = status;
  if (status === 'APPROVED') {
    current.approvedAt = new Date().toISOString();
    current.approvedBy = approvedBy || 'ADMIN';
  } else {
    current.approvedAt = undefined;
    current.approvedBy = undefined;
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
      approvedBy: 'SYSTEM'
    };
  });
  return {
    ...base,
    ...approvalState
  };
};

