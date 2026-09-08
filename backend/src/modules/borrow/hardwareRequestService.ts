import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  sendAdminHardwareRequestAlert,
  sendHardwareRequestStatusEmail,
  sendBorrowConfirmation,
  sendAdminBorrowNotification,
  SUPER_ADMIN_EMAILS
} from '../../services/emailService';
import { dbRead } from '../../config/database';
import { supabase } from '../../app';
import { finalizeBorrow } from './borrow.controller';

export interface HardwareIssueRequest {
  id: string;
  itemId: string;
  itemName: string;
  category?: string;
  borrowerName: string;
  borrowerEmail: string;
  rollNumber?: string | null;
  userId?: string;
  quantity: number;
  purpose: string;
  durationDays: number;
  dueDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

const STORAGE_FILE = path.resolve(process.cwd(), 'hardware_requests_data.json');

let requestsState: Record<string, HardwareIssueRequest> = {};

// Load persisted requests state
try {
  if (fs.existsSync(STORAGE_FILE)) {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    requestsState = JSON.parse(raw);
  }
} catch (err) {
  console.warn('[HARDWARE REQUESTS] Failed to load request storage file, using memory:', err);
}

const saveState = () => {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(requestsState, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[HARDWARE REQUESTS] Failed to save request storage file:', err);
  }
};

export const createHardwareRequest = async (payload: {
  itemId: string;
  itemName?: string;
  borrowerName: string;
  borrowerEmail: string;
  rollNumber?: string | null;
  userId?: string;
  quantity: number;
  purpose: string;
  durationDays?: number;
  dueDate?: string;
}): Promise<HardwareIssueRequest> => {
  const id = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const requestedAt = new Date().toISOString();
  const durationDays = payload.durationDays || 7;

  let itemName = payload.itemName || 'Hardware Component';
  let category = 'Robotics';

  // Fetch actual item details from database if possible
  try {
    const { data: item } = await dbRead
      .from('inventory')
      .select('name, category')
      .eq('id', payload.itemId)
      .single();
    if (item) {
      itemName = item.name;
      category = item.category || 'Robotics';
    }
  } catch (e) {
    // Non-blocking
  }

  const defaultDueDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dueDate = payload.dueDate || defaultDueDate;

  const newRequest: HardwareIssueRequest = {
    id,
    itemId: payload.itemId,
    itemName,
    category,
    borrowerName: payload.borrowerName,
    borrowerEmail: payload.borrowerEmail,
    rollNumber: payload.rollNumber || null,
    userId: payload.userId,
    quantity: payload.quantity,
    purpose: payload.purpose,
    durationDays,
    dueDate,
    status: 'PENDING',
    requestedAt
  };

  requestsState[id] = newRequest;
  saveState();

  // Instant notification to Super Admins (Zero Emojis, Authentic High-Priority Cyber Notification)
  sendAdminHardwareRequestAlert(SUPER_ADMIN_EMAILS, {
    requestId: id,
    itemName,
    category,
    quantity: payload.quantity,
    borrowerName: payload.borrowerName,
    borrowerEmail: payload.borrowerEmail,
    rollNumber: payload.rollNumber,
    purpose: payload.purpose,
    durationDays,
    dueDate,
    requestedAt
  }).catch((err) => console.error('[HARDWARE REQUEST] Admin email alert failed:', err));

  return newRequest;
};

export const getAllHardwareRequests = (): HardwareIssueRequest[] => {
  return Object.values(requestsState).sort((a, b) => {
    return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
  });
};

export const getHardwareRequestById = (id: string): HardwareIssueRequest | undefined => {
  return requestsState[id];
};

export const approveHardwareRequest = async (
  id: string,
  adminName: string,
  adminEmail: string
): Promise<{ success: boolean; request?: HardwareIssueRequest; error?: string }> => {
  const req = requestsState[id];
  if (!req) {
    return { success: false, error: 'Request not found.' };
  }

  if (req.status !== 'PENDING') {
    return { success: false, error: `Request has already been ${req.status.toLowerCase()}.` };
  }

  // Finalize borrow in database / inventory
  const result = await finalizeBorrow({
    userId: req.userId || '',
    userName: req.borrowerName,
    itemId: req.itemId,
    quantity: req.quantity,
    purpose: req.purpose,
    durationDays: req.durationDays
  });

  if (result.error) {
    return { success: false, error: result.error.message };
  }

  req.status = 'APPROVED';
  req.reviewedAt = new Date().toISOString();
  req.reviewedBy = adminName || adminEmail || 'ADMIN';
  saveState();

  const { borrowRecord, item, newAvailableQty, dueDate } = result;

  // Send approval status email to borrower (with CC to admins)
  if (req.borrowerEmail) {
    sendHardwareRequestStatusEmail(
      req.borrowerEmail,
      req.borrowerName,
      req.itemName,
      req.quantity,
      'APPROVED',
      req.reviewedBy
    ).catch((e) => console.error('[EMAIL ERROR] Failed to send approval status email to borrower:', e));

    const { data: activeHolders } = await dbRead
      .from('borrow_records')
      .select('borrower_name, roll_number, quantity, borrowed_at')
      .eq('inventory_id', req.itemId)
      .eq('status', 'BORROWED')
      .neq('id', borrowRecord.id);

    sendBorrowConfirmation(req.borrowerEmail, req.borrowerName, {
      itemName: item.name,
      category: item.category,
      quantity: req.quantity,
      remainingStock: newAvailableQty,
      holders: activeHolders || [],
      durationDays: req.durationDays,
      dueDate
    }).catch((e) => console.error('[EMAIL ERROR] Failed to send borrower confirmation on approval:', e));
  }

  // Send admin borrow alert
  sendAdminBorrowNotification(SUPER_ADMIN_EMAILS, {
    borrowerName: req.borrowerName,
    borrowerEmail: req.borrowerEmail,
    rollNumber: req.rollNumber,
    itemName: item.name,
    category: item.category,
    quantity: req.quantity,
    remainingStock: newAvailableQty,
    purpose: req.purpose,
    durationDays: req.durationDays,
    dueDate
  }).catch((e) => console.error('[EMAIL ERROR] Failed to send admin borrow alert on approval:', e));

  return { success: true, request: req };
};

export const rejectHardwareRequest = async (
  id: string,
  adminName: string,
  adminEmail: string,
  reason?: string
): Promise<{ success: boolean; request?: HardwareIssueRequest; error?: string }> => {
  const req = requestsState[id];
  if (!req) {
    return { success: false, error: 'Request not found.' };
  }

  if (req.status !== 'PENDING') {
    return { success: false, error: `Request has already been ${req.status.toLowerCase()}.` };
  }

  req.status = 'REJECTED';
  req.reviewedAt = new Date().toISOString();
  req.reviewedBy = adminName || adminEmail || 'ADMIN';
  req.reviewNote = reason || 'Declined by administrator.';
  saveState();

  // Send rejection email to user
  if (req.borrowerEmail) {
    sendHardwareRequestStatusEmail(
      req.borrowerEmail,
      req.borrowerName,
      req.itemName,
      req.quantity,
      'REJECTED',
      req.reviewedBy,
      req.reviewNote
    ).catch((e) => console.error('[EMAIL ERROR] Failed to send rejection email to requester:', e));
  }

  // Log audit
  try {
    await supabase.from('audit_logs').insert([
      {
        action: 'Rejected Request',
        user_id: req.userId || null,
        item_id: req.itemId,
        description: `Admin ${adminName} rejected ${req.borrowerName}'s request for ${req.quantity}x ${req.itemName}.`
      }
    ]);
  } catch (e) {
    // Non-blocking
  }

  return { success: true, request: req };
};
