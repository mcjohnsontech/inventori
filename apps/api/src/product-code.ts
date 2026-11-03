import { randomInt } from 'node:crypto';
import { ConflictException } from '@nestjs/common';

export function allocateProductBase(prefix: string, existingCodes: Iterable<string>, draw: () => number = () => randomInt(100000)): string {
  const used = new Set(existingCodes);
  const candidate = (number: number) => `${prefix}${String(number).padStart(5, '0')}`;
  for (let attempt = 0; attempt < 32; attempt++) {
    const code = candidate(draw());
    if (!used.has(code)) return code;
  }
  // Random starting point also handles a nearly-full namespace without false exhaustion.
  const start = draw();
  for (let offset = 0; offset < 100000; offset++) {
    const code = candidate((start + offset) % 100000);
    if (!used.has(code)) return code;
  }
  throw new ConflictException('All five-digit product numbers for this prefix have been allocated. Contact Admin.');
}
