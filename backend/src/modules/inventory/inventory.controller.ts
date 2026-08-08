import { Request, Response } from 'express';
import { supabase } from '../../app';
import { AuthRequest } from '../../middleware/auth.middleware';

// Helper function to log actions in audit_logs
async function logAudit(action: string, userId: string | undefined, itemId: string | null, description: string) {
  try {
    await supabase.from('audit_logs').insert([
      { action, user_id: userId || null, item_id: itemId, description }
    ]);
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

// GET /api/items (Search, Filter by Category, Get All)
export const getItems = async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;
    let query = supabase.from('inventory').select('*').order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category as string);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: items, error } = await query;
    if (error) throw error;

    return res.status(200).json({ status: 'success', count: items.length, data: items });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/items/categories (List distinct categories)
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = ['Controllers', 'Sensors', 'Power', 'Actuators', 'Tools'];
    return res.status(200).json({ status: 'success', data: categories });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/items/:id
export const getItemById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data: item, error } = await supabase.from('inventory').select('*').eq('id', id).single();

    if (error || !item) {
      return res.status(404).json({ status: 'error', message: 'Item not found.' });
    }

    return res.status(200).json({ status: 'success', data: item });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/items (Add Item - Admin Only)
export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, category, location, quantity, image, tags } = req.body;

    if (!name || !category || !location || quantity === undefined) {
      return res.status(400).json({ status: 'error', message: 'Name, category, location, and quantity are required.' });
    }

    const qty = Number(quantity);

    const { data: newItem, error } = await supabase
      .from('inventory')
      .insert([
        {
          name,
          description,
          category,
          location,
          quantity: qty,
          available_quantity: qty,
          image: image || null,
          tags: tags || []
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Log to Audit
    await logAudit('Item Added', req.user?.id, newItem.id, `Added "${newItem.name}" with quantity ${qty}`);

    return res.status(201).json({ status: 'success', message: 'Item created successfully!', data: newItem });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// PATCH /api/items/:id (Edit Item - Admin Only)
export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Fetch existing item to calculate available quantity if total quantity changed
    const { data: existingItem, error: fetchErr } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !existingItem) {
      return res.status(404).json({ status: 'error', message: 'Item not found.' });
    }

    if (updates.quantity !== undefined) {
      const diff = Number(updates.quantity) - existingItem.quantity;
      updates.available_quantity = existingItem.available_quantity + diff;
      if (updates.available_quantity < 0) updates.available_quantity = 0;
    }

    updates.updated_at = new Date().toISOString();

    const { data: updatedItem, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log to Audit
    await logAudit('Item Edited', req.user?.id, id, `Updated details for item "${updatedItem.name}"`);

    return res.status(200).json({ status: 'success', message: 'Item updated successfully!', data: updatedItem });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// DELETE /api/items/:id (Delete Item - Admin Only)
export const deleteItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: item } = await supabase.from('inventory').select('name').eq('id', id).single();

    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) throw error;

    // Log to Audit
    await logAudit('Deleted', req.user?.id, null, `Deleted item "${item?.name || id}"`);

    return res.status(200).json({ status: 'success', message: 'Item deleted successfully!' });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};