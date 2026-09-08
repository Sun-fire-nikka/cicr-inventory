export interface AdminDirectoryEntry {
  id: string;
  name: string;
  email: string;
}

export const ADMIN_DIRECTORY: AdminDirectoryEntry[] = [
  { id: 'vardaan', name: 'Vardaan Saxena (Lead Admin)', email: 'vardaansaxena096@gmail.com' },
  { id: 'cicr-admin', name: 'CICR Inventory Admin', email: 'cicrinventory@gmail.com' }
];

export const getAdminById = (adminId: string): AdminDirectoryEntry | undefined =>
  ADMIN_DIRECTORY.find((admin) => admin.id === adminId || admin.name.toLowerCase() === adminId.toLowerCase());

export const getAdminByEmail = (email: string): AdminDirectoryEntry | undefined =>
  ADMIN_DIRECTORY.find((admin) => admin.email.toLowerCase() === email.toLowerCase());

