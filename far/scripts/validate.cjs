/**
 * Static checks: vendor assets + Node syntax parse for project JS (no node_modules).
 */
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const root = path.join(__dirname, '..');
const requiredVendor = [
  'chart.umd.js',
  'pdf.min.mjs',
  'pdf.worker.min.mjs',
  'marked.min.js',
  'purify.min.js',
  'fuse.min.js',
];

let errors = 0;
for (const f of requiredVendor)