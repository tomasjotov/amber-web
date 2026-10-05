// Combat backgrounds: Amberstar COM_BACK.AMB (14 images of 176x112, each with its own combat palette)
// -> Ambermoon GraphicType.CombatBackground (320x95) + CombatBackgroundInfo lists.
//
// Index convention (shared with graphics2D.js): Ambermoon combat background index = Amberstar COM_BACK number - 1
// (0 outdoors, 1 forest, 2 desert, 3 swamp, 4 sea, 5 mountain, 6 river, 7 town, 8 tower/tunnel/cellar,
// 9 temple of Sansri, 10 sewers, 11 graveyard, 12 villa, 13 bridge). The same list is used for 2D and 3D.
import { Graphic } from '../../../ambermoon/Ambermoon.Data.Common/Graphic.js';
import { CombatBackgroundInfo } from '../../../ambermoon/Ambermoon.Data.Common/CombatBackgroundInfo.js';
import { GraphicType } from '../../../ambermoon/Ambermoon.Data.Common/IGraphicProvider.js';
import { toAmbermoonPalette } from '../../common.js';

export const CombatBackgroundCount = 14;
const Width = 320, Height = 95;
const SourceWidth = 176, SourceHeight = 112;
// Rows removed from the 112 rows of the Amberstar image (mostly sky/ceiling, the ground with the monsters stays).
const CropTop = 12;
// Landscapes are widened by mirroring their edges. Backgrounds with perspective (corridors, town, bridge) are
// widened by stretching their outer parts (the side walls), the center keeps its 1:1 scale.
const Landscape = new Set([1, 2, 3, 4, 5, 6, 7]);
// Outdoor backgrounds get darker palettes for twilight and night (Ambermoon has day/twilight/night palettes).
const Outdoor = new Set([1, 2, 3, 4, 5, 6, 7, 8, 12, 14]);
const OpaqueBlack = 16;

function sourceX(x, number) {
	const center = Width / 2, srcCenter = SourceWidth / 2;
	const u = x + 0.5 - center;
	if (Landscape.has(number)) {
		// mirror at the edges: ... 2 1 0 | 0 1 2 ... 175 | 175 174 ...
		let s = Math.floor(srcCenter + u);
		while (s < 0 || s >= SourceWidth)
			s = s < 0 ? -s - 1 : 2 * SourceWidth - s - 1;
		return s;
	}
	// stretch: the inner 96 pixels 1:1, the outer 40 source pixels on each side fill the remaining 112
	const inner = 48;
	const a = Math.abs(u);
	let s;
	if (a <= inner)
		s = a;
	else
		s = inner + (a - inner) * (srcCenter - inner) / (center - inner);
	s = Math.floor(srcCenter + Math.sign(u) * s);
	return Math.max(0, Math.min(SourceWidth - 1, s));
}

function createBackground(source, number) {
	const result = new Graphic(Width, Height, 0);
	for (let y = 0; y < Height; y++) {
		const sy = Math.min(SourceHeight - 1, y + CropTop);
		for (let x = 0; x < Width; x++) {
			const c = source.data[sourceX(x, number) + sy * source.width];
			result.Data[x + y * Width] = c === 0 ? OpaqueBlack : c;
		}
	}
	return result;
}

function shade(colors, factor, blue = 0) {
	return colors.map(([r, g, b]) => [r * factor, g * factor, Math.min(255, b * (factor + blue))].map(Math.round));
}

function addPalette(ctx, colors, id) {
	const full = colors.slice(0, 16);
	while (full.length < 32)
		full.push([0, 0, 0]);
	full[OpaqueBlack] = colors[0];
	return ctx.palettes.add(toAmbermoonPalette(full, false), id);
}

/**
 * Converts all combat backgrounds. Sets ctx.graphics CombatBackground and ctx.result.combatBackgrounds2D/3D
 * (16 entries each, indices 14 and 15 are unused by the Amberstar data and repeat 0 and 8).
 */
export function convertCombatBackgrounds(ctx) {
	const source = ctx.source;
	const palettes = source.loadCombatPalettes();
	const graphics = [];
	const infos = [];
	for (let number = 1; number <= CombatBackgroundCount; number++) {
		graphics.push(createBackground(source.loadCombatBackground(number), number));
		const colors = palettes[number - 1];
		const day = addPalette(ctx, colors, `combat${number}`);
		let twilight = day, night = day;
		if (Outdoor.has(number)) {
			twilight = addPalette(ctx, shade(colors, 0.75, 0.05), `combat${number}-twilight`);
			night = addPalette(ctx, shade(colors, 0.5, 0.15), `combat${number}-night`);
		}
		const info = new CombatBackgroundInfo();
		info.GraphicIndex = number; // 1-based (BattleHandling uses GraphicIndex - 1)
		info.Palettes = [day, twilight, night];
		infos.push(info);
	}
	infos.push(infos[0], infos[8]);
	ctx.graphics.set(GraphicType.CombatBackground, graphics);
	ctx.result.combatBackgrounds2D = infos;
	ctx.result.combatBackgrounds3D = infos;
	return { graphics, infos };
}
