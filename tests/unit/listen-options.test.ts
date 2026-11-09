import { expect, it } from 'vitest';
import { listenOptions } from '../../apps/api/src/listen-options.js';

it('keeps local startup loopback-only and uses the Heroku assigned port explicitly', () => {
  expect(listenOptions({})).toEqual({ host: '127.0.0.1', port: 4000 });
  expect(listenOptions({ DYNO: 'web.1', HOST: '0.0.0.0', PORT: '18234' }))
    .toEqual({ host: '0.0.0.0', port: 18234 });
  expect(() => listenOptions({ DYNO: 'web.1' })).toThrow('Heroku requires');
});
it('rejects invalid port and bind configurations before connecting to a database', () => {
  for (const PORT of ['0', '-1', '65536', 'NaN', '4e3', ''])
    expect(() => listenOptions({ PORT })).toThrow();
  expect(() => listenOptions({ HOST: 'example.com' })).toThrow();
});
