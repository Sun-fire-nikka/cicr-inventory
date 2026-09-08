"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminByEmail = exports.getAdminById = exports.ADMIN_DIRECTORY = void 0;
exports.ADMIN_DIRECTORY = [
    { id: 'cicr-admin', name: 'CICR Inventory Admin', email: 'cicrinventory@gmail.com' },
    { id: 'master-vardaan', name: 'Vardaan', email: 'vardaansaxena096@gmail.com' }
];
const getAdminById = (adminId) => exports.ADMIN_DIRECTORY.find((admin) => admin.id === adminId || admin.name.toLowerCase() === adminId.toLowerCase());
exports.getAdminById = getAdminById;
const getAdminByEmail = (email) => exports.ADMIN_DIRECTORY.find((admin) => admin.email.toLowerCase() === email.toLowerCase());
exports.getAdminByEmail = getAdminByEmail;
