#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const repoRootCargo = path.resolve(root, '..', '.cargo');
const env = { ...process.env };

if (fs.existsSync(path.join(repoRootCargo, 'registry'))) {
  env.CARGO_HOME = repoRootCargo;
}

const args = process.argv.slice(2);
const result = spawnSync('cargo', args, {
  cwd: root,
  env,
  shell: false,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
