// Port of Ambermoon.Data.Legacy/Serialization/MapWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Map } from '../../Ambermoon.Data.Common/Map.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { AutomapType } from '../../Ambermoon.Data.Common/Enumerations/AutomapType.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { EventWriter } from './EventWriter.js';

export class MapWriter {
	static WriteMapHeader(map, dataWriter) {
		dataWriter.WriteWord(map.Flags);
		dataWriter.WriteByte(map.Type);
		dataWriter.WriteByte(map.MusicIndex);
		dataWriter.WriteByte(map.Width);
		dataWriter.WriteByte(map.Height);
		dataWriter.WriteByte(map.TilesetOrLabdataIndex);
		dataWriter.WriteByte(map.NPCGfxIndex);
		dataWriter.WriteByte(map.LabyrinthBackgroundIndex);
		dataWriter.WriteByte(map.PaletteIndex);
		dataWriter.WriteByte(map.World);
		dataWriter.WriteByte(0);
	}

	static WriteMap(map, dataWriter) {
		MapWriter.WriteMapHeader(map, dataWriter);

		// Up to 32 character references (10 bytes each -> total 320 bytes)
		for (let i = 0; i < 32; ++i) {
			if (map.CharacterReferences[i] == null) {
				for (let j = 0; j < 10; ++j)
					dataWriter.WriteByte(0);
			} else {
				dataWriter.WriteByte(map.CharacterReferences[i].Index);
				dataWriter.WriteByte(map.CharacterReferences[i].CollisionClass);
				const typeAndFlags = ((map.CharacterReferences[i].Type & 0xff) | ((map.CharacterReferences[i].CharacterFlags & 0xff) << 2)) & 0xff;
				dataWriter.WriteByte(typeAndFlags);
				dataWriter.WriteByte(map.CharacterReferences[i].EventIndex);
				dataWriter.WriteWord(map.CharacterReferences[i].GraphicIndex);
				dataWriter.WriteDword(map.CharacterReferences[i].TileFlags);
			}
		}

		if (map.Type === MapType.Map2D) {
			for (let y = 0; y < map.Height; ++y) {
				for (let x = 0; x < map.Width; ++x) {
					const tile = map.InitialTiles[x][y]; // C# InitialTiles[x, y]
					dataWriter.WriteByte(tile.BackTileIndex);
					dataWriter.WriteByte(tile.MapEventId);
					dataWriter.WriteWord(tile.FrontTileIndex);
				}
			}
		} else {
			for (let y = 0; y < map.Height; ++y) {
				for (let x = 0; x < map.Width; ++x) {
					const block = map.InitialBlocks[x][y]; // C# InitialBlocks[x, y]
					const blockDataIndex = block.MapBorder ? 255
						: block.ObjectIndex !== 0 ? block.ObjectIndex
							: block.WallIndex !== 0 ? 100 + block.WallIndex
								: 0;
					dataWriter.WriteByte(blockDataIndex);
					dataWriter.WriteByte(block.MapEventId);
				}
			}
		}

		EventWriter.WriteEvents(dataWriter, map.Events, map.EventList);

		const characterDataOffset = dataWriter.Position;
		const characterPositionDataHeaderLocations = new globalThis.Map();

		// For each character reference the positions or movement paths are stored here.
		// For random movement there are 2 bytes (x and y). Otherwise there are 288 positions
		// each has 2 bytes (x and y). Each position is for one 5 minute chunk of the day.
		// There are 24 hours * 60 minutes = 1440 minutes per day. Divided by 5 you get 288.
		// A position of 0,0 is possible. It means "not visible on the map".
		for (const characterReference of map.CharacterReferences) {
			if (characterReference == null || characterReference.Index === 0)
				continue;

			const flags = Map.CharacterReference.Flags;

			if (characterReference.Type === CharacterType.Monster ||
				(characterReference.CharacterFlags & flags.RandomMovement) === flags.RandomMovement ||
				(characterReference.CharacterFlags & flags.Stationary) === flags.Stationary) {
				// For monsters, random movement or stationary only the start position is given.
				dataWriter.WriteByte(characterReference.Positions[0].X);
				dataWriter.WriteByte(characterReference.Positions[0].Y);
			} else if (characterReference.HourMovement) {
				for (let i = 0; i < 12; i++) {
					dataWriter.WriteByte(characterReference.Positions[i].X);
					dataWriter.WriteByte(characterReference.Positions[i].Y);
				}
			} else {
				for (let i = 0; i < 288; ++i) {
					dataWriter.WriteByte(characterReference.Positions[i].X);
					dataWriter.WriteByte(characterReference.Positions[i].Y);
				}
			}
		}

		dataWriter.WriteWord(map.GotoPoints.length);

		for (const gotoPoint of map.GotoPoints) {
			dataWriter.WriteByte(gotoPoint.X);
			dataWriter.WriteByte(gotoPoint.Y);
			dataWriter.WriteByte(gotoPoint.Direction);
			dataWriter.WriteByte(gotoPoint.Index);

			let name = gotoPoint.Name;

			if (name.length > 15)
				name = name.substring(0, 15);
			dataWriter.WriteWithoutLength(name);
			for (let i = name.length; i < 16; ++i)
				dataWriter.WriteByte(0);
		}

		if (map.Type === MapType.Map3D) {
			if (map.EventAutomapTypes == null || map.EventAutomapTypes.length !== map.EventList.length)
				throw new AmbermoonException(ExceptionScope.Data, 'For 3D maps the EventAutomapTypes collection size must match the EventList collection size.');
			for (const automapType of map.EventAutomapTypes) {
				if (automapType === AutomapType.Invalid)
					dataWriter.WriteByte(0);
				else
					dataWriter.WriteByte(automapType);
			}
		}
	}
}
