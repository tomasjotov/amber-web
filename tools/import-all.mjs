// Imports every ported module and reports load-time errors.
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
const root = new URL('../src/ambermoon/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const skip = (process.argv[2] ?? '').split(',').filter(Boolean);
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
walk(root);
await import(pathToFileURL(join(root, 'Ambermoon.Core/GameCore.js')).href);
let ok = 0, bad = 0;
for (const f of files) {
	const rel = relative(root, f).split(String.fromCharCode(92)).join('/');
	if (skip.some(s => rel.startsWith(s))) continue;
	try { await import(pathToFileURL(f).href); ok++; }
	catch (e) { bad++; console.log('FAIL', rel, '-', String(e.message).split('\n')[0]); }
}
console.log(`ok ${ok}, failed ${bad}`);
