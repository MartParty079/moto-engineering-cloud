import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const ignored = new Set(['node_modules', 'dist', '.git']);
const jsFiles = [];
const textFiles = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      const ext = extname(entry.name).toLowerCase();
      if (['.js', '.mjs'].includes(ext)) jsFiles.push(path);
      if (['.js', '.mjs', '.html', '.css'].includes(ext)) textFiles.push(path);
    }
  }
}

await walk(root);
let failed = false;

for (const file of jsFiles) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    failed = true;
    console.error(`\nSyntax failure: ${relative(root, file)}\n${check.stderr}`);
  }
}

const warnings = [];
for (const file of textFiles) {
  const name = relative(root, file);
  const text = await readFile(file, 'utf8');
  if (/setInterval\([^)]*,\s*(?:[0-9]{1,3})\s*\)/.test(text)) warnings.push(`${name}: unusually fast interval`);
  if (/location\.reload\s*\(/.test(text)) warnings.push(`${name}: forced page reload present`);
  if (/innerHTML\s*\+=/.test(text)) warnings.push(`${name}: incremental innerHTML can duplicate listeners or IDs`);
  if (/MutationObserver/.test(text) && !/disconnect\s*\(/.test(text)) warnings.push(`${name}: persistent MutationObserver; verify idempotent callback`);
  if (/target=["']_blank["']/.test(text) && !/rel=["'][^"']*noopener/.test(text)) warnings.push(`${name}: external blank target without noopener`);
}

console.log(`Checked ${jsFiles.length} JavaScript files.`);
if (warnings.length) {
  console.log('\nAudit warnings:');
  warnings.forEach(warning => console.log(`- ${warning}`));
}
if (failed) process.exit(1);
