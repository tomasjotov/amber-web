// Port of Ambermoon.Data.Legacy/Serialization/IntroData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmigaExecutable } from './AmigaExecutable.js';
import { DataReader } from './DataReader.js';
import { Deploder } from './Deploder.js';
import { GraphicReader } from './GraphicReader.js';
import { IntroGraphic, IntroText, IntroTextCommandType } from '../../Ambermoon.Data.Common/IIntroData.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { Glyph } from '../../Ambermoon.Data.Common/Glyph.js';
import { Color } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { TextProcessor } from '../Text.js';
import { arrayCopy, getValue, tryGetValue, ArgumentException } from '../../../runtime.js';

/** System.Text.Encoding.UTF8 replacement */
const UTF8Encoding = {
	IsSingleByte: false,
	GetString(bytes) {
		return new TextDecoder('utf-8').decode(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
	},
	GetBytes(str) {
		return new TextEncoder().encode(str);
	}
};

function addUnique(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

export class IntroTwinlakeImagePart {
	constructor() {
		this.Position = null;
		this.Graphic = null;
	}
}

export class TextCommand {
	constructor(type = 0, args = null) {
		this.Type = type;
		this.Args = args;
	}

	/** out TextCommand? textCommand -> returns [success, textCommand] */
	static TryParse(dataReader, texts) {
		let textCommand = null;
		const command = dataReader.ReadByte();

		if (command > IntroTextCommandType.ActivatePaletteFading) {
			if (command === 255)
				return [false, textCommand]; // End marker

			// Otherwise the data is invalid
			throw new AmbermoonException(ExceptionScope.Data, 'Unsupported intro text command.');
		}

		let args;

		switch (command) {
			case IntroTextCommandType.Add:
				args = new Array(3).fill(0);
				args[0] = dataReader.ReadByte(); // X
				args[1] = dataReader.ReadByte(); // Y
				args[2] = texts.length; // Text index
				texts.push(dataReader.ReadNullTerminatedString());
				break;
			case IntroTextCommandType.Wait:
				args = [dataReader.ReadByte()]; // Ticks
				break;
			case IntroTextCommandType.SetTextColor:
				args = [dataReader.ReadWord()]; // Color
				break;
			default:
				args = [];
				break;
		}

		textCommand = new TextCommand(command, args);

		return [true, textCommand];
	}
}

// This is somewhere in the code hunk so we just define it static here.
const GlyphMapping = new Uint8Array([
	0xff, 0x42, 0xff, 0xff, 0xff, 0xff, 0x47, 0x4b,
	0x44, 0x45, 0xff, 0x46, 0x3e, 0x48, 0x3f, 0x43,
	0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b,
	0x3c, 0x3d, 0x40, 0xff, 0x49, 0xff, 0x4a, 0x41,
	0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
	0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
	0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
	0x17, 0x18, 0x19, 0xff, 0xff, 0xff, 0xff, 0xff,
	0x4b, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
	0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28,
	0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30,
	0x31, 0x32, 0x33, 0xff, 0xff, 0xff, 0xff, 0xff
]);

let graphicPalettes = null;
let paletteGraphicInfo = null;

function getPaletteGraphicInfo() {
	if (paletteGraphicInfo === null) {
		paletteGraphicInfo = new GraphicInfo();
		paletteGraphicInfo.Width = 32;
		paletteGraphicInfo.Height = 1;
		paletteGraphicInfo.GraphicFormat = GraphicFormat.XRGB16;
	}
	return paletteGraphicInfo;
}

function FindByteSequence(reader, offset, ...sequence) {
	let matchLength = 0;
	reader.Position = offset;

	while (reader.Position < reader.Size) {
		if ((reader.Size - reader.Position) + matchLength < sequence.length)
			return -1;

		if (reader.ReadByte() === sequence[matchLength]) {
			if (++matchLength === sequence.length)
				return reader.Position - matchLength;
		} else {
			matchLength = 0;
		}
	}

	return -1;
}

export class IntroData {
	/** @param gameData Legacy GameData (uses gameData.Files: Map<string, IFileContainer>) */
	constructor(gameData) {
		this.twinlakeImageParts = [];
		this.textCommands = [];
		this.textCommandTexts = [];
		this.introPalettes = [];
		this.graphics = new Map();
		this.texts = new Map();
		this.glyphs = new Map();
		this.largeGlyphs = new Map();

		const graphics = this.graphics;
		const texts = this.texts;
		const textCommands = this.textCommands;
		const textCommandTexts = this.textCommandTexts;
		const introPalettes = this.introPalettes;
		const twinlakeImageParts = this.twinlakeImageParts;
		const glyphs = this.glyphs;
		const HunkType = AmigaExecutable.HunkType;

		const introHunks = AmigaExecutable.Read(getValue(getValue(gameData.Files, 'Ambermoon_intro').Files, 1));
		const introDataHunks = introHunks
			.filter(h => h.Type === HunkType.Data).map(h => DataReader.FromData(h.Data));
		const graphicReader = new GraphicReader();

		// #region Hunk 0 - Palettes and texts

		const hunk0 = introDataHunks[0];

		function LoadPalette() {
			const paletteGraphic = new Graphic();
			graphicReader.ReadGraphic(paletteGraphic, hunk0, getPaletteGraphicInfo());
			return paletteGraphic;
		}

		// There are only 8 palettes and the other 64 bytes have some other meaning!
		// It seems it is some kind of color palette as well but used in a different way (maybe a changing palette or some color replacement table which is activated over time?)
		for (let i = 0; i < 8; ++i)
			introPalettes.push(LoadPalette());
		hunk0.Position += 64;

		// We still use 9 palettes here.
		// The intro uses the last 16 colors to fade the first 16 colors when starting the intro and vice versa.
		// As we fade with a black overlay we need the color palette when the images are fully visible (faded in).
		// At this point the 16 last colors are also the first 16 colors, so here we just copy them over.
		const palette9 = introPalettes[4].Clone();
		arrayCopy(introPalettes[4].Data, 16 * 4, palette9.Data, 0, 16 * 4);
		introPalettes.push(palette9);

		hunk0.Position += 8; // 2 byte end marker (0xffff) + 3 words (offset from the position of the word to the associated town name: Gemstone: 6, Illien: 14, Snakesign: 20)

		for (let i = 0; i < 8; ++i) {
			const introText = i;

			if (introText >= IntroText.Gemstone && introText <= IntroText.Snakesign)
				hunk0.Position++; // skip X byte

			addUnique(texts, introText, hunk0.ReadNullTerminatedString());
		}

		if (hunk0.ReadByte() !== 4) // Should contain the amount of main menu text (= 4)
			throw new AmbermoonException(ExceptionScope.Data, 'Wrong intro data.');

		for (let i = 0; i < 4; ++i) {
			// The 4 main menu texts are prefixed by 2 bytes (x and y render offset).
			hunk0.Position += 2; // We skip those bytes here.
			addUnique(texts, 8 + i, hunk0.ReadNullTerminatedString());
		}

		while (true) {
			const [success, textCommand] = TextCommand.TryParse(hunk0, textCommandTexts);
			if (!success)
				break;
			textCommands.push(textCommand);
		}

		// TODO: here the zoom infos start with the header 00 05 which gives the amount of objects

		// #endregion

		// #region Hunk 1 - Main menu background and town graphics

		const hunk1ImageSizes = [
			new Size(288, 200),
			new Size(320, 256),
			new Size(160, 128),
			new Size(160, 128),
			new Size(160, 128),
			new Size(160, 128),
			new Size(160, 128),
			new Size(160, 128),
		];

		for (let i = 0; i < 8; ++i) {
			let reader = introDataHunks[1];

			if (reader.PeekDword() === 0x494d5021) // "IMP!", may be imploded
				reader = DataReader.FromData(Deploder.DeplodeFimp(reader).reverse());

			const graphicInfo = new GraphicInfo();
			graphicInfo.Width = hunk1ImageSizes[i].Width;
			graphicInfo.Height = hunk1ImageSizes[i].Height;
			graphicInfo.GraphicFormat = GraphicFormat.Palette4Bit;
			graphicInfo.PaletteOffset = 0;
			graphicInfo.Alpha = false;
			const graphic = new Graphic();
			graphicReader.ReadGraphic(graphic, reader, graphicInfo);
			addUnique(graphics, i, graphic);
		}

		// #endregion

		// #region Hunk 2 - Twinlake image and animation data

		// This is encoded data
		const hunk2Data = [];
		const encodedReader = introDataHunks[2];
		let off = 0;
		let currentData = [];

		while (encodedReader.Position < encodedReader.Size) {
			const size = encodedReader.ReadWord();
			const endOffset = off + size;

			while (off < endOffset) {
				const header = (encodedReader.ReadByte() << 24) >> 24; // sbyte

				if (header >= 0) {
					for (let i = 0; i < header + 1; i++)
						currentData.push(encodedReader.ReadByte());

					off += header + 1;
				} else {
					const literal = encodedReader.ReadByte();
					const count = ~header + 1;

					for (let i = 0; i < count; i++)
						currentData.push(literal);

					off += count;
				}
			}

			if (size !== 0) {
				hunk2Data.push(Uint8Array.from(currentData));
				currentData = [];

				if (encodedReader.Position % 2 === 1)
					encodedReader.Position++;
			}
		}

		// There are 177 iterations per data block
		// First a long is read. If 0, the iteration is skipped.
		// Otherwise the value is doubled and checked for 32-bit overflow.
		// If overflow occurs, some code is executed, otherwise skipped.
		// This continues 32 times.

		if (hunk2Data.length !== 95)
			throw new AmbermoonException(ExceptionScope.Data, 'Invalid intro hunk.');

		let blockIndex = 0;
		const graphicData = new Uint8Array((256 * 177) / 2); // max size and 4bpp

		for (const dataBlock of hunk2Data) {
			const blockReader = DataReader.FromData(dataBlock);
			let left = 0x7fffffff;
			let right = -1;
			let top = 0x7fffffff;
			let bottom = -1;

			for (let i = 0; i < 177; i++) {
				let changeHeader = blockReader.ReadDword();

				if (changeHeader === 0)
					continue;

				for (let n = 0; n < 32; n++) {
					changeHeader *= 2; // changeHeader <<= 1 (64 bit)

					if (changeHeader >= 0x100000000) { // (changeHeader & 0x1_0000_0000) != 0
						const x = n * 8;

						if (left > x)
							left = x;
						if (right < x + 8)
							right = x + 8;
						if (top > i)
							top = i;
						if (bottom < i + 1)
							bottom = i + 1;

						changeHeader -= 0x100000000; // changeHeader &= 0x0_ffff_ffff;

						// I think this changes the Twinlake picture to add
						// the animations of fleeing people of impacts.

						const a = blockReader.ReadByte();
						const b = blockReader.ReadByte();
						const c = blockReader.ReadByte();
						const d = blockReader.ReadByte();

						let offset = i * 32 * 4 + n;

						graphicData[offset] ^= a;
						offset += 32;
						graphicData[offset] ^= b;
						offset += 32;
						graphicData[offset] ^= c;
						offset += 32;
						graphicData[offset] ^= d;

						// Basically an exclusive OR (^) is performed on the
						// image data at offset 0, 40, 80 and 120 (40 bytes per row, 320 bits).
						// 4 values as there are 4 bits per pixel.
						// For every iteration, the offset is increased by 1 to the next byte.
						// Each byte holds 8 pixels basically.

						// I guess the image is only 256 pixels wide, therefore only 32 instead of 40 iterations.
						// 177 is most likely the height.

						// The changes are performed on the screen buffer starting at 32, 7
						// and so it goes up to 288, 184.

						// In contrast to the Amiga version we will generate and store the graphic parts
						// together with the locations once when loading the data and then display them later.

						// The first frame seems to hold the base graphic. With a header of 0xffffffff you
						// ensure that every pixel is updated in a row. The first data block uses this header
						// all the time and as the screen is 0 beforehand, it will just print the base graphic.
						// Later blocks often use a header of 0 to just skip large parts of the image and then
						// for example use 0x1000. A doubling means a left shift. So the position of the first 1
						// (from left) basically determines when something is changed. For 0x80000000 or greater
						// the first pixel is directly changed, for 0x40000000 only the second one and so on.
						// 0x1000 means 18 pixels are not changed and then it starts. Then the amount of 1 bits
						// in a row keeps changing pixels. So 0xf0000000 will change the first 4 pixels in a row.
					}
				}
			}

			function CreateGraphic() {
				const graphic = new Graphic();
				const graphicInfo = new GraphicInfo();
				graphicInfo.Width = 256;
				graphicInfo.Height = 177;
				graphicInfo.GraphicFormat = GraphicFormat.Palette4Bit;
				const graphicDataReader = new DataReader(graphicData);
				graphicReader.ReadGraphic(graphic, graphicDataReader, graphicInfo);
				// Note: Color index 0 is treated as transparent. But we need this for black
				// color here. As index 16 also has black, we just replace index 0 by 16.
				graphic.ReplaceColor(0, 16);
				return graphic;
			}

			if (blockIndex++ === 0) {
				addUnique(graphics, IntroGraphic.Twinlake, CreateGraphic());
			} else {
				const part = new IntroTwinlakeImagePart();
				part.Graphic = CreateGraphic().GetArea(left, top, right - left, bottom - top);
				part.Position = new Position(left, top);
				twinlakeImageParts.push(part);
			}
		}

		// #endregion

		// #region Hunk 3 - Intro graphics (planets, etc)

		const hunk3ImageCount = 10;

		const hunk3ImageSizes = [
			new Size(128, 82), // Thalion Logo
			new Size(272, 87), // Ambermoon
			new Size(64, 64), // Sun
			new Size(128, 128), // Lyramion
			new Size(64, 64), // Morag
			new Size(64, 64), // Forest Moon
			new Size(96, 88), // Meteor
			new Size(64, 47), // Meteor Sparks
			new Size(112, 128), // Left cloud
			new Size(112, 128), // right cloud
		];
		const hunk3FrameCounts = [
			1,
			1,
			12,
			1,
			1,
			1,
			1,
			30,
			1,
			1
		];
		const MeteorSparkId = 7;

		for (let i = 0; i < hunk3ImageCount; ++i) {
			const graphicInfo = new GraphicInfo();
			graphicInfo.Width = hunk3ImageSizes[i].Width;
			graphicInfo.Height = hunk3ImageSizes[i].Height;
			graphicInfo.GraphicFormat = GraphicFormat.Palette4Bit;
			graphicInfo.PaletteOffset = 0;
			graphicInfo.Alpha = false;
			let graphic;
			const ReadFrame = () => {
				const frameGraphic = new Graphic();

				if (i >= MeteorSparkId) { // meteor spark and both cloud images use this
					// This has a bit mask plane for the blitter (1 bit per pixel).
					// The image itself is 4bpp. So for easier handling we just load
					// this as a 5 bpp image.
					graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
					graphicReader.ReadGraphic(frameGraphic, introDataHunks[3], graphicInfo);

					if (i === MeteorSparkId) {
						// Now we have to consider the bit mask.
						// The lowest bit is the mask. If it is 0
						// the whole pixel should be transparent.
						// Otherwise we use the color.
						for (let b = 0; b < frameGraphic.Data.length; b++) {
							// This means opaque and color index 0. This would be black but we
							// use color index 0 for transparent pixels, so switch to color 16
							// here which is also black.
							if (frameGraphic.Data[b] === 0x1)
								frameGraphic.Data[b] = 16;
							// In this case the lowest bit is not set, so use color index 0
							// here to achieve a transparent pixel.
							else if ((frameGraphic.Data[b] & 0x1) === 0)
								frameGraphic.Data[b] = 0;
							// In all other cases we just have to shift the color value right
							// by 1 to get rid of the mask bit and get the real color.
							else
								frameGraphic.Data[b] >>= 1;
						}
					} else {
						// The cloud images do it the other way around.
						// First the 4 bit planes and then the mask.
						for (let b = 0; b < frameGraphic.Data.length; b++) {
							// This means opaque and color index 0. This would be black but we
							// use color index 0 for transparent pixels, so switch to color 16
							// here which is also black.
							if (frameGraphic.Data[b] === 0x10)
								frameGraphic.Data[b] = 16;
							// In this case the mask bit is not set, so use color index 0
							// here to achieve a transparent pixel.
							else if ((frameGraphic.Data[b] & 0x10) === 0)
								frameGraphic.Data[b] = 0;
							// In all other cases we just have to AND the color value
							// by 0xf to get rid of the mask bit and get the real color.
							else
								frameGraphic.Data[b] &= 0xf;
						}
					}
				} else {
					graphicReader.ReadGraphic(frameGraphic, introDataHunks[3], graphicInfo);
				}

				return frameGraphic;
			};
			const frames = hunk3FrameCounts[i];
			if (frames === 1) {
				graphic = ReadFrame();
			} else {
				graphic = new Graphic(frames * graphicInfo.Width, graphicInfo.Height, 0);

				for (let f = 0; f < frames; ++f) {
					const frameGraphic = ReadFrame();
					graphic.AddOverlay(f * frameGraphic.Width, 0, frameGraphic, false);
				}
			}
			addUnique(graphics, IntroGraphic.ThalionLogo + i, graphic);
		}

		// In the original version the glowing of the meteor is performed by fading the upper 16 colors
		// of the palette to the lower 16 colors of the palette and vice versa. The meteor always uses
		// colors from the first 16 colors though.
		// As we can't do this here we add another meteor graphic where all color indices are increased
		// by 16. This way they point to the bright color in the upper 16 colors and show the meteor
		// in full glow brightness. To fade we just display the glow image above the normal meteor with
		// some level of transparency.
		const glowingMeteorGraphic = getValue(graphics, IntroGraphic.Meteor).Clone();
		for (let i = 0; i < glowingMeteorGraphic.Data.length; ++i) {
			if (glowingMeteorGraphic.Data[i] !== 0) // keep index 0 as it is full transparency!
				glowingMeteorGraphic.Data[i] = (glowingMeteorGraphic.Data[i] + 16) & 0xff;
		}
		addUnique(graphics, IntroGraphic.GlowingMeteor, glowingMeteorGraphic);

		// #endregion

		this.LoadFonts(DataReader.FromData(introHunks[0].Data));

		// Special handling of the new "remake-only" Intro_texts.amb
		const [hasIntroTexts, introTextsContainer] = tryGetValue(gameData.Files, 'Intro_texts.amb');
		if (hasIntroTexts) {
			const introTextsReader = getValue(introTextsContainer.Files, 1);
			const nonCommandTextCount = introTextsReader.ReadByte();

			for (let i = 0; i < nonCommandTextCount; ++i) {
				const text = introTextsReader.ReadNullTerminatedString(UTF8Encoding);

				if (i < 12) // In case the count is too high
					texts.set(i, text);
			}

			const commandCount = introTextsReader.ReadByte();
			const textCommandGroups = [];
			let currentTextCommandGroup = [];
			let index = 0;
			let firstWhiteTextCommandIndex = -1;

			for (const textCommand of textCommands) {
				if (textCommand.Type === IntroTextCommandType.Add) {
					currentTextCommandGroup.push(index);
				} else if (textCommand.Type === IntroTextCommandType.Render) {
					if (currentTextCommandGroup.length !== 0) {
						textCommandGroups.push(currentTextCommandGroup.slice());
						currentTextCommandGroup = [];
					}
				} else if (firstWhiteTextCommandIndex === -1 &&
					textCommand.Type === IntroTextCommandType.SetTextColor &&
					textCommand.Args[0] === 0x0ccc) {
					firstWhiteTextCommandIndex = index;

					while (firstWhiteTextCommandIndex > 0 && textCommands[firstWhiteTextCommandIndex - 1].Type !== IntroTextCommandType.Clear)
						--firstWhiteTextCommandIndex;
				}

				++index;
			}

			for (let i = 0; i < commandCount; ++i) {
				const commandTexts = new Array(introTextsReader.ReadByte()).fill(null);

				for (let t = 0; t < commandTexts.length; ++t)
					commandTexts[t] = introTextsReader.ReadNullTerminatedString(UTF8Encoding);

				if (i < textCommandGroups.length) {
					for (let t = 0; t < commandTexts.length; ++t) {
						if (t < textCommandGroups[i].length) {
							const commandIndex = textCommandGroups[i][t];
							const command = textCommands[commandIndex];
							const commandText = TextProcessor.RemoveDiacritics(commandTexts[t]).split('').filter(ch => ch === ' ' || glyphs.has(ch)).join('');
							textCommandTexts[command.Args[2]] = commandText;

							if (commandText.length !== 0 && firstWhiteTextCommandIndex !== -1 && commandIndex >= firstWhiteTextCommandIndex) {
								const args = command.Args;
								let width = 0;
								for (const ch of commandText.split(''))
									width += ch === ' ' ? 6 : getValue(glyphs, ch).Advance;
								args[0] = 160 - Math.trunc(width / 2);
								textCommands[commandIndex] = new TextCommand(command.Type, args); // command with { Args = args }
							}
						}
					}
				}
			}
		}
	}

	get IntroPalettes() {
		return this.introPalettes;
	}

	static get GraphicPalettes() {
		if (graphicPalettes === null) {
			graphicPalettes = new Map([
				[IntroGraphic.Frame, 8],
				[IntroGraphic.MainMenuBackground, 6], // 7 will work too
				[IntroGraphic.Gemstone, 4],
				[IntroGraphic.Illien, 4],
				[IntroGraphic.Snakesign, 4],
				[IntroGraphic.DestroyedGemstone, 4],
				[IntroGraphic.DestroyedIllien, 4],
				[IntroGraphic.DestroyedSnakesign, 4],
				[IntroGraphic.ThalionLogo, 0],
				[IntroGraphic.Ambermoon, 1],
				[IntroGraphic.SunAnimation, 3],
				[IntroGraphic.Lyramion, 3],
				[IntroGraphic.Morag, 3],
				[IntroGraphic.ForestMoon, 3],
				[IntroGraphic.Meteor, 3],
				[IntroGraphic.MeteorSparks, 3],
				[IntroGraphic.CloudsLeft, 4],
				[IntroGraphic.CloudsRight, 4],
				[IntroGraphic.GlowingMeteor, 3],
				[IntroGraphic.Twinlake, 8],
			]);
		}
		return graphicPalettes;
	}

	/** IReadOnlyDictionary<IntroGraphic, Graphic> (Map) */
	get Graphics() {
		return this.graphics;
	}

	/** IReadOnlyDictionary<IntroText, string> (Map) */
	get Texts() {
		return this.texts;
	}

	/** IReadOnlyDictionary<char, Glyph> (Map) */
	get Glyphs() {
		return this.glyphs;
	}

	/** IReadOnlyDictionary<char, Glyph> (Map) */
	get LargeGlyphs() {
		return this.largeGlyphs;
	}

	get TwinlakeImageParts() {
		return this.twinlakeImageParts;
	}

	get TextCommands() {
		return this.textCommands;
	}

	get TextCommandTexts() {
		return this.textCommandTexts;
	}

	LoadFonts(dataReader) {
		function LoadFont(large, glyphWidth, glyphHeight, glyphs) {
			const bytesPerGlyph = Math.trunc(glyphWidth * glyphHeight / 8);

			// The glyph width (advance) values and glyph data is inside the code
			// hunk so not at a fixed offset necessarily. So we search for the first
			// bytes which should be unique: 15 11 10 13
			// Should be safe to only start at offset 10000. In reality it is above 11000.
			// Same for small glyphs. Offset is 18262 so we pick 17000 for safety.
			const glyphWidthOffset = large
				? FindByteSequence(dataReader, 10000, 0x15, 0x11, 0x10, 0x13)
				: FindByteSequence(dataReader, 17000, 0x0b, 0x09, 0x09, 0x0a);

			// Read glyph widths
			dataReader.Position = glyphWidthOffset;
			const advanceValues = dataReader.ReadBytes(76); // for 76 valid chars

			// Read glyph data (follows immediately after the glyph widths)
			const glyphData = dataReader.ReadBytes(76 * bytesPerGlyph); // for 76 valid chars

			for (let i = 1; i < GlyphMapping.length; ++i) {
				const index = GlyphMapping[i];

				if (index === 0xff)
					continue;

				const ch = String.fromCharCode(0x20 + i);
				const graphic = new Graphic();
				graphic.Width = glyphWidth;
				graphic.Height = glyphHeight;
				graphic.IndexedGraphic = true;
				graphic.Data = new Uint8Array(glyphWidth * glyphHeight);
				const numBytesPerRow = Math.trunc((glyphWidth + 7) / 8);
				let ptr = index * bytesPerGlyph;
				for (let y = 0; y < glyphHeight; ++y) {
					let offset = 0;

					for (let n = 0; n < numBytesPerRow; ++n) {
						const data = glyphData[ptr++];

						for (let b = 0; b < 8; ++b) {
							if ((data & (1 << (7 - b))) !== 0)
								graphic.Data[y * numBytesPerRow * 8 + offset + b] = Color.White;
						}

						offset += 8;
					}
				}
				const glyph = new Glyph();
				glyph.Advance = advanceValues[index];
				glyph.Graphic = graphic;
				addUnique(glyphs, ch, glyph);
			}
		}

		// Normal font
		LoadFont(false, 16, 11, this.glyphs);

		// Large font
		LoadFont(true, 32, 22, this.largeGlyphs);
	}
}
