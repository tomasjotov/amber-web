// Web port addition (not part of Ambermoon.net): palette index preserving pixel art upscaler for the HD graphics mode.
//
// Implements MMPX ("MMPX Style-Preserving Pixel-Art Magnification", Morgan McGuire and Mara Gagiu, JCGT 2021,
// reference implementation MIT licensed, https://casual-effects.com/research/McGuire2021PixelArt/).
// MMPX is a 2x magnifier that only copies source pixels (it never blends colors), so it works directly on the
// palette indices of the graphics: the output is again an indexed graphic and all palette features of the renderer
// (palette per sprite, palette fading, color replacement, mask colors, transparency, sky color replacement) keep working.
// 4x = MMPX applied twice.
//
// The upscaling runs on the GPU (one fragment shader pass per 2x step, render to an R8 texture) so even large texture
// atlases are scaled in milliseconds when they are used for the first time. Every graphic of an atlas is a separate
// "region": neighbors outside of the region are clamped (or wrapped for tileable textures), so graphics never bleed into
// each other. Luminance comparisons (used by MMPX to decide ambiguous diagonals) use the palette given per region.
//
// A CPU implementation of the very same algorithm (MmpxScale2x) is included as fallback and as reference for tests.

import { ShaderProgram } from './ShaderProgram.js';
import { VertexArrayObject } from './VertexArrayObject.js';
import { Texture } from './Texture.js';
import { UpscaleFlags } from '../Ambermoon.Core/Render/TextureAtlasManager.js';

export { UpscaleFlags };

const RegionTextureWidth = 2048; // texels
const RegionTexels = 4; // texels per region

// #region CPU implementation

/**
 * Returns the MMPX luminance ((r + g + b + 1) * (256 - alpha) like the reference implementation) of the palette colors.
 * Transparent pixels (index 0 of non-opaque graphics) get a value above all colors.
 * palette: Uint8Array RGBA (32 colors) or null (grayscale ramp by index)
 */
export function CreateLumaTable(palette, opaque) {
	const luma = new Int32Array(256);

	for (let i = 0; i < 256; ++i) {
		const index = i >= 32 ? 0 : i; // the renderer shows indices >= 32 with color 0 (e.g. black of event pictures)
		let r, g, b, a;

		if (palette) {
			r = palette[index * 4 + 0];
			g = palette[index * 4 + 1];
			b = palette[index * 4 + 2];
			a = palette[index * 4 + 3];
		} else {
			r = g = b = index * 8;
			a = 255;
		}

		// Transparent pixels are treated as brighter than any color (outlines grow into transparent areas).
		luma[i] = i === 0 && !opaque ? 1000000 : (r + g + b + 1) * (256 - a);
	}

	return luma;
}

/**
 * MMPX 2x of an indexed image region.
 * src: Uint8Array (width * height), luma: Int32Array(256) from CreateLumaTable, flags: UpscaleFlags
 * orig: for the second pass of 4x the input of the first pass (width / 2 * height / 2), otherwise null
 * Returns a Uint8Array (2 * width * 2 * height).
 */
export function MmpxScale2x(src, width, height, luma, flags = 0, orig = null, noise = null, noiseShift = 0) {
	const noiseWidth = width >> noiseShift;
	const dst = new Uint8Array(width * height * 4);
	const dstWidth = width * 2;
	const wrapX = (flags & UpscaleFlags.WrapX) !== 0;
	const wrapY = (flags & UpscaleFlags.WrapY) !== 0;
	const px = (x, y) => {
		if (x < 0 || x >= width)
			x = wrapX ? ((x % width) + width) % width : (x < 0 ? 0 : width - 1);
		if (y < 0 || y >= height)
			y = wrapY ? ((y % height) + height) % height : (y < 0 ? 0 : height - 1);
		return src[y * width + x];
	};

	for (let y = 0; y < height; ++y) {
		for (let x = 0; x < width; ++x) {
			const A = px(x - 1, y - 1), B = px(x, y - 1), C = px(x + 1, y - 1);
			const D = px(x - 1, y), E = px(x, y), F = px(x + 1, y);
			const G = px(x - 1, y + 1), H = px(x, y + 1), I = px(x + 1, y + 1);
			let J = E, K = E, L = E, M = E;

			const isNoise = noise != null && noise[(y >> noiseShift) * noiseWidth + (x >> noiseShift)] !== 0;

			if (!isNoise && (A !== E || B !== E || C !== E || D !== E || F !== E || G !== E || H !== E || I !== E)) {
				const P = px(x, y - 2), S = px(x, y + 2), Q = px(x - 2, y), R = px(x + 2, y);
				const Bl = luma[B], Dl = luma[D], El = luma[E], Fl = luma[F], Hl = luma[H];

				// 1:1 slope rules
				if ((D === B && D !== H && D !== F) && (El >= Dl || E === A) && (E === A || E === C || E === G) && ((El < Dl) || A !== D || E !== P || E !== Q)) J = D;
				if ((B === F && B !== D && B !== H) && (El >= Bl || E === C) && (E === A || E === C || E === I) && ((El < Bl) || C !== B || E !== P || E !== R)) K = B;
				if ((H === D && H !== F && H !== B) && (El >= Hl || E === G) && (E === A || E === G || E === I) && ((El < Hl) || G !== H || E !== S || E !== Q)) L = H;
				if ((F === H && F !== B && F !== D) && (El >= Fl || E === I) && (E === C || E === G || E === I) && ((El < Fl) || I !== H || E !== R || E !== S)) M = F;

				// Intersection rules
				if ((E !== F && E === C && E === I && E === D && E === Q && F === B && F === H) && (F !== px(x + 3, y))) K = M = F;
				if ((E !== D && E === A && E === G && E === F && E === R && D === B && D === H) && (D !== px(x - 3, y))) J = L = D;
				if ((E !== H && E === G && E === I && E === B && E === P && H === D && H === F) && (H !== px(x, y + 3))) L = M = H;
				if ((E !== B && E === A && E === C && E === H && E === S && B === D && B === F) && (B !== px(x, y - 3))) J = K = B;
				if (Bl < El && E === G && E === H && E === I && E === S && E !== A && E !== D && E !== C && E !== F) J = K = B;
				if (Hl < El && E === A && E === B && E === C && E === P && E !== D && E !== G && E !== I && E !== F) L = M = H;
				if (Fl < El && E === A && E === D && E === G && E === Q && E !== B && E !== C && E !== I && E !== H) K = M = F;
				if (Dl < El && E === C && E === F && E === I && E === R && E !== B && E !== A && E !== G && E !== H) J = L = D;

				// 2:1 slope rules
				if (H !== B) {
					if (H !== A && H !== E && H !== C) {
						if (H === G && H === F && H === R && H !== D && H !== px(x + 2, y - 1)) L = M;
						if (H === I && H === D && H === Q && H !== F && H !== px(x - 2, y - 1)) M = L;
					}

					if (B !== I && B !== G && B !== E) {
						if (B === A && B === F && B === R && B !== D && B !== px(x + 2, y + 1)) J = K;
						if (B === C && B === D && B === Q && B !== F && B !== px(x - 2, y + 1)) K = J;
					}
				}

				if (F !== D) {
					if (D !== I && D !== E && D !== C) {
						if (D === A && D === H && D === S && D !== B && D !== px(x + 1, y + 2)) J = L;
						if (D === G && D === B && D === P && D !== H && D !== px(x + 1, y - 2)) L = J;
					}

					if (F !== E && F !== A && F !== G) {
						if (F === C && F === H && F === S && F !== B && F !== px(x - 1, y + 2)) K = M;
						if (F === I && F === B && F === P && F !== H && F !== px(x - 1, y - 2)) M = K;
					}
				}
			}

			if (orig != null && (J !== E || K !== E || L !== E || M !== E)) {
				// Second pass of 4x: keep checkerboard corners of the previous pass sharp (see the GPU shader)
				const ox = x >> 1, oy = y >> 1, ow = width >> 1, oh = height >> 1;
				const op = (px_, py_) => {
					if (px_ < 0 || px_ >= ow)
						px_ = wrapX ? ((px_ % ow) + ow) % ow : (px_ < 0 ? 0 : ow - 1);
					if (py_ < 0 || py_ >= oh)
						py_ = wrapY ? ((py_ % oh) + oh) % oh : (py_ < 0 ? 0 : oh - 1);
					return orig[py_ * ow + px_];
				};
				const keep = (dx, dy) => {
					if ((dx < 0 ? (x & 1) !== 0 : (x & 1) !== 1) || (dy < 0 ? (y & 1) !== 0 : (y & 1) !== 1))
						return false;
					const o0 = op(ox, oy), o1 = op(ox + dx, oy), o2 = op(ox, oy + dy), o3 = op(ox + dx, oy + dy);
					return o0 === o3 && o1 === o2 && o0 !== o1;
				};
				if (J !== E && keep(-1, -1)) J = E;
				if (K !== E && keep(1, -1)) K = E;
				if (L !== E && keep(-1, 1)) L = E;
				if (M !== E && keep(1, 1)) M = E;
			}

			const o = (y * 2) * dstWidth + x * 2;
			dst[o] = J;
			dst[o + 1] = K;
			dst[o + dstWidth] = L;
			dst[o + dstWidth + 1] = M;
		}
	}

	return ResolveCrossings(src, width, height, dst, luma, flags);
}

/**
 * Web port addition to MMPX: at a corner where 2x2 source pixels form a checkerboard (a b / b a) MMPX may connect both
 * diagonals, which produces an "X" (typical in dithered / noisy pictures). Only the darker diagonal is connected then.
 * raw: MMPX output (2 * width * 2 * height). Returns the corrected output.
 */
export function ResolveCrossings(src, width, height, raw, luma, flags = 0) {
	const wrapX = (flags & UpscaleFlags.WrapX) !== 0;
	const wrapY = (flags & UpscaleFlags.WrapY) !== 0;
	const dstWidth = width * 2;
	const dstHeight = height * 2;
	const result = new Uint8Array(raw);
	const wrap = (v, n, w) => v < 0 || v >= n ? (w ? ((v % n) + n) % n : (v < 0 ? 0 : n - 1)) : v;
	const px = (x, y) => src[wrap(y, height, wrapY) * width + wrap(x, width, wrapX)];
	const out = (x, y) => raw[wrap(y, dstHeight, wrapY) * dstWidth + wrap(x, dstWidth, wrapX)];

	for (let oy = 0; oy < dstHeight; ++oy) {
		for (let ox = 0; ox < dstWidth; ++ox) {
			const sx = ox >> 1, sy = oy >> 1;
			const dx = (ox & 1) === 0 ? -1 : 1, dy = (oy & 1) === 0 ? -1 : 1;
			const E = px(sx, sy), X = px(sx + dx, sy), Y = px(sx, sy + dy), Z = px(sx + dx, sy + dy);

			if (E !== Z || X !== Y || E === X)
				continue;

			// E diagonal flipped (the corner of E or Z was given to X) and X diagonal flipped (corner of X or Y given to E)?
			const eFlipped = out(ox, oy) !== E || out(ox + dx, oy + dy) !== E;
			const xFlipped = out(ox + dx, oy) !== X || out(ox, oy + dy) !== X;

			if (eFlipped && xFlipped)
				result[oy * dstWidth + ox] = luma[E] < luma[X] || (luma[E] === luma[X] && E < X) ? E : X;
		}
	}

	return result;
}

/**
 * Web port addition to MMPX: noise detection. Edge directed scalers turn noisy / dithered areas (foliage, painted
 * backgrounds) into "worms" or labyrinth patterns. A pixel is "weakly connected" if at most one of its 4 neighbors has
 * the same color. Pixels with many weakly connected pixels in their 5x5 neighborhood are marked as noise and are not
 * changed by the upscaler (they are only magnified, which keeps the original look of dithering).
 * Returns a Uint8Array (width * height), 1 = noise.
 */
export function ComputeNoiseMap(src, width, height, flags = 0, threshold = NoiseThreshold) {
	const wrapX = (flags & UpscaleFlags.WrapX) !== 0;
	const wrapY = (flags & UpscaleFlags.WrapY) !== 0;
	const wrap = (v, n, w) => v < 0 || v >= n ? (w ? ((v % n) + n) % n : (v < 0 ? 0 : n - 1)) : v;
	const px = (x, y) => src[wrap(y, height, wrapY) * width + wrap(x, width, wrapX)];
	const weak = new Uint8Array(width * height);
	const noise = new Uint8Array(width * height);

	for (let y = 0; y < height; ++y) {
		for (let x = 0; x < width; ++x) {
			const e = px(x, y);
			const same = (px(x - 1, y) === e) + (px(x + 1, y) === e) + (px(x, y - 1) === e) + (px(x, y + 1) === e);
			weak[y * width + x] = same <= 1 ? 1 : 0;
		}
	}

	for (let y = 0; y < height; ++y) {
		for (let x = 0; x < width; ++x) {
			let count = 0;

			for (let dy = -2; dy <= 2; ++dy)
				for (let dx = -2; dx <= 2; ++dx)
					count += weak[wrap(y + dy, height, wrapY) * width + wrap(x + dx, width, wrapX)];

			noise[y * width + x] = count >= threshold ? 1 : 0;
		}
	}

	return noise;
}

/** Number of weakly connected pixels in the 5x5 neighborhood from which on a pixel is treated as noise */
export const NoiseThreshold = 0;

/**
 * Palette colors for XbrScale: Float32Array(256 * 4) with RGBA in 0..1 (alpha 0 for transparent index 0).
 * palette: Uint8Array RGBA (32 colors) or null (grayscale ramp)
 */
export function CreateColorTable(palette, opaque) {
	const colors = new Float32Array(256 * 4);

	for (let i = 0; i < 256; ++i) {
		if (i === 0 && !opaque)
			continue;

		const index = i >= 32 ? 0 : i;

		for (let k = 0; k < 3; ++k)
			colors[i * 4 + k] = palette ? palette[index * 4 + k] / 255 : index / 31;

		colors[i * 4 + 3] = 1;
	}

	return colors;
}

/**
 * Index preserving xBR (web port): the edge detection of Hyllian's xBR-lv2 (with the tweaks of the screen filter
 * GraphicFilter.PixelArt, see ScreenShader.PixelArtScalerFunctions), but instead of blending colors each output pixel
 * takes either the color of the source pixel or the color of the neighbor behind the detected edge. So the result is
 * an indexed graphic again with smooth 45, 30 and 60 degree edges at any integer factor.
 * colors: from CreateColorTable. Returns Uint8Array (width * factor * height * factor).
 */
export function XbrScale(src, width, height, colors, flags, factor, noise = null) {
	const wrapX = (flags & UpscaleFlags.WrapX) !== 0;
	const wrapY = (flags & UpscaleFlags.WrapY) !== 0;
	const wrap = (v, n, w) => v < 0 || v >= n ? (w ? ((v % n) + n) % n : (v < 0 ? 0 : n - 1)) : v;
	// src: Uint8Array (width * height) or an accessor (x, y) => index for coordinates relative to the graphic
	const px = typeof src === "function" ? src : (x, y) => src[wrap(y, height, wrapY) * width + wrap(x, width, wrapX)];
	const cd = (a, b) => {
		const dr = colors[a * 4] - colors[b * 4], dg = colors[a * 4 + 1] - colors[b * 4 + 1], db = colors[a * 4 + 2] - colors[b * 4 + 2];
		const da = colors[a * 4 + 3] - colors[b * 4 + 3];
		const y = Math.fround(dr * 0.299 + dg * 0.587 + db * 0.114);
		const u = Math.fround(dr * -0.14713 + dg * -0.28886 + db * 0.436);
		const v = Math.fround(dr * 0.615 + dg * -0.51499 + db * -0.10001);
		return 48 * (Math.abs(y) + 0.5 * (Math.abs(u) + Math.abs(v)) + Math.abs(da));
	};
	const xdiff = (a, b) => cd(a, b) > 0.05;
	const xeq = (a, b) => cd(a, b) <= 15;
	const xneq = (a, b) => cd(a, b) > 15;
	const outWidth = width * factor;
	const dst = new Uint8Array(outWidth * height * factor);
	// rotations (R * v) of the canonical bottom right neighborhood: [r00, r01, r10, r11] with column major mat2 like GLSL
	const rotations = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]];

	for (let y = 0; y < height; ++y) {
		for (let x = 0; x < width; ++x) {
			const e = px(x, y);
			const corners = [];

			if (noise == null || noise[y * width + x] === 0) {
				for (const R of rotations) {
					// GLSL mat2(a, b, c, d): columns (a, b) and (c, d); R * v = (a * vx + c * vy, b * vx + d * vy)
					const n = (vx, vy) => px(x + R[0] * vx + R[2] * vy, y + R[1] * vx + R[3] * vy);
					const b = n(0, -1), c = n(1, -1), d = n(-1, 0), f = n(1, 0), g = n(-1, 1), h = n(0, 1), i = n(1, 1);
					const i4 = n(2, 1), i5 = n(1, 2), h5 = n(0, 2), f4 = n(2, 0);
					const isolated = cd(b, d) + cd(d, h) + cd(h, f) < 2;
					const irlv0 = xdiff(e, f) && xdiff(e, h) && cd(e, i) >= 2 && !isolated;
					const irlv1 = irlv0 && ((xneq(f, b) && xneq(f, c)) || (xneq(h, d) && xneq(h, g)) ||
						(xeq(e, i) && ((xneq(f, f4) && xneq(f, i4)) || (xneq(h, h5) && xneq(h, i5)))) || xeq(e, g) || xeq(e, c));
					const irlv2l = xdiff(e, g) && xdiff(d, g);
					const irlv2u = xdiff(e, c) && xdiff(b, c);
					const wd1 = cd(e, c) + cd(e, g) + cd(i, h5) + cd(i, f4) + 4 * cd(h, f);
					const wd2 = cd(h, d) + cd(h, i5) + cd(f, i4) + cd(f, b) + 4 * cd(e, i);
					const edri = wd1 <= wd2 && irlv0;
					const edr = wd1 + 0.1 <= wd2 && irlv1;
					const edrL = 2 * cd(f, g) <= cd(h, c) && irlv2l && edr && xeq(f, f4);
					const edrU = 2 * cd(h, c) <= cd(f, g) && irlv2u && edr && xeq(h, h5);
					corners.push({ R, edri, edr, edrL, edrU, color: cd(e, f) <= cd(e, h) ? f : h });
				}
			}

			for (let sy = 0; sy < factor; ++sy) {
				for (let sx = 0; sx < factor; ++sx) {
					let result = e;

					if (corners.length !== 0) {
						const fpx = (sx + 0.5) / factor - 0.5, fpy = (sy + 0.5) / factor - 0.5;
						const m = corners.map(({ R, edri, edr, edrL, edrU }) => {
							// q = (fp - 0.5) * R + 0.5 (row vector times matrix = transpose(R) * v)
							const qx = fpx * R[0] + fpy * R[1] + 0.5, qy = fpx * R[2] + fpy * R[3] + 0.5;
							const fx = qx + qy, fxL = 0.5 * qx + qy, fxU = 2 * qx + qy;
							return (edrL && fxL >= 1) || (edrU && fxU >= 2) || (edr && fx >= 1.5) || (edri && fx >= 1.75);
						});
						const r1 = m[2] ? corners[2].color : m[0] ? corners[0].color : e;
						const r2 = m[3] ? corners[3].color : m[1] ? corners[1].color : e;
						result = cd(e, r2) >= cd(e, r1) ? r2 : r1;
					}

					dst[(y * factor + sy) * outWidth + x * factor + sx] = result;
				}
			}
		}
	}

	return dst;
}

/**
 * Pixel accessor (x, y relative to the region) of an atlas region like the GPU shaders: outside pixels wrap (flags),
 * come from the neighbor graphics (region.neighbors: [left x, y, right x, y, top x, y, bottom x, y], -1 = none) or
 * repeat the border pixels.
 */
export function RegionAccessor(data, atlasWidth, region) {
	const { width, height } = region;
	const wrapX = (region.flags & UpscaleFlags.WrapX) !== 0;
	const wrapY = (region.flags & UpscaleFlags.WrapY) !== 0;
	const nb = region.neighbors ?? null;
	const clamp = (v, n) => v < 0 ? 0 : v >= n ? n - 1 : v;
	const wrap = (v, n) => ((v % n) + n) % n;

	return (x, y) => {
		if (!wrapX && !wrapY && nb != null && (x < 0 || y < 0 || x >= width || y >= height)) {
			let k = -1, nx = x, ny = y;

			if (x < 0) { k = 0; nx += width; } else if (x >= width) { k = 2; nx -= width; } else if (y < 0) { k = 4; ny += height; } else { k = 6; ny -= height; }

			if (nb[k] >= 0)
				return data[(nb[k + 1] + clamp(ny, height)) * atlasWidth + nb[k] + clamp(nx, width)];
		}

		const qx = wrapX ? wrap(x, width) : clamp(x, width);
		const qy = wrapY ? wrap(y, height) : clamp(y, height);
		return data[(region.y + qy) * atlasWidth + region.x + qx];
	};
}

/**
 * Upscales a whole indexed atlas on the CPU (fallback of the GPU upscaler).
 * regions: [{ x, y, width, height, flags, lumaTable }] in source pixels. Returns the scaled atlas data.
 * noiseThreshold: see ComputeNoiseMap (0 = no noise detection)
 */
export function UpscaleAtlasCPU(data, width, height, regions, factor, noiseThreshold = NoiseThreshold, algorithm = 'xbr') {
	if (algorithm === 'xbr') {
		// regions need colorTable (CreateColorTable)
		const outWidth = width * factor;
		const result = new Uint8Array(outWidth * height * factor);

		for (const region of regions) {
			const part = new Uint8Array(region.width * region.height);

			for (let y = 0; y < region.height; ++y)
				part.set(data.subarray((region.y + y) * width + region.x, (region.y + y) * width + region.x + region.width), y * region.width);

			const noise = noiseThreshold > 0 ? ComputeNoiseMap(part, region.width, region.height, region.flags, noiseThreshold) : null;
			const scaled = XbrScale(RegionAccessor(data, width, region), region.width, region.height, region.colorTable, region.flags, factor, noise);
			const rowLength = region.width * factor;

			for (let y = 0; y < region.height * factor; ++y)
				result.set(scaled.subarray(y * rowLength, (y + 1) * rowLength), (region.y * factor + y) * outWidth + region.x * factor);
		}

		return result;
	}

	let scale = 1;
	let shift = 0;
	const noiseMaps = new Map();
	let current = data;
	let previous = null;
	const extract = (buffer, bufferWidth, rx, ry, rw, rh) => {
		const part = new Uint8Array(rw * rh);

		for (let y = 0; y < rh; ++y)
			part.set(buffer.subarray((ry + y) * bufferWidth + rx, (ry + y) * bufferWidth + rx + rw), y * rw);

		return part;
	};

	while (scale < factor) {
		const curWidth = width * scale;
		const next = new Uint8Array(curWidth * 2 * height * scale * 2);
		const nextWidth = curWidth * 2;

		for (const region of regions) {
			const rw = region.width * scale;
			const rh = region.height * scale;
			const rx = region.x * scale;
			const ry = region.y * scale;
			const part = extract(current, curWidth, rx, ry, rw, rh);
			const orig = previous == null ? null : extract(previous, curWidth / 2, rx / 2, ry / 2, rw / 2, rh / 2);
			let noise = null;

			if (noiseThreshold > 0) {
				noise = noiseMaps.get(region);

				if (noise == null) {
					noise = ComputeNoiseMap(extract(data, width, region.x, region.y, region.width, region.height), region.width, region.height, region.flags, noiseThreshold);
					noiseMaps.set(region, noise);
				}
			}

			const scaled = MmpxScale2x(part, rw, rh, region.lumaTable, region.flags, orig, noise, shift);

			for (let y = 0; y < rh * 2; ++y)
				next.set(scaled.subarray(y * rw * 2, (y + 1) * rw * 2), (ry * 2 + y) * nextWidth + rx * 2);
		}

		previous = current;
		current = next;
		scale *= 2;
		++shift;
	}

	return current;
}

// #endregion

// #region GPU implementation

const VertexShader = `#version 300 es
precision highp float;
precision highp int;
uniform highp isampler2D regions;
uniform vec2 dstSize;
uniform float scale; // current scale of the source relative to the region coordinates
uniform float outScale; // output size relative to the source (2 = MMPX passes, 1 = noise passes)
flat out ivec4 vRect; // source rect (x, y, w, h) in source texels
flat out ivec4 vInfo; // flags, palette row
flat out ivec4 vNbH; // origins of the left and right neighbor graphics (-1 = none)
flat out ivec4 vNbV; // origins of the top and bottom neighbor graphics (-1 = none)
ivec4 scaleNb(ivec4 nb, int s)
{
	return ivec4(nb.x < 0 ? ivec2(-1) : nb.xy * s, nb.z < 0 ? ivec2(-1) : nb.zw * s);
}
void main()
{
	int r = gl_VertexID / 6;
	int c = gl_VertexID - r * 6;
	ivec2 t = ivec2((r * ${RegionTexels}) % ${RegionTextureWidth}, (r * ${RegionTexels}) / ${RegionTextureWidth});
	ivec4 rect = texelFetch(regions, t, 0);
	ivec4 info = texelFetch(regions, t + ivec2(1, 0), 0);
	int s = int(scale);
	vNbH = scaleNb(texelFetch(regions, t + ivec2(2, 0), 0), s);
	vNbV = scaleNb(texelFetch(regions, t + ivec2(3, 0), 0), s);
	rect *= s;
	vec2 corner = vec2((c == 1 || c == 2 || c == 4) ? 1.0f : 0.0f, (c == 2 || c == 4 || c == 5) ? 1.0f : 0.0f);
	vec2 p = (vec2(rect.xy) + corner * vec2(rect.zw)) * outScale;
	gl_Position = vec4(p / dstSize * 2.0f - 1.0f, 0.0f, 1.0f);
	vRect = rect;
	vInfo = info;
}`;

// Functions shared by the fragment shaders (vRect = source rect of the region, vInfo.x = flags, vInfo.y = palette row)
const FragmentHeader = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D src;
uniform highp sampler2D palette;
flat in ivec4 vRect;
flat in ivec4 vInfo;
flat in ivec4 vNbH;
flat in ivec4 vNbV;
out vec4 outColor;
int wrapIndex(int v, int n) // (% is undefined for negative operands in GLSL)
{
	if (v < 0)
		v += n * ((n - 1 - v) / n);
	return v % n;
}
// neighbor origin (given in the scale of vRect) in the scale of size
ivec2 nbOrigin(ivec2 nb, ivec2 size)
{
	return nb.x < 0 ? ivec2(-1) : (nb * size) / vRect.zw;
}
ivec2 regionTexel(ivec2 p, ivec2 lo, ivec2 size)
{
	ivec2 q = p - lo;
	if ((vInfo.x & 3) == 0 && (q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y))
	{
		// pixels outside of the graphic: read them from the neighbor graphic if known
		ivec2 nlo = ivec2(-1);
		ivec2 nq = q;
		if (q.x < 0) { nlo = nbOrigin(vNbH.xy, size); nq.x += size.x; }
		else if (q.x >= size.x) { nlo = nbOrigin(vNbH.zw, size); nq.x -= size.x; }
		else if (q.y < 0) { nlo = nbOrigin(vNbV.xy, size); nq.y += size.y; }
		else { nlo = nbOrigin(vNbV.zw, size); nq.y -= size.y; }
		if (nlo.x >= 0)
			return nlo + clamp(nq, ivec2(0), size - 1);
	}
	if ((vInfo.x & 1) != 0) q.x = wrapIndex(q.x, size.x); else q.x = clamp(q.x, 0, size.x - 1);
	if ((vInfo.x & 2) != 0) q.y = wrapIndex(q.y, size.y); else q.y = clamp(q.y, 0, size.y - 1);
	return lo + q;
}
int fetchIndex(highp sampler2D t, ivec2 p, ivec2 lo, ivec2 size)
{
	return int(texelFetch(t, regionTexel(p, lo, size), 0).r * 255.0f + 0.5f);
}
int idx(ivec2 p)
{
	return fetchIndex(src, p, vRect.xy, vRect.zw);
}
int luma(int i)
{
	if (i == 0 && (vInfo.x & 4) == 0)
		return 1000000; // transparent
	vec4 c = texelFetch(palette, ivec2(i >= 32 ? 0 : i, vInfo.y), 0);
	int a = int(c.a * 255.0f + 0.5f);
	return (int(c.r * 255.0f + 0.5f) + int(c.g * 255.0f + 0.5f) + int(c.b * 255.0f + 0.5f) + 1) * (256 - a);
}
void writeIndex(int v)
{
	outColor = vec4(float(v) / 255.0f, 0.0f, 0.0f, 1.0f);
}
`;

// Noise detection, pass 1 (see ComputeNoiseMap): 1 if at most one 4-neighbor has the same color
const WeakFragmentShader = FragmentHeader + `
void main()
{
	ivec2 s = ivec2(gl_FragCoord.xy);
	int e = idx(s);
	int same = int(idx(s + ivec2(-1, 0)) == e) + int(idx(s + ivec2(1, 0)) == e) + int(idx(s + ivec2(0, -1)) == e) + int(idx(s + ivec2(0, 1)) == e);
	writeIndex(same <= 1 ? 1 : 0);
}`;

// Noise detection, pass 2: 1 if the 5x5 neighborhood contains at least 'threshold' weakly connected pixels (src = weak map)
const NoiseFragmentShader = FragmentHeader + `
uniform int threshold;
void main()
{
	ivec2 s = ivec2(gl_FragCoord.xy);
	int count = 0;
	for (int dy = -2; dy <= 2; ++dy)
		for (int dx = -2; dx <= 2; ++dx)
			count += idx(s + ivec2(dx, dy));
	writeIndex(count >= threshold ? 1 : 0);
}`;

const FragmentShader = FragmentHeader + `
uniform highp sampler2D orig; // source of the previous pass (half the size of src)
uniform highp sampler2D noise; // noise map (original size, 1 = noise)
uniform int noiseShift; // log2(scale)
uniform int useNoise;
uniform float scale;
int origIdx(ivec2 p)
{
	return fetchIndex(orig, p, vRect.xy / 2, vRect.zw / 2);
}
void main()
{
	ivec2 o = ivec2(gl_FragCoord.xy);
	ivec2 s = o / 2;
	ivec2 sub = o - s * 2;
	int A = idx(s + ivec2(-1, -1)), B = idx(s + ivec2(0, -1)), C = idx(s + ivec2(1, -1));
	int D = idx(s + ivec2(-1, 0)), E = idx(s), F = idx(s + ivec2(1, 0));
	int G = idx(s + ivec2(-1, 1)), H = idx(s + ivec2(0, 1)), I = idx(s + ivec2(1, 1));
	int J = E, K = E, L = E, M = E;
	bool isNoise = useNoise != 0 && texelFetch(noise, s >> noiseShift, 0).r * 255.0f > 0.5f;
	if (!isNoise && (A != E || B != E || C != E || D != E || F != E || G != E || H != E || I != E))
	{
		int P = idx(s + ivec2(0, -2)), S = idx(s + ivec2(0, 2)), Q = idx(s + ivec2(-2, 0)), R = idx(s + ivec2(2, 0));
		int Bl = luma(B), Dl = luma(D), El = luma(E), Fl = luma(F), Hl = luma(H);
		// 1:1 slope rules
		if ((D == B && D != H && D != F) && (El >= Dl || E == A) && (E == A || E == C || E == G) && ((El < Dl) || A != D || E != P || E != Q)) J = D;
		if ((B == F && B != D && B != H) && (El >= Bl || E == C) && (E == A || E == C || E == I) && ((El < Bl) || C != B || E != P || E != R)) K = B;
		if ((H == D && H != F && H != B) && (El >= Hl || E == G) && (E == A || E == G || E == I) && ((El < Hl) || G != H || E != S || E != Q)) L = H;
		if ((F == H && F != B && F != D) && (El >= Fl || E == I) && (E == C || E == G || E == I) && ((El < Fl) || I != H || E != R || E != S)) M = F;
		// Intersection rules
		if ((E != F && E == C && E == I && E == D && E == Q && F == B && F == H) && (F != idx(s + ivec2(3, 0)))) { K = F; M = F; }
		if ((E != D && E == A && E == G && E == F && E == R && D == B && D == H) && (D != idx(s + ivec2(-3, 0)))) { J = D; L = D; }
		if ((E != H && E == G && E == I && E == B && E == P && H == D && H == F) && (H != idx(s + ivec2(0, 3)))) { L = H; M = H; }
		if ((E != B && E == A && E == C && E == H && E == S && B == D && B == F) && (B != idx(s + ivec2(0, -3)))) { J = B; K = B; }
		if (Bl < El && E == G && E == H && E == I && E == S && E != A && E != D && E != C && E != F) { J = B; K = B; }
		if (Hl < El && E == A && E == B && E == C && E == P && E != D && E != G && E != I && E != F) { L = H; M = H; }
		if (Fl < El && E == A && E == D && E == G && E == Q && E != B && E != C && E != I && E != H) { K = F; M = F; }
		if (Dl < El && E == C && E == F && E == I && E == R && E != B && E != A && E != G && E != H) { J = D; L = D; }
		// 2:1 slope rules
		if (H != B)
		{
			if (H != A && H != E && H != C)
			{
				if (H == G && H == F && H == R && H != D && H != idx(s + ivec2(2, -1))) L = M;
				if (H == I && H == D && H == Q && H != F && H != idx(s + ivec2(-2, -1))) M = L;
			}
			if (B != I && B != G && B != E)
			{
				if (B == A && B == F && B == R && B != D && B != idx(s + ivec2(2, 1))) J = K;
				if (B == C && B == D && B == Q && B != F && B != idx(s + ivec2(-2, 1))) K = J;
			}
		}
		if (F != D)
		{
			if (D != I && D != E && D != C)
			{
				if (D == A && D == H && D == S && D != B && D != idx(s + ivec2(1, 2))) J = L;
				if (D == G && D == B && D == P && D != H && D != idx(s + ivec2(1, -2))) L = J;
			}
			if (F != E && F != A && F != G)
			{
				if (F == C && F == H && F == S && F != B && F != idx(s + ivec2(-1, 2))) K = M;
				if (F == I && F == B && F == P && F != H && F != idx(s + ivec2(-1, -2))) M = K;
			}
		}
	}
	int v = sub.y == 0 ? (sub.x == 0 ? J : K) : (sub.x == 0 ? L : M);
	// 4x = second 2x pass: keep the decisions of the first pass at the corners of the original pixels.
	// If the output pixel touches a corner of the original pixel grid where the four original pixels form a
	// checkerboard (dithering), the first pass kept that corner sharp: do not cut it now (avoids diamond artifacts).
	if (scale > 1.5f && v != E)
	{
		ivec2 dir = ivec2(sub.x == 0 ? -1 : 1, sub.y == 0 ? -1 : 1);
		ivec2 parity = s - (s / 2) * 2; // position of the 2x pixel inside its original pixel
		if ((dir.x < 0 ? parity.x == 0 : parity.x == 1) && (dir.y < 0 ? parity.y == 0 : parity.y == 1))
		{
			ivec2 p = s / 2;
			int o0 = origIdx(p), ox = origIdx(p + ivec2(dir.x, 0)), oy = origIdx(p + ivec2(0, dir.y)), oxy = origIdx(p + dir);
			if (o0 == oxy && ox == oy && o0 != ox)
				v = E;
		}
	}
	writeIndex(v);
}`;

// Second shader pass of each 2x step: see ResolveCrossings
const ResolveFragmentShader = FragmentHeader + `
uniform highp sampler2D raw; // output of the MMPX pass (2x)
int rawIdx(ivec2 p)
{
	return fetchIndex(raw, p, vRect.xy * 2, vRect.zw * 2);
}
void main()
{
	ivec2 o = ivec2(gl_FragCoord.xy);
	ivec2 s = o / 2;
	ivec2 sub = o - s * 2;
	ivec2 dir = ivec2(sub.x == 0 ? -1 : 1, sub.y == 0 ? -1 : 1);
	int v = rawIdx(o);
	int E = idx(s), X = idx(s + ivec2(dir.x, 0)), Y = idx(s + ivec2(0, dir.y)), Z = idx(s + dir);
	if (E == Z && X == Y && E != X)
	{
		bool eFlipped = v != E || rawIdx(o + dir) != E;
		bool xFlipped = rawIdx(o + ivec2(dir.x, 0)) != X || rawIdx(o + ivec2(0, dir.y)) != X;
		if (eFlipped && xFlipped)
		{
			int le = luma(E), lx = luma(X);
			v = le < lx || (le == lx && E < X) ? E : X;
		}
	}
	writeIndex(v);
}`;

// Index preserving xBR (see XbrUpscale): one pass from the original size to the target factor.
const XbrFragmentShader = FragmentHeader + `
uniform highp sampler2D noise; // noise map (original size, 1 = noise)
uniform int useNoise;
uniform float factor;
vec4 col(int i)
{
	if (i == 0 && (vInfo.x & 4) == 0)
		return vec4(0.0f);
	vec4 c = texelFetch(palette, ivec2(i >= 32 ? 0 : i, vInfo.y), 0);
	return vec4(c.rgb, 1.0f);
}
float cd(vec4 a, vec4 b)
{
	vec4 d = a - b;
	float y = dot(d.rgb, vec3(0.299f, 0.587f, 0.114f));
	float u = dot(d.rgb, vec3(-0.14713f, -0.28886f, 0.436f));
	float v = dot(d.rgb, vec3(0.615f, -0.51499f, -0.10001f));
	return 48.0f * (abs(y) + 0.5f * (abs(u) + abs(v)) + abs(d.a));
}
bool xdiff(vec4 a, vec4 b) { return cd(a, b) > 0.05f; }
bool xeq(vec4 a, vec4 b) { return cd(a, b) <= 15.0f; }
bool xneq(vec4 a, vec4 b) { return cd(a, b) > 15.0f; }
// 5x5 neighborhood of the current pixel (indices and colors), filled once
int nIds[25];
vec4 nCols[25];
int nk(mat2 R, vec2 v)
{
	ivec2 p = ivec2(round(R * v)) + 2;
	return p.y * 5 + p.x;
}
// One corner of the pixel (R rotates the canonical bottom right neighborhood). Returns the index of the color which
// is drawn behind the edge and writes the coverage of the edge at the position fp to m.
int xbrCorner(mat2 R, vec2 fp, vec4 e, out float m)
{
	vec4 b = nCols[nk(R, vec2(0.0f, -1.0f))], c = nCols[nk(R, vec2(1.0f, -1.0f))];
	vec4 d = nCols[nk(R, vec2(-1.0f, 0.0f))];
	int fk = nk(R, vec2(1.0f, 0.0f)), hk = nk(R, vec2(0.0f, 1.0f));
	vec4 f = nCols[fk], h = nCols[hk];
	vec4 g = nCols[nk(R, vec2(-1.0f, 1.0f))], i = nCols[nk(R, vec2(1.0f, 1.0f))];
	vec4 i4 = nCols[nk(R, vec2(2.0f, 1.0f))], i5 = nCols[nk(R, vec2(1.0f, 2.0f))];
	vec4 h5 = nCols[nk(R, vec2(0.0f, 2.0f))], f4 = nCols[nk(R, vec2(2.0f, 0.0f))];
	vec2 q = (fp - 0.5f) * R + 0.5f;
	bool isolated = cd(b, d) + cd(d, h) + cd(h, f) < 2.0f;
	bool irlv0 = xdiff(e, f) && xdiff(e, h) && cd(e, i) >= 2.0f && !isolated;
	bool irlv1 = irlv0 && ((xneq(f, b) && xneq(f, c)) || (xneq(h, d) && xneq(h, g)) ||
		(xeq(e, i) && ((xneq(f, f4) && xneq(f, i4)) || (xneq(h, h5) && xneq(h, i5)))) || xeq(e, g) || xeq(e, c));
	bool irlv2l = xdiff(e, g) && xdiff(d, g);
	bool irlv2u = xdiff(e, c) && xdiff(b, c);
	float wd1 = cd(e, c) + cd(e, g) + cd(i, h5) + cd(i, f4) + 4.0f * cd(h, f);
	float wd2 = cd(h, d) + cd(h, i5) + cd(f, i4) + cd(f, b) + 4.0f * cd(e, i);
	bool edri = wd1 <= wd2 && irlv0;
	bool edr = wd1 + 0.1f <= wd2 && irlv1;
	bool edrL = 2.0f * cd(f, g) <= cd(h, c) && irlv2l && edr && xeq(f, f4);
	bool edrU = 2.0f * cd(h, c) <= cd(f, g) && irlv2u && edr && xeq(h, h5);
	float fx = q.x + q.y;
	float fxL = 0.5f * q.x + q.y;
	float fxU = 2.0f * q.x + q.y;
	bool covered = (edrL && fxL >= 1.0f) || (edrU && fxU >= 2.0f) || (edr && fx >= 1.5f) || (edri && fx >= 1.75f);
	m = covered ? 1.0f : 0.0f;
	return cd(e, f) <= cd(e, h) ? nIds[fk] : nIds[hk];
}
void main()
{
	int F = int(factor + 0.5f);
	ivec2 o = ivec2(gl_FragCoord.xy);
	ivec2 cell = o / F;
	ivec2 sub = o - cell * F;
	vec2 fp = (vec2(sub) + 0.5f) / float(F);
	int ei = idx(cell);
	if (useNoise != 0 && texelFetch(noise, cell, 0).r * 255.0f > 0.5f)
	{
		writeIndex(ei);
		return;
	}
	for (int k = 0; k < 25; ++k)
	{
		int id = idx(cell + ivec2(k % 5 - 2, k / 5 - 2));
		nIds[k] = id;
		nCols[k] = col(id);
	}
	vec4 e = nCols[12];
	int c[4];
	float m[4];
	for (int r = 0; r < 4; ++r)
	{
		mat2 R = r == 0 ? mat2(1.0f, 0.0f, 0.0f, 1.0f) : r == 1 ? mat2(0.0f, -1.0f, 1.0f, 0.0f) : r == 2 ? mat2(-1.0f, 0.0f, 0.0f, -1.0f) : mat2(0.0f, 1.0f, -1.0f, 0.0f);
		float mr;
		c[r] = xbrCorner(R, fp, e, mr);
		m[r] = mr;
	}
	int r1 = m[2] > 0.5f ? c[2] : m[0] > 0.5f ? c[0] : ei;
	int r2 = m[3] > 0.5f ? c[3] : m[1] > 0.5f ? c[1] : ei;
	writeIndex(cd(e, col(r2)) >= cd(e, col(r1)) ? r2 : r1);
}`;

function compile(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error('PixelArtUpscaler: shader compile error: ' + log);
	}

	return shader;
}

export class PixelArtUpscaler {
	/** Appended to the fragment shaders (tests: forces a new compilation instead of using the driver cache) */
	static ShaderSalt = '';

	/**
	 * state: renderer State, palette: palette Texture (32 x N RGBA, rows = palettes)
	 */
	constructor(state, palette) {
		this.state = state;
		this.palette = palette;
		this.program = null;
		this.vao = null;
		this.failed = false;
		this.Stats = { count: 0, milliseconds: 0, pixels: 0 };
		/** See ComputeNoiseMap (0 = no noise detection) */
		this.NoiseThreshold = NoiseThreshold;
		/** 'xbr' (index preserving xBR, any factor) or 'mmpx' (MMPX, factor 2 or 4) */
		this.Algorithm = 'xbr';
	}

	get Gl() { return this.state.Gl; }

	get MaxTextureSize() { return this.Gl.getParameter(this.Gl.MAX_TEXTURE_SIZE); }

	/** Names of the shader programs needed for the current settings */
	requiredPrograms() {
		const names = this.Algorithm === 'xbr' ? ['xbrProgram'] : ['program', 'resolveProgram'];

		if ((this.NoiseThreshold | 0) > 0)
			names.push('weakProgram', 'noiseProgram');

		return names;
	}

	/**
	 * Starts compiling the shaders. With KHR_parallel_shader_compile the driver compiles them in the background
	 * (the first compilation of the large upscaler shaders can take seconds on some drivers), see Ready.
	 */
	Prepare() {
		if (this.failed || this.Gl.isContextLost())
			return;

		const gl = this.Gl;
		const sources = {
			program: FragmentShader,
			resolveProgram: ResolveFragmentShader,
			weakProgram: WeakFragmentShader,
			noiseProgram: NoiseFragmentShader,
			xbrProgram: XbrFragmentShader
		};
		this.parallelCompile ??= gl.getExtension('KHR_parallel_shader_compile');
		this.pending ??= [];

		for (const name of this.requiredPrograms()) {
			if (this[name] != null || this.pending.some(p => p.name === name))
				continue;

			const vs = gl.createShader(gl.VERTEX_SHADER);
			gl.shaderSource(vs, VertexShader);
			gl.compileShader(vs);
			const fs = gl.createShader(gl.FRAGMENT_SHADER);
			gl.shaderSource(fs, sources[name] + PixelArtUpscaler.ShaderSalt);
			gl.compileShader(fs);
			const program = gl.createProgram();
			gl.attachShader(program, vs);
			gl.attachShader(program, fs);
			gl.linkProgram(program);
			this.pending.push({ name, program, vs, fs, start: performance.now() });
		}
	}

	/** True when the shaders are compiled (never blocks if KHR_parallel_shader_compile is supported). */
	get Ready() {
		return this.checkReady(false);
	}

	checkReady(wait) {
		if (this.failed)
			return true; // CPU fallback

		this.Prepare();

		const gl = this.Gl;

		if (this.pending.length !== 0) {
			if (!wait && this.parallelCompile && this.pending.some(p => !gl.getProgramParameter(p.program, this.parallelCompile.COMPLETION_STATUS_KHR)))
				return false;

			try {
				for (const { name, program, vs, fs, start } of this.pending) {
					if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
						const log = (gl.getShaderInfoLog(fs) || '') + (gl.getShaderInfoLog(vs) || '') + (gl.getProgramInfoLog(program) || '');
						throw new Error(`PixelArtUpscaler: ${name} could not be compiled: ${log}`);
					}

					const uniforms = {};

					for (const uniform of ['regions', 'dstSize', 'scale', 'outScale', 'factor', 'src', 'orig', 'raw', 'noise', 'noiseShift', 'useNoise', 'threshold', 'palette'])
						uniforms[uniform] = gl.getUniformLocation(program, uniform);

					this[name] = { program, uniforms };
					this.Stats.compileMilliseconds = Math.max(this.Stats.compileMilliseconds ?? 0, performance.now() - start);
				}
			} catch (e) {
				if (!gl.isContextLost()) {
					console.warn('GPU pixel art upscaling not available, using the CPU:', e);
					this.failed = true;
				}
			} finally {
				for (const { vs, fs } of this.pending) {
					gl.deleteShader(vs);
					gl.deleteShader(fs);
				}

				this.pending = [];
			}
		}

		this.vao ??= gl.createVertexArray();
		return true;
	}

	ensureProgram() {
		this.checkReady(true);
	}

	/** Palette rows as RGBA bytes (CPU fallback) */
	readPaletteRow(row) {
		const data = this.palette?.SourceData;

		if (!data)
			return null;

		return data.subarray(row * 32 * 4, (row + 1) * 32 * 4);
	}

	static createR8Texture(gl, texture, width, height, data) {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data);
	}

	/**
	 * Upscales an indexed atlas into the given GL texture (allocated here with the scaled size).
	 * data: Uint8Array (width * height) palette indices
	 * regions: [{ x, y, width, height, flags, palette }] in source pixels (palette = palette texture row for luma)
	 * factor: 2 or 4
	 */
	Upscale(targetTexture, data, width, height, regions, factor) {
		const start = performance.now();

		if (this.Gl.isContextLost())
			return;

		if (!this.failed) {
			try {
				this.upscaleGPU(targetTexture, data, width, height, regions, factor);
				this.Stats.count++;
				this.Stats.milliseconds += performance.now() - start;
				this.Stats.pixels += width * height * factor * factor;
				return;
			} catch (e) {
				if (this.Gl.isContextLost())
					return;

				console.warn('GPU pixel art upscaling failed, using the CPU:', e);
				this.failed = true;
			}
		}

		const tables = new Map();
		const cpuRegions = regions.map(r => {
			const key = r.palette * 8 + (r.flags & UpscaleFlags.Opaque);
			let table = tables.get(key);

			if (!table) {
				const palette = this.readPaletteRow(r.palette);
				const opaque = (r.flags & UpscaleFlags.Opaque) !== 0;
				table = { lumaTable: CreateLumaTable(palette, opaque), colorTable: CreateColorTable(palette, opaque) };
				tables.set(key, table);
			}

			return { ...r, ...table };
		});
		const scaled = UpscaleAtlasCPU(data, width, height, cpuRegions, factor, this.NoiseThreshold, this.Algorithm);
		const gl = this.Gl;
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		PixelArtUpscaler.createR8Texture(gl, targetTexture, width * factor, height * factor, scaled);
		gl.bindTexture(gl.TEXTURE_2D, null);
		Texture.ActiveTexture = null;
		this.Stats.count++;
		this.Stats.milliseconds += performance.now() - start;
		this.Stats.pixels += width * height * factor * factor;
	}

	upscaleGPU(targetTexture, data, width, height, regions, factor) {
		const gl = this.Gl;
		this.ensureProgram();

		// save the state the engine relies on
		const saved = {
			framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING),
			viewport: gl.getParameter(gl.VIEWPORT),
			activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
			blend: gl.isEnabled(gl.BLEND),
			depthTest: gl.isEnabled(gl.DEPTH_TEST),
			cullFace: gl.isEnabled(gl.CULL_FACE),
			scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
			unpackAlignment: gl.getParameter(gl.UNPACK_ALIGNMENT)
		};

		while (gl.getError() !== gl.NO_ERROR && !gl.isContextLost()); // flush older errors

		const textures = [];
		const framebuffer = gl.createFramebuffer();
		let regionTexture = null;

		try {
			gl.disable(gl.BLEND);
			gl.disable(gl.DEPTH_TEST);
			gl.disable(gl.CULL_FACE);
			gl.disable(gl.SCISSOR_TEST);
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

			// region data: 4 texels per region (x, y, w, h), (flags, palette, 0, 0), neighbors (left, right), (top, bottom)
			const regionCount = regions.length;
			const rows = Math.max(1, Math.ceil(regionCount * RegionTexels / RegionTextureWidth));
			const regionData = new Int32Array(RegionTextureWidth * rows * 4);

			regions.forEach((r, i) => {
				const o = i * RegionTexels * 4;
				regionData[o + 0] = r.x;
				regionData[o + 1] = r.y;
				regionData[o + 2] = r.width;
				regionData[o + 3] = r.height;
				regionData[o + 4] = r.flags | 0;
				regionData[o + 5] = r.palette | 0;

				for (let k = 0; k < 8; ++k)
					regionData[o + 8 + k] = r.neighbors?.[k] ?? -1;
			});

			gl.activeTexture(gl.TEXTURE2);
			regionTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, regionTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32I, RegionTextureWidth, rows, 0, gl.RGBA_INTEGER, gl.INT, regionData);

			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.palette.Index);

			// source texture
			gl.activeTexture(gl.TEXTURE0);
			let source = gl.createTexture();
			textures.push(source);
			PixelArtUpscaler.createR8Texture(gl, source, width, height, data);

			gl.bindVertexArray(this.vao);
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

			// Draws all regions with the given program into the target texture (allocated with the given size).
			// texture3: orig (MMPX pass) or raw (resolve pass), noise map on unit 4
			const noiseThreshold = this.NoiseThreshold | 0;
			let noiseMap = null;
			const draw = ({ program, uniforms }, target, dstWidth, dstHeight, scale, outScale, source, texture3) => {
				gl.useProgram(program);
				gl.uniform1i(uniforms.regions, 2);
				gl.uniform1i(uniforms.palette, 1);
				gl.uniform1i(uniforms.src, 0);
				gl.uniform1i(uniforms.orig, 3);
				gl.uniform1i(uniforms.raw, 3);
				gl.uniform1i(uniforms.noise, 4);
				gl.uniform1i(uniforms.useNoise, noiseMap != null ? 1 : 0);
				gl.uniform1i(uniforms.noiseShift, Math.round(Math.log2(scale)));
				gl.uniform1i(uniforms.threshold, noiseThreshold);
				gl.activeTexture(gl.TEXTURE0);
				PixelArtUpscaler.createR8Texture(gl, target, dstWidth, dstHeight, null);
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);

				if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
					throw new Error('R8 frame buffer incomplete');

				gl.viewport(0, 0, dstWidth, dstHeight);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.activeTexture(gl.TEXTURE4);
				gl.bindTexture(gl.TEXTURE_2D, noiseMap);
				gl.activeTexture(gl.TEXTURE3);
				gl.bindTexture(gl.TEXTURE_2D, texture3);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, source);
				gl.uniform2f(uniforms.dstSize, dstWidth, dstHeight);
				gl.uniform1f(uniforms.scale, scale);
				gl.uniform1f(uniforms.outScale, outScale);
				gl.drawArrays(gl.TRIANGLES, 0, regionCount * 6);
				// detach the target, it is used as source of the next pass
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
			};

			// noise detection on the original graphics (see ComputeNoiseMap)
			if (noiseThreshold > 0) {
				const weak = gl.createTexture();
				textures.push(weak);
				draw(this.weakProgram, weak, width, height, 1, 1, source, null);
				const noise = gl.createTexture();
				textures.push(noise);
				draw(this.noiseProgram, noise, width, height, 1, 1, weak, null);
				noiseMap = noise;
			}

			let scale = 1;
			let previousSource = null;

			if (this.Algorithm === 'xbr') {
				gl.useProgram(this.xbrProgram.program);
				gl.uniform1f(this.xbrProgram.uniforms.factor, factor);
				draw(this.xbrProgram, targetTexture, width * factor, height * factor, 1, factor, source, null);
				scale = factor;
			}

			while (scale < factor) {
				const dstWidth = width * scale * 2;
				const dstHeight = height * scale * 2;
				const last = scale * 2 >= factor;
				const raw = gl.createTexture();
				textures.push(raw);
				const target = last ? targetTexture : gl.createTexture();

				if (!last)
					textures.push(target);

				draw(this.program, raw, dstWidth, dstHeight, scale, 2, source, previousSource ?? source);
				draw(this.resolveProgram, target, dstWidth, dstHeight, scale, 2, source, raw);

				previousSource = source;
				source = target;
				scale *= 2;
			}

			const error = gl.getError();

			if (error !== gl.NO_ERROR && error !== gl.CONTEXT_LOST_WEBGL)
				throw new Error('GL error ' + error);
		} finally {
			gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
			gl.deleteFramebuffer(framebuffer);

			for (const t of textures)
				gl.deleteTexture(t);

			if (regionTexture)
				gl.deleteTexture(regionTexture);

			gl.activeTexture(gl.TEXTURE4);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.activeTexture(gl.TEXTURE3);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.activeTexture(saved.activeTexture);
			gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);
			gl.bindVertexArray(null);
			gl.useProgram(null);
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, saved.unpackAlignment);
			saved.blend ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);
			saved.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
			saved.cullFace ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);
			saved.scissorTest ? gl.enable(gl.SCISSOR_TEST) : gl.disable(gl.SCISSOR_TEST);
			// the engine caches bindings
			ShaderProgram.ActiveProgram = null;
			VertexArrayObject.ActiveVAO = null;
			Texture.ActiveTexture = null;
		}
	}
}

// #endregion
