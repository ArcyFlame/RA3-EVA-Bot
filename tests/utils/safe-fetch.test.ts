import { describe, expect, it } from 'vitest';
import { decodeResponseText } from '../../src/utils/safe-fetch';

describe('decodeResponseText', () => {
  it('decodes the ISO-8859-1 declaration used by GameReplays as Windows-1252', () => {
    const bytes = Uint8Array.from([
      ...Buffer.from('C&C:Online Replacement '),
      0x97,
      ...Buffer.from(' Tacitus Released'),
    ]);
    expect(decodeResponseText(bytes, 'text/html; charset=ISO-8859-1')).toBe(
      'C&C:Online Replacement — Tacitus Released',
    );
  });

  it('uses an HTML charset declaration when the response header omits it', () => {
    const bytes = Uint8Array.from([
      ...Buffer.from('<meta charset="windows-1252"><p>A'),
      0x96,
      ...Buffer.from('B</p>'),
    ]);
    expect(decodeResponseText(bytes)).toContain('A–B');
  });
});
