// Port of Amberstar.GameData.Legacy.ProgramData for the Amiga AMBERDEV.UDO file.
import { DataReader, decodeString, findSequence } from './reader.js';
import { readContainer, readPrg } from './container.js';
import { Graphic } from './graphic.js';
import { UIGraphicInfo, UIGraphic, ButtonType, StatusIcon, ItemGraphicCount, UITextCount, CursorTypeCount } from './enums.js';

const AmigaReloc = {
	Version: 0x1ed,
	GlyphMapping: 0x10bb,
	RaceName: 0x1697,
	ClassName: 0x169c,
	SpellSchoolName: 0x1d91,
	Graphic: 0xa15,
	PArea: 0xaa9,
	Window: 0x28b4,
	Cursor: 0x2a13,
	UIText: 0x1107,
	Music: 0x1c8,
	AfterEnterWordLabel: 0xdb8,
};

/** Reads a compressed text table (text count, offsets, fragment indices) and returns its raw bytes */
export function determineTextLengthAndRead(reader) {
	const start = reader.position;
	const textCount = reader.readByte();
	reader.position++;
	if (textCount === 0)
		return new Uint8Array(0);
	reader.position += textCount * 2;
	const length = reader.readWord() * 2;
	reader.position = start;
	return reader.readBytes(2 + (textCount + 1) * 2 + length);
}

export class ProgramData {
	constructor(amberdevBytes) {
		const container = readContainer(amberdevBytes);
		const prg = readPrg(container.get(1));
		const r = new DataReader(prg.text);
		const reloc = prg.relocTable;
		this.textSegment = prg.text;

		const readGraphic = (w, h) => Graphic.fromBitPlanes(w, h, r.readBytes(w * h / 2), 4);

		// Version
		const versionPos = findSequence(prg.text, reloc[AmigaReloc.Version], [...'Version'].map(c => c.charCodeAt(0)));
		if (versionPos < 0)
			throw new Error('Could not find the version string in the program file.');
		r.position = versionPos;
		this.version = readStringUntil(r, 0x0d);

		// Glyph mappings
		r.position = reloc[AmigaReloc.GlyphMapping] + 2;
		this.glyphMappings = r.readBytes(224);

		// Text fragments
		const textCount = r.readWord();
		const unknownCount = r.readByte();
		r.position += unknownCount - 1;
		this.textFragments = [''];
		for (let i = 1; i < textCount; i++) {
			const length = r.readByte();
			this.textFragments.push(decodeString(r.readBytes(length - 1)));
		}
		if (r.readByte() !== 0)
			throw new Error('Invalid text fragment terminator.');

		// UI texts
		r.position = reloc[AmigaReloc.UIText];
		this.uiTexts = [];
		const readNullTerminatedText = () => {
			let last = 0xff;
			const buffer = [];
			while (true) {
				const b = r.readByte();
				if (b === 0 && last > 2)
					break;
				if (b < 3 && last < 3)
					last = 0xff;
				else
					last = b;
				buffer.push(b);
			}
			return Uint8Array.from(buffer);
		};
		for (let i = 0; i < UITextCount; i++) {
			if (i === UITextCount - 1) { // EnterWord
				r.position = reloc[AmigaReloc.AfterEnterWordLabel] - 2;
				while (r.peekByte() !== 2)
					r.position--;
				r.position++;
			}
			this.uiTexts.push(readNullTerminatedText());
		}

		// Windows
		r.position = reloc[AmigaReloc.Window];
		this.windows = [r.readBytes(0x800), r.readBytes(0x800)];

		// Embedded graphics
		r.position = reloc[AmigaReloc.Graphic];
		this.layoutBottomCorners = r.readWords(8 * 16);
		this.layoutBottomCornerMasks = r.readWords(8 * 4);

		// Portrait area
		this.portraitArea = new Graphic(320, 37);
		const statusBlockMid = readGraphic(16, 36);
		const statusBlockLeft = readGraphic(16, 36);
		const statusBlockRight = readGraphic(16, 36);
		const statusBlockTop = readGraphic(32, 1);
		const statusBlockBottom = readGraphic(32, 1);
		this.portraitArea.addOverlay(0, 0, statusBlockLeft);
		for (let i = 1; i <= 6; i++)
			this.portraitArea.addOverlay(i * 48, 0, statusBlockMid);
		this.portraitArea.addOverlay(6 * 48 + 16, 0, statusBlockRight);
		for (let i = 0; i < 6; i++) {
			this.portraitArea.addOverlay(16 + i * 48, 0, statusBlockTop);
			this.portraitArea.addOverlay(16 + i * 48, 35, statusBlockBottom);
		}

		// Layouts (11)
		this.layouts = [null];
		for (let i = 1; i <= 11; i++)
			this.layouts.push(r.readBytes(220));

		// UI graphics
		this.uiGraphics = [];
		const addUIGraphic = index => {
			const [w, h, frames] = UIGraphicInfo[index];
			this.uiGraphics[index] = r.readBytes(frames * w * h / 2);
		};
		for (let i = 0; i <= UIGraphic.Invisibility; i++)
			addUIGraphic(i);

		if (r.peekWord() !== 0xaaaa)
			throw new Error('Could not find the layouts in the program file.');

		this.layoutBlocks = [];
		for (let i = 0; i < 132; i++)
			this.layoutBlocks.push(readGraphic(16, 16));

		// Buttons
		this.buttons = [];
		for (let i = 0; i <= ButtonType.LastOriginalButton; i++)
			this.buttons.push(r.readBytes(32 * 16 / 2));

		// Status icons
		this.statusIcons = [];
		for (let i = 0; i <= StatusIcon.LastStatusIcon; i++)
			this.statusIcons.push(r.readBytes(16 * 16 / 2));

		for (let i = UIGraphic.DamageSplash; i <= UIGraphic.EmptyCharSlot; i++)
			addUIGraphic(i);

		// Item graphics
		this.itemGraphics = [];
		for (let i = 0; i < ItemGraphicCount; i++)
			this.itemGraphics.push(r.readBytes(16 * 16 / 2));

		for (let i = UIGraphic.HPBar; i <= UIGraphic.LastUIGraphic; i++)
			addUIGraphic(i);

		// Sky gradients
		this.skyGradients = [];
		for (let i = 0; i < 3; i++)
			this.skyGradients.push(r.readBytes(84 * 2));

		// Names
		r.position = reloc[AmigaReloc.RaceName];
		const readWordList = count => r.readWords(count);
		this.raceNames = readWordList(15);
		this.attributeNames = readWordList(10);

		r.position = reloc[AmigaReloc.ClassName];
		this.classNames = readWordList(11);
		this.skillNames = readWordList(10);
		this.charInfoTexts = readWordList(5);
		r.position += 12;
		this.languageNames = readWordList(7);
		r.position += 2;
		this.conditionNames = [0, ...readWordList(16)]; // 1-based
		this.itemTypeNames = readWordList(19);

		r.position = reloc[AmigaReloc.SpellSchoolName];
		this.spellSchoolNames = [0, ...readWordList(7)]; // 1-based
		this.spellNames = [0, ...readWordList(7 * 30)]; // 1-based
		this.spellLocationNames = readWordList(5);
		r.position += 4;
		this.spellTargetNames = readWordList(8);
		r.position += 2;

		// Places
		const placeCount = r.readWord();
		this.placesData = [null];
		this.placeNames = [null];
		for (let i = 1; i <= placeCount; i++)
			this.placesData.push(r.readBytes(24));
		for (let i = 1; i <= placeCount; i++)
			this.placeNames.push(decodeString(r.readBytes(30)).trimEnd());

		// Messages
		this.messageData = [];
		for (let i = 0; i < 8; i++)
			this.messageData.push(determineTextLengthAndRead(r));

		// Music
		r.position = reloc[AmigaReloc.Music];
		this.songs = [null];
		for (let i = 1; i <= 19; i++) {
			const start = r.position;
			r.position += 0x1c;
			const size = r.readDword();
			r.position = start;
			this.songs.push(r.readBytes(size));
			if (i < 19 && r.peekDword() !== 0x434f534f)
				throw new Error(`Could not find data for song ${i}.`);
		}

		// Cursors
		r.position = reloc[AmigaReloc.Cursor];
		this.cursors = [];
		for (let i = 0; i < CursorTypeCount; i++)
			this.cursors.push(r.readBytes(68));

		// Font
		r.position = reloc[AmigaReloc.PArea] + 8;
		this.font = r.readBytes(0x3fe);
	}
}

function readStringUntil(reader, endByte) {
	const bytes = [];
	while (reader.position < reader.size) {
		const b = reader.readByte();
		if (b === endByte)
			break;
		bytes.push(b);
	}
	return decodeString(bytes);
}
