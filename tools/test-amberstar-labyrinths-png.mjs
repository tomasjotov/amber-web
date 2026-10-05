// Tiny PNG writer for previews of converted graphics (Node only, no dependencies).
import fs from 'fs';
import zlib from 'zlib';

const crcTable = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++)
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes) {
	let c = 0xffffffff;
	for (const b of bytes)
		c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, 'ascii');
	Buffer.from(data).copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}

/** Writes RGBA pixel data (Uint8Array width*height*4) as PNG. */
export function writePng(file, width, height, rgba) {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0;
		Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8; // bit depth
	header[9] = 6; // RGBA
	fs.writeFileSync(file, Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', zlib.deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]));
}

/** Simple RGBA canvas to compose previews of indexed graphics. */
export class Canvas {
	constructor(width, height, background = [40, 40, 40, 255]) {
		this.width = width;
		this.height = height;
		this.data = new Uint8Array(width * height * 4);
		for (let i = 0; i < width * height; i++)
			this.data.set(background, i * 4);
	}

	/**
	 * Draws an indexed graphic ({Width, Height, Data} Ambermoon or {width, height, data} Amberstar).
	 * palette: array of [r,g,b] or an Ambermoon palette graphic (RGBA data). Index 0 is transparent if transparent0.
	 */
	drawIndexed(graphic, x, y, palette, { scale = 1, transparent0 = true, mapColor = null } = {}) {
		const w = graphic.Width ?? graphic.width, h = graphic.Height ?? graphic.height, d = graphic.Data ?? graphic.data;
		const color = i => {
			if (mapColor)
				return mapColor(i);
			if (Array.isArray(palette))
				return palette[i] ?? [255, 0, 255];
			return [palette.Data[i * 4], palette.Data[i * 4 + 1], palette.Data[i * 4 + 2]];
		};
		for (let gy = 0; gy < h; gy++) {
			for (let gx = 0; gx < w; gx++) {
				const index = d[gx + gy * w];
				if (transparent0 && index === 0)
					continue;
				const c = color(index);
				for (let sy = 0; sy < scale; sy++) {
					for (let sx = 0; sx < scale; sx++) {
						const px = x + gx * scale + sx, py = y + gy * scale + sy;
						if (px < 0 || py < 0 || px >= this.width || py >= this.height)
							continue;
						const o = (px + py * this.width) * 4;
						this.data[o] = c[0];
						this.data[o + 1] = c[1];
						this.data[o + 2] = c[2];
						this.data[o + 3] = 255;
					}
				}
			}
		}
	}

	fillRect(x, y, w, h, c) {
		for (let py = Math.max(0, y); py < Math.min(this.height, y + h); py++)
			for (let px = Math.max(0, x); px < Math.min(this.width, x + w); px++)
				this.data.set([c[0], c[1], c[2], 255], (px + py * this.width) * 4);
	}

	save(file) {
		writePng(file, this.width, this.height, this.data);
	}
}
