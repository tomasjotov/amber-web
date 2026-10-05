// Port of Ambermoon.Data.Legacy/LightEffectProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { arrayCopy, getValue, hasFlag, toByte } from '../../runtime.js';
import { MapFlags } from '../Ambermoon.Data.Common/Map.js';
import { PaletteReplacement, SkyPart } from '../Ambermoon.Data.Common/ILightEffectProvider.js';

// Note: ILightEffectDataProvider is a pure interface (SkyGradients, DaytimePaletteReplacements) and not ported.

export class LightEffectProvider {
	constructor(lightEffectDataProvider) {
		this.lightEffectDataProvider = lightEffectDataProvider;
		this.skyPartCache = new Map();
		this.paletteReplaceCache = new Map();
	}

	/**
	 * This was extracted from the original code. These are the brightness levels
	 * for outdoor maps. At least they are used to blend colors dependent on daytime
	 * on those maps.
	 */
	static OutdoorBrightnessLevels = new Uint8Array([
		0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x28, 0x40,
		0xc8, 0xc8, 0xc8, 0xc8, 0xc8, 0xc8, 0xc8, 0xc8,
		0xc8, 0x40, 0x40, 0x28, 0x10, 0x10, 0x10, 0x10
	]);

	GetLightPaletteReplacement(map, hour, minute, buffLightIntensity, graphicInfoProvider) {
		const CachePaletteReplacement = (stage, creator) => {
			const key = map.TilesetOrLabdataIndex * 10000 + stage;

			if (this.paletteReplaceCache.has(key))
				return this.paletteReplaceCache.get(key);

			const replacement = creator();
			this.paletteReplaceCache.set(key, replacement);
			return replacement;
		};

		if (!hasFlag(map.Flags, MapFlags.Outdoor))
			return null;

		const worldIndex = map.World;
		buffLightIntensity &= 0xF0; // multiples of 16 only
		// 9-18: Day
		// 18-22: Transition to night
		// 22-5: Night
		// 5-9: Transition to day
		let basePalette = null;
		let blendPalette = null;
		let destFactor = 0;
		let stage = 0;

		if (hour >= 22 || hour < 5) // Night
		{
			if (buffLightIntensity > 0) {
				if (hour < 5)
					return this.GetLightPaletteReplacement(map, Math.min(8, 4 + Math.trunc(buffLightIntensity / 16)), 0, 0, graphicInfoProvider);
				else
					return this.GetLightPaletteReplacement(map, Math.max(18, 22 - Math.trunc(buffLightIntensity / 16)), 0, 0, graphicInfoProvider);
			}

			stage = 0;
			basePalette = this.lightEffectDataProvider.DaytimePaletteReplacements[worldIndex * 2 + 0];
		}
		else if (hour >= 9 && hour < 18) // Day
		{
			stage = 1;
			basePalette = getValue(graphicInfoProvider.Palettes, map.PaletteIndex);
		}
		else if (hour >= 18 && hour < 20) // Dawn phase I
		{
			if (buffLightIntensity > 0)
				return this.GetLightPaletteReplacement(map, Math.max(17, hour - Math.trunc(buffLightIntensity / 16)), 0, 0, graphicInfoProvider);

			stage = 1000 + hour * 60 + minute;
			basePalette = getValue(graphicInfoProvider.Palettes, map.PaletteIndex);
			blendPalette = this.lightEffectDataProvider.DaytimePaletteReplacements[worldIndex * 2 + 1];
			destFactor = Math.trunc(255 * ((hour - 18) * 60 + minute) / 120);
		}
		else if (hour >= 20 && hour < 22) // Dawn phase II
		{
			if (buffLightIntensity > 0)
				return this.GetLightPaletteReplacement(map, Math.max(17, hour - Math.trunc(buffLightIntensity / 16)), 0, 0, graphicInfoProvider);

			stage = 3000 + hour * 60 + minute;
			basePalette = this.lightEffectDataProvider.DaytimePaletteReplacements[worldIndex * 2 + 1];
			blendPalette = this.lightEffectDataProvider.DaytimePaletteReplacements[worldIndex * 2 + 0];
			destFactor = Math.trunc(255 * ((hour - 20) * 60 + minute) / 120);
		}
		else if (hour >= 5 && hour < 7) // Dusk phase I
		{
			if (buffLightIntensity > 0)
				return this.GetLightPaletteReplacement(map, Math.min(9, hour + Math.trunc(buffLightIntensity / 16)), 0, 0, graphicInfoProvider);

			stage = 5000 + hour * 60 + minute;
			basePalette = this.lightEffectDataProvider.DaytimePaletteReplacements[worldIndex * 2 + 0];
			blendPalette = this.lightEffectDataProvider.DaytimePaletteReplacements[worldIndex * 2 + 1];
			destFactor = Math.trunc(255 * ((hour - 5) * 60 + minute) / 120);
		}
		else if (hour >= 7 && hour < 9) // Dusk phase II
		{
			if (buffLightIntensity > 0)
				return this.GetLightPaletteReplacement(map, Math.min(9, hour + Math.trunc(buffLightIntensity / 16)), 0, 0, graphicInfoProvider);

			stage = 7000 + hour * 60 + minute;
			basePalette = this.lightEffectDataProvider.DaytimePaletteReplacements[worldIndex * 2 + 1];
			blendPalette = getValue(graphicInfoProvider.Palettes, map.PaletteIndex);
			destFactor = Math.trunc(255 * ((hour - 7) * 60 + minute) / 120);
		}

		return CachePaletteReplacement(stage, () => {
			const replacement = new PaletteReplacement();

			if (blendPalette == null) {
				arrayCopy(basePalette.Data, replacement.ColorData, replacement.ColorData.length);
			}
			else {
				for (let c = 0; c < 16; ++c) {
					const offset = c * 4;
					const sr = basePalette.Data[offset + 0];
					const sg = basePalette.Data[offset + 1];
					const sb = basePalette.Data[offset + 2];
					const dr = blendPalette.Data[offset + 0];
					const dg = blendPalette.Data[offset + 1];
					const db = blendPalette.Data[offset + 2];
					replacement.ColorData[offset + 0] = toByte(Math.trunc((sr * (255 - destFactor) + dr * destFactor) / 255));
					replacement.ColorData[offset + 1] = toByte(Math.trunc((sg * (255 - destFactor) + dg * destFactor) / 255));
					replacement.ColorData[offset + 2] = toByte(Math.trunc((sb * (255 - destFactor) + db * destFactor) / 255));
					replacement.ColorData[offset + 3] = 255;
				}
			}

			return replacement;
		});
	}

	GetSkyParts(map, hour, minute) {
		if (!hasFlag(map.Flags, MapFlags.Outdoor))
			return null;

		const worldIndex = map.World;

		// 9-18: Day
		// 18-22: Transition to night
		// 22-5: Night
		// 5-9: Transition to day
		let baseGraphic = null;
		let blendGraphic = null;
		let destFactor = 0;
		let stage = 0;

		const Cache = (stage, creator) => {
			const key = worldIndex * 10000 + stage;

			if (this.skyPartCache.has(key))
				return this.skyPartCache.get(key);

			const parts = creator();
			this.skyPartCache.set(key, parts);
			return parts;
		};

		if (hour >= 22 || hour < 5) // Night
		{
			stage = 0;
			baseGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 0];
		}
		else if (hour >= 9 && hour < 18) // Day
		{
			stage = 1;
			baseGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 2];
		}
		else if (hour >= 18 && hour < 20) // Dawn phase I
		{
			stage = 1000 + hour * 60 + minute;
			baseGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 2];
			blendGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 1];
			destFactor = Math.trunc(255 * ((hour - 18) * 60 + minute) / 120);
		}
		else if (hour >= 20 && hour < 22) // Dawn phase II
		{
			stage = 3000 + hour * 60 + minute;
			baseGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 1];
			blendGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 0];
			destFactor = Math.trunc(255 * ((hour - 20) * 60 + minute) / 120);
		}
		else if (hour >= 5 && hour < 7) // Dusk phase I
		{
			stage = 5000 + hour * 60 + minute;
			baseGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 0];
			blendGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 1];
			destFactor = Math.trunc(255 * ((hour - 5) * 60 + minute) / 120);
		}
		else if (hour >= 7 && hour < 9) // Dusk phase II
		{
			stage = 7000 + hour * 60 + minute;
			baseGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 1];
			blendGraphic = this.lightEffectDataProvider.SkyGradients[worldIndex * 3 + 2];
			destFactor = Math.trunc(255 * ((hour - 7) * 60 + minute) / 120);
		}

		const parts = Cache(stage, () => {
			const parts = [];
			let lastColor = 0xffffffff; // uint.MaxValue
			let currentPart = null;

			const ToColor = (graphic, y) =>
				(graphic.Data[y * 4 + 0] << 16) | (graphic.Data[y * 4 + 1] << 8) | graphic.Data[y * 4 + 2];

			function ProcessColor(y, color) {
				if (lastColor !== color) {
					if (currentPart != null)
						parts.push(currentPart);

					lastColor = color;

					currentPart = new SkyPart();
					currentPart.Y = y;
					currentPart.Height = 1;
					currentPart.Color = color;
				}
				else {
					++currentPart.Height;
				}
			}

			if (blendGraphic == null) {
				for (let y = 0; y < 72; ++y) {
					ProcessColor(y, ToColor(baseGraphic, y));
				}
			}
			else {
				for (let y = 0; y < 72; ++y) {
					const offset = y * 4;
					const sr = baseGraphic.Data[offset + 0];
					const sg = baseGraphic.Data[offset + 1];
					const sb = baseGraphic.Data[offset + 2];
					const dr = blendGraphic.Data[offset + 0];
					const dg = blendGraphic.Data[offset + 1];
					const db = blendGraphic.Data[offset + 2];
					const r = Math.trunc((sr * (255 - destFactor) + dr * destFactor) / 255);
					const g = Math.trunc((sg * (255 - destFactor) + dg * destFactor) / 255);
					const b = Math.trunc((sb * (255 - destFactor) + db * destFactor) / 255);
					ProcessColor(y, (r << 16) | (g << 8) | b);
				}
			}

			parts.push(currentPart);

			return parts;
		});

		return parts;
	}
}
