import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyHubSignature, tokensEqual } from '../../src/utils/hmac';

describe('verifyHubSignature', () => {
  it('accepts a valid sha1 signature', () => {
    const secret = 'secret';
    const body = '<feed/>';
    const sig = `sha1=${crypto.createHmac('sha1', secret).update(body, 'utf8').digest('hex')}`;
    expect(verifyHubSignature(sig, body, secret)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    expect(verifyHubSignature(`sha1=${'a'.repeat(40)}`, 'body', 'secret')).toBe(false);
  });

  it('rejects a non-sha1 algorithm', () => {
    expect(verifyHubSignature(`sha256=${'a'.repeat(64)}`, 'body', 'secret')).toBe(false);
  });
});

describe('tokensEqual', () => {
  it('accepts equal tokens', () => {
    expect(tokensEqual('abc', 'abc')).toBe(true);
  });

  it('rejects different tokens', () => {
    expect(tokensEqual('abc', 'def')).toBe(false);
  });
});
