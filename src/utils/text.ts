/**
 * Text helpers shared by the portal and forum extractors.
 */

/**
 * All currency amounts in a text. Whitespace-collapsed posts glue prize
 * tables together ("1st $11112nd $4563rd"): when digits run into an ordinal
 * suffix, the ordinal's digit is split back off ("$4563rd" → 456).
 */
export function extractAmounts(text: string): number[] {
  const amounts: number[] = [];
  const push = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) amounts.push(n);
  };
  // Currency + digits glued to an ordinal ("$4563rd"): the last digit
  // belongs to the ordinal ("3rd"), the rest is the amount.
  for (const m of text.matchAll(/[$€£]\s?(\d{2,6})(?:st|nd|rd|th)\b/gi)) {
    push(m[1].slice(0, -1));
  }
  // Plain "$40" amounts — not followed by more digits or an ordinal suffix.
  for (const m of text.matchAll(/[$€£]\s?(\d{1,4})(?:\.\d{1,2})?(?!\d)(?!(?:st|nd|rd|th)\b)/gi)) {
    push(m[1]);
  }
  // Amount before the sign ("120$", "120 $").
  for (const m of text.matchAll(/\b(\d{1,4})(?:\.\d{1,2})?\s?[$€£]/g)) {
    push(m[1]);
  }
  // Spelled-out currencies ("40 USD", "40 dollars").
  for (const m of text.matchAll(/\b(\d{1,4})\s?(?:USD|dollars)\b/gi)) {
    push(m[1]);
  }
  return amounts;
}

/**
 * Headline prize value: explicit total → sum of donations → place-table sum
 * → largest amount.
 */
export function extractPrizeValue(text: string, title = ''): number | undefined {
  const sources = `${title} ${text}`;
  for (const m of sources.matchAll(
    /(?:[$€£]\s?(\d{1,5})(?:\.\d{1,2})?|(\d{1,5})(?:\.\d{1,2})?\s?[$€£])\s*(?:total\s+)?prize\s*(?:pool|money|fund)/gi,
  )) {
    return parseFloat(m[1] ?? m[2]);
  }
  for (const m of sources.matchAll(
    /total\s+prize\s*(?:pool|money|fund)?[^$\d]{0,25}[$€£]?\s?(\d{1,5})/gi,
  )) {
    return parseFloat(m[1]);
  }
  const donations = [...text.matchAll(/\b(\d{1,4})\s?[$€£]?\s*(?:donated|contribut(?:ed|ions?))\s+by/gi)].map(
    (m) => parseFloat(m[1]),
  );
  if (donations.length > 0) return donations.reduce((a, b) => a + b, 0);
  // Prize TABLE ("1st Place: 20$2nd Place: 10$" → 30$, "3rd & 4th Place:
  // 60$" counts 60 per place, "2 Random draws: 30$" counts 2×30).
  let tableTotal = 0;
  let tableEntries = 0;
  for (const m of text.matchAll(
    /((?:\d{1,2}(?:st|nd|rd|th))(?:\s*(?:&|and|,)\s*\d{1,2}(?:st|nd|rd|th))*)(?:\s+place)?s?\s*[:-]?\s*(\d{1,4})(?:\.\d{1,2})?\s?[$€£](?=\s|$|[^0-9]|\d{1,2}(?:st|nd|rd|th)\b|\d\s)/gi,
  )) {
    const places = m[1].split(/&|and|,/).length;
    tableTotal += parseFloat(m[2]) * places;
    tableEntries += places;
  }
  for (const m of text.matchAll(
    /\b(\d{1,2})\s+[a-z][a-z ]{2,24}:\s*(\d{1,4})\s?[$€£](?=\s|$|[^0-9]|\d{1,2}(?:st|nd|rd|th)\b|\d\s)/gi,
  )) {
    const qty = parseInt(m[1], 10);
    if (qty > 1 && qty <= 10) {
      tableTotal += parseFloat(m[2]) * qty;
      tableEntries += qty;
    }
  }
  if (tableEntries > 1) return tableTotal;
  const titleAmounts = title ? extractAmounts(title) : [];
  const amounts = titleAmounts.length > 0 ? titleAmounts : extractAmounts(text);
  if (amounts.length === 0) return undefined;
  return Math.max(...amounts);
}

/**
 * Truncates text at the last full sentence (or word) inside `max` chars and
 * appends "..." — never cuts mid-word ("...day of the to").
 */
export function truncateSentences(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const window = clean.slice(0, max);
  // Prefer ending on a sentence boundary inside the window.
  const lastSentenceEnd = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  const lastSpace = window.lastIndexOf(' ');
  const cut = lastSentenceEnd > max * 0.5 ? lastSentenceEnd + 1 : lastSpace;
  if (cut <= 0) return window + '...';
  return window.slice(0, cut).trim() + '...';
}
