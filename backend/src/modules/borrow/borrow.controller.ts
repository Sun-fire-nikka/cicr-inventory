import { Request, Response } from 'express';
import { supabase } from '../../app';
import { dbRead } from '../../config/database';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendBorrowConfirmation, sendReturnConfirmation, sendOtpEmail } from '../../services/emailService';
import { ADMIN_DIRECTORY, getAdminById } from './adminDirectory';
import { generateOtp, storeOtp, verifyOtp as verifyOtpCode, consumeOtp } from './otpService';
import { cacheGetJSON, cacheSetJSON } from '../../config/redis';
import { invalidateItemsCache } from '../inventory/inventory.controller';

const ADMIN_DIRECTORY_CACHE_TTL = 60; // seconds

export const MIN_RENTAL_DAYS = 1;
export const MAX_RENTAL_DAYS = 30;
export const DEFAULT_RENTAL_DAYS = 5;

// Fire-and-forget wrapper: catches and logs errors without blocking the response.
function dispatchBackground(label: string, promise: Promise<unknown>): void {
  promise.catch((err) => console.error(`[BACKGROUND] ${label} failed:`, err));
}

// Helper function to insert into audit_logs
async function logAudit(action: string, userId: string | undefined, itemId: string | null, description: string) {
  try {
    await supabase.from('audit_logs').insert([
      { action, user_id: userId || null, item_id: itemId, description }
    ]);
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

const parseRentalDays = (value: any): number | null => {
  if (value === undefined || value === null || value === '') return DEFAULT_RENTAL_DAYS;
  const days = Number(value);
  if (!Number.isInteger(days) || days < MIN_RENTAL_DAYS || days > MAX_RENTAL_DAYS) return null;
  return days;
};

const daysErrorMessage = `duration_days must be an integer between ${MIN_RENTAL_DAYS} and ${MAX_RENTAL_DAYS}.`;

const finalizeBorrow = async (
  payload: { userId: string; userName: string; itemId: string; quantity: number; purpose: string; durationDays: number }
) => {
  const { userId, userName, itemId, quantity, purpose, durationDays } = payload;

  // 1. Fetch item details (name, category, etc.) for the response and audit log.
  const { data: item, error: itemErr } = await dbRead
    .from('inventory')
    .select('*')
    .eq('id', itemId)
    .single();

  if (itemErr || !item) {
    return { error: { status: 404, message: 'Item not found.' } };
  }

  // 2. Atomic decrement: only succeed if sufficient stock exists.
  //    This WHERE clause prevents concurrent borrows from over-allocating.
  const { data: updatedRows, error: updateErr } = await supabase
    .from('inventory')
    .update({
      available_quantity: item.available_quantity - quantity,
      updated_at: new Date().toISOString()
    })
    .eq('id', itemId)
    .gte('available_quantity', quantity)
    .select('available_quantity');

  if (updateErr) return { error: { status: 500, message: updateErr.message } };

  // If no rows were updated, the WHERE condition failed (insufficient stock).
  if (!updatedRows || updatedRows.length === 0) {
    // Re-read the current stock to give an accurate error message.
    const { data: fresh } = await dbRead
      .from('inventory')
      .select('available_quantity')
      .eq('id', itemId)
      .single();
    const currentStock = fresh?.available_quantity ?? 0;
    return {
      error: {
        status: 400,
        message: `Requested quantity (${quantity}) exceeds available stock (${currentStock}).`
      }
    };
  }

  const newAvailableQty = updatedRows[0].available_quantity;

  // 3. Create the borrow record.
  const borrowedAt = new Date();
  const dueDate = new Date(borrowedAt);
  dueDate.setDate(dueDate.getDate() + durationDays);

  const { data: borrowRecord, error: borrowErr } = await supabase
    .from('borrow_records')
    .insert([
      {
        user_id: userId,
        borrower_name: userName,
        inventory_id: itemId,
        quantity,
        purpose,
        borrowed_at: borrowedAt.toISOString(),
        due_date: dueDate.toISOString(),
        status: 'BORROWED'
      }
    ])
    .select()
    .single();

  if (borrowErr) return { error: { status: 500, message: borrowErr.message } };

  await invalidateItemsCache(itemId);

  await logAudit('Borrowed', userId, itemId, `Borrowed ${quantity} units of "${item.name}" for purpose: ${purpose}`);

  return { borrowRecord, item, newAvailableQty, dueDate };
};

// GET /api/borrow/admins (Admin directory) — cached 60s
export const getAdmins = async (req: Request, res: Response) => {
  const cacheKey = 'cicr:cache:admins';

  const cached = await cacheGetJSON(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const payload = {
    status: 'success',
    count: ADMIN_DIRECTORY.length,
    data: ADMIN_DIRECTORY
  };
  await cacheSetJSON(cacheKey, payload, ADMIN_DIRECTORY_CACHE_TTL);
  return res.status(200).json(payload);
};

// POST /api/borrow (Borrow Item)
export const borrowItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    const userName = req.user?.name || 'Borrower';
    const { inventory_id, quantity, purpose } = req.body;

    if (!inventory_id || !quantity || !purpose) {
      return res.status(400).json({ status: 'error', message: 'inventory_id, quantity, and purpose are required.' });
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      return res.status(400).json({ status: 'error', message: 'Quantity must be greater than 0.' });
    }

    const days = parseRentalDays(req.body.duration_days);
    if (days === null) {
      return res.status(400).json({ status: 'error', message: daysErrorMessage });
    }

    const result = await finalizeBorrow({ userId: userId || '', userName, itemId: inventory_id, quantity: qty, purpose, durationDays: days });
    if (result.error) {
      return res.status(result.error.status).json({ status: 'error', message: result.error.message });
    }

    const { borrowRecord, item, newAvailableQty, dueDate } = result;

    if (userEmail) {
      const { data: activeHolders } = await dbRead
        .from('borrow_records')
        .select('borrower_name, roll_number, quantity, borrowed_at')
        .eq('inventory_id', inventory_id)
        .eq('status', 'BORROWED')
        .neq('id', borrowRecord.id);

      dispatchBackground('borrow-confirmation', sendBorrowConfirmation(userEmail, userName, {
        itemName: item.name,
        category: item.category,
        quantity: qty,
        remainingStock: newAvailableQty,
        holders: activeHolders || [],
        durationDays: days,
        dueDate
      }));
    }

    return res.status(201).json({
      status: 'success',
      message: 'Item borrowed successfully!',
      data: borrowRecord
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/borrow/request-otp (Request Admin OTP approval)
export const requestOtp = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';
    const userName = req.user?.name || 'Borrower';
    const { item_id, quantity = 1, purpose = 'Admin OTP approved borrow', duration_days, selected_admin_id } = req.body;

    if (!item_id || !selected_admin_id) {
      return res.status(400).json({ status: 'error', message: 'item_id, duration_days, and selected_admin_id are required.' });
    }

    const days = parseRentalDays(duration_days);
    if (days === null) {
      return res.status(400).json({ status: 'error', message: daysErrorMessage });
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      return res.status(400).json({ status: 'error', message: 'Quantity must be greater than 0.' });
    }

    const admin = getAdminById(String(selected_admin_id));
    if (!admin) {
      return res.status(404).json({ status: 'error', message: 'Selected admin not found in the admin directory.' });
    }

    const { data: item, error: itemErr } = await dbRead
      .from('inventory')
      .select('*')
      .eq('id', item_id)
      .single();

    if (itemErr || !item) {
      return res.status(404).json({ status: 'error', message: 'Item not found.' });
    }

    if (item.available_quantity < qty) {
      return res.status(400).json({
        status: 'error',
        message: `Requested quantity (${qty}) exceeds available stock (${item.available_quantity}).`
      });
    }

    const otp = generateOtp();
    storeOtp(otp, {
      userId,
      userName,
      userEmail,
      itemId: item_id,
      quantity: qty,
      purpose,
      durationDays: days,
      adminId: admin.id
    });

    const emailResult = await sendOtpEmail(admin.email, admin.name, userName, otp, item.name, days);

    if (!emailResult.success) {
      return res.status(502).json({ status: 'error', message: 'OTP generated but failed to send to admin email.', data: emailResult });
    }

    await logAudit('OTP Requested', userId, item_id, `OTP approval requested from ${admin.name} (${admin.email}) for "${item.name}" (${days} days)`);

    return res.status(200).json({
      status: 'success',
      message: `OTP sent to admin ${admin.name} (${admin.email}). It expires in 10 minutes.`,
      data: {
        expires_in_seconds: 600,
        item_id,
        duration_days: days,
        selected_admin: { id: admin.id, name: admin.name, email: admin.email }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/borrow/verify-otp (Verify admin OTP and confirm borrow)
export const verifyOtp = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '';
    const userEmail = req.user?.email || '';
    const userName = req.user?.name || 'Borrower';
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ status: 'error', message: 'otp is required.' });
    }

    const payload = verifyOtpCode(String(otp));
    if (!payload) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP.' });
    }

    if (payload.userId !== userId) {
      return res.status(400).json({ status: 'error', message: 'OTP was issued to a different user.' });
    }

    consumeOtp(String(otp));

    const result = await finalizeBorrow({
      userId,
      userName,
      itemId: payload.itemId,
      quantity: payload.quantity,
      purpose: payload.purpose,
      durationDays: payload.durationDays
    });

    if (result.error) {
      return res.status(result.error.status).json({ status: 'error', message: result.error.message });
    }

    const { borrowRecord, item, newAvailableQty, dueDate } = result;

    if (userEmail) {
      const { data: activeHolders } = await dbRead
        .from('borrow_records')
        .select('borrower_name, roll_number, quantity, borrowed_at')
        .eq('inventory_id', payload.itemId)
        .eq('status', 'BORROWED')
        .neq('id', borrowRecord.id);

      dispatchBackground('borrow-confirmation', sendBorrowConfirmation(userEmail, userName, {
        itemName: item.name,
        category: item.category,
        quantity: payload.quantity,
        remainingStock: newAvailableQty,
        holders: activeHolders || [],
        durationDays: payload.durationDays,
        dueDate
      }));
    }

    return res.status(201).json({
      status: 'success',
      message: 'OTP verified. Borrow confirmed successfully!',
      data: {
        borrow: borrowRecord,
        approved_by_admin_id: payload.adminId
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/borrow/return (Return Item)
export const returnItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { borrow_id } = req.body;

    if (!borrow_id) {
      return res.status(400).json({ status: 'error', message: 'borrow_id is required.' });
    }

    // 1. Fetch borrow record (read pool)
    const { data: record, error: recordErr } = await dbRead
      .from('borrow_records')
      .select('*, inventory(name, available_quantity)')
      .eq('id', borrow_id)
      .single();

    if (recordErr || !record) {
      return res.status(404).json({ status: 'error', message: 'Borrow record not found.' });
    }

    if (record.status === 'RETURNED') {
      return res.status(400).json({ status: 'error', message: 'Item has already been returned.' });
    }

    const returnTimestamp = new Date();

    // 2. Atomic status flip: only transition BORROWED -> RETURNED.
    //    If another concurrent request already flipped it, this affects 0 rows.
    const { data: updatedRecord, error: updateRecordErr } = await supabase
      .from('borrow_records')
      .update({
        status: 'RETURNED',
        returned_at: returnTimestamp.toISOString()
      })
      .eq('id', borrow_id)
      .eq('status', 'BORROWED')   // atomic guard: only if still BORROWED
      .select()
      .single();

    if (updateRecordErr) throw updateRecordErr;

    // If no row was updated, a concurrent request already returned this record.
    if (!updatedRecord) {
      return res.status(400).json({ status: 'error', message: 'Item has already been returned.' });
    }

    // 3. Restore available_quantity — read then write is safe here because
    //    only one request can win the BORROWED -> RETURNED flip above.
    const { data: currentItem } = await dbRead
      .from('inventory')
      .select('available_quantity')
      .eq('id', record.inventory_id)
      .single();
    const restoredQty = (currentItem?.available_quantity || 0) + record.quantity;

    const { error: restoreErr } = await supabase
      .from('inventory')
      .update({ available_quantity: restoredQty, updated_at: new Date().toISOString() })
      .eq('id', record.inventory_id);

    if (restoreErr) throw restoreErr;

    await invalidateItemsCache(record.inventory_id);

    // 4. Audit Log
    const itemName = record.inventory?.name || record.inventory_id;
    await logAudit('Returned', userId, record.inventory_id, `Returned ${record.quantity} units of "${itemName}"`);

    // 5. Send Return Confirmation Receipt Email
    const userEmail = req.user?.email;
    const userName = req.user?.name || 'Borrower';
    if (userEmail) {
      dispatchBackground('return-confirmation', sendReturnConfirmation(userEmail, userName, itemName, returnTimestamp));
    }

    return res.status(200).json({
      status: 'success',
      message: 'Item returned successfully! Return logged on server.',
      data: updatedRecord
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/borrow/history (Borrow History)
export const getBorrowHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    let query = dbRead
      .from('borrow_records')
      .select('*')
      .order('borrowed_at', { ascending: false });

    // Members see only their own history; Admins see all
    if (userRole !== 'ADMIN') {
      query = query.eq('user_id', userId);
    }

    const { data: records, error } = await query;
    if (error) throw error;

    // Resolve related users and items manually
    const userIds = [...new Set((records || []).map((r) => r.user_id).filter(Boolean))];
    const itemIds = [...new Set((records || []).map((r) => r.inventory_id).filter(Boolean))];

    const [usersRes, itemsRes] = await Promise.all([
      userIds.length
        ? dbRead.from('users').select('id, name, email, roll_number').in('id', userIds)
        : Promise.resolve({ data: [] }),
      itemIds.length
        ? dbRead.from('inventory').select('id, name, category, image').in('id', itemIds)
        : Promise.resolve({ data: [] })
    ]);

    const userMap = Object.fromEntries((usersRes.data || []).map((u) => [u.id, u]));
    const itemMap = Object.fromEntries((itemsRes.data || []).map((i) => [i.id, i]));

    const history = (records || []).map((r) => ({
      ...r,
      users: userMap[r.user_id] || null,
      inventory: itemMap[r.inventory_id] || null
    }));

    return res.status(200).json({ status: 'success', count: history.length, data: history });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
