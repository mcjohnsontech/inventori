import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
// Keep Vite's temporary module files inside the workspace on restricted Windows hosts.
const directory = resolve('.local/tmp');
mkdirSync(directory, { recursive: true });
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, TEMP: directory, TMP: directory, TMPDIR: directory } });
process.exitCode = result.status ?? 1;
