// Windows-side screenshot batch (no WSL dependency).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'D:/GitHub/Farzan/screenshots';
const ROUTES = ['home', 'courses', 'flashcards', 'studio', 'progress', 'notes', 'settings', 'pdf'];
const runTag = String(Date.now());

for (const route of ROUTES) {
  const profile = `D:/GitHub/Farzan/.edge-run/${route}-${runTag}`;
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--hide-scrollbars',
    '--window-size=1440,900', '--virtual-time-budget=12000',
    `--screenshot=D:/GitHub/Farzan/screenshots/${route}.png`,
    `http://127.0.0.1:5173/#/${route}`,
  ];
  const r = spawnSync(EDGE, args, { stdio: 'ignore' });
  const size = fs.existsSync(`${OUT}/${route}.png`) ? fs.statSync(`${OUT}/${route}.png`).size : 0;
  console.log(`${route}: rc=${r.status} size=${size}`);
}
