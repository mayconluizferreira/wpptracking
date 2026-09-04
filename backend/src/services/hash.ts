import crypto from 'crypto';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').toLowerCase();
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Brazilian number without country code (10-11 digits)
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

// For phone numbers extracted from a WhatsApp JID (remoteJid / "from" field
// in Evolution and Cloud API payloads). These always already carry the full
// international country code — WhatsApp never omits it there. Just strip
// non-digits; do NOT run the "add 55" heuristic used in normalizePhone(),
// which incorrectly rewrites e.g. a US number "19048624594" (country code 1
// + area code + number, 11 digits) into "5519048624594" because it can't
// tell that apart from an 11-digit Brazilian number missing its DDI.
export function normalizePhoneFromJid(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function hashPhone(phone: string): string {
  return sha256(normalizePhone(phone));
}

export function hashName(name: string): string {
  return sha256(name.trim().toLowerCase());
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}
