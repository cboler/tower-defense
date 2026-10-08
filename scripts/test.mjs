import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Node 25+ ships a built-in localStorage global that shadows jsdom's and is undefined
// without --localstorage-file. Disable it for the test run. NODE_OPTIONS (not execArgv)
// is required so the flag reaches Vitest's worker processes. Older Node versions that
// don't recognise the flag are left untouched.
const FLAG = '--no-experimental-webstorage';
const env = { ...process.env };
if (process.allowedNodeEnvironmentFlags.has(FLAG) && !env.NODE_OPTIONS?.includes(FLAG)) {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, FLAG].filter(Boolean).join(' ');
}

const ngBin = createRequire(import.meta.url).resolve('@angular/cli/bin/ng.js');
const result = spawnSync(process.execPath, [ngBin, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(result.status ?? 1);
