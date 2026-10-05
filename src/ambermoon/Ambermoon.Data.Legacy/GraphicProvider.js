// Port of Ambermoon.Data.Legacy/GraphicProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, KeyNotFoundException, getValue, toByte } from '../../runtime.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../Ambermoon.Data.Common/Graphic.js';
import { GraphicType, MonsterRow } from '../Ambermoon.Data.Common/IGraphicProvider.js';
import { MapType } from '../Ambermoon.Data.Common/Enumerations/MapType.js';
import { CombatGraphicIndex } from '../Ambermoon.Data.Common/Enumerations/CombatGraphicIndex.js';
import { GraphicReader } from './Serialization/GraphicReader.js';
import { CombatBackgrounds } from './CombatBackgrounds.js';
import { CombatGraphics } from './CombatGraphics.js';
import { UIElementProvider } from './UIElementProvider.js';

// Enum.GetValues: all values ordered by their unsigned value
const getValues = enumObject => Object.values(enumObject).sort((a, b) => (a >>> 0) - (b >>> 0));
// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

class GraphicFile {
	/**
	 * GraphicFile(file, fileIndexOffset = 0)
	 * GraphicFile(file, fileIndexOffset, subFile, optional = false)
	 * (The C# overload with params int[] subFiles is not used.)
	 */
	constructor(file, fileIndexOffset = 0, subFile, optional = false) {
		this.File = file;
		this.SubFiles = subFile === undefined ? null : [subFile]; // null means all
		this.FileIndexOffset = fileIndexOffset;
		this.Optional = subFile === undefined ? false : optional;
	}
}

// Note: Found this at 0x12BE in data1 hunk of AM2_CPU (1.05 german)
// These are 3 color index mappings for:
// - 2D non-world maps
// - 2D world maps
// - 3D maps
// Each tile or wall provides a color index in the range 0..15.
// This index is used inside the mapping to get the associated palette index.
const ColorIndexMapping = new Uint8Array([
	0x00, 0x1F, 0x1E, 0x1D, 0x1C, 0x1B, 0x1A, 0x12, 0x13, 0x14, 0x11, 0x10, 0x09, 0x0A, 0x18, 0x17,
	0x00, 0x01, 0x1F, 0x12, 0x1C, 0x14, 0x15, 0x06, 0x08, 0x0A, 0x04, 0x02, 0x0E, 0x0C, 0x13, 0x10,
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F
]);

const paletteFile = 'Palettes.amb';
let paletteGraphicInfo = null;
let graphicFiles = null;

function getPaletteGraphicInfo() {
	if (paletteGraphicInfo == null) {
		paletteGraphicInfo = new GraphicInfo();
		paletteGraphicInfo.Width = 32;
		paletteGraphicInfo.Height = 1;
		paletteGraphicInfo.GraphicFormat = GraphicFormat.XRGB16;
	}
	return paletteGraphicInfo;
}

// Static constructor (executed lazily to avoid using other modules at module evaluation time)
function getGraphicFiles() {
	if (graphicFiles == null) {
		graphicFiles = new Map();
		const AddGraphicFiles = (type, ...files) => add(graphicFiles, type, files);

		AddGraphicFiles(GraphicType.Tileset1 + 0, new GraphicFile('1Icon_gfx.amb', 0, 1));
		AddGraphicFiles(GraphicType.Tileset1 + 1, new GraphicFile('3Icon_gfx.amb', 0, 2));
		AddGraphicFiles(GraphicType.Tileset1 + 2, new GraphicFile('2Icon_gfx.amb', 0, 3));
		AddGraphicFiles(GraphicType.Tileset1 + 3, new GraphicFile('2Icon_gfx.amb', 0, 4));
		AddGraphicFiles(GraphicType.Tileset1 + 4, new GraphicFile('2Icon_gfx.amb', 0, 5));
		AddGraphicFiles(GraphicType.Tileset1 + 5, new GraphicFile('2Icon_gfx.amb', 0, 6));
		AddGraphicFiles(GraphicType.Tileset1 + 6, new GraphicFile('2Icon_gfx.amb', 0, 7));
		AddGraphicFiles(GraphicType.Tileset1 + 7, new GraphicFile('3Icon_gfx.amb', 0, 8));
		AddGraphicFiles(GraphicType.Tileset1 + 8, new GraphicFile('3Icon_gfx.amb', 0, 9, true));
		AddGraphicFiles(GraphicType.Tileset1 + 9, new GraphicFile('2Icon_gfx.amb', 0, 10, true));
		AddGraphicFiles(GraphicType.Player, new GraphicFile('Party_gfx.amb'));
		AddGraphicFiles(GraphicType.Portrait, new GraphicFile('Portraits.amb'));
		AddGraphicFiles(GraphicType.Item, new GraphicFile('Object_icons'));
		AddGraphicFiles(GraphicType.Layout, new GraphicFile('Layouts.amb'));
		AddGraphicFiles(GraphicType.LabBackground, new GraphicFile('Lab_background.amb'));
		AddGraphicFiles(GraphicType.Pics80x80, new GraphicFile('Pics_80x80.amb'));
		AddGraphicFiles(GraphicType.EventPictures, new GraphicFile('Event_pix.amb'));
		AddGraphicFiles(GraphicType.CombatBackground, new GraphicFile('Combat_background.amb'));
	}
	return graphicFiles;
}

export class GraphicProvider {
	static MaxTilesets = 10;

	constructor(gameData, executableData, additionalPalettes) {
		this.npcGraphicOffsets = new Map();
		this.npcGraphicFrameCounts = new Map();
		this.graphics = new Map();
		const graphics = this.graphics;

		this.gameData = gameData;
		const graphicReader = new GraphicReader();
		this.Palettes = new Map();
		for (const [key, value] of getValue(gameData.Files, paletteFile).Files)
			this.Palettes.set(key, GraphicProvider.ReadPalette(graphicReader, value));
		const Palettes = this.Palettes;
		let i;

		this.PrimaryUIPaletteIndex = toByte(1 + Palettes.size);
		this.AutomapPaletteIndex = toByte(this.PrimaryUIPaletteIndex + 1);
		this.SecondaryUIPaletteIndex = toByte(this.PrimaryUIPaletteIndex + 2);
		this.FirstIntroPaletteIndex = toByte(this.PrimaryUIPaletteIndex + 4);
		this.FirstOutroPaletteIndex = toByte(this.FirstIntroPaletteIndex + 9);
		this.FirstFantasyIntroPaletteIndex = toByte(this.FirstOutroPaletteIndex + 6);

		// Add builtin palettes
		for (i = 0; i < 3; ++i)
			add(Palettes, this.PrimaryUIPaletteIndex + i, executableData.BuiltinPalettes[i]);

		// And another palette for some UI graphics.
		// The portraits have a blue gradient as background. It is also 32x34 pixels in size and the gradient
		// is in y-direction. All colors have R=0x00 and G=0x11. The blue component is increased by 0x11
		// every 2 pixels starting at y=4 (first 4 pixel rows have B=0x00, next 2 have B=0x11, etc).
		// Last 2 rows have B=0xff.
		const uiPalette = new Graphic();
		uiPalette.Width = 32;
		uiPalette.Height = 1;
		uiPalette.IndexedGraphic = false;
		uiPalette.Data = new Uint8Array([
			// The first colors are used for spells which use a materialize animation (earth and wind spells, waterfall, etc).
			// The animation uses black, dark red, light purple, dark purple, dark beige, light beige in that order.
			// We start with these color at offset 1. We leave the first color as fully transparent.
			// Index 7 is unused.
			0x00, 0x00, 0x00, 0x00, 0x00, 0x11, 0x00, 0xff, 0x33, 0x11, 0x00, 0xff, 0x88, 0x77, 0xaa, 0xff,
			0x66, 0x55, 0x88, 0xff, 0x99, 0x88, 0x77, 0xff, 0xbb, 0xbb, 0x99, 0xff, 0x00, 0x00, 0x00, 0x00,
			// 16 colors for the blue background gradient of portraits
			0x00, 0x11, 0x00, 0xff, 0x00, 0x11, 0x11, 0xff, 0x00, 0x11, 0x22, 0xff, 0x00, 0x11, 0x33, 0xff,
			0x00, 0x11, 0x44, 0xff, 0x00, 0x11, 0x55, 0xff, 0x00, 0x11, 0x66, 0xff, 0x00, 0x11, 0x77, 0xff,
			0x00, 0x11, 0x88, 0xff, 0x00, 0x11, 0x99, 0xff, 0x00, 0x11, 0xaa, 0xff, 0x00, 0x11, 0xbb, 0xff,
			0x00, 0x11, 0xcc, 0xff, 0x00, 0x11, 0xdd, 0xff, 0x00, 0x11, 0xee, 0xff, 0x00, 0x11, 0xff, 0xff,
			// some UI colors (TODO: character with condition?)
			0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x66, 0x66, 0x55, 0xff, 0x44, 0x44, 0x33, 0xff,
			0x22, 0x22, 0x22, 0xff, 0x88, 0x88, 0x77, 0xff, 0xaa, 0xaa, 0x99, 0xff, 0xcc, 0xcc, 0xbb, 0xff
		]);
		add(Palettes, this.PrimaryUIPaletteIndex + 3, uiPalette);

		const additionalPaletteCount = 9 + 6 + 2; // Intro, Outro, Fantasy Intro
		i = 0;
		for (; i < Math.min(additionalPaletteCount, additionalPalettes.length); ++i) {
			add(Palettes, this.FirstIntroPaletteIndex + i, additionalPalettes[i]);
		}
		for (; i < additionalPaletteCount; ++i) {
			const emptyPalette = new Graphic();
			emptyPalette.Width = 32;
			emptyPalette.Height = 1;
			emptyPalette.IndexedGraphic = false;
			emptyPalette.Data = new Uint8Array(32 * 4);
			add(Palettes, this.FirstIntroPaletteIndex + i, emptyPalette);
		}

		for (const type of getValues(GraphicType)) {
			if (type === GraphicType.Cursor) {
				const cursorGraphics = [];
				graphics.set(GraphicType.Cursor, cursorGraphics);

				for (const cursor of executableData.Cursors.Entries)
					cursorGraphics.push(cursor.Graphic);
			}
			else if (type === GraphicType.UIElements) {
				graphics.set(type, UIElementProvider.Create());
				graphics.get(type).push(...executableData.UIGraphics.Entries.values());
				graphics.get(type).push(...executableData.Buttons.Entries.values());
			}
			else if (type === GraphicType.TravelGfx) {
				graphics.set(type, gameData.TravelGraphics);
			}
			else if (type === GraphicType.Transports) {
				const reader = getValue(gameData.Files, 'Stationary').Files.get(1);
				reader.Position = 0;
				graphics.set(type, [...gameData.StationaryImageInfos].map(([, info]) => {
					const graphic = new Graphic();
					graphicReader.ReadGraphic(graphic, reader, info);
					return graphic;
				}));
			}
			else if (type === GraphicType.NPC) {
				const npcGraphics = [];
				const graphicInfo = new GraphicInfo();
				graphicInfo.Width = 16;
				graphicInfo.Height = 32;
				graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
				graphicInfo.Alpha = true;
				graphicInfo.PaletteOffset = 0;
				const graphic = new Graphic();
				for (const [key, value] of getValue(gameData.Files, 'NPC_gfx.amb').Files) {
					add(this.npcGraphicOffsets, key, npcGraphics.length);
					const frameCounts = [];
					add(this.npcGraphicFrameCounts, key, frameCounts);
					const reader = value;
					reader.Position = 0;

					while (reader.Position < reader.Size) {
						const numFrames = reader.ReadByte();

						if (numFrames === 0)
							break;

						frameCounts.push(numFrames);

						reader.AlignToWord();
						const compoundGraphic = new Graphic(16 * numFrames, 32, 0);

						for (i = 0; i < numFrames; ++i) {
							graphicReader.ReadGraphic(graphic, reader, graphicInfo);
							compoundGraphic.AddOverlay(i * 16, 0, graphic, false);
						}

						npcGraphics.push(compoundGraphic);
					}
				}

				graphics.set(type, npcGraphics);
			}
			else if (type === GraphicType.CombatGraphics) {
				const combatGraphics = [];
				const graphicInfo = new GraphicInfo();
				graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
				graphicInfo.Alpha = true;
				graphicInfo.PaletteOffset = 0;
				const reader = getValue(gameData.Files, 'Combat_graphics').Files.get(1);
				reader.Position = 0;

				for (const [combatGraphicKey, info] of CombatGraphics.Info) {
					if (combatGraphicKey === CombatGraphicIndex.BattleFieldIcons) {
						const battleFieldIcons = [];
						const iconGraphicInfo = new GraphicInfo();
						iconGraphicInfo.Width = 16;
						iconGraphicInfo.Height = 14;
						iconGraphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
						iconGraphicInfo.Alpha = true;
						iconGraphicInfo.PaletteOffset = 0;

						while (reader.Position < reader.Size) {
							const graphic = new Graphic();
							graphicReader.ReadGraphic(graphic, reader, iconGraphicInfo);
							battleFieldIcons.push(graphic);
						}

						graphics.set(GraphicType.BattleFieldIcons, battleFieldIcons);
					}
					else {
						const graphic = new Graphic();
						const compoundGraphic = new Graphic(info.FrameCount * info.GraphicInfo.Width, info.GraphicInfo.Height, 0);

						for (i = 0; i < info.FrameCount; ++i) {
							graphicReader.ReadGraphic(graphic, reader, info.GraphicInfo);
							compoundGraphic.AddOverlay(i * info.GraphicInfo.Width, 0, graphic, false);
						}

						combatGraphics.push(compoundGraphic);
					}
				}

				graphics.set(type, combatGraphics);
			}
			else if (type === GraphicType.BattleFieldIcons) {
				// Do nothing. This is filled when processing GraphicType.CombatGraphics.
			}
			else if (type === GraphicType.RiddlemouthGraphics) {
				const riddlemouthGraphics = [];
				const reader = getValue(gameData.Files, 'Riddlemouth_graphics').Files.get(1);
				reader.Position = 0;
				const ReadAndAddGraphics = (frames, width, height) => {
					const graphicInfo = new GraphicInfo();
					graphicInfo.Width = width;
					graphicInfo.Height = height;
					graphicInfo.GraphicFormat = GraphicFormat.Palette3Bit;
					graphicInfo.Alpha = false;
					graphicInfo.PaletteOffset = 24;
					const graphic = new Graphic();
					const compoundGraphic = new Graphic(frames * width, height, 0);
					for (let f = 0; f < frames; ++f) {
						graphicReader.ReadGraphic(graphic, reader, graphicInfo);
						compoundGraphic.AddOverlay(f * width, 0, graphic, false);
					}
					riddlemouthGraphics.push(compoundGraphic);
				};
				// 4 eye frames
				ReadAndAddGraphics(4, 48, 9);
				// 7 mouth frames
				ReadAndAddGraphics(7, 48, 15);
				graphics.set(type, riddlemouthGraphics);
			}
			else if (type === GraphicType.AutomapGraphics) {
				const automapGraphics = [];
				const reader = getValue(gameData.Files, 'Automap_graphics').Files.get(1);
				reader.Position = 0x100; // TODO: maybe decode the bytes before that later

				const ReadAndAddGraphics = (amount, width, height, graphicFormat, frames = 1, alpha = false) => {
					const graphicInfo = new GraphicInfo();
					graphicInfo.Width = width;
					graphicInfo.Height = height;
					graphicInfo.GraphicFormat = graphicFormat;
					graphicInfo.Alpha = alpha;
					graphicInfo.PaletteOffset = 0;
					for (let i = 0; i < amount; ++i) {
						let graphic = new Graphic();
						if (frames === 1) {
							graphicReader.ReadGraphic(graphic, reader, graphicInfo);
						}
						else {
							const compoundGraphic = new Graphic(frames * width, height, 0);

							for (let f = 0; f < frames; ++f) {
								graphicReader.ReadGraphic(graphic, reader, graphicInfo);
								compoundGraphic.AddOverlay(f * width, 0, graphic, false);
							}

							graphic = compoundGraphic;
						}
						automapGraphics.push(graphic);
					}
				};
				// Map corners
				ReadAndAddGraphics(4, 32, 32, GraphicFormat.Palette3Bit);
				// Top map border
				ReadAndAddGraphics(4, 16, 32, GraphicFormat.Palette3Bit);
				// Right map border
				ReadAndAddGraphics(2, 32, 32, GraphicFormat.Palette3Bit);
				// Bottom map border
				ReadAndAddGraphics(4, 16, 32, GraphicFormat.Palette3Bit);
				// Left map border
				ReadAndAddGraphics(2, 32, 32, GraphicFormat.Palette3Bit);
				// 10 pin graphics
				ReadAndAddGraphics(10, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Riddlemouth (4 frames)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 4, true);
				// Teleport (4 frames)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 4, true);
				// Spinner (4 frames)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 4, true);
				// Trap (4 frames)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 4, true);
				// Trapdoor (4 frames)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 4, true);
				// Special (4 frames)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 4, true);
				// Monster (4 frames)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 4, true);
				// Door closed (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Door open (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Merchant (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Inn (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Chest closed (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Exit (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Chest open (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Pile (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Person (1 frame)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 1, true);
				// Goto point (8 frames)
				ReadAndAddGraphics(1, 16, 16, GraphicFormat.Palette5Bit, 8, true);

				graphics.set(type, automapGraphics);
			}
			else {
				this.LoadGraphics(type);

				if (type === GraphicType.Tileset1) {
					for (let t = 1; t < GraphicProvider.MaxTilesets; t++)
						this.LoadGraphics(type + t);
				}
			}
		}
	}

	get NPCGraphicOffsets() { return this.npcGraphicOffsets; }
	get NPCGraphicFrameCounts() { return this.npcGraphicFrameCounts; }

	PaletteIndexFromColorIndex(map, colorIndex) {
		const offset = map.Type === MapType.Map3D ? 32 : map.IsWorldMap ? 16 : 0;
		return ColorIndexMapping[offset + colorIndex % 16];
	}

	get DefaultTextPaletteIndex() { return this.PrimaryUIPaletteIndex; }

	/**
	 * ReadPalette(graphicReader, reader) (private, resets the reader position)
	 * ReadPalette(reader) (internal)
	 */
	static ReadPalette(graphicReaderOrReader, reader) {
		if (arguments.length >= 2) {
			const graphicReader = graphicReaderOrReader;
			reader.Position = 0;
			const paletteGraphic = new Graphic();
			graphicReader.ReadGraphic(paletteGraphic, reader, getPaletteGraphicInfo());
			return paletteGraphic;
		}

		reader = graphicReaderOrReader;
		const graphicReader = new GraphicReader();
		const paletteGraphic = new Graphic();
		graphicReader.ReadGraphic(paletteGraphic, reader, getPaletteGraphicInfo());
		return paletteGraphic;
	}

	GetGraphics(type) {
		return getValue(this.graphics, type);
	}

	LoadGraphics(type) {
		if (!this.graphics.has(type)) {
			const graphicList = [];
			const reader = new GraphicReader();
			const info = GraphicProvider.GraphicInfoFromType(type);

			this.graphics.set(type, graphicList);

			function LoadGraphic(graphicDataReader, maskColor = 0) {
				graphicDataReader.Position = 0;
				const end = graphicDataReader.Size - info.DataSize;
				while (graphicDataReader.Position <= end) {
					const graphic = new Graphic();
					reader.ReadGraphic(graphic, graphicDataReader, info, maskColor);
					graphicList.push(graphic);
				}
			}

			const files = getGraphicFiles().get(type);

			if (files === undefined && type >= GraphicType.Tileset1)
				return;

			const allFiles = new Map(); // SortedDictionary (sorted below)

			for (const graphicFile of files) {
				const containerFile = getValue(this.gameData.Files, graphicFile.File);

				if (graphicFile.SubFiles == null) {
					for (const [key, value] of containerFile.Files) {
						allFiles.set(graphicFile.FileIndexOffset + key, value);
					}
				}
				else {
					for (const file of graphicFile.SubFiles) {
						if (containerFile.Files.has(file))
							allFiles.set(graphicFile.FileIndexOffset + file, containerFile.Files.get(file));
						else if (!graphicFile.Optional)
							throw new KeyNotFoundException(`Sub file ${file} of ${graphicFile.File} was not found.`);
					}
				}
			}

			const sortedFiles = [...allFiles].sort((a, b) => a[0] - b[0]);

			for (const [, value] of sortedFiles) {
				let maskColor;
				switch (type) {
					case GraphicType.Portrait: maskColor = 25; break;
					case GraphicType.LabBackground: maskColor = 9; break; // 9 is the sky color index
					default: maskColor = 0; break;
				}
				LoadGraphic(value, maskColor);
			}
		}
	}

	static GraphicInfoFromType(type) {
		const info = new GraphicInfo();
		info.Width = 16;
		info.Height = 16;
		info.GraphicFormat = GraphicFormat.Palette5Bit;

		if (type >= GraphicType.Tileset1) {
			info.Alpha = true;
		}
		else {
			switch (type) {
				case GraphicType.Player:
					info.Width = 16;
					info.Height = 32;
					info.Alpha = true;
					break;
				case GraphicType.Portrait:
					info.Width = 32;
					info.Height = 34;
					info.Alpha = false;
					break;
				case GraphicType.Item:
					info.Width = 16;
					info.Height = 16;
					info.Alpha = true;
					break;
				case GraphicType.Layout:
					info.Width = 320;
					info.Height = 163;
					info.GraphicFormat = GraphicFormat.Palette3Bit;
					info.PaletteOffset = 24;
					info.Alpha = true;
					break;
				case GraphicType.LabBackground:
					info.Width = 144;
					info.Height = 20;
					info.GraphicFormat = GraphicFormat.Palette4Bit;
					info.PaletteOffset = 0;
					info.Alpha = false;
					break;
				case GraphicType.Pics80x80:
					info.Width = 80;
					info.Height = 80;
					info.GraphicFormat = GraphicFormat.Palette5Bit;
					info.PaletteOffset = 0;
					info.Alpha = false;
					break;
				case GraphicType.EventPictures:
					info.Width = 320;
					info.Height = 92;
					info.GraphicFormat = GraphicFormat.Palette5Bit;
					info.PaletteOffset = 0;
					info.Alpha = false;
					break;
				case GraphicType.CombatBackground:
					info.Width = 320;
					info.Height = 95;
					info.GraphicFormat = GraphicFormat.Palette5Bit;
					info.PaletteOffset = 0;
					info.Alpha = false;
					break;
			}
		}

		return info;
	}

	Get2DCombatBackground(index, advanced) {
		if (advanced && CombatBackgrounds.AdvancedReplacements2D.has(index))
			return CombatBackgrounds.AdvancedReplacements2D.get(index);

		return CombatBackgrounds.Info2D[index];
	}

	Get3DCombatBackground(index, advanced) {
		if (advanced && CombatBackgrounds.AdvancedReplacements3D.has(index))
			return CombatBackgrounds.AdvancedReplacements3D.get(index);

		return CombatBackgrounds.Info3D[index];
	}

	GetCombatGraphicInfo(index) { return getValue(CombatGraphics.Info, index); }

	GetMonsterRowImageScaleFactor(row) {
		switch (row) {
			case MonsterRow.Farthest: return 0.7;
			case MonsterRow.Far: return 0.8;
			case MonsterRow.Near: return 1.25;
			default: return 1.0;
		}
	}

	GetLabBackgroundGraphics() { return this.GetGraphics(GraphicType.LabBackground); }
}
