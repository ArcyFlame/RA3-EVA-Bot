import crypto from 'crypto';

/** Constant-time comparison of the `sha1=...` hub signature against our HMAC. */
export function verifyHubSignature(signature: string, body: string, secret: string): boolean {
  const [algo, provided] = signature.split('=');
  if (algo !== 'sha1' || !provided || !/^[a-f0-9]{40}$/i.test(provided)) return false;
  const expected = crypto.createHmac('sha1', secret).update(body, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

/** Constant-time string comparison that tolerates unequal lengths. */
export function tokensEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB) && a.length === b.length;
}
