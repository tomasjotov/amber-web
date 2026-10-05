// Asset provider for the original Amiga data files (port of AssetProvider and the loaders).
import { DataReader, findSequence } from './reader.js';
import { readContainer } from './container.js';
import { Graphic, loadWidePalette, loadPalette, paletteFromBytes, loadPaletteColors, loadGraphicWithHeader, loadGraphicList } from './graphic.js';
import { ProgramData } from './programData.js';
import { UIGraphic, UIGraphicInfo, ButtonType, DayTime } from './enums.js';
import { loadMap } from './maps.js';
import { loadLabBlock, loadLabData } from './labs.js';
import { Text } from './text.js';
import { readSavegame } from './savegame.js';
import { loadPerson, clonePartyMember, loadMonster, loadChest } from './characters.js';

export const UIPalette = paletteFromBytes([
	0x00, 0x00, 0x07, 0x50, 0x03, 0x33, 0x02, 0x22, 0x01, 0x11, 0x07, 0x42, 0x06, 0x31, 0x02, 0x00,
	0x05, 0x66, 0x03, 0x45, 0x07, 0x54, 0x06, 0x43, 0x05, 0x32, 0x04, 0x21, 0x03, 0x10, 0x07, 0x65,
]);
export const ItemPalette = paletteFromBytes([
	0x00, 0x00, 0x06, 0x51, 0x03, 0x33, 0x02, 0x22, 0x01, 0x11, 0x05, 0x31, 0x04, 0x21, 0x01, 0x24,
	0x02, 0x36, 0x06, 0x10, 0x03, 0x10, 0x05, 0x41, 0x03, 0x40, 0x04, 0x51, 0x04, 0x44, 0x07, 0x65,
]);
export const AutomapPalette = paletteFromBytes([
	0x00, 0x00, 0x05, 0x00, 0x03, 0x33, 0x02, 0x22, 0x01, 0x11, 0x04, 0x44, 0x05, 0x55, 0x02, 0x10,
	0x03, 0x20, 0x04, 0x31, 0x05, 0x42, 0x00, 0x12, 0x01, 0x23, 0x03, 0x51, 0x02, 0x30, 0x06, 0x66,
]);

export const DATA_FILES = [
	'AMBERDEV.UDO', 'MAP_DATA.AMB', 'MAPTEXT.AMB', 'CODETXT.AMB', 'PUZZLE.TXT', 'COL_PALL.AMB',
	'PICS80.AMB', 'ICON_DAT.AMB', 'PARTYDAT.SAV', 'LAB_DATA.AMB', 'LABBLOCK.AMB', 'BACKGRND.AMB',
	'MON_DATA.AMB', 'CHARDATA.AMB', 'CHESTDAT.AMB', 'WARESDAT.AMB', 'AUTOMAP.AMB', 'MON_GFX.AMB',
	'COM_BACK.AMB', 'SAMPLEDA.IMG', 'TACTIC.ICN', 'F_T_ANIM.ICN', 'PUZZLE.ICN',
];

export class AssetProvider {
	/** @param {Map<string, Uint8Array>} files original data files by upper case name */
	constructor(files) {
		this.files = files;
		this.containers = new Map();
		this.cache = new Map();
		this.program = new ProgramData(this.#file('AMBERDEV.UDO'));
		this.textFragments = this.program.textFragments;
	}

	#file(name) {
		const data = this.files.get(name);
		if (!data)
			throw new Error(`Missing data file ${name}`);
		return data;
	}

	hasFile(name) { return this.files.has(name); }

	container(name) {
		let c = this.containers.get(name);
		if (!c) {
			c = readContainer(this.#file(name));
			this.containers.set(name, c);
		}
		return c;
	}

	/** Returns a fresh reader for container entry (1-based) or null */
	reader(name, index) {
		const r = this.container(name).get(index);
		return r ? new DataReader(r.data) : null;
	}

	keys(name) {
		return [...this.container(name).keys()];
	}

	#cached(key, factory) {
		if (this.cache.has(key))
			return this.cache.get(key);
		const value = factory();
		this.cache.set(key, value);
		return value;
	}

	get version() { return this.program.version; }

	// ---- palettes ----

	loadPalette(index) {
		return this.#cached(`pal${index}`, () => loadWidePalette(this.reader('COL_PALL.AMB', index)));
	}

	// ---- layouts / ui ----

	loadLayout(index) {
		return this.#cached(`layout${index}`, () => {
			const def = this.program.layouts[index];
			const blocks = this.program.layoutBlocks;
			const corners = this.program.layoutBottomCorners;
			const masks = this.program.layoutBottomCornerMasks;
			const g = new Graphic(320, 163);
			let defIndex = 0, y = 0;

			for (let line = 0; line < 11; line++) {
				const offsetY = line === 0 ? 4 : 0;
				const height = line === 0 ? 12 : line === 10 ? 7 : 16;
				for (let i = 0; i < 20; i++) {
					let block = blocks[def[defIndex++] - 1];
					if (height !== 16)
						block = block.getPart(0, offsetY, 16, height);
					g.addOverlay(i * 16, y, block);
				}
				y += height;
			}

			let maskIndex = 0, cornerIndex = 0;
			for (const x of [0, 304]) {
				for (let by = 0; by < 16; by++) {
					const m = masks[maskIndex++];
					g.applyBitMaskedPlanarValues(x, 184 + by - 37, [m, m, m, m],
						[corners[cornerIndex++], corners[cornerIndex++], corners[cornerIndex++], corners[cornerIndex++]], 4);
				}
			}
			return g;
		});
	}

	get portraitArea() { return this.program.portraitArea; }

	loadUIGraphic(index) {
		if (index === UIGraphic.EmptyItemSlot)
			return this.program.layoutBlocks[77];
		return this.#cached(`ui${index}`, () => {
			const [w, h, frames] = UIGraphicInfo[index];
			return Graphic.fromBitPlanes(w, h, this.program.uiGraphics[index], 4, frames);
		});
	}

	loadButton(index) {
		return this.#cached(`btn${index}`, () => {
			if (index > ButtonType.LastOriginalButton) {
				const food = this.loadButton(ButtonType.DistributeFood);
				const give = this.loadButton(ButtonType.GiveItem);
				const button = food.fillRectsWithColor([{ x: 12, y: 2, w: 8, h: 5 }, { x: 15, y: 7, w: 8, h: 7 }], food.getColorIndexAt(2, 1));
				const item = give.getPart(3, 4, 7, 7);
				button.addOverlay(13, 3, item);
				button.addOverlay(11, 6, item);
				return button;
			}
			return Graphic.fromBitPlanes(32, 16, this.program.buttons[index], 4);
		});
	}

	loadStatusIcon(index) {
		return this.#cached(`status${index}`, () => Graphic.fromBitPlanes(16, 16, this.program.statusIcons[index], 4));
	}

	loadItemGraphic(index) {
		return this.#cached(`item${index}`, () => Graphic.fromBitPlanes(16, 16, this.program.itemGraphics[index], 4));
	}

	loadWindowGraphics(dark) {
		return this.#cached(`window${dark}`, () => {
			const data = this.program.windows[dark ? 0 : 1];
			const result = [];
			for (let i = 0; i < data.length / 128; i++)
				result.push(Graphic.fromBitPlanes(16, 16, data.subarray(i * 128, (i + 1) * 128), 4));
			return result;
		});
	}

	loadCursor(index) {
		return this.#cached(`cursor${index}`, () => {
			const r = new DataReader(this.program.cursors[index]);
			const hotspotX = r.readWord();
			const hotspotY = r.readWord();
			const graphic = Graphic.fromBitPlanes(16, 16, r.readBytes(32), 1);
			const mask = Graphic.fromBitPlanes(16, 16, r.readBytes(32), 1);
			graphic.maskWith(mask, 14);
			graphic.replaceColorIndex(1, 15);
			return { hotspotX, hotspotY, graphic };
		});
	}

	loadFont() {
		return this.#cached('font', () => {
			const r = new DataReader(this.program.font);
			const textConversion = r.readBytes(224);
			const runeConversion = r.readBytes(224);
			const glyphCount = (290 + 5 + 150) / 5;
			const glyphs = [];
			for (let i = 0; i < glyphCount; i++)
				glyphs.push(Graphic.fromBitPlanes(8, 5, r.readBytes(5), 1));
			return {
				advance: 6, glyphWidth: 8, glyphHeight: 5, lineHeight: 7,
				textConversion, runeConversion, glyphs,
				getGlyphIndex(ch, rune = false) {
					const code = typeof ch === 'number' ? ch : ch.charCodeAt(0);
					if (code <= 32)
						return -1;
					const table = rune ? runeConversion : textConversion;
					const idx = code - 32;
					if (idx >= table.length)
						return -1;
					return table[idx];
				},
			};
		});
	}

	loadSkyGradients() {
		return this.#cached('sky', () => {
			const result = {};
			for (let i = 0; i < 3; i++) {
				const data = loadPaletteColors(new DataReader(this.program.skyGradients[i]), 84);
				const gradient = [];
				for (let n = 0; n < 84; n++) {
					let r = data[n * 2] & 0xf;
					const gb = data[n * 2 + 1];
					let g = gb >> 4, b = gb & 0xf;
					gradient.push([r | (r << 4), g | (g << 4), b | (b << 4)]);
				}
				const dayTime = (i + 2) % 3; // 0 -> Day, 1 -> Night, 2 -> Dawn
				result[dayTime] = gradient;
				if (dayTime === DayTime.Dawn)
					result[DayTime.Dusk] = gradient;
			}
			return result;
		});
	}

	// ---- 80x80 pictures ----

	load80x80(index) {
		return this.#cached(`pic${index}`, () => {
			const g = Graphic.fromBitPlanes(80, 80, this.reader('PICS80.AMB', index * 2 - 1).readToEnd(), 4);
			const palette = loadPalette(this.reader('PICS80.AMB', index * 2));
			return { graphic: g, palette };
		});
	}

	// ---- maps ----

	loadMap(index) {
		return this.#cached(`map${index}`, () => loadMap(index, this.reader('MAP_DATA.AMB', index)));
	}

	get mapCount() { return this.keys('MAP_DATA.AMB').length; }

	loadTileset(index) {
		return this.#cached(`tileset${index}`, () => {
			const r = this.reader('ICON_DAT.AMB', index);
			const playerSpriteIndex = r.readWord();
			const frameCounts = r.readBytes(250);
			const imageIndices = r.readWords(250);
			const flags = [];
			for (let i = 0; i < 250; i++)
				flags.push(r.readDword());
			const colors = r.readBytes(250);
			const palette = loadWidePalette(r);
			const graphics = [];
			while (r.position <= r.size - 128)
				graphics.push(loadGraphicWithHeader(r));
			const tiles = [];
			for (let i = 0; i < 250; i++)
				tiles.push({ frameCount: frameCounts[i], imageIndex: imageIndices[i], minimapColorIndex: colors[i], flags: flags[i] });
			return { playerSpriteIndex, tiles, palette, graphics };
		});
	}

	loadAllLabBlocks() {
		return this.#cached('labblocks', () => {
			const blocks = new Map();
			for (const key of this.keys('LABBLOCK.AMB'))
				blocks.set(key, loadLabBlock(key, this.reader('LABBLOCK.AMB', key)));
			return blocks;
		});
	}

	loadLabData(index) {
		return this.#cached(`labdata${index}`, () => loadLabData(this.reader('LAB_DATA.AMB', index), this.loadAllLabBlocks()));
	}

	#loadBackgrounds() {
		return this.#cached('backgrounds', () => {
			const backgrounds = new Map(), clouds = new Map();
			for (const key of this.keys('BACKGRND.AMB')) {
				const graphics = loadGraphicList(this.reader('BACKGRND.AMB', key));
				backgrounds.set(key, graphics[0]);
				if (graphics.length > 1)
					clouds.set(key, graphics[1]);
			}
			return { backgrounds, clouds };
		});
	}

	loadBackground(index) { return this.#loadBackgrounds().backgrounds.get(index); }
	loadCloud(index) { return this.#loadBackgrounds().clouds.get(index); }
	get backgroundKeys() { return [...this.#loadBackgrounds().backgrounds.keys()]; }

	// ---- texts ----

	text(type, index) {
		return this.#cached(`text${type}:${index}`, () => {
			switch (type) {
				case 'map': return Text.read(this.reader('MAPTEXT.AMB', index), this.textFragments);
				case 'item': return Text.read(this.reader('CODETXT.AMB', index), this.textFragments);
				case 'puzzle': return Text.read(this.reader('PUZZLE.TXT', index), this.textFragments);
				default: throw new Error(`Unknown text type ${type}`);
			}
		});
	}

	/** Message from the embedded message containers, 1-based index across all containers */
	message(index) {
		let blockIndex = index;
		for (let i = 0; i < this.program.messageData.length; i++) {
			const container = this.#cached(`msg${i}`, () => Text.fromBytes(this.program.messageData[i], this.textFragments));
			if (blockIndex < container.textBlockCount)
				return container.getTextBlock(blockIndex);
			blockIndex -= container.textBlockCount;
		}
		throw new Error(`Message ${index} not found`);
	}

	fragment(index) {
		return this.textFragments[index] ?? '';
	}

	fragmentText(index) {
		return Text.fromFragmentIndex(index, this.textFragments);
	}

	uiText(index) {
		return this.program.uiTexts[index];
	}

	findWord(word) {
		const lower = word.toLowerCase();
		const index = this.textFragments.findIndex(t => t.toLowerCase() === lower);
		return index === -1 ? null : index;
	}

	placeName(index) { return this.program.placeNames[index]; }
	placeData(index) { return this.program.placesData[index]; }

	// ---- characters ----

	loadPerson(index) {
		return this.#cached(`person${index}`, () => loadPerson(index, this.reader('CHARDATA.AMB', index), this.textFragments));
	}

	get personKeys() { return this.keys('CHARDATA.AMB'); }

	/** Map of character index -> party member copy (only persons who can join) */
	getPartyMemberCopies() {
		const result = new Map();
		for (const key of this.personKeys) {
			const p = this.loadPerson(key);
			if (p.isPartyMember)
				result.set(key, clonePartyMember(p));
		}
		return result;
	}

	/** Map of character index -> portrait graphic */
	loadPersonPortraits() {
		return this.#cached('portraits', () => {
			const result = new Map();
			for (const key of this.personKeys) {
				const p = this.loadPerson(key);
				if (p.conversationData.portrait)
					result.set(key, p.conversationData.portrait);
			}
			return result;
		});
	}

	loadMonster(index) {
		return this.#cached(`monster${index}`, () => loadMonster(this.reader('MON_DATA.AMB', index)));
	}

	loadChest(index) {
		return this.#cached(`chest${index}`, () => loadChest(index, this.reader('CHESTDAT.AMB', index)));
	}

	/** Place data as 12 words */
	loadPlaceData(index) {
		const data = this.program.placesData[index];
		const words = [];
		for (let i = 0; i < 12; i++)
			words.push((data[i * 2] << 8) | data[i * 2 + 1]);
		return { words, name: this.program.placeNames[index] };
	}

	// ---- battle ----

	/** 14 combat palettes (template + variant per combat background) */
	loadCombatPalettes() {
		return this.#cached('combatPalettes', () => {
			const text = this.program.textSegment;
			const pos = findSequence(text, 0, [...'CODETXT.AMB'].map(c => c.charCodeAt(0)));
			if (pos < 0)
				throw new Error('Combat palette not found');
			const tpl = pos + 0x5e5;
			const template = loadPalette(new DataReader(text, tpl, 32));
			const result = [];
			for (let i = 0; i < 14; i++) {
				const variant = loadPalette(new DataReader(text, tpl + 32 + i * 6, 6), 3);
				const p = template.slice();
				p[12] = variant[0];
				p[13] = variant[1];
				p[14] = variant[2];
				result.push(p);
			}
			return result;
		});
	}

	/** Combat background (1..14), 176x112 */
	loadCombatBackground(index) {
		return this.#cached(`comback${index}`, () => Graphic.fromBitPlanes(176, 112, this.reader('COM_BACK.AMB', index).readToEnd(), 4));
	}

	/** Tactical grid icons: 31 creature types with 3 animation frames each (16x16) */
	loadTacticIcons() {
		return this.#cached('tactic', () => {
			const data = this.#file('TACTIC.ICN');
			const icons = [];
			for (let i = 0; i < data.length / 128; i++)
				icons.push(Graphic.fromBitPlanes(16, 16, data.subarray(i * 128, (i + 1) * 128), 4));
			return icons;
		});
	}

	/** Combat field animations (spells etc.), 16x16 frames */
	loadCombatAnimations() {
		return this.#cached('ftanim', () => {
			const data = this.#file('F_T_ANIM.ICN');
			const icons = [];
			for (let i = 0; i < data.length / 128; i++)
				icons.push(Graphic.fromBitPlanes(16, 16, data.subarray(i * 128, (i + 1) * 128), 4));
			return icons;
		});
	}

	/**
	 * First person monster graphics (MON_GFX.AMB). Returns 3 groups (far, middle, near)
	 * of animation frames. The file stores a table of frame offsets, each frame starts
	 * with the width in words and the height.
	 */
	loadMonsterGraphics(index) {
		return this.#cached(`mongfx${index}`, () => {
			const r = this.reader('MON_GFX.AMB', index);
			if (!r)
				return null;
			const d = r.data;
			const count = r.peekDword() / 4;
			const offsets = r.readWords(count * 2).filter((_, i) => i % 2 === 1).map((lo, i) => lo); // offsets are < 64k
			const frames = [];
			for (let i = 0; i < count; i++) {
				const o = offsets[i];
				const end = i + 1 < count ? offsets[i + 1] : d.length;
				if (end - o < 4) {
					frames.push(null);
					continue;
				}
				const words = (d[o] << 8) | d[o + 1];
				const h = (d[o + 2] << 8) | d[o + 3];
				const w = words * 16;
				frames.push(Graphic.fromBitPlanes(w, h, d.subarray(o + 4, o + 4 + w * h / 2), 4));
			}
			// Group the frames by size (3 distances)
			const groups = [];
			if (count === 24) {
				for (let g = 0; g < 3; g++)
					groups.push(frames.slice(g * 8, g * 8 + 8).filter(Boolean));
			} else {
				let current = [];
				for (const f of frames) {
					if (!f) continue;
					if (current.length && current[0].width !== f.width) {
						groups.push(current);
						current = [];
					}
					current.push(f);
				}
				if (current.length)
					groups.push(current);
			}
			while (groups.length < 3)
				groups.unshift(groups[0] ?? []);
			return groups.slice(0, 3);
		});
	}

	/** Monster group (combat layout) from MON_DATA.AMB: rows from nearest to farthest */
	loadMonsterGroup(index) {
		return this.#cached(`mongroup${index}`, () => {
			const r = this.reader('MON_DATA.AMB', index);
			if (!r)
				return null;
			const ids = r.readWords(3);
			const masks = r.readBytes(3);
			return ids.map((id, i) => ({ monsterIndex: id, mask: masks[i] }));
		});
	}

	/** Monster character data (stored in CHARDATA.AMB like persons) */
	loadMonsterCharacter(index) {
		return this.#cached(`monchar${index}`, () => loadMonster(this.reader('CHARDATA.AMB', index)));
	}

	// ---- new game ----

	/** The original keeps a fresh copy of the changing files in Amberfiles/_new */
	get hasNewGameData() {
		return this.files.has('_NEW/PARTYDAT.SAV') && this.files.has('_NEW/CHARDATA.AMB');
	}

	/** Savegame and party members of a new game */
	loadNewGame() {
		const savegame = readSavegame(new DataReader(this.files.get('_NEW/PARTYDAT.SAV')));
		const container = readContainer(this.files.get('_NEW/CHARDATA.AMB'));
		const partyMembers = new Map();
		for (const [key, reader] of container) {
			const p = loadPerson(key, new DataReader(reader.data), this.textFragments);
			if (p.isPartyMember)
				partyMembers.set(key, clonePartyMember(p));
		}
		return { savegame, partyMembers };
	}

	// ---- savegame ----

	loadInitialSavegame() {
		return readSavegame(this.reader('PARTYDAT.SAV', 1));
	}
}
