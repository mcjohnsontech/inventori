import { describe, expect, it } from 'vitest';
import { canonical, digest, passwordHash, verifyPassword } from '../../apps/api/src/security.js';
describe('credentials and replay hashes', () => {
  it('salts credentials independently, verifies correct passwords and rejects malformed hashes', () => {
    const one = passwordHash('correct password');
    expect(one).not.toBe(passwordHash('correct password'));
    expect(one).not.toContain('correct password');
    expect(verifyPassword('correct password', one)).toBe(true);
    expect(verifyPassword('wrong password', one)).toBe(false);
    expect(verifyPassword('anything', 'malformed')).toBe(false);
  });
  it('ignores JSON object-key order while distinguishing different commands and array order', () => {
    expect(digest(canonical({ b: 2, a: { z: 1, y: 2 } }))).toBe(digest(canonical({ a: { y: 2, z: 1 }, b: 2 })));
    expect(digest(canonical([1, 2]))).not.toBe(digest(canonical([2, 1])));
  });
});
