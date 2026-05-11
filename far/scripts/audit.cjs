/**
 * Project gate: validate assets + parse checks, ESLint, Vitest, then smoke (via npm script chain).
 */
const { spawnSync } = require('child_process');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run(process.execPath, ['scripts/validate.cjs']);
run(process.execPath, ['node_modules/eslint/bin/eslint.js', 'src', 'scripts', 'tests', 'eslint.config.js', 'vitest.config.js']);
run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--passWithNoTests', '--configLoader', 'runner', '--pool', 'vmThreads']);

console.log('[audit] OK');
