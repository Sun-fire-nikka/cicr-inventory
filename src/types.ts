export interface BorrowRecord {
    name: string;
    roll: string;
    qty: number;
    purpose: string;
    date: string;
    dueDate?: string;
    returned?: boolean;
    returnedAt?: string;
}

export interface RequestRecord {
    id: string;
    itemId: string;
    itemName: string;
    name: string;
    roll: string;
    qty: number;
    purpose: string;
    dueDate?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    reviewNote?: string;
}

export interface InventoryItem {
    id: string;
    name: string;
    category: string;
    quantity: number;
    location: string;
    specs: string;
    borrowedBy: BorrowRecord[];
}

export interface ActivityLog {
    type: 'system' | 'borrow' | 'return' | 'add' | 'request' | 'approve' | 'reject' | 'overdue' | 'low_stock';
    timestamp: string;
    text: string;
}

export interface UserDatabase {
    [username: string]: string; // username -> password mapping
}
