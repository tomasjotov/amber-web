// Port of Ambermoon.Data.Common/Map.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// 2D arrays (Tile[,] / Block[,]) are arrays of arrays: Tiles[x][y] == C# Tiles[x, y] (outer length = Width).

import { enumName, formatNumber, newArray, newArray2D } from '../../runtime.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { TravelType } from './Enumerations/TravelType.js';
import { CharacterType } from './Enumerations/CharacterType.js';
import { CharacterDirection } from '../Ambermoon.Common/Direction.js';
import { MapType } from './Enumerations/MapType.js';
import { World } from './Enumerations/World.js';
import { Tileset } from './Tileset.js';
import { EventType, DoorEvent } from './Event.js';

const hasFlag = (value, flag) => (value & flag) === flag;

export const MapFlags = Object.freeze({
	None: 0,
	Indoor: 1, // Always at full light.
	Outdoor: 2, // Light level is given by the daytime.
	Dungeon: 4, // Only own light sources will grant light.
	Automapper: 8, // If set the map is available and the map has to be explored. It also allows map-related spells. All Morag temples omit this.
	CanRest: 0x10,
	Unknown1: 0x20, // Unknown. All world maps use that in Ambermoon.
	Sky: 0x40, // All towns have this and the ruin tower. Only considered for 3D maps.
	NoSleepUntilDawn: 0x80, // If active sleep time is always 8 hours.
	StationaryGraphics: 0x100, // Allow stationary graphics (travel type images) and therefore transports. Is set for all world maps. This also controls if the music is taken from the map file or dependent on the travel type.
	Unknown2: 0x200, // Unknown. Never used in Ambermoon.
	WorldSurface: 0x400, // If set the map doesn't use map text 0 as the title but uses the world name instead. Moreover based on world adjacent maps are shown with a size of 50x50.
	CanUseMagic: 0x800, // Only 0 in map 269 which is the house of the baron of Spannenberg (also in map 148 but this is a bug). It just disables the spell book if not set but you still can use scrolls or items.
	NoTravelMusic: 0x1000, // Won't use travel music if StationaryGraphics is set
	NoMarkOrReturn: 0x2000, // Forbids the use of "Word of marking" and "Word of returning"
	NoEagleOrBroom: 0x4000, // Forbids the use of eagle and broom
	SharedMapData: 0x8000, // Only used internal by the new game data, do not use in original!
	SmallPlayer: 0x100 // = StationaryGraphics. Display player smaller. Only all world maps have this set. Only considered for 2D maps.
});

const TileType = Object.freeze({
	Normal: 0,
	ChairUp: 1,
	ChairRight: 2,
	ChairDown: 3,
	ChairLeft: 4,
	Bed: 5,
	Invisible: 6,
	Water: 7
});

// IEventOnMap is a pure interface (Tile and Block have MapEventId).

class Tile {
	constructor() {
		/**
		 * Back layer in 2D maps
		 */
		this.BackTileIndex = 0;
		/**
		 * Front layer in 2D maps
		 */
		this.FrontTileIndex = 0;
		this.MapEventId = 0;
		this.Type = TileType.Normal;
	}

	AllowMovement(tileset, travelType, isPlayer = true, allowSwimWalkChange = false) {
		if (!isPlayer && this.Type === TileType.Water) {
			return false;
		}

		if (travelType !== TravelType.Swim && (this.Type > TileType.Normal && this.Type < TileType.Invisible)) {
			return true;
		}

		if (tileset.AllowMovement(this.BackTileIndex, this.FrontTileIndex, travelType))
			return true;

		if (allowSwimWalkChange) {
			if (travelType === TravelType.Swim && tileset.AllowMovement(this.BackTileIndex, this.FrontTileIndex, TravelType.Walk))
				return true;

			if (travelType === TravelType.Walk && tileset.AllowMovement(this.BackTileIndex, this.FrontTileIndex, TravelType.Swim))
				return true;
		}

		return false;
	}

	BlocksSight(tileset) {
		// TODO: Is there a tile flag for that?

		if (this.Type === TileType.Invisible || !this.AllowMovement(tileset, TravelType.Walk))
			return true;

		return false;
	}

	Clone() {
		const tile = new Tile();
		tile.BackTileIndex = this.BackTileIndex;
		tile.FrontTileIndex = this.FrontTileIndex;
		tile.MapEventId = this.MapEventId;
		tile.Type = this.Type;
		return tile;
	}
}

class Block {
	constructor() {
		this.ObjectIndex = 0;
		this.WallIndex = 0;
		this.MapEventId = 0;
		/**
		 * This block is not drawn at all.
		 */
		this.MapBorder = false;
	}

	BlocksPlayer(labdata, wallsOnly = false) {
		if (this.MapBorder)
			return true;

		if (this.WallIndex !== 0) {
			const wallFlags = labdata.Walls[(this.WallIndex - 1) % labdata.Walls.length].Flags;
			return hasFlag(wallFlags, Tileset.TileFlags.BlockAllMovement) || !hasFlag(wallFlags, Tileset.TileFlags.AllowMovementWalk);
		}

		if (!wallsOnly && this.ObjectIndex !== 0) {
			const obj = labdata.Objects[(this.ObjectIndex - 1) % labdata.Objects.length];

			for (const subObject of obj.SubObjects) {
				const objectFlags = subObject.Object.Flags;

				if (hasFlag(objectFlags, Tileset.TileFlags.BlockAllMovement) || !hasFlag(objectFlags, Tileset.TileFlags.AllowMovementWalk))
					return true;
			}
		}

		return false;
	}

	BlocksPlayerSight(labdata) {
		if (this.MapBorder)
			return true;

		if (this.WallIndex !== 0) {
			const wallFlags = labdata.Walls[(this.WallIndex - 1) % labdata.Walls.length].Flags;
			return hasFlag(wallFlags, Tileset.TileFlags.BlockSight);
		}

		return false;
	}

	Clone() {
		const block = new Block();
		block.ObjectIndex = this.ObjectIndex;
		block.WallIndex = this.WallIndex;
		block.MapEventId = this.MapEventId;
		block.MapBorder = this.MapBorder;
		return block;
	}
}

const CharacterReferenceFlags = Object.freeze({
	None: 0,
	RandomMovement: 1,
	UseTileset: 2,
	TextPopup: 4,
	NPCTalksToYou: 8,
	HourMovement: 0x10,
	Stationary: 0x20, // new in Ambermoon Advanced
	MoveOnlyWhenSeePlayer: 0x20 // new in Ambermoon Advanced
});

class CharacterReference {
	static Flags = CharacterReferenceFlags;

	constructor() {
		this.Type = CharacterType.PartyMember;
		this.CharacterFlags = CharacterReferenceFlags.None;
		/**
		 * Equals travel type.
		 */
		this.CollisionClass = 0;
		this.Index = 0; // of party member, npc, monster or map text
		/**
		 * Upper 4 bits of this contains the combat background index.
		 * (Tileset.TileFlags)
		 */
		this.TileFlags = 0;
		this.EventIndex = 0;
		/**
		 * This is:
		 * - an object index inside the labdata for 3D maps
		 * - a tile index inside the tileset for 2D maps if flag UseTileset is set
		 * - an NPC graphic index for 2D maps if flag UseTileset is not set and it's an NPC
		 */
		this.GraphicIndex = 0;
		this.CombatBackgroundIndex = 0;
		/** Position[] */
		this.Positions = [];
		/** number or null */
		this.SpecialMoveCharacterIndex = null;
		/** number or null */
		this.SpecialMoveOffset = null;
	}

	get OnlyMoveWhenSeePlayer() { return this.Type === CharacterType.Monster && hasFlag(this.CharacterFlags, CharacterReferenceFlags.MoveOnlyWhenSeePlayer); }
	get Stationary() { return this.Type !== CharacterType.Monster && hasFlag(this.CharacterFlags, CharacterReferenceFlags.Stationary); }
	get HourMovement() { return this.Type !== CharacterType.Monster && hasFlag(this.CharacterFlags, CharacterReferenceFlags.HourMovement); }
	get NPCTalksToYou() { return this.Type === CharacterType.NPC && !hasFlag(this.CharacterFlags, CharacterReferenceFlags.TextPopup) && hasFlag(this.CharacterFlags, CharacterReferenceFlags.NPCTalksToYou); }

	Clone() {
		const clone = new CharacterReference();
		clone.Type = this.Type;
		clone.CharacterFlags = this.CharacterFlags;
		clone.CollisionClass = this.CollisionClass;
		clone.Index = this.Index;
		clone.TileFlags = this.TileFlags;
		clone.EventIndex = this.EventIndex;
		clone.GraphicIndex = this.GraphicIndex;
		clone.CombatBackgroundIndex = this.CombatBackgroundIndex;

		clone.Positions.push(...this.Positions.map(p => new Position(p)));

		return clone;
	}
}

class GotoPoint {
	constructor() {
		this.X = 0;
		this.Y = 0;
		this.Direction = CharacterDirection.Up;
		this.Index = 0;
		this.Name = null;
	}

	Clone() {
		const gotoPoint = new GotoPoint();
		gotoPoint.X = this.X;
		gotoPoint.Y = this.Y;
		gotoPoint.Direction = this.Direction;
		gotoPoint.Index = this.Index;
		gotoPoint.Name = this.Name;
		return gotoPoint;
	}
}

export class Map {
	static TileType = TileType;
	static Tile = Tile;
	static Block = Block;
	static CharacterReference = CharacterReference;
	static GotoPoint = GotoPoint;

	constructor() {
		this.Index = 0;
		this.Flags = MapFlags.None;
		this.Type = 0;
		this.MusicIndex = 0;
		this.Width = 0;
		this.Height = 0;
		/**
		 * Tileset index in 2D
		 * Labdata index in 3D
		 */
		this.TilesetOrLabdataIndex = 0;
		/**
		 * This is only used in non-world-surface 2D maps.
		 * To be more precise it could be used in any 2D map
		 * but it only makes sense for maps which have 2D NPCs.
		 * There are 2 NPC graphic files inside the NPC_gfx.amb.
		 * This index specifies which to load (0 = none, 1 or 2).
		 */
		this.NPCGfxIndex = 0;
		/**
		 * This is used for outdoor 3D maps (towns). It basically
		 * depends on the world (there is one for each world).
		 * 0: Not used, 1: Lyramion, 2: Forest Moon, 3: Morag
		 *
		 * TODO: This is also used for all Lyramion and Morag
		 * 2D world maps where it is set to 1. For all other 2D
		 * maps (including forest moon world maps) it is 0.
		 */
		this.LabyrinthBackgroundIndex = 0;
		this.PaletteIndex = 0;
		this.World = World.Lyramion;
		/** Tile[Width][Height] */
		this.Tiles = null;
		/** Block[Width][Height] */
		this.Blocks = null;
		/** Tile[Width][Height] */
		this.InitialTiles = null;
		/** Block[Width][Height] */
		this.InitialBlocks = null;
		/** Event[] */
		this.Events = [];
		/** Event[] */
		this.EventList = [];
		/** string[] */
		this.Texts = [];
		/** CharacterReference[32] */
		this.CharacterReferences = newArray(32, null);
		/** GotoPoint[] */
		this.GotoPoints = [];
		/** AutomapType[] */
		this.EventAutomapTypes = [];
		this.TicksPerAnimationFrame = 10; // This matches the frame speed in real game quite good. TODO: changeable later? same for every map?
	}

	Clone() {
		const clone = new Map();
		clone.Index = this.Index;
		clone.Flags = this.Flags;
		clone.Type = this.Type;
		clone.MusicIndex = this.MusicIndex;
		clone.Width = this.Width;
		clone.Height = this.Height;
		clone.TilesetOrLabdataIndex = this.TilesetOrLabdataIndex;
		clone.NPCGfxIndex = this.NPCGfxIndex;
		clone.LabyrinthBackgroundIndex = this.LabyrinthBackgroundIndex;
		clone.PaletteIndex = this.PaletteIndex;
		clone.World = this.World;
		clone.Tiles = this.Type === MapType.Map2D ? newArray2D(this.Width, this.Height) : null;
		clone.Blocks = this.Type === MapType.Map3D ? newArray2D(this.Width, this.Height) : null;
		clone.InitialTiles = this.Type === MapType.Map2D ? newArray2D(this.Width, this.Height) : null;
		clone.InitialBlocks = this.Type === MapType.Map3D ? newArray2D(this.Width, this.Height) : null;

		// Note: JS Map with object keys (reference equality like the C# Event class)
		const events = new globalThis.Map();

		for (const e of this.Events) {
			if (events.has(e))
				throw new Error('An item with the same key has already been added.');
			events.set(e, e.Clone(false));
		}

		clone.EventList.push(...this.EventList.map(e => events.get(e)));

		const newEvents = [...events.values()];

		for (const [Key, Value] of events) {
			if (Key.Next != null)
				Value.Next = newEvents[this.Events.indexOf(Key.Next)];
			clone.Events.push(Value);
		}

		clone.Texts.push(...this.Texts);

		for (let i = 0; i < clone.CharacterReferences.length; ++i)
			clone.CharacterReferences[i] = this.CharacterReferences[i]?.Clone() ?? null;

		clone.GotoPoints.push(...this.GotoPoints.map(g => g?.Clone() ?? null));
		clone.EventAutomapTypes.push(...this.EventAutomapTypes);

		for (let y = 0; y < this.Height; ++y) {
			for (let x = 0; x < this.Width; ++x) {
				if (this.Type === MapType.Map2D) {
					clone.Tiles[x][y] = this.Tiles[x][y].Clone();
					clone.InitialTiles[x][y] = this.InitialTiles[x][y].Clone();
				} else {
					clone.Blocks[x][y] = this.Blocks[x][y].Clone();
					clone.InitialBlocks[x][y] = this.InitialBlocks[x][y].Clone();
				}
			}
		}

		return clone;
	}

	// Web port: NameOverride / WorldMapDimensionOverride / BaseWorldMapIndexOverride are used for Amberstar maps.
	get Name() { if (this.NameOverride != null) return this.NameOverride; return this.IsWorldMap || this.Index < 256 ? `${enumName(World, this.World)}${formatNumber(this.Index, '000')}` : this.Texts[0]; }
	get IsLyramionWorldMap() { return this.IsWorldMap && this.World === World.Lyramion; }
	get IsForestMoonWorldMap() { return this.IsWorldMap && this.World === World.ForestMoon; }
	get IsMoragWorldMap() { return this.IsWorldMap && this.World === World.Morag; }
	// Note: We use this to determine that the player is drawn smaller.
	// But actually it should depend on flag SmallPlayer. It is only used
	// for all world maps in Ambermoon so it should be safe.
	get IsWorldMap() { return hasFlag(this.Flags, MapFlags.WorldSurface); }
	get UseTravelTypes() { return hasFlag(this.Flags, MapFlags.StationaryGraphics); }
	get UseTravelMusic() { return this.UseTravelTypes && !hasFlag(this.Flags, MapFlags.NoTravelMusic); }

	GetText(index, fallbackText) {
		if (this.Texts == null || index < 0 || index >= this.Texts.length)
			return fallbackText;

		return this.Texts[index];
	}

	MoveWorldMapIndex(baseIndex, worldMapDimension, currentIndex, changeX, changeY) {
		let relativeIndex = (currentIndex - baseIndex) >>> 0;
		const row = Math.trunc(relativeIndex / worldMapDimension);

		if (changeX !== 0) {
			const rowBaseIndex = row * worldMapDimension;
			let indexInRow = (relativeIndex % worldMapDimension) + changeX;

			while (indexInRow < 0)
				indexInRow += worldMapDimension;
			while (indexInRow >= worldMapDimension)
				indexInRow -= worldMapDimension;

			relativeIndex = rowBaseIndex + indexInRow;
		}

		if (changeY !== 0) {
			let newIndex = relativeIndex + changeY * worldMapDimension;
			const totalMaps = worldMapDimension * worldMapDimension;

			while (newIndex < 0)
				newIndex += totalMaps;
			while (newIndex >= totalMaps)
				newIndex -= totalMaps;

			relativeIndex = newIndex;
		}

		return baseIndex + relativeIndex;
	}

	get BaseWorldMapIndex() {
		if (this.BaseWorldMapIndexOverride != null && this.IsWorldMap)
			return this.BaseWorldMapIndexOverride;

		if (this.IsLyramionWorldMap)
			return 1;

		if (this.IsForestMoonWorldMap)
			return 300;

		if (this.IsMoragWorldMap)
			return 513;

		return 0;
	}

	get WorldMapDimension() {
		if (this.WorldMapDimensionOverride != null && this.IsWorldMap)
			return this.WorldMapDimensionOverride;

		if (this.IsLyramionWorldMap)
			return 16;

		if (this.IsForestMoonWorldMap)
			return 6;

		if (this.IsMoragWorldMap)
			return 4;

		return 0;
	}

	get LeftMapIndex() { return !this.IsWorldMap ? null : this.MoveWorldMapIndex(this.BaseWorldMapIndex, this.WorldMapDimension, this.Index, -1, 0); }
	get RightMapIndex() { return !this.IsWorldMap ? null : this.MoveWorldMapIndex(this.BaseWorldMapIndex, this.WorldMapDimension, this.Index, 1, 0); }
	get UpMapIndex() { return !this.IsWorldMap ? null : this.MoveWorldMapIndex(this.BaseWorldMapIndex, this.WorldMapDimension, this.Index, 0, -1); }
	get UpLeftMapIndex() { return !this.IsWorldMap ? null : this.MoveWorldMapIndex(this.BaseWorldMapIndex, this.WorldMapDimension, this.Index, -1, -1); }
	get UpRightMapIndex() { return !this.IsWorldMap ? null : this.MoveWorldMapIndex(this.BaseWorldMapIndex, this.WorldMapDimension, this.Index, 1, -1); }
	get DownMapIndex() { return !this.IsWorldMap ? null : this.MoveWorldMapIndex(this.BaseWorldMapIndex, this.WorldMapDimension, this.Index, 0, 1); }
	get DownLeftMapIndex() { return !this.IsWorldMap ? null : this.MoveWorldMapIndex(this.BaseWorldMapIndex, this.WorldMapDimension, this.Index, -1, 1); }
	get DownRightMapIndex() { return !this.IsWorldMap ? null : this.MoveWorldMapIndex(this.BaseWorldMapIndex, this.WorldMapDimension, this.Index, 1, 1); }

	get MapOffset() {
		if (!this.IsWorldMap)
			return new Position(0, 0);

		const relativeIndex = (this.Index - this.BaseWorldMapIndex) >>> 0;
		const dimension = this.WorldMapDimension;

		const x = (relativeIndex % dimension) * this.Width; // world maps should all have the same width
		const y = Math.trunc(relativeIndex / dimension) * this.Height; // world maps should all have the same height

		return new Position(x, y);
	}

	static Load(index, mapReader, dataReader, textDataReader, tilesets) {
		const map = new Map();
		map.Index = index;

		mapReader.ReadMap(map, dataReader, tilesets);
		mapReader.ReadMapTexts(map, textDataReader);

		return map;
	}

	static LoadWithoutTexts(index, mapReader, dataReader, tilesets) {
		const map = new Map();
		map.Index = index;

		mapReader.ReadMap(map, dataReader, tilesets);

		return map;
	}

	Reset() {
		if (this.InitialTiles != null) {
			this.Tiles = newArray2D(this.Width, this.Height);

			for (let y = 0; y < this.Height; ++y) {
				for (let x = 0; x < this.Width; ++x) {
					const initialTile = this.InitialTiles[x][y];
					const tile = new Tile();
					tile.BackTileIndex = initialTile.BackTileIndex;
					tile.FrontTileIndex = initialTile.FrontTileIndex;
					tile.MapEventId = initialTile.MapEventId;
					tile.Type = initialTile.Type;
					this.Tiles[x][y] = tile;
				}
			}
		} else if (this.InitialBlocks != null) {
			this.Blocks = newArray2D(this.Width, this.Height);

			for (let y = 0; y < this.Height; ++y) {
				for (let x = 0; x < this.Width; ++x) {
					const initialBlock = this.InitialBlocks[x][y];
					const block = new Block();
					block.MapBorder = initialBlock.MapBorder;
					block.ObjectIndex = initialBlock.ObjectIndex;
					block.WallIndex = initialBlock.WallIndex;
					block.MapEventId = initialBlock.MapEventId;
					this.Blocks[x][y] = block;
				}
			}
		}
	}

	static TileTypeFromTile(tile, tileset) {
		const tilesetTile = tile.FrontTileIndex === 0 ? tileset.Tiles[tile.BackTileIndex - 1] : tileset.Tiles[tile.FrontTileIndex - 1];

		if (tilesetTile.Sleep)
			return TileType.Bed;
		if (tilesetTile.SitDirection != null)
			return TileType.ChairUp + tilesetTile.SitDirection;
		if (tilesetTile.CharacterInvisible)
			return TileType.Invisible;
		if (tile.AllowMovement(tileset, TravelType.Swim))
			return TileType.Water;
		return TileType.Normal;
	}

	UpdateTile(x, y, newFrontTileIndex, tileset) {
		if (this.Type !== MapType.Map2D)
			throw new AmbermoonException(ExceptionScope.Data, 'Tiles can only be updated for 2D maps.');

		if (newFrontTileIndex === 0)
			this.Tiles[x][y].FrontTileIndex = 0;
		else {
			if (hasFlag(tileset.Tiles[newFrontTileIndex - 1].Flags, Tileset.TileFlags.Background))
				this.Tiles[x][y].FrontTileIndex = newFrontTileIndex;
			else
				this.Tiles[x][y].BackTileIndex = newFrontTileIndex;
		}

		this.Tiles[x][y].Type = Map.TileTypeFromTile(this.Tiles[x][y], tileset);
	}

	StopMovingTowards(savegame, x, y) {
		const mapEventId = (this.Type === MapType.Map2D) ? this.Tiles[x][y].MapEventId : this.Blocks[x][y].MapEventId;

		if (mapEventId === 0 || !savegame.IsEventActive(this.Index, mapEventId - 1))
			return false;

		const event = this.EventList[mapEventId - 1];

		switch (event.Type) {
			case EventType.Chest: return true;
			case EventType.Door: return savegame.IsDoorLocked((event instanceof DoorEvent ? event : null).DoorIndex); // Only locked doors block
			case EventType.EnterPlace: return true;
			case EventType.Riddlemouth: return true;
			default: return false;
		}
	}

	get CanCamp() { return hasFlag(this.Flags, MapFlags.CanRest); }
	get CanUseSpells() { return hasFlag(this.Flags, MapFlags.CanUseMagic); }
}

export {
	TileType as Map_TileType,
	Tile as Map_Tile,
	Block as Map_Block,
	CharacterReference as Map_CharacterReference,
	CharacterReferenceFlags as Map_CharacterReference_Flags,
	GotoPoint as Map_GotoPoint
};
