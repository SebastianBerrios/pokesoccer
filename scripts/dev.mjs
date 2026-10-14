import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--experimental-strip-types', 'apps/server/src/index.ts'], { stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: 'apps/client', stdio: 'inherit', windowsHide: true })
];
function close() { for (const child of children) child.kill(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
for (const child of children) child.on('exit', code => { if (code) { close(); process.exitCode = code; } });
