/**
 * Sanitize user input to prevent mention spam and injection
 */
export function sanitizeInput(input: string, maxLength = 2000): string {
  if (!input) return '';
  let sanitized = input.replace(/@(everyone|here)/gi, '@\u200b$1');
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength - 3) + '...';
  }
  return sanitized;
}

/**
 * Validate clan tag (only alphanumeric, 1-6 chars)
 */
export function validateClanTag(tag: string): boolean {
  return /^[A-Za-z0-9]{1,6}$/.test(tag);
}

/**
 * Validate clan name (no special characters, max 50)
 */
export function validateClanName(name: string): boolean {
  return name.length >= 2 && name.length <= 50 && /^[a-zA-Z0-9\s\-_]+$/.test(name);
}
