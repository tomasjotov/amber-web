// Minimal static file server for local development: node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.argv[2] ?? 8090);
const types = { '.wasm': 'application/wasm', '.wav': 'audio/wav', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

createServer(async (req, res) => {
	if (req.method === 'POST' && req.url.startsWith('/__shot')) {
		// Debug helper: stores a posted PNG data URL in tools/out
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const dataUrl = Buffer.concat(chunks).toString();
		const name = new URL(req.url, 'http://x').searchParams.get('name') ?? 'shot';
		const { writeFile, mkdir } = await import('node:fs/promises');
		await mkdir(join(root, 'tools', 'out'), { recursive: true });
		await writeFile(join(root, 'tools', 'out', name.replace(/[^a-z0-9_-]/gi, '') + '.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
		res.writeHead(200);
		res.end('ok');
		return;
	}
	if (req.url.startsWith('/__list')) {
		// Lists the files of a data folder (the browser cannot list directories)
		const dir = new URL(req.url, 'http://x').searchParams.get('dir') ?? '';
		const full = normalize(join(root, dir));
		try {
			if (!full.startsWith(root)) throw new Error('forbidden');
			const list = [];
			const walk = async (d, prefix) => {
				for (const e of await readdir(d, { withFileTypes: true })) {
					if (e.isDirectory()) await walk(join(d, e.name), prefix + e.name + '/');
					else list.push(prefix + e.name);
				}
			};
			await walk(full, '');
			res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
			res.end(JSON.stringify(list));
		} catch {
			res.writeHead(404);
			res.end('[]');
		}
		return;
	}
	try {
		let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		if (path.endsWith('/')) path += 'index.html';
		const file = normalize(join(root, path));
		if (!file.startsWith(root)) throw new Error('forbidden');
		await stat(file);
		res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
		res.end(await readFile(file));
	} catch {
		res.writeHead(404);
		res.end('Not found');
	}
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}/`));
