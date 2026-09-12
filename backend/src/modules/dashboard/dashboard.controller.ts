import { Request, Response } from 'express';
import { dbRead } from '../../config/database';

// GET /api/stats (Dashboard Analytics)
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { count: totalItems } = await dbRead.from('inventory').select('*', { count: 'exact', head: true });
    const { count: totalUsers } = await dbRead.from('users').select('*', { count: 'exact', head: true });
    const { count: activeBorrows } = await dbRead
      .from('borrow_records')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'BORROWED');

    const { data: items } = await dbRead.from('inventory').select('quantity, available_quantity');
    const totalQuantity = items?.reduce((acc: number, curr: any) => acc + curr.quantity, 0) || 0;
    const availableQuantity = items?.reduce((acc: number, curr: any) => acc + curr.available_quantity, 0) || 0;

    return res.status(200).json({
      status: 'success',
      data: {
        total_items: totalItems || 0,
        total_users: totalUsers || 0,
        active_borrows: activeBorrows || 0,
        total_quantity: totalQuantity,
        available_quantity: availableQuantity,
        borrowed_quantity: totalQuantity - availableQuantity
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/audit (Audit Logs List)
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const { category, search, limit } = req.query;
    const maxLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);

    // NOTE: audit_logs uses item_id (not inventory_id) for the FK to inventory.
    // The generic FK_MAP cannot express this table-specific FK, so we omit the
    // inventory join here.  If the frontend needs the item name, resolve it in
    // a second pass (same pattern as getBorrowHistory).
    let query = dbRead
      .from('audit_logs')
      .select('*, users(name, email, role)')
      .order('timestamp', { ascending: false })
      .limit(maxLimit);

    if (category && typeof category === 'string' && category !== 'all') {
      const cat = category.toLowerCase();
      if (cat === 'auth') {
        query = query.in('action', ['Sign In', 'Sign Up', 'User Approved', 'User Rejected', 'Role Changed', 'User Deleted']);
      } else if (cat === 'inventory') {
        query = query.in('action', ['Item Added', 'Item Edited', 'Item Deleted']);
      } else if (cat === 'hardware') {
        query = query.in('action', ['Hardware Requested', 'Hardware Approved', 'Hardware Rejected']);
      } else if (cat === 'loans') {
        query = query.in('action', ['Borrowed', 'Returned', 'OTP Requested', 'Item Borrowed', 'Item Returned']);
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      query = query.or(`action.ilike.%${term}%,description.ilike.%${term}%`);
    }

    const { data: logs, error } = await query;

    if (error) throw error;

    return res.status(200).json({ status: 'success', count: logs?.length || 0, data: logs || [] });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};