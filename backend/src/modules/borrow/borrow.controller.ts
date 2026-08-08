import { Request, Response } from 'express';
import { supabase } from '../../app';
import { AuthRequest } from '../../middleware/auth.middleware';

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

// POST /api/borrow (Borrow Item)
export const borrowItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { inventory_id, quantity, purpose } = req.body;

    if (!inventory_id || !quantity || !purpose) {
      return res.status(400).json({ status: 'error', message: 'inventory_id, quantity, and purpose are required.' });
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      return res.status(400).json({ status: 'error', message: 'Quantity must be greater than 0.' });
    }

    // 1. Fetch item to check stock
    const { data: item, error: itemErr } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', inventory_id)
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

    // 2. Insert borrow record
    const { data: borrowRecord, error: borrowErr } = await supabase
      .from('borrow_records')
      .insert([
        {
          user_id: userId,
          inventory_id,
          quantity: qty,
          purpose,
          status: 'BORROWED'
        }
      ])
      .select()
      .single();

    if (borrowErr) throw borrowErr;

    // 3. Decrement available_quantity in inventory
    const newAvailableQty = item.available_quantity - qty;
    const { error: updateErr } = await supabase
      .from('inventory')
      .update({ available_quantity: newAvailableQty, updated_at: new Date().toISOString() })
      .eq('id', inventory_id);

    if (updateErr) throw updateErr;

    // 4. Audit Log
    await logAudit('Borrowed', userId, inventory_id, `Borrowed ${qty} units of "${item.name}" for purpose: ${purpose}`);

    return res.status(201).json({
      status: 'success',
      message: 'Item borrowed successfully!',
      data: borrowRecord
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

    // 1. Fetch borrow record
    const { data: record, error: recordErr } = await supabase
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

    // 2. Update borrow record
    const { data: updatedRecord, error: updateRecordErr } = await supabase
      .from('borrow_records')
      .update({
        status: 'RETURNED',
        return_date: new Date().toISOString()
      })
      .eq('id', borrow_id)
      .select()
      .single();

    if (updateRecordErr) throw updateRecordErr;

    // 3. Restore available_quantity in inventory
    const { data: item } = await supabase.from('inventory').select('available_quantity').eq('id', record.inventory_id).single();
    const restoredQty = (item?.available_quantity || 0) + record.quantity;

    await supabase
      .from('inventory')
      .update({ available_quantity: restoredQty, updated_at: new Date().toISOString() })
      .eq('id', record.inventory_id);

    // 4. Audit Log
    const itemName = record.inventory?.name || record.inventory_id;
    await logAudit('Returned', userId, record.inventory_id, `Returned ${record.quantity} units of "${itemName}"`);

    return res.status(200).json({
      status: 'success',
      message: 'Item returned successfully!',
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

    let query = supabase
      .from('borrow_records')
      .select('*, users(name, email, roll_number), inventory(name, category, image)')
      .order('borrow_date', { ascending: false });

    // Members see only their own history; Admins see all
    if (userRole !== 'ADMIN') {
      query = query.eq('user_id', userId);
    }

    const { data: history, error } = await query;
    if (error) throw error;

    return res.status(200).json({ status: 'success', count: history.length, data: history });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};