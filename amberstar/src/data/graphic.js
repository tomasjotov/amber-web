// Palette indexed graphics (port of Amber.Assets.Common.Graphic).

export class Graphic {
	/**
	 * @param {number} width
	 * @param {number} height
	 * @param {Uint8Array} [data] palette indices, row-major
	 */
	constructor(width, height, data) {
		this.width = width;
		this.height = height;
		this.data = data ?? new Uint8Array(width * height);
		if (this.data.length !== width * height)
			throw new Error(`Unexpected graphic data size ${this.data.length} for ${width}x${height}`);
	}

	static fromBitPlanes(width, height, data, planes, frameCount = 1) {
		const pixels = readBitPlanes(width, height, data, planes, frameCount);

		if (frameCount === 1)
			return new Graphic(width, height, pixels);

		// Frames are stored vertically, we want them side by side.
		const result = new Uint8Array(pixels.length);
		const totalWidth = width * frameCount;
		for (let f = 0; f < frameCount; f++) {
			for (let y = 0; y < height; y++) {
				const src = (f * height + y) * width;
				result.set(pixels.subarray(src, src + width), y * totalWidth + f * width);
			}
		}
		return new Graphic(totalWidth, height, result);
	}

	clone() {
		return new Graphic(this.width, this.height, this.data.slice());
	}

	getPart(x, y, width, height) {
		if (x < 0 || y < 0 || x + width > this.width || y + height > this.height)
			throw new Error('Part is out of bounds.');
		const part = new Uint8Array(width * height);
		for (let row = 0; row < height; row++) {
			const src = (y + row) * this.width + x;
			part.set(this.data.subarray(src, src + width), row * width);
		}
		return new Graphic(width, height, part);
	}

	getColorIndexAt(x, y) {
		return this.data[x + y * this.width];
	}

	/** If blend is true, index 0 of the overlay is transparent. */
	addOverlay(x, y, overlay, blend = false) {
		if (x < 0 || y < 0 || x + overlay.width > this.width || y + overlay.height > this.height)
			throw new Error('Overlay is out of bounds.');
		for (let row = 0; row < overlay.height; row++) {
			const src = row * overlay.width;
			const dst = (y + row) * this.width + x;
			if (!blend)
				this.data.set(overlay.data.subarray(src, src + overlay.width), dst);
			else {
				for (let i = 0; i < overlay.width; i++) {
					const c = overlay.data[src + i];
					if (c !== 0)
						this.data[dst + i] = c;
				}
			}
		}
	}

	applyBitMaskedPlanarValues(x, y, masks, values, planes) {
		const offset = y * this.width + x;
		const results = new Array(planes);

		for (let p = 0; p < planes; p++) {
			let plane = 0;
			const checkMask = 1 << p;
			for (let i = 0; i < 16; i++)
				if (this.data[offset + i] & checkMask)
					plane |= 1 << (15 - i);
			plane &= ~masks[p] & 0xffff;
			plane |= values[p];
			results[p] = plane;
		}

		for (let i = 0; i < 16; i++) {
			let pixel = 0;
			for (let p = 0; p < planes; p++)
				if (results[p] & (1 << (15 - i)))
					pixel |= 1 << p;
			this.data[offset + i] = pixel;
		}
	}

	replaceColorIndex(oldIndex, newIndex) {
		for (let i = 0; i < this.data.length; i++)
			if (this.data[i] === oldIndex)
				this.data[i] = newIndex;
	}

	maskWith(mask, transparentColorIndex = 0) {
		for (let y = 0; y < Math.min(this.height, mask.height); y++)
			for (let x = 0; x < Math.min(this.width, mask.width); x++)
				if (mask.data[x + y * mask.width] !== 0)
					this.data[x + y * this.width] = transparentColorIndex;
	}

	fillRectsWithColor(rects, colorIndex) {
		const g = this.clone();
		for (const r of rects)
			for (let y = Math.max(0, r.y); y < Math.min(g.height, r.y + r.h); y++)
				for (let x = Math.max(0, r.x); x < Math.min(g.width, r.x + r.w); x++)
					g.data[x + y * g.width] = colorIndex;
		return g;
	}

	/** Creates a horizontally concatenated graphic from frames. */
	static fromFrames(frames) {
		const width = frames.reduce((s, f) => s + f.width, 0);
		const height = Math.max(...frames.map(f => f.height));
		const g = new Graphic(width, height);
		let x = 0;
		for (const f of frames) {
			g.addOverlay(x, 0, f);
			x += f.width;
		}
		return g;
	}
}

export function readBitPlanes(width, height, data, planes, frameCount = 1) {
	if (width <= 8 && planes === 1 && frameCount === 1) {
		// font glyphs: one byte per row
		const glyph = new Uint8Array(width * height);
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++)
				if (data[y] & (1 << (7 - x)))
					glyph[y * width + x] = 1;
		return glyph;
	}

	const wordsPerLine = (width + 15) >> 4;
	const readWidth = wordsPerLine * 16;
	if (data.length !== frameCount * readWidth * height * planes / 8)
		throw new Error(`Invalid data length ${data.length} for ${planes}-bit ${width}x${height}x${frameCount} graphic.`);

	const pixels = new Uint8Array(frameCount * width * height);
	const plane = new Array(planes);
	let index = 0;

	for (let y = 0; y < frameCount * height; y++) {
		let x0 = 0;
		for (let w = 0; w < wordsPerLine; w++) {
			for (let p = 0; p < planes; p++) {
				plane[p] = (data[index] << 8) | data[index + 1];
				index += 2;
			}
			for (let x = 0; x < 16; x++, x0++) {
				if (x0 >= width)
					continue;
				let pixel = 0;
				const mask = 1 << (15 - x);
				for (let p = 0; p < planes; p++)
					if (plane[p] & mask)
						pixel |= 1 << p;
				pixels[y * width + x0] = pixel;
			}
		}
	}

	return pixels;
}

// ---- palettes ----
// A palette is an array of [r, g, b] (0..255) entries.

/** Wide palette: word count + 4 bytes per color (ARGB, 0..7 per channel) */
export function loadWidePalette(reader) {
	const size = reader.readWord();
	const colors = [];
	for (let i = 0; i < size; i++) {
		reader.readByte();
		const r = reader.readByte(), g = reader.readByte(), b = reader.readByte();
		colors.push([r * 32, g * 32, b * 32]);
	}
	return colors;
}

/** Compact palette data, each byte shifted left by 1 like the original code */
export function loadPaletteColors(reader, numColors) {
	const data = reader.readBytes(numColors * 2);
	for (let i = 0; i < data.length; i++)
		data[i] = (data[i] << 1) & 0xff;
	return data;
}

export function paletteFromCompact(data) {
	const colors = [];
	for (let i = 0; i < data.length / 2; i++) {
		const r = data[i * 2] & 0x0f;
		const gb = data[i * 2 + 1];
		const g = gb >> 4, b = gb & 0x0f;
		colors.push([r | (r << 4), g | (g << 4), b | (b << 4)]);
	}
	return colors;
}

/** Compact palette (16 colors, 2 bytes per color) */
export function loadPalette(reader, numColors = 16) {
	return paletteFromCompact(loadPaletteColors(reader, numColors));
}

export function paletteFromBytes(bytes) {
	return paletteFromCompact(Uint8Array.from(bytes, b => (b << 1) & 0xff));
}

// ---- graphics with header ----

export function loadGraphicWithHeader(reader) {
	const width = reader.readWord() + 1;
	const height = reader.readWord() + 1;
	const planes = reader.readWord();

	if (planes !== 4)
		throw new Error('Unexpected plane count for legacy graphic data.');

	const readWidth = (width + 15) & ~15;
	const data = reader.readBytes(readWidth * height * planes / 8);
	return Graphic.fromBitPlanes(width, height, data, planes);
}

export function loadGraphicList(reader) {
	let totalDataSize = reader.readDword();
	const count = reader.readByte();
	if (reader.readByte() !== 0)
		throw new Error('Invalid graphic list.');
	const graphics = [];
	for (let i = 0; i < count; i++) {
		const size = reader.readDword();
		const end = reader.position + size;
		graphics.push(loadGraphicWithHeader(reader));
		if (reader.position !== end)
			throw new Error('Invalid graphic list.');
		totalDataSize -= size;
	}
	if (totalDataSize !== 1)
		throw new Error('Invalid graphic list.');
	return graphics;
}
