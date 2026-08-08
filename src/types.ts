export interface BorrowRecord {
    name: string;
    roll: string;
    qty: number;
    purpose: string;
    date: string;
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
    type: 'system' | 'borrow' | 'return' | 'add';
    timestamp: string;
    text: string;
}

export interface UserDatabase {
    [username: string]: string; // username -> password mapping
}
