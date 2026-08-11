export interface AdminDirectoryEntry {
  id: string;
  name: string;
  email: string;
}

export const ADMIN_DIRECTORY: AdminDirectoryEntry[] = [
  { id: 'kush', name: 'KUSH', email: 'kushagragargdelhi@gmail.com' },
  { id: 'yasharth', name: 'Yasharth', email: 'yasharth@cicr.edu' },
  { id: 'aryan', name: 'Aryan', email: 'aryan@cicr.edu' },
  { id: 'dhruvi', name: 'Dhruvi', email: 'dhruvi@cicr.edu' }
];

export const getAdminById = (adminId: string): AdminDirectoryEntry | undefined =>
  ADMIN_DIRECTORY.find((admin) => admin.id === adminId || admin.name.toLowerCase() === adminId.toLowerCase());
