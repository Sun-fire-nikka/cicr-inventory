"use strict";
// Email format validators.
//
// Domain enforcement:
//   - Students: MUST match institutional email domain @mail.jiit.ac.in (enrollmentnumber@mail.jiit.ac.in)
//   - Institutional: @mail.jiit.ac.in or @jiit.ac.in
//   - Admins: The current authorized administrator emails
//   - General external emails: strictly blocked for registration and non-admin login
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractEnrollment = exports.isValidEmail = exports.isAllowedAuthEmail = exports.isStudentEmail = exports.isJiitEmail = exports.STUDENT_DOMAIN = exports.JIIT_INSTITUTIONAL_EMAIL_REGEX = exports.JIIT_NUMERIC_STUDENT_EMAIL_REGEX = exports.JIIT_STUDENT_EMAIL_REGEX = exports.isCurrentAdminEmail = exports.CURRENT_ADMIN_EMAILS = void 0;
exports.CURRENT_ADMIN_EMAILS = [
    'vardaansaxena096@gmail.com',
    'cicrinventory@gmail.com'
];
const isCurrentAdminEmail = (email) => {
    const norm = String(email ?? '').trim().toLowerCase();
    return exports.CURRENT_ADMIN_EMAILS.some((admin) => admin.toLowerCase() === norm);
};
exports.isCurrentAdminEmail = isCurrentAdminEmail;
// Student emails: enrollment number @mail.jiit.ac.in
exports.JIIT_STUDENT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@mail\.jiit\.ac\.in$/i;
exports.JIIT_NUMERIC_STUDENT_EMAIL_REGEX = /^\d+@mail\.jiit\.ac\.in$/i;
exports.JIIT_INSTITUTIONAL_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(mail\.)?jiit\.ac\.in$/i;
exports.STUDENT_DOMAIN = 'mail.jiit.ac.in';
/**
 * Checks if an email is a valid institutional JIIT student/staff email.
 */
const isJiitEmail = (email) => {
    const norm = String(email ?? '').trim().toLowerCase();
    return exports.JIIT_INSTITUTIONAL_EMAIL_REGEX.test(norm);
};
exports.isJiitEmail = isJiitEmail;
const isStudentEmail = (email) => {
    const norm = String(email ?? '').trim().toLowerCase();
    return exports.JIIT_STUDENT_EMAIL_REGEX.test(norm);
};
exports.isStudentEmail = isStudentEmail;
/**
 * Validates whether an email is permitted to create an account or log into the portal.
 * Returns true ONLY for:
 *   - Accounts with JIIT domain (enrollmentnumber@mail.jiit.ac.in or @jiit.ac.in)
 *   - Current authorized administrator emails
 */
const isAllowedAuthEmail = (email) => {
    const norm = String(email ?? '').trim().toLowerCase();
    return (0, exports.isCurrentAdminEmail)(norm) || (0, exports.isJiitEmail)(norm);
};
exports.isAllowedAuthEmail = isAllowedAuthEmail;
const isValidEmail = (email) => {
    return (0, exports.isAllowedAuthEmail)(email);
};
exports.isValidEmail = isValidEmail;
/**
 * Extracts the enrollment number / local prefix from a student email.
 */
const extractEnrollment = (email) => {
    const match = String(email ?? '').trim().toLowerCase().match(/^([a-zA-Z0-9._%+-]+)@mail\.jiit\.ac\.in$/);
    return match ? match[1] : null;
};
exports.extractEnrollment = extractEnrollment;
