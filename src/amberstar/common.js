// Shared helpers for running Amberstar on the Ambermoon engine (see AMBERSTAR.md).
// Amberstar data is loaded with the loaders of the Amberstar web port (amberstar/src/data) and
// converted into the data structures of the Ambermoon port (src/ambermoon).
import { Graphic } from '../ambermoon/Ambermoon.Data.Common/Graphic.js';

/** Converts an Amberstar palette color channel (0..224 in steps of 32 from the 3 bit hardware value) to 0..255. */
function channel(value) {
	// The wide palettes store 0..7 per channel which the Amberstar loader multiplies with 32.
	// Expand it to the full range (7 -> 255) like real Amiga/ST hardware output.
	if (value % 32 === 0 && value <= 224)
		return Math.round(value / 32 * 255 / 7);
	return value;
}

/** Amberstar palette ([r, g, b][]) -> Ambermoon palette graphic (32x1 RGBA, color 0 transparent). */
export function toAmbermoonPalette(colors, transparentColor0 = true) {
	const palette = new Graphic();
	palette.Width = 32;
	palette.Height = 1;
	palette.IndexedGraphic = false;
	palette.Data = new Uint8Array(32 * 4);
	for (let i = 0; i < Math.min(32, colors.length); i++) {
		const [r, g, b] = colors[i];
		palette.Data[i * 4 + 0] = channel(r);
		palette.Data[i * 4 + 1] = channel(g);
		palette.Data[i * 4 + 2] = channel(b);
		palette.Data[i * 4 + 3] = transparentColor0 && i === 0 ? 0 : 255;
	}
	return palette;
}

/** Amberstar Graphic (width, height, data) -> Ambermoon indexed Graphic. */
export function toAmbermoonGraphic(graphic, colorOffset = 0) {
	const result = new Graphic();
	result.Width = graphic.width;
	result.Height = graphic.height;
	result.IndexedGraphic = true;
	result.Data = colorOffset === 0 ? graphic.data.slice() : graphic.data.map(c => c === 0 ? 0 : c + colorOffset);
	return result;
}

/** Empty indexed Ambermoon graphic */
export function emptyGraphic(width, height) {
	const result = new Graphic();
	result.Width = width;
	result.Height = height;
	result.IndexedGraphic = true;
	result.Data = new Uint8Array(width * height);
	return result;
}

/** Places an Amberstar graphic into a larger empty one (e.g. 16x16 icons as 16x32 character frames, bottom aligned). */
export function placeGraphic(graphic, width, height, x, y) {
	const result = emptyGraphic(width, height);
	for (let gy = 0; gy < graphic.height; gy++) {
		for (let gx = 0; gx < graphic.width; gx++) {
			const tx = x + gx, ty = y + gy;
			if (tx >= 0 && ty >= 0 && tx < width && ty < height)
				result.Data[tx + ty * width] = graphic.data[gx + gy * graphic.width];
		}
	}
	return result;
}

function rgbOf(palette, index) {
	return [palette.Data[index * 4], palette.Data[index * 4 + 1], palette.Data[index * 4 + 2], palette.Data[index * 4 + 3]];
}

/**
 * Builds a color index mapping from a source palette ([r,g,b][] Amberstar colors) to the nearest colors of a
 * destination Ambermoon palette graphic. Index 0 (transparent) stays 0. Returns an array source -> destination.
 * `allowed` optionally restricts the destination indices.
 */
export function buildColorMapping(sourceColors, destinationPalette, allowed = null) {
	const candidates = allowed ?? Array.from({ length: 32 }, (_, i) => i).filter(i => i > 0);
	const mapping = [0];
	for (let i = 1; i < sourceColors.length; i++) {
		const [r, g, b] = sourceColors[i].map(channel);
		let best = candidates[0];
		let bestDistance = Infinity;
		for (const c of candidates) {
			const [dr, dg, db, da] = rgbOf(destinationPalette, c);
			if (da === 0)
				continue;
			// weighted euclidean distance (human perception)
			const distance = 2 * (r - dr) ** 2 + 4 * (g - dg) ** 2 + 3 * (b - db) ** 2;
			if (distance < bestDistance) {
				bestDistance = distance;
				best = c;
			}
		}
		mapping.push(best);
	}
	return mapping;
}

/** Amberstar graphic -> Ambermoon graphic with remapped color indices (see buildColorMapping). */
export function remapGraphic(graphic, mapping) {
	const result = toAmbermoonGraphic(graphic);
	result.Data = result.Data.map(c => mapping[c] ?? 0);
	return result;
}

/** Concatenates frames horizontally (Ambermoon animated graphics are compound graphics). */
export function compoundGraphic(frames) {
	if (frames.length === 1)
		return frames[0];
	const width = frames[0].Width;
	const height = frames[0].Height;
	const result = emptyGraphic(width * frames.length, height);
	frames.forEach((frame, f) => {
		for (let y = 0; y < height; y++)
			result.Data.set(frame.Data.subarray(y * width, (y + 1) * width), y * result.Width + f * width);
	});
	return result;
}
