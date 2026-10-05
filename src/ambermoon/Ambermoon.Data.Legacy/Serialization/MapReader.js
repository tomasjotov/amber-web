// Port of Ambermoon.Data.Legacy/Serialization/MapReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Map } from '../../Ambermoon.Data.Common/Map.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { TextReader } from './TextReader.js';
import { EventReader } from './EventReader.js';
import { Exception, getValue, newArray2D } from '../../../runtime.js';

/** string.Trim('\0', ' ') */
function trimNullAndSpace(s) {
	return s.replace(/^[\0 ]+|[\0 ]+$/g, '');
}

/** Object initializer: construct, then assign the properties in order. */
function init(obj, props) {
	for (const key of Object.keys(props))
		obj[key] = props[key];
	return obj;
}

export class MapReader {
	ReadMapTexts(map, textDataReader) {
		if (textDataReader != null)
			textDataReader.Position = 0;

		map.Texts = TextReader.ReadTexts(textDataReader);
	}

	static ReadMapHeader(map, dataReader) {
		map.Flags = dataReader.ReadWord();
		map.Type = dataReader.ReadByte();

		if (map.Type !== MapType.Map2D && map.Type !== MapType.Map3D)
			throw new Exception('Invalid map data.');

		map.MusicIndex = dataReader.ReadByte();
		map.Width = dataReader.ReadByte();
		map.Height = dataReader.ReadByte();
		map.TilesetOrLabdataIndex = dataReader.ReadByte();

		map.NPCGfxIndex = dataReader.ReadByte();
		map.LabyrinthBackgroundIndex = dataReader.ReadByte();
		map.PaletteIndex = dataReader.ReadByte();
		map.World = dataReader.ReadByte();

		if (dataReader.ReadByte() !== 0) // end of map header
			throw new AmbermoonException(ExceptionScope.Data, 'Invalid map data');
	}

	static GetGotoPointOffset(dataReader) {
		const map = new Map();
		MapReader.ReadMap(map, dataReader, map => { dataReader.Position += (map.Type === MapType.Map2D ? 4 : 2) * map.Width * map.Height; });
		return dataReader.Position - 2 - map.GotoPoints.length * 20 - (map.Type === MapType.Map2D ? 0 : map.EventList.length);
	}

	static ReadGotoPoints(dataReader) {
		const map = new Map();
		MapReader.ReadMap(map, dataReader, map => { dataReader.Position += (map.Type === MapType.Map2D ? 4 : 2) * map.Width * map.Height; });
		return map.GotoPoints;
	}

	/** C# private static ReadMap(Map map, IDataReader dataReader, Action<Map> readTilesOrBlocks) */
	static ReadMap(map, dataReader, readTilesOrBlocks) {
		dataReader.Position = 0;

		MapReader.ReadMapHeader(map, dataReader);

		// Up to 32 character references (10 bytes each -> total 320 bytes)
		for (let i = 0; i < 32; ++i) {
			const index = dataReader.ReadByte();
			const collisionClass = dataReader.ReadByte();
			const typeAndFlags = dataReader.ReadByte();
			const eventIndex = dataReader.ReadByte();
			const gfxIndex = dataReader.ReadWord();
			const tileFlags = dataReader.ReadDword();

			map.CharacterReferences[i] = index === 0 ? null : init(new Map.CharacterReference(), {
				Index: index,
				Type: typeAndFlags & 0x03,
				CharacterFlags: typeAndFlags >> 2,
				CollisionClass: collisionClass,
				EventIndex: eventIndex,
				GraphicIndex: gfxIndex,
				TileFlags: tileFlags,
				CombatBackgroundIndex: tileFlags >>> 28
			});

			// Note: Map 258 has 3 characters but one seems to be not used anymore.
			// It is not directly following the other 2 and has no movement data
			// hence it is not marked as random moving. I guess this is a relict.
			// This character is marked as party member but there is none on this map.
			// To avoid problems we null all further character references if we found
			// the first empty one.
			if (map.CharacterReferences[i] == null) {
				for (let j = i + 1; j < 32; ++j) {
					map.CharacterReferences[j] = null;
					dataReader.Position += 10;
				}

				break;
			}
		}

		// Read map tiles or blocks
		readTilesOrBlocks(map);

		EventReader.ReadEvents(dataReader, map.Events, map.EventList);

		const characterPositionOffset = dataReader.Position;

		// For each character reference the positions or movement paths are stored here.
		// For random movement there are 2 bytes (x and y). Otherwise there are 288 positions
		// each has 2 bytes (x and y). Each position is for one 5 minute chunk of the day.
		// There are 24 hours * 60 minutes = 1440 minutes per day. Divided by 5 you get 288.
		// A position of 0,0 is possible. It means "not visible on the map".
		for (const characterReference of map.CharacterReferences) {
			if (characterReference == null)
				continue;

			const flags = Map.CharacterReference.Flags;

			if (characterReference.Type === CharacterType.Monster ||
				(characterReference.CharacterFlags & flags.RandomMovement) === flags.RandomMovement ||
				(characterReference.CharacterFlags & flags.Stationary) === flags.Stationary) {
				// For monsters, random movement or stationary only the start position is given.
				const x = dataReader.ReadByte();
				const y = dataReader.ReadByte();
				characterReference.Positions.push(new Position(x, y));
			} else if (characterReference.HourMovement) {
				for (let i = 0; i < 12; ++i) {
					const x = dataReader.ReadByte();
					const y = dataReader.ReadByte();
					characterReference.Positions.push(new Position(x, y));
				}

				for (let i = 12; i < 288; ++i)
					characterReference.Positions.push(new Position(characterReference.Positions[i % 12]));
			} else {
				for (let i = 0; i < 288; ++i) {
					const x = dataReader.ReadByte();
					const y = dataReader.ReadByte();
					characterReference.Positions.push(new Position(x, y));
				}
			}
		}

		const gotoPointCount = dataReader.ReadWord();

		for (let i = 0; i < gotoPointCount; ++i) {
			const gotoPoint = new Map.GotoPoint();
			gotoPoint.X = dataReader.ReadByte();
			gotoPoint.Y = dataReader.ReadByte();
			gotoPoint.Direction = dataReader.ReadByte();
			gotoPoint.Index = dataReader.ReadByte();
			gotoPoint.Name = trimNullAndSpace(dataReader.ReadString(16));
			map.GotoPoints.push(gotoPoint);
		}

		if (map.Type === MapType.Map3D) {
			map.EventAutomapTypes = Array.from(dataReader.ReadBytes(map.EventList.length));
		}
	}

	/**
	 * C# public ReadMap(Map map, IDataReader dataReader, Dictionary<uint, Tileset> tilesets)
	 * @param tilesets Map<uint, Tileset>
	 */
	ReadMap(map, dataReader, tilesets) {
		MapReader.ReadMap(map, dataReader, map => {
			if (map.Type === MapType.Map2D) {
				map.InitialTiles = newArray2D(map.Width, map.Height); // C# Map.Tile[Width, Height] -> [x][y]
				map.InitialBlocks = null;
				map.Tiles = newArray2D(map.Width, map.Height);
				map.Blocks = null;
				const tileset = getValue(tilesets, map.TilesetOrLabdataIndex);

				for (let y = 0; y < map.Height; ++y) {
					for (let x = 0; x < map.Width; ++x) {
						const backTileIndex = dataReader.ReadByte();
						const mapEventId = dataReader.ReadByte();
						const frontTileIndex = dataReader.ReadWord();
						map.InitialTiles[x][y] = init(new Map.Tile(), {
							BackTileIndex: backTileIndex,
							FrontTileIndex: frontTileIndex,
							MapEventId: mapEventId
						});
						map.Tiles[x][y] = init(new Map.Tile(), {
							BackTileIndex: backTileIndex,
							FrontTileIndex: frontTileIndex,
							MapEventId: mapEventId
						});
						map.InitialTiles[x][y].Type = map.Tiles[x][y].Type = Map.TileTypeFromTile(map.InitialTiles[x][y], tileset);
					}
				}
			} else {
				map.InitialBlocks = newArray2D(map.Width, map.Height); // C# Map.Block[Width, Height] -> [x][y]
				map.InitialTiles = null;
				map.Blocks = newArray2D(map.Width, map.Height);
				map.Tiles = null;

				for (let y = 0; y < map.Height; ++y) {
					for (let x = 0; x < map.Width; ++x) {
						const blockDataIndex = dataReader.ReadByte();
						const mapEventId = dataReader.ReadByte();
						map.InitialBlocks[x][y] = init(new Map.Block(), {
							ObjectIndex: blockDataIndex <= 100 ? blockDataIndex : 0,
							WallIndex: blockDataIndex !== 255 && blockDataIndex > 100 ? blockDataIndex - 100 : 0,
							MapEventId: mapEventId,
							MapBorder: blockDataIndex === 255
						});
						map.Blocks[x][y] = init(new Map.Block(), {
							ObjectIndex: blockDataIndex <= 100 ? blockDataIndex : 0,
							WallIndex: blockDataIndex !== 255 && blockDataIndex > 100 ? blockDataIndex - 100 : 0,
							MapEventId: mapEventId,
							MapBorder: blockDataIndex === 255
						});
					}
				}
			}
		});
	}
}
