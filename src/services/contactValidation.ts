/**
 * Contact details and urgency validation pure functions.
 * No storage access.
 */

export function normaliseContactEmail(value?: string): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

export function isValidContactEmail(value: string): boolean {
  if (!value || value.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normaliseContactPhone(value?: string): string {
  if (!value) return '';
  return value.trim();
}

export function isValidContactPhone(value: string): boolean {
  if (!value || value.length > 30) return false;
  if (!/^\+?[\d\s\-()]+$/.test(value)) return false;
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.length >= 8 && digitsOnly.length <= 15;
}

export function validateContact(email?: string, phone?: string): string | null {
  const normEmail = normaliseContactEmail(email);
  const normPhone = normaliseContactPhone(phone);

  if (!normEmail && !normPhone) {
    return 'Please give a contact email or a mobile number so an administrator can reach you about this report.';
  }

  if (normEmail && !isValidContactEmail(normEmail)) {
    return 'Please enter a valid contact email address.';
  }

  if (normPhone && !isValidContactPhone(normPhone)) {
    return 'Please enter a valid mobile number (8 to 15 digits, for example 0412 345 678).';
  }

  return null;
}

export function validateUrgent(urgent?: boolean, reason?: string): string | null {
  if (urgent === true) {
    const trimmed = (reason || '').trim();
    if (trimmed.length < 5 || trimmed.length > 140) {
      return 'Please say briefly why this is urgent (5 to 140 characters).';
    }
  }
  return null;
}
