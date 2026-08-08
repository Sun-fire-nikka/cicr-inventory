import { Request, Response } from 'express';
import { supabase } from '../../app';

// GET /api/stats (Dashboard Analytics)
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { count: totalItems } = await supabase.from('inventory').select('*', { count: 'exact', head: true });
    const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: activeBorrows } = await supabase
      .from('borrow_records')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'BORROWED');

    const { data: items } = await supabase.from('inventory').select('quantity, available_quantity');
    const totalQuantity = items?.reduce((acc, curr) => acc + curr.quantity, 0) || 0;
    const availableQuantity = items?.reduce((acc, curr) => acc + curr.available_quantity, 0) || 0;

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
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*, users(name, email), inventory(name)')
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.status(200).json({ status: 'success', count: logs.length, data: logs });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};