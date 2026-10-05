// The Amberstar title picture (INTRO.UDO) for the main menu and the outro.
//
// INTRO.UDO is a LOB packed file of 46400 bytes:
//   0..6399      200 palettes of 16 colors (Atari ST/Amiga 0x0RGB words, 3 bits per channel). Palette 0 holds
//                colors 0..15 of the picture; palette y holds the colors 16..31 of picture line y (the picture
//                uses a raster/copper palette change on every line).
//   6400..46399  320x200 pixels, 5 bit planes stored one after another (8000 bytes per plane).
// The picture uses 72 different colors this way. The Ambermoon engine draws a sprite with one 32 color palette,
// so the colors are reduced to 31 (agglomerative merge of the closest, rarest colors; the result is
// practically indistinguishable from the original). Color index 0 stays transparent (black background).
import { readContainer } from '../../../amberstar/src/data/container.js';
import { Graphic } from '../../ambermoon/Ambermoon.Data.Common/Graphic.js';

const Width = 320;
const Height = 200;

function channel(v) {
	return Math.round(v * 255 / 7);
}

/** Returns { graphic: Ambermoon Graphic 320x200 (indices 1..31), palette: Ambermoon palette graphic } or null. */
export function loadTitlePicture(source) {
	const file = source.files.get('INTRO.UDO');
	if (!file)
		return null;
	const data = readContainer(file).get(1)?.data;
	if (!data || data.length < 46400)
		return null;
	const color = offset => {
		const v = (data[offset] << 8) | data[offset + 1];
		return ((v >> 8) & 7) * 64 + ((v >> 4) & 7) * 8 + (v & 7); // 9 bit key
	};
	const pixels = new Uint16Array(Width * Height);
	const histogram = new Map();
	for (let y = 0; y < Height; y++) {
		for (let x = 0; x < Width; x++) {
			let c = 0;
			for (let p = 0; p < 5; p++)
				c |= ((data[6400 + p * 8000 + y * 40 + (x >> 3)] >> (7 - (x & 7))) & 1) << p;
			const key = color(c < 16 ? c * 2 : y * 32 + (c - 16) * 2);
			pixels[x + y * Width] = key;
			histogram.set(key, (histogram.get(key) ?? 0) + 1);
		}
	}

	// Reduce to 31 colors
	const rgb = key => [key >> 6, (key >> 3) & 7, key & 7];
	const distance = (a, b) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
	let clusters = [...histogram.entries()].map(([key, count]) => ({ keys: [key], color: rgb(key), count }));
	while (clusters.length > 31) {
		let best = null, bestValue = Infinity;
		for (let i = 0; i < clusters.length; i++) {
			for (let j = i + 1; j < clusters.length; j++) {
				const value = distance(clusters[i].color, clusters[j].color) * Math.min(clusters[i].count, clusters[j].count);
				if (value < bestValue) {
					bestValue = value;
					best = [i, j];
				}
			}
		}
		const [i, j] = best;
		const a = clusters[i], b = clusters[j];
		clusters[i] = { keys: [...a.keys, ...b.keys], color: a.count >= b.count ? a.color : b.color, count: a.count + b.count };
		clusters.splice(j, 1);
	}
	const indexOfKey = new Map();
	clusters.forEach((cluster, i) => cluster.keys.forEach(key => indexOfKey.set(key, i + 1)));

	const graphic = new Graphic(Width, Height, 0);
	for (let i = 0; i < pixels.length; i++)
		graphic.Data[i] = indexOfKey.get(pixels[i]);

	const palette = new Graphic();
	palette.Width = 32;
	palette.Height = 1;
	palette.IndexedGraphic = false;
	palette.Data = new Uint8Array(32 * 4);
	clusters.forEach((cluster, i) => {
		const [r, g, b] = cluster.color;
		palette.Data.set([channel(r), channel(g), channel(b), 255], (i + 1) * 4);
	});
	return { graphic, palette };
}
