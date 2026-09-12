import { Request, Response } from 'express';
import { dbRead } from '../../config/database';
import {
  buildBoteSnapshot,
  simulateScale,
  DEFAULT_BOTE_CONFIG,
  BoteInputs
} from '../../services/boteService';

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfToday = (): Date => {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
};

const countToday = async (from: string, column: string): Promise<number> => {
  const { count } = await dbRead
    .from(from)
    .select('*', { count: 'exact', head: true })
    .gte(column, startOfToday().toISOString());
  return count || 0;
};

// GET /api/system/bote-metrics — live capacity, peak-load, latency & memory snapshot
export const getBoteMetrics = async (req: Request, res: Response) => {
  try {
    const [borrowsToday, returnsToday, activeBorrows, dueToday, totalUsers, items] = await Promise.all([
      countToday('borrow_records', 'borrowed_at'),
      countToday('borrow_records', 'returned_at'),
      dbRead.from('borrow_records').select('*', { count: 'exact', head: true }).eq('status', 'BORROWED'),
      dbRead.from('borrow_records').select('*', { count: 'exact', head: true }).eq('status', 'BORROWED').lt('due_date', endOfToday().toISOString()),
      dbRead.from('users').select('*', { count: 'exact', head: true }),
      dbRead.from('inventory').select('quantity, available_quantity')
    ]);
    const inputs: BoteInputs = {
      emailsUsedToday: (borrowsToday || 0) + (returnsToday || 0),
      activeBorrows: activeBorrows.count || 0,
      dueTodayEmails: dueToday.count || 0,
      totalUsers: totalUsers.count || 0,
      totalItems: items.data?.length || 0,
      availableQuantity: items.data?.reduce((acc: number, curr: any) => acc + (curr.available_quantity || 0), 0) || 0,
      borrowedQuantity: items.data?.reduce((acc: number, curr: any) => acc + (curr.quantity || 0), 0) || 0
    };

    return res.status(200).json({
      status: 'success',
      data: {
        ...buildBoteSnapshot(inputs),
        inventory: {
          total_items: inputs.totalItems,
          available_quantity: inputs.availableQuantity,
          borrowed_quantity: Math.max(0, inputs.borrowedQuantity - inputs.availableQuantity)
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/system/simulate-scale?users=&borrowsPerUserPerMonth=&jobsPerUser=
export const getSimulateScale = async (req: Request, res: Response) => {
  try {
    const users = Number(req.query.users);
    const borrowsPerUserPerMonth = Number(req.query.borrowsPerUserPerMonth ?? 2);
    const jobsPerUser = Number(req.query.jobsPerUser ?? 1);

    if (!Number.isFinite(users) || users < 0) {
      return res.status(400).json({ status: 'error', message: 'Query param "users" is required and must be a non-negative number.' });
    }
    if (!Number.isFinite(borrowsPerUserPerMonth) || borrowsPerUserPerMonth < 0) {
      return res.status(400).json({ status: 'error', message: '"borrowsPerUserPerMonth" must be a non-negative number.' });
    }
    if (!Number.isFinite(jobsPerUser) || jobsPerUser < 0) {
      return res.status(400).json({ status: 'error', message: '"jobsPerUser" must be a non-negative number.' });
    }

    return res.status(200).json({
      status: 'success',
      data: simulateScale({ users, borrowsPerUserPerMonth, jobsPerUser }, DEFAULT_BOTE_CONFIG)
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
