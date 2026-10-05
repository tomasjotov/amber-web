// Port of Ambermoon.Data.Legacy/ExecutableData/ExecutableData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, newArray } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { Item } from '../../Ambermoon.Data.Common/Item.js';
import { TextContainer } from '../../Ambermoon.Data.Common/TextContainer.js';
import { AmigaExecutable } from '../Serialization/AmigaExecutable.js';
import { DataReader } from '../Serialization/DataReader.js';
import { GraphicReader } from '../Serialization/GraphicReader.js';
import { ItemReader } from '../Serialization/ItemReader.js';
import { TextContainerReader } from '../Serialization/TextContainerReader.js';
import { GraphicProvider } from '../GraphicProvider.js';
import { ItemManager } from '../ItemManager.js';
import { UIGraphics } from './UIGraphics.js';
import { DigitGlyphs } from './DigitGlyphs.js';
import { Glyphs } from './Glyphs.js';
import { Cursors } from './Cursors.js';
import { FileList } from './FileList.js';
import { WorldNames } from './WorldNames.js';
import { Messages } from './Messages.js';
import { AutomapNames } from './AutomapNames.js';
import { OptionNames } from './OptionNames.js';
import { SongNames } from './SongNames.js';
import { SpellTypeNames } from './SpellTypeNames.js';
import { SpellNames } from './SpellNames.js';
import { LanguageNames } from './LanguageNames.js';
import { ClassNames } from './ClassNames.js';
import { RaceNames } from './RaceNames.js';
import { SkillNames } from './SkillNames.js';
import { AttributeNames } from './AttributeNames.js';
import { ItemTypeNames } from './ItemTypeNames.js';
import { ConditionNames } from './ConditionNames.js';
import { UITexts } from './UITexts.js';
import { Buttons } from './Buttons.js';

// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

/**
 * This contains all relevant data from the executable.
 *
 * The last RELOC32 hunk contains some offset mappings for the last
 * data hunk which contains the relevant data. With the help of
 * these offsets, we can safely locate the data.
 *
 * There should be 15 relocation offsets for hunk 5 (which should
 * be the last data hunk 0-based without END hunks).
 *
 * If the first 12 offsets are added together the resulting
 * offset (in bytes) points to the beginning of the section
 * with codepage mappings which should be the first important
 * data section.
 *
 * The 13th and 15th offsets are longer ones. The 14th should
 * be a small 4 byte offset.
 *
 * If the 13th offset is added this points right after the
 * rune code mapping and those additional 10 bytes:
 * 03 00 1C 1C 1A 1A 19 1B 18 18
 *
 * The next section starts with two identical dwords and then
 * the first text section starts. The mentioned 14th offset
 * points to the second dword.
 *
 * After adding all 15 offsets together and adding 262 we
 * are at the glyph data section. But if this address is not
 * dword-aligned we have to do so (offset += (4 - offset % 4)).
 *
 * =====================
 * The first data hunk contains some UI graphics.
 *
 * The second data hunk contains palettes, texts,
 * cursors, glyphs and their mappings,
 * button graphics and items.
 */
export class ExecutableData {
	// TODO: at offste 0x79be in data hunk 1 (german 1.05) there is the info about combat backgrounds
	// descibed here https://gitlab.com/ambermoon/research/-/wikis/Amberfiles/Combat_background.
	// there are 128 bytes (32 * 4). 4 bytes for 15 2D backgrounds and 4 bytes for 15 3D backgrounds.
	// first byte is the combat background graphic index (1-based) and then 3 palette indices (daytime dependent).

	// Before that there are 3*14 bytes. A 14 byte chunk for each world (Lyramion, Forest Moon, Morag).
	// - ushort mapsPerRow
	// - ushort mapsPerColumn
	// - ushort tilesPerMapRow (= mapWidth)
	// - ushort tilesPerMapColumn (= mapHeight)
	// - ushort firstWorldMapIndex (1, 300, 513)
	// - ushort nightEndTime (6)
	// - ushort dayEndTime (18)

	static DigitGlyphOffset = 48; // Glyph 48 is '0'

	/** Activator.CreateInstance(typeof(T), dataReader) */
	static Read(type, dataReaders, readerIndex) {
		const dataReader = dataReaders[readerIndex];

		return new type(dataReader);
	}

	static ReadOffsetAfterByteSequence(dataReader, ...sequence) {
		const index = dataReader.FindByteSequence(Uint8Array.from(sequence), dataReader.Position);

		if (index === -1)
			throw new AmbermoonException(ExceptionScope.Data, 'Could not find byte sequence.');

		dataReader.Position = index + sequence.length;

		return dataReader.ReadDword();
	}

	/* Some interesting offsets:
	 *
	 * 2nd data hunk
	 * =============
	 *
	 * Offsets are for German 1.05.
	 *
	 * 0x7AA0: Palette indices for event pix (only 8 of 9)
	 * 0x8085: Name of the dictionary file. From here on the relative
	 *         text offsets will differ between german and english version!
	 */

	static FromGameData(gameData) {
		const exe = gameData.Files.get('AM2_CPU');
		const hunks = exe !== undefined
			? AmigaExecutable.Read(exe.Files.get(1))
			: [];

		const textAmb = gameData.Files.get('Text.amb') ?? null;
		const objectsAmb = gameData.Files.get('Objects.amb') ?? null;
		const buttonGraphics = gameData.Files.get('Button_graphics') ?? null;

		const textAmbPosition = textAmb == null ? 0 : textAmb.Files.get(1).Position;
		const objectsAmbPosition = objectsAmb == null ? 0 : objectsAmb.Files.get(1).Position;
		const buttonGraphicsPosition = buttonGraphics == null ? 0 : buttonGraphics.Files.get(1).Position;

		try {
			return new ExecutableData(hunks, textAmb?.Files.get(1) ?? null, objectsAmb?.Files.get(1) ?? null, buttonGraphics?.Files.get(1) ?? null);
		}
		finally {
			if (textAmb != null)
				textAmb.Files.get(1).Position = textAmbPosition;
			if (objectsAmb != null)
				objectsAmb.Files.get(1).Position = objectsAmbPosition;
			if (buttonGraphics != null)
				buttonGraphics.Files.get(1).Position = buttonGraphicsPosition;
		}
	}

	/**
	 * ExecutableData(hunks) or ExecutableData(hunks, textAmbReader, objectsAmbReader, buttonGraphicsReader)
	 */
	constructor(hunks, textAmbReader = null, objectsAmbReader = null, buttonGraphicsReader = null) {
		this.DataVersionString = null;
		this.DataInfoString = null;
		this.UIGraphics = null;
		this.DigitGlyphs = null;
		this.Glyphs = null;
		this.Cursors = null;
		this.FileList = null;
		this.WorldNames = null;
		this.Messages = null;
		this.AutomapNames = null;
		this.OptionNames = null;
		this.SongNames = null;
		this.SpellTypeNames = null;
		this.SpellNames = null;
		this.LanguageNames = null;
		this.ClassNames = null;
		this.RaceNames = null;
		this.SkillNames = null;
		this.AttributeNames = null;
		this.ItemTypeNames = null;
		this.ConditionNames = null;
		this.UITexts = null;
		this.Buttons = null;
		this.ItemManager = null;
		this.BuiltinPalettes = newArray(3);
		this.SkyGradients = newArray(9);
		this.DaytimePaletteReplacements = newArray(6);

		const firstCodeHunk = hunks?.find(h => h.Type === AmigaExecutable.HunkType.Code) ?? null;

		if (firstCodeHunk == null && textAmbReader == null) {
			this.DataInfoString = 'Unknown data version';
			return;
		}

		const codeReader = firstCodeHunk == null ? null : DataReader.FromData(firstCodeHunk.Data);
		let textContainer = null;

		if (textAmbReader != null) {
			textAmbReader.Position = 0;
			textContainer = new TextContainer();
			const textContainerReader = new TextContainerReader();
			textContainerReader.ReadTextContainer(textContainer, textAmbReader, true);
			this.DataVersionString = textContainer.VersionString;
			this.DataInfoString = textContainer.DateAndLanguageString;
		}
		else {
			codeReader.Position = 6;
			this.DataVersionString = codeReader.ReadNullTerminatedString(AmigaExecutable.Encoding);
			this.DataInfoString = codeReader.ReadNullTerminatedString(AmigaExecutable.Encoding);
		}

		let dataHunkReaders = null;
		let dataHunkIndex = 0;

		if (hunks.length > 0) {
			dataHunkReaders = hunks.filter(h => h.Type === AmigaExecutable.HunkType.Data).map(h => DataReader.FromData(h.Data));

			// Note: First 160 bytes are copper commands which can be dynamically filled
			// to move data to some Amiga registers. The area is permanently used by the
			// copper.
			dataHunkReaders[dataHunkIndex].Position = 160;

			this.UIGraphics = ExecutableData.Read(UIGraphics, dataHunkReaders, dataHunkIndex);
			// Here follows the note period table for Sonic Arranger (110 words)
			// Then the vibrato table (258 bytes)
			// Then track data and many more SA tables

			dataHunkIndex = 1;
			const reader = dataHunkReaders[1];
			codeReader.Position = 115000;
			reader.Position = ExecutableData.ReadOffsetAfterByteSequence(codeReader, 0x34, 0x3c, 0x03, 0xe7, 0x41, 0xf9);
			this.DigitGlyphs = ExecutableData.Read(DigitGlyphs, dataHunkReaders, dataHunkIndex);

			// TODO ...

			// NOTE: There is a new AM2_CPU format introduced to ease supporting new languages.
			// Instead of storing the glyph data and character mappings somewhere inside data
			// hunks which contain a lot of other stuff (including arbitrary sized texts), there
			// is a new data hunk at the end solely for glyph-related data.
			//
			// Original AM2_CPUs have 3 data hunks, now there are 4.
			const newExeFormat = dataHunkReaders.length === 4;

			if (newExeFormat) {
				codeReader.Position += 27500;

				codeReader.Position = codeReader.FindByteSequence(Uint8Array.from([0x48, 0xe7, 0x00, 0xc0, 0x41, 0xf9]), codeReader.Position) + 180;
				reader.Position = ExecutableData.ReadOffsetAfterByteSequence(codeReader, 0x48, 0xe7, 0x00, 0xc0, 0x41, 0xf9);
				this.Cursors = ExecutableData.Read(Cursors, dataHunkReaders, dataHunkIndex);

				const glyphHunkReader = dataHunkReaders[dataHunkReaders.length - 1];

				glyphHunkReader.Position = 2 * 224; // 224 chars (256 - 32) are mapped for normal and rune glyphs

				this.Glyphs = ExecutableData.Read(Glyphs, dataHunkReaders, dataHunkReaders.length - 1);
			}
			else {
				codeReader.Position += 29000;

				reader.Position = ExecutableData.ReadOffsetAfterByteSequence(codeReader, 0x22, 0x48, 0x41, 0xf9);
				this.Glyphs = ExecutableData.Read(Glyphs, dataHunkReaders, dataHunkIndex);
				this.Cursors = ExecutableData.Read(Cursors, dataHunkReaders, dataHunkIndex);
			}

			// Here are the 3 builtin palettes for primary UI, automap and secondary UI.
			for (let i = 0; i < 3; ++i) {
				this.BuiltinPalettes[i] = GraphicProvider.ReadPalette(dataHunkReaders[dataHunkIndex]);
			}

			// Then 9 vertical color gradients used for skies are stored. They are stored
			// as 16 bit XRGB colors and not color indices!
			// The first 3 skies are for Lyramion, the next 3 for the forest moon and the last
			// 3 for Morag. The first sky is night, the second twilight and the third day.
			// Transitions blend night with twilight or day with twilight.
			const skyGraphicInfo = new GraphicInfo();
			skyGraphicInfo.Alpha = false;
			skyGraphicInfo.GraphicFormat = GraphicFormat.XRGB16;
			skyGraphicInfo.Width = 1;
			skyGraphicInfo.Height = 72;
			const graphicReader = new GraphicReader();

			for (let i = 0; i < 9; ++i) {
				const sky = this.SkyGradients[i] = new Graphic();
				graphicReader.ReadGraphic(sky, dataHunkReaders[dataHunkIndex], skyGraphicInfo);
			}

			// After the 9 sky gradients there are 6 partial palettes (16 colors).
			// Two of them per world (first for night, second for twilight).
			// They are also blended together (the first 16 colors of the map's palette is
			// used for day) and then replaces the first 16 colors of the map's palette.
			const daytimePaletteReplacementInfo = new GraphicInfo();
			daytimePaletteReplacementInfo.Alpha = false;
			daytimePaletteReplacementInfo.GraphicFormat = GraphicFormat.XRGB16;
			daytimePaletteReplacementInfo.Width = 1;
			daytimePaletteReplacementInfo.Height = 16;
			for (let i = 0; i < 6; ++i) {
				const replacement = this.DaytimePaletteReplacements[i] = new Graphic();
				graphicReader.ReadGraphic(replacement, dataHunkReaders[dataHunkIndex], daytimePaletteReplacementInfo);
			}

			// TODO: Here the spell infos for all 210 possible spells follow (5 byte each).
			// TODO: Then 1024 words follow. Most likely some 3D stuff (cos/sin values). 101, 201, 302, 402, 503, ...
			// TODO: Then 1025 words follow. Also 3D stuff I guess. 0, 1, 1, 2, 3, 3, 4, 4, 5, ...
			// TODO: Then the class exp factors follow (11 words).
			// TODO: Then for each travel type a number of additional ticks per step follows (11 bytes). 0 means move directly, 1 means pause for 1 additional tick after movement, etc.
			// TODO: Then for each travel type a number follows which specifies how many steps are needed to increase the time by 5 minutes (11 bytes).
			// TODO: Then for each travel type the music index follows (11 bytes).
			// TODO: Then a fill byte to get to a even word boundary.
			// TODO: Then there are 3 world infos. They contain 7 words each: MapsPerRow, MapsPerCol, MapWidth, MapHeight, MapIndexOffset, DayBeginHour, DayEndHour (not sure about the latter two).
			// TODO: Then 2x16 combat background infos follow. First 16 for 2D, then 16 for 3D. Each info has 4 bytes. Image index and then 3 palette indices for day, twilight and night.
			// TODO: Then the 9 character heights for the races follow (word each). The first (human -> 180) is also the reference height.

			// TODO ...

			const search = 'Amberfiles/';
			dataHunkReaders[1].Position = dataHunkReaders[1].FindString(search, dataHunkReaders[1].Position) + search.length + 54;
		}

		if (textContainer == null) {
			this.FileList = ExecutableData.Read(FileList, dataHunkReaders, dataHunkIndex);
			this.WorldNames = ExecutableData.Read(WorldNames, dataHunkReaders, dataHunkIndex);
			this.Messages = ExecutableData.Read(Messages, dataHunkReaders, dataHunkIndex);
			this.AutomapNames = ExecutableData.Read(AutomapNames, dataHunkReaders, dataHunkIndex);
			this.OptionNames = ExecutableData.Read(OptionNames, dataHunkReaders, dataHunkIndex);
			this.SongNames = ExecutableData.Read(SongNames, dataHunkReaders, dataHunkIndex);
			this.SpellTypeNames = ExecutableData.Read(SpellTypeNames, dataHunkReaders, dataHunkIndex);
			this.SpellNames = ExecutableData.Read(SpellNames, dataHunkReaders, dataHunkIndex);
			this.LanguageNames = ExecutableData.Read(LanguageNames, dataHunkReaders, dataHunkIndex);
			this.ClassNames = ExecutableData.Read(ClassNames, dataHunkReaders, dataHunkIndex);
			this.RaceNames = ExecutableData.Read(RaceNames, dataHunkReaders, dataHunkIndex);
			this.SkillNames = ExecutableData.Read(SkillNames, dataHunkReaders, dataHunkIndex);
			this.AttributeNames = ExecutableData.Read(AttributeNames, dataHunkReaders, dataHunkIndex);
			this.SkillNames.AddShortNames(dataHunkReaders[dataHunkIndex]);
			this.AttributeNames.AddShortNames(dataHunkReaders[dataHunkIndex]);
			this.ItemTypeNames = ExecutableData.Read(ItemTypeNames, dataHunkReaders, dataHunkIndex);
			this.ConditionNames = ExecutableData.Read(ConditionNames, dataHunkReaders, dataHunkIndex);
			this.UITexts = ExecutableData.Read(UITexts, dataHunkReaders, dataHunkIndex);
		}
		else {
			if (dataHunkReaders != null) {
				const hunkReader = dataHunkReaders[1];
				let dataHunks = 0;
				let relocHunk = null;
				for (const hunk of hunks) {
					if (hunk.Type === AmigaExecutable.HunkType.Data)
						++dataHunks;

					if (hunk.Type === AmigaExecutable.HunkType.RELOC32 && dataHunks === 2) {
						relocHunk = hunk;
						break;
					}
				}

				if (relocHunk == null)
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid executable file.');

				const FindHunk = offset => {
					for (const [Key, Value] of relocHunk.Entries) {
						if (Value.includes(offset))
							return Key;
					}

					return -1;
				};

				this.FileList = new FileList();

				while (hunkReader.PeekWord() !== 0) {
					const hunkIndex = FindHunk(hunkReader.Position);

					if (hunkIndex === -1)
						throw new AmbermoonException(ExceptionScope.Data, 'Invalid executable file.');

					const offset = hunkReader.ReadDword();

					const fileNameReader = DataReader.FromData(hunks[hunkIndex].Data);
					fileNameReader.Position = offset;
					this.FileList.ReadFileEntry(fileNameReader);
				}
			}

			this.WorldNames = new WorldNames(textContainer.WorldNames);
			this.Messages = new Messages(textContainer.FormatMessages, textContainer.Messages);
			this.AutomapNames = new AutomapNames(textContainer.AutomapTypeNames);
			this.OptionNames = new OptionNames(textContainer.OptionNames);
			this.SongNames = new SongNames(textContainer.MusicNames);
			this.SpellTypeNames = new SpellTypeNames(textContainer.SpellClassNames);
			this.SpellNames = new SpellNames(textContainer.SpellNames);
			this.LanguageNames = new LanguageNames(textContainer.LanguageNames);
			this.ClassNames = new ClassNames(textContainer.ClassNames);
			this.RaceNames = new RaceNames(textContainer.RaceNames);
			this.SkillNames = new SkillNames(textContainer.SkillNames, textContainer.SkillShortNames);
			this.AttributeNames = new AttributeNames(textContainer.AttributeNames, textContainer.AttributeShortNames);
			this.ItemTypeNames = new ItemTypeNames(textContainer.ItemTypeNames);
			this.ConditionNames = new ConditionNames(textContainer.ConditionNames);
			this.UITexts = new UITexts(textContainer.UITexts);
		}

		if (buttonGraphicsReader != null) {
			buttonGraphicsReader.Position = 0;
			this.Buttons = new Buttons(buttonGraphicsReader);
		}
		else {
			this.Buttons = ExecutableData.Read(Buttons, dataHunkReaders, dataHunkIndex);
		}

		if (objectsAmbReader == null) {
			const itemCount = dataHunkReaders[dataHunkIndex].ReadWord();
			if (dataHunkReaders[dataHunkIndex].ReadWord() !== itemCount)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid item data.');

			const itemReader = new ItemReader();
			const items = new Map();

			for (let i = 1; i <= itemCount; ++i) // in original Ambermoon there are 402 items
				add(items, i, Item.Load(i, itemReader, dataHunkReaders[dataHunkIndex]));

			this.ItemManager = new ItemManager(items);
		}
		else {
			objectsAmbReader.Position = 0;
			const itemCount = objectsAmbReader.ReadWord();
			const itemReader = new ItemReader();
			const items = new Map();

			for (let i = 1; i <= itemCount; ++i) // in original Ambermoon there are 402 items
				add(items, i, Item.Load(i, itemReader, objectsAmbReader));

			this.ItemManager = new ItemManager(items);
		}
	}
}
