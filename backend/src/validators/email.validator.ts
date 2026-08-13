// Email format validators (v1.4.7).
//
// Institutional Email Support: 12-digit numeric student IDs on the CICR
// institutional mail domain are fully supported, e.g. ^[0-9]{12}@mail\.jiit\.ac\.in$.
// Seeded students also exist on the @gmail.jiit.ac.in subdomain, so the
// institutional pattern accepts a numeric local-part on any jiit.ac.in
// subdomain.

export const GENERAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const INSTITUTIONAL_STUDENT_EMAIL_REGEX = /^[0-9]{12}@[a-z0-9-]+\.jiit\.ac\.in$/;

export const isValidEmail = (email: string): boolean => {
  const value = String(email ?? '').trim();
  if (!value) return false;
  if (INSTITUTIONAL_STUDENT_EMAIL_REGEX.test(value)) return true;
  return GENERAL_EMAIL_REGEX.test(value);
};
