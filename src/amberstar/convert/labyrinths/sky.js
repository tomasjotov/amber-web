// Sky and daylight handling of the Amberstar cities (outdoor 3D maps) on the Ambermoon engine.
//
// Ambermoon draws the sky of outdoor 3D maps (MapFlags.Outdoor) with ILightEffectProvider.GetSkyParts (a vertical
// color gradient of 72 lines) and darkens the first 16 palette colors of the map with GetLightPaletteReplacement.
// Amberstar has three sky gradients (day, night, twilight; 84 lines each, AMBERDEV.UDO) and does not darken the
// city graphics. This provider uses the Amberstar gradients (resampled to the 72 lines of the Ambermoon sky,
// blended between the day times like Ambermoon does) and darkens the map's own palette at night
// (Ambermoon uses fixed per-world night palettes which do not fit the Amberstar palettes).
import { MapFlags } from '../../../ambermoon/Ambermoon.Data.Common/Map.js';
import { PaletteReplacement, SkyPart } from '../../../ambermoon/Ambermoon.Data.Common/ILightEffectProvider.js';

const SkyLines = 72;
// DayTime values of the Amberstar loader (loadSkyGradients): 0 night, 1 dawn, 2 day, 3 dusk
const Night = 0, Dawn = 1, Day = 2;

function blend(a, b, f) {
	return a.map((v, i) => Math.round(v * (1 - f) + b[i] * f));
}

/**
 * Light state for a time: [gradientA, gradientB, factor, brightness]
 * Amberstar: 06-08 twilight, 08-18 day, 18-20 twilight, 20-06 night. The transitions are blended over an hour.
 */
function lightState(hour, minute) {
	const t = hour + minute / 60;
	const keys = [
		[0, Night, 0.45], [5, Night, 0.45], [6.5, Dawn, 0.75], [8, Day, 1.0], [18, Day, 1.0],
		[19.5, Dawn, 0.75], [21, Night, 0.45], [24, Night, 0.45],
	];
	for (let i = 0; i < keys.length - 1; i++) {
		const [t0, g0, b0] = keys[i];
		const [t1, g1, b1] = keys[i + 1];
		if (t >= t0 && t < t1) {
			const f = (t - t0) / (t1 - t0);
			return [g0, g1, f, b0 + (b1 - b0) * f];
		}
	}
	return [Night, Night, 0, 0.45];
}

export class AmberstarLightEffectProvider {
	/**
	 * @param gradients Amberstar sky gradients by day time ([r,g,b][] with 84 entries)
	 * @param palettes Map<int, Graphic> palette graphics by key (PaletteRegistry.palettes)
	 */
	constructor(gradients, palettes) {
		this.palettes = palettes;
		this.gradients = {};
		for (const dayTime of [Night, Dawn, Day]) {
			const g = gradients[dayTime];
			// The last Amberstar line is the horizon line. Resample the 84 lines to the 72 lines of the Ambermoon sky.
			this.gradients[dayTime] = Array.from({ length: SkyLines }, (_, y) => g[Math.min(g.length - 1, Math.floor(y * g.length / SkyLines))]);
		}
		this.skyPartCache = new Map();
		this.paletteReplaceCache = new Map();
	}

	GetSkyParts(map, hour, minute) {
		if ((map.Flags & MapFlags.Outdoor) === 0)
			return null;
		const [a, b, f] = lightState(hour, minute);
		const key = `${a}:${b}:${Math.round(f * 60)}`;
		let parts = this.skyPartCache.get(key);
		if (parts)
			return parts;
		parts = [];
		let current = null;
		for (let y = 0; y < SkyLines; y++) {
			const [r, g, bl] = blend(this.gradients[a][y], this.gradients[b][y], Math.round(f * 60) / 60);
			const color = (r << 16) | (g << 8) | bl;
			if (current && current.Color === color) {
				++current.Height;
			} else {
				current = new SkyPart();
				current.Y = y;
				current.Height = 1;
				current.Color = color;
				parts.push(current);
			}
		}
		this.skyPartCache.set(key, parts);
		return parts;
	}

	GetLightPaletteReplacement(map, hour, minute, buffLightIntensity, graphicInfoProvider) {
		if ((map.Flags & MapFlags.Outdoor) === 0)
			return null;
		let [, , , brightness] = lightState(hour, minute);
		// Light spells brighten the night (Ambermoon: buffLightIntensity in steps of 16)
		brightness = Math.min(1, brightness + (buffLightIntensity & 0xf0) / 255 * 0.6);
		const stage = Math.round(brightness * 100);
		const key = map.PaletteIndex * 1000 + stage;
		let replacement = this.paletteReplaceCache.get(key);
		if (replacement)
			return replacement;
		const palette = graphicInfoProvider?.Palettes?.get(map.PaletteIndex) ?? this.palettes.get(map.PaletteIndex);
		replacement = new PaletteReplacement();
		const night = 1 - brightness; // add a slight blue tint at night
		for (let c = 0; c < 16; c++) {
			const o = c * 4;
			replacement.ColorData[o + 0] = Math.round(palette.Data[o + 0] * brightness);
			replacement.ColorData[o + 1] = Math.round(palette.Data[o + 1] * brightness);
			replacement.ColorData[o + 2] = Math.min(255, Math.round(palette.Data[o + 2] * (brightness + night * 0.25)));
			replacement.ColorData[o + 3] = 255;
		}
		this.paletteReplaceCache.set(key, replacement);
		return replacement;
	}
}
