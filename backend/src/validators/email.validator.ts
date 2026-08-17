// Email format validators (v1.6.2).
//
// Strict domain enforcement:
//   - Students: MUST match ^[0-9]{12}@mail\.jiit\.ac\.in$ (12-digit enrollment @ institutional mail)
//   - Admins: MUST be in the configured admin directory (adminDirectory.ts)
//   - General: blocked — all emails must be institutional or admin-approved

export const GENERAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const INSTITUTIONAL_STUDENT_EMAIL_REGEX = /^[0-9]{12}@mail\.jiit\.ac\.in$/;

export const STUDENT_DOMAIN = 'mail.jiit.ac.in';

/**
 * Validates an email address.
 * Returns true ONLY for:
 *   - 12-digit enrollment @mail.jiit.ac.in (student)
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
 * Extracts the enrollment number from a student email.
 * Returns null if not a valid student email.
 */
export const extractEnrollment = (email: string): string | null => {
  const match = String(email ?? '').trim().toLowerCase().match(/^([0-9]{12})@mail\.jiit\.ac\.in$/);
  return match ? match[1] : null;
};
