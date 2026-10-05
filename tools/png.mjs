// Tiny PNG encoder for previews (RGBA)
import zlib from 'node:zlib';
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); Buffer.from(data).copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}
/** rgba: Uint8Array width*height*4 */
export function encodePNG(width, height, rgba) {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1); }
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** Draws indexed graphics into an RGBA sheet. items: [{ x, y, width, height, data, palette: [[r,g,b,a]] }] */
export function sheet(width, height, items, background = [40, 0, 40, 255]) {
	const rgba = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) rgba.set(background, i * 4);
	for (const it of items) for (let y = 0; y < it.height; y++) for (let x = 0; x < it.width; x++) {
		const c = it.data[x + y * it.width]; const col = it.palette[c]; if (!col || col[3] === 0) continue;
		const tx = it.x + x, ty = it.y + y; if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
		rgba.set([col[0], col[1], col[2], 255], (tx + ty * width) * 4);
	}
	return rgba;
}
/** nearest neighbour upscale of an RGBA buffer */
export function scale(width, height, rgba, f) {
	const out = new Uint8Array(width * f * height * f * 4);
	for (let y = 0; y < height * f; y++) for (let x = 0; x < width * f; x++)
		out.set(rgba.subarray(((Math.floor(x / f)) + Math.floor(y / f) * width) * 4, ((Math.floor(x / f)) + Math.floor(y / f) * width) * 4 + 4), (x + y * width * f) * 4);
	return out;
}
