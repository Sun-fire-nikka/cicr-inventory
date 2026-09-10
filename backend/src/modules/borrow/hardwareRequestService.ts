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

const resolveStoragePath = (fileName: string) => {
  const localPath = path.resolve(process.cwd(), fileName);
  if (fs.existsSync(localPath)) return localPath;
  const backendPath = path.resolve(process.cwd(), 'backend', fileName);
  if (fs.existsSync(backendPath)) return backendPath;
  return path.resolve(__dirname, '..', '..', '..', fileName);
};

const STORAGE_FILE = resolveStoragePath('hardware_requests_data.json');

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

export const getAllHardwareRequests = async (): Promise<HardwareIssueRequest[]> => {
  const localList = Object.values(requestsState);

  // Also query pending rows from Supabase borrow_records
  try {
    const { data: dbRecords } = await dbRead
      .from('borrow_records')
      .select('*, inventory(name, category)')
      .eq('status', 'PENDING')
      .order('borrowed_at', { ascending: false });

    if (dbRecords && dbRecords.length > 0) {
      for (const rec of dbRecords) {
        const exists = localList.some(r => r.id === rec.id || (r.itemId === rec.inventory_id && r.purpose === rec.purpose));
        if (!exists) {
          localList.push({
            id: rec.id,
            itemId: rec.inventory_id,
            itemName: rec.inventory?.name || 'Hardware Component',
            category: rec.inventory?.category || 'Robotics',
            borrowerName: rec.borrower_name || 'Member',
            borrowerEmail: rec.roll_number ? `${rec.roll_number}@mail.jiit.ac.in` : 'student@mail.jiit.ac.in',
            rollNumber: rec.roll_number,
            userId: rec.user_id,
            quantity: rec.quantity || 1,
            purpose: rec.purpose || 'Testing',
            durationDays: 7,
            dueDate: rec.due_date ? rec.due_date.split('T')[0] : '',
            status: 'PENDING',
            requestedAt: rec.borrowed_at || new Date().toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.warn('[HARDWARE REQUEST] Error reading pending records from Supabase:', err);
  }

  return localList.sort((a, b) => {
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
  let req = requestsState[id];
  if (!req) {
    // Check if it exists in Supabase borrow_records with status = 'PENDING'
    const { data: dbRec } = await dbRead.from('borrow_records').select('*, inventory(name, category)').eq('id', id).maybeSingle();
    if (dbRec) {
      req = {
        id: dbRec.id,
        itemId: dbRec.inventory_id,
        itemName: dbRec.inventory?.name || 'Hardware Component',
        category: dbRec.inventory?.category || 'Robotics',
        borrowerName: dbRec.borrower_name || 'Member',
        borrowerEmail: dbRec.roll_number ? `${dbRec.roll_number}@mail.jiit.ac.in` : 'student@mail.jiit.ac.in',
        rollNumber: dbRec.roll_number,
        userId: dbRec.user_id,
        quantity: dbRec.quantity || 1,
        purpose: dbRec.purpose || 'Testing',
        durationDays: 7,
        dueDate: dbRec.due_date ? dbRec.due_date.split('T')[0] : '',
        status: dbRec.status,
        requestedAt: dbRec.borrowed_at || new Date().toISOString()
      };
      requestsState[id] = req;
    }
  }

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
  let req = requestsState[id];
  if (!req) {
    const { data: dbRec } = await dbRead.from('borrow_records').select('*, inventory(name, category)').eq('id', id).maybeSingle();
    if (dbRec) {
      req = {
        id: dbRec.id,
        itemId: dbRec.inventory_id,
        itemName: dbRec.inventory?.name || 'Hardware Component',
        category: dbRec.inventory?.category || 'Robotics',
        borrowerName: dbRec.borrower_name || 'Member',
        borrowerEmail: dbRec.roll_number ? `${dbRec.roll_number}@mail.jiit.ac.in` : 'student@mail.jiit.ac.in',
        rollNumber: dbRec.roll_number,
        userId: dbRec.user_id,
        quantity: dbRec.quantity || 1,
        purpose: dbRec.purpose || 'Testing',
        durationDays: 7,
        dueDate: dbRec.due_date ? dbRec.due_date.split('T')[0] : '',
        status: dbRec.status,
        requestedAt: dbRec.borrowed_at || new Date().toISOString()
      };
      requestsState[id] = req;
    }
  }

  if (!req) {
    return { success: false, error: 'Request not found.' };
  }

  if (req.status !== 'PENDING') {
    return { success: false, error: `Request has already been ${req.status.toLowerCase()}.` };
  }

  // If persisted in Supabase borrow_records, delete it
  try {
    await supabase.from('borrow_records').delete().eq('id', id);
  } catch (e) {
    // Non-blocking
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
