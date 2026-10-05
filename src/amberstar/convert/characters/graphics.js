// Character related graphics: portraits, 80x80 pictures, event pictures, battle field icons and the
// monster combat graphics (MON_GFX.AMB).
import { Graphic } from '../../../ambermoon/Ambermoon.Data.Common/Graphic.js';
import { Picture80x80 } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Picture80x80.js';
import { GraphicType } from '../../../ambermoon/Ambermoon.Data.Common/IGraphicProvider.js';
import { Class } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Class.js';
import { UIPalette } from '../../../../amberstar/src/data/assets.js';
import { Image80x80 } from '../../../../amberstar/src/data/enums.js';
import { Graphic as AmberstarGraphic } from '../../../../amberstar/src/data/graphic.js';
import { buildColorMapping, remapGraphic, toAmbermoonGraphic, toAmbermoonPalette, emptyGraphic, compoundGraphic } from '../../common.js';
import { ClassMapping } from './mappings.js';

// ---------------------------------------------------------------------------------------------
// Portraits
//
// The engine draws portraits (32x34) with the primary UI palette on top of a blue gradient (color 0 is
// transparent). Amberstar portraits use the Amberstar UI palette and color 0 as background, so they are
// remapped to the Ambermoon UI palette.
//
// Portrait indices are 1-based (Graphics.PortraitOffset + PortraitIndex - 1). The Ambermoon character
// creator offers fixed portrait indices for the hero (CharacterCreator.MalePortraitIndices /
// FemalePortraitIndices). These slots get Amberstar portraits of the matching gender (the Amberstar
// hero portrait first), all other persons get their own slot.
// ---------------------------------------------------------------------------------------------
export const CreatorMalePortraitIndices = [2, 25, 7, 23, 3, 16, 9, 17, 21];
export const CreatorFemalePortraitIndices = [31, 38, 44, 51, 39, 40, 41, 47, 52];
const MaxPortraits = 130; // Graphics.PortraitOffset (20) .. Graphics.Pics80x80Offset (150)

/**
 * @param persons Map<characterIndex, { portrait, gender, race, isPartyMember }> of all Amberstar persons
 * @returns { graphics: Graphic[], portraitIndices: Map<characterIndex, portraitIndex> }
 */
export function convertPortraits(ctx, persons) {
	const mapping = buildColorMapping(UIPalette, ctx.uiPalette);
	const graphics = [];
	const portraitIndices = new Map();
	const reserved = new Set([...CreatorMalePortraitIndices, ...CreatorFemalePortraitIndices]);
	const converted = new Map();
	for (const [index, person] of persons) {
		if (person.portrait)
			converted.set(index, remapGraphic(person.portrait, mapping));
	}
	let next = 1;
	const set = (portraitIndex, graphic) => {
		while (graphics.length < portraitIndex)
			graphics.push(null);
		graphics[portraitIndex - 1] = graphic;
	};
	for (const index of converted.keys()) {
		while (reserved.has(next))
			++next;
		if (next > MaxPortraits)
			break;
		portraitIndices.set(index, next);
		set(next++, converted.get(index));
	}
	// Character creator portraits: hero, party members of that gender, then other humanoid persons.
	const candidates = gender => {
		const list = [...persons.entries()].filter(([index, p]) => converted.has(index) && p.gender === gender && p.race < 13);
		list.sort(([ia, a], [ib, b]) => (ia === 1 ? -1 : ib === 1 ? 1 : 0) || (b.isPartyMember - a.isPartyMember) || ia - ib);
		return list.map(([index]) => converted.get(index));
	};
	const fill = (slots, list) => {
		slots.forEach((slot, i) => {
			if (list.length !== 0)
				set(slot, list[i % list.length]);
		});
	};
	fill(CreatorMalePortraitIndices, candidates(0));
	fill(CreatorFemalePortraitIndices, candidates(1));
	for (let i = 0; i < graphics.length; i++)
		graphics[i] ??= emptyGraphic(32, 34);
	return { graphics, portraitIndices };
}

// ---------------------------------------------------------------------------------------------
// 80x80 pictures
//
// The engine draws them with the UI palette (Layout.Set80x80Picture), so they are remapped. Color 0 is
// part of the Amberstar pictures (black) and becomes 32 (opaque color 0).
// Indices 1..22 are the Ambermoon Picture80x80 values (used by the engine for chests, doors, places,
// camps) and get the closest Amberstar pictures. The Amberstar pictures 1..26 (Image80x80 enum) follow
// as Picture80x80 = AmberstarPicture80x80Offset + amberstarImage.
// ---------------------------------------------------------------------------------------------
export const AmberstarPicture80x80Offset = 22;

const Picture80x80Sources = {
	[Picture80x80.ChestClosed]: Image80x80.LockedChest,
	[Picture80x80.Door]: Image80x80.LockedDoor,
	[Picture80x80.ChestOpenEmpty]: Image80x80.OpenChest,
	[Picture80x80.Enchantress]: Image80x80.Sage,
	[Picture80x80.Healer]: Image80x80.Healer,
	[Picture80x80.Horse]: Image80x80.HorseStable,
	[Picture80x80.Innkeeper]: Image80x80.Inn,
	[Picture80x80.Librarian]: Image80x80.Library,
	[Picture80x80.Magician]: Image80x80.Guild,
	[Picture80x80.Merchant]: Image80x80.Merchant,
	[Picture80x80.ChestOpenFull]: Image80x80.OpenChest,
	[Picture80x80.Sage]: Image80x80.Sage,
	[Picture80x80.Captain]: Image80x80.ShipDealer,
	[Picture80x80.Thief]: Image80x80.Guild,
	[Picture80x80.Treasure]: Image80x80.OpenChest,
	[Picture80x80.Knight]: Image80x80.Guild,
	[Picture80x80.Riddlemouth]: Image80x80.Riddlemouth,
	[Picture80x80.RestInn]: Image80x80.Inn,
	[Picture80x80.RestDungeon]: Image80x80.Camp,
	[Picture80x80.RestOutdoor]: Image80x80.Camp,
	[Picture80x80.MoragMerchant]: Image80x80.Merchant,
	[Picture80x80.DwarfMerchant]: Image80x80.Merchant,
};

/** Picture80x80 value of an Amberstar 80x80 image (Image80x80 enum, 1-based) */
export function getPicture80x80(amberstarImage) {
	return AmberstarPicture80x80Offset + amberstarImage;
}

function loadPictures(ctx) {
	const pictures = [];
	for (let i = 1; i <= Image80x80.Amberstar; i++)
		pictures.push(ctx.source.load80x80(i));
	return pictures;
}

export function convertPictures80x80(ctx, pictures) {
	const converted = pictures.map(({ graphic, palette }) => {
		const result = remapGraphic(graphic, buildColorMapping(palette, ctx.uiPalette));
		// color 0 is black in the Amberstar pictures
		for (let i = 0; i < result.Data.length; i++) {
			if (graphic.data[i] === 0)
				result.Data[i] = 32;
		}
		return result;
	});
	const graphics = [];
	for (let i = 1; i <= AmberstarPicture80x80Offset; i++)
		graphics.push(converted[(Picture80x80Sources[i] ?? Image80x80.Merchant) - 1]);
	graphics.push(...converted);
	return graphics;
}

// ---------------------------------------------------------------------------------------------
// Event pictures
//
// Contract with the map event converter: EventImageIndex = Amberstar 80x80 picture - 1, so the event
// picture list holds the Amberstar pictures in order, centered on black 320x92 pictures. The engine
// shows event pictures with a palette per picture (Layout.AddEventPicture, currently a hardcoded switch
// for the Ambermoon pictures), so every picture gets its own palette (ctx.palettes, id
// eventpicture<n>) and ctx.result.eventPicturePalettes maps the event picture index to the sprite
// palette index (key - 1). See the engine change notes in ../characters.js.
// ---------------------------------------------------------------------------------------------
export const AmberstarEventPictureOffset = 0;

/** Event picture index (0-based like EventImageIndex) of an Amberstar 80x80 image (1-based). */
export function getEventPictureIndex(amberstarImage) {
	return AmberstarEventPictureOffset + amberstarImage - 1;
}

export function convertEventPictures(ctx, pictures) {
	const graphics = [];
	const palettes = [];
	pictures.forEach(({ graphic, palette }, i) => {
		// Black 320x92 picture with the 80x80 picture centered in a 2 pixel frame of the brightest and
		// a darker color of the picture palette.
		const picture = new Graphic(320, 92, 32); // 32 = opaque color 0 (black)
		const brightness = c => palette[c] ? palette[c][0] * 2 + palette[c][1] * 4 + palette[c][2] * 3 : 0;
		const colors = Array.from({ length: Math.min(16, palette.length) }, (_, c) => c).filter(c => c > 0);
		colors.sort((a, b) => brightness(b) - brightness(a));
		const bright = colors[0] ?? 1;
		const dark = colors[Math.floor(colors.length / 2)] ?? bright;
		const fill = (x, y, w, h, color) => {
			for (let fy = y; fy < y + h; fy++)
				picture.Data.fill(color, fy * 320 + x, fy * 320 + x + w);
		};
		fill(118, 4, 84, 84, bright);
		fill(119, 5, 82, 82, dark);
		const image = toAmbermoonGraphic(graphic);
		image.Data = image.Data.map(c => c === 0 ? 32 : c);
		picture.AddOverlay(120, 6, image, false);
		graphics.push(picture);
		const key = ctx.palettes.add(toAmbermoonPalette(palette, false), `eventpicture${i + 1}`);
		palettes.push(key - 1); // sprite palette index (= key - 1 like the hardcoded Ambermoon values)
	});
	return { graphics, palettes };
}

// ---------------------------------------------------------------------------------------------
// Battle field icons (16x14, drawn with the UI palette): index = Class for party members and
// Class.Monster + CombatGraphicIndex - 1 for monsters. Amberstar has tactic icons (TACTIC.ICN, 16x16,
// 3 animation frames per creature type) for the classes 0..9 and the monster graphics 1..21 (type
// 9 + graphic index). Monster CombatGraphicIndex = Amberstar battle graphic index, so the monster icons
// line up: Ambermoon icon k (k >= 10) = Amberstar tactic type k.
// ---------------------------------------------------------------------------------------------
export function convertBattleFieldIcons(ctx) {
	const icons = ctx.source.loadTacticIcons();
	const combatPalette = ctx.source.loadCombatPalettes()[0];
	const mapping = buildColorMapping(combatPalette, ctx.uiPalette);
	const typeCount = Math.floor(icons.length / 3);
	const result = [];
	for (let k = 0; k < typeCount; k++) {
		let type = k;
		if (k < Class.Monster) {
			const amberstarClass = ClassMapping.indexOf(k);
			type = amberstarClass < 0 ? 0 : amberstarClass;
		}
		const icon = remapGraphic(icons[type * 3], mapping);
		// 16x16 -> 16x14 (skip the first and last row which are empty in most icons)
		const cropped = new Graphic(16, 14, 0);
		cropped.Data.set(icon.Data.subarray(16, 16 * 15));
		result.push(cropped);
	}
	return result;
}

// ---------------------------------------------------------------------------------------------
// Monster combat graphics (MON_GFX.AMB)
//
// Amberstar stores 3 distances (far, middle, near) with 3 or 8 animation frames each. Files with 24
// entries have 8 slots per distance (unused slots are empty), files with 14/15 entries have 3 far,
// 3 middle and the rest near frames. The Ambermoon engine scales one set of frames per row itself
// (GetMonsterRowImageScaleFactor), so only the near frames are used.
//
// The frames keep the Amberstar combat palette color indices (0 = transparent, 1..15). The monster
// sprites are drawn with the palette of the combat background (CombatBackgroundInfo.Palettes), which
// are the Amberstar combat palettes (template + 3 background colors) registered by the labyrinths
// converter, like in Amberstar.
// ---------------------------------------------------------------------------------------------
function readMonsterFrames(ctx, graphicIndex) {
	const reader = ctx.source.reader('MON_GFX.AMB', graphicIndex);
	if (!reader)
		return null;
	const d = reader.data;
	const count = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 2;
	const offsets = [];
	for (let i = 0; i < count; i++)
		offsets.push(((d[i * 4] << 24) | (d[i * 4 + 1] << 16) | (d[i * 4 + 2] << 8) | d[i * 4 + 3]) >>> 0);
	const frames = offsets.map((o, i) => {
		const end = i + 1 < count ? offsets[i + 1] : d.length;
		if (end - o < 4)
			return null;
		const w = ((d[o] << 8) | d[o + 1]) * 16;
		const h = (d[o + 2] << 8) | d[o + 3];
		if (w === 0 || h === 0 || o + 4 + w * h / 2 > d.length)
			return null;
		return AmberstarGraphic.fromBitPlanes(w, h, d.subarray(o + 4, o + 4 + w * h / 2), 4);
	});
	let near;
	if (count === 24)
		near = frames.slice(16).filter(Boolean);
	else
		near = frames.slice(6).filter(Boolean);
	if (near.length === 0)
		near = frames.filter(Boolean).slice(-1);
	return near;
}

/**
 * Builds the combat graphic data of an Amberstar battle graphic index:
 * { graphic (compound Graphic), frameWidth, frameHeight, mappedWidth, mappedHeight, animations, alternateBits }
 */
export function convertMonsterGraphic(ctx, graphicIndex) {
	const frames = readMonsterFrames(ctx, graphicIndex);
	if (!frames || frames.length === 0)
		return null;
	const width = Math.max(...frames.map(f => f.width));
	const height = Math.max(...frames.map(f => f.height));
	const placed = frames.map(f => {
		const g = emptyGraphic(width, height);
		const x = Math.floor((width - f.width) / 2);
		const y = height - f.height; // bottom aligned
		for (let fy = 0; fy < f.height; fy++)
			for (let fx = 0; fx < f.width; fx++)
				g.Data[x + fx + (y + fy) * width] = f.data[fx + fy * f.width];
		return g;
	});
	const graphic = compoundGraphic(placed);
	// The Ambermoon battle field is 320 pixels wide (Amberstar: 176) but not much higher (95 vs. 112).
	const scale = Math.min(1.25, 100 / height);
	const n = placed.length;
	const all = Array.from({ length: n }, (_, i) => i);
	const attack = n <= 3 ? all.slice(1) : [...all, ...all.slice(0, -1).reverse()];
	const animations = [
		n > 1 ? [0, 1] : [0], // Move / idle
		attack, // close ranged attack
		attack, // long ranged attack
		attack, // cast
		[0], // hurt
		[], // die
		[], // start
		[],
	];
	let alternateBits = n > 1 ? 1 : 0;
	if (n <= 3)
		alternateBits |= 0b1110;
	return {
		graphic,
		frameWidth: width,
		frameHeight: height,
		mappedWidth: Math.round(width * scale),
		mappedHeight: Math.round(height * scale),
		animations,
		alternateBits,
	};
}

export function loadAmberstarPictures(ctx) {
	return loadPictures(ctx);
}
