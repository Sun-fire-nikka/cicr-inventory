// Email format validators (v1.7.0).
//
// Domain enforcement:
//   - Students: MUST match ^[a-zA-Z0-9._%+-]+@mail\.jiit\.ac\.in$ (any valid prefix @ institutional mail)
//   - Admins: MUST be in the configured admin directory (adminDirectory.ts)
//   - General: blocked — all emails must be institutional or admin-approved

export const GENERAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const INSTITUTIONAL_STUDENT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@mail\.jiit\.ac\.in$/i;

export const STUDENT_DOMAIN = 'mail.jiit.ac.in';

/**
 * Validates an email address.
 * Returns true ONLY for:
 *   - Any valid prefix @mail.jiit.ac.in (student)
 *   - Known admin emails from adminDirectory.ts
 */
export const isValidEmail = (email: string): boolean => {
  const value = String(email ?? '').trim().toLowerCase();
  if (!value) return false;
  if (INSTITUTIONAL_STUDENT_EMAIL_REGEX.test(value)) return true;
  return false;
};

/**
 * Checks if an email is a valid institutional student email.
 */
export const isStudentEmail = (email: string): boolean => {
  return INSTITUTIONAL_STUDENT_EMAIL_REGEX.test(String(email ?? '').trim().toLowerCase());
};

/**
 * Extracts the local prefix (everything before @mail.jiit.ac.in) from a student email.
 * Returns null if not a valid student email.
 */
export const extractEnrollment = (email: string): string | null => {
  const match = String(email ?? '').trim().toLowerCase().match(/^([a-zA-Z0-9._%+-]+)@mail\.jiit\.ac\.in$/);
  return match ? match[1] : null;
};
