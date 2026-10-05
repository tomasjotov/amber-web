// Port of Ambermoon.Data.Common/Tileset.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { hasFlag } from '../../runtime.js';

const TileFlags = Object.freeze({
	None: 0,
	WaveAnimation: 0x00000001, // Animations will go back and forth instead of loop cyclic
	BlockSight: 0x00000002, // TODO: this should be considered for 2D monsters
	Background: 0x00000004,
	Floor: 0x00000008, // Only for 3D objects
	RandomAnimationStart: 0x00000010, // Only randomly trigger the animation from time to time
	UseBackgroundTileFlags: 0x00000020,
	BringToFront: 0x00000040,
	BlockAllMovement: 0x00000080,
	// On non-world maps this and the below AllowMovement values are just arbitrary collision classes
	// which can be used by 3D chars (the player always has this first class on non-world maps).
	AllowMovementWalk: 0x00000100,
	AllowMovementHorse: 0x00000200,
	AllowMovementRaft: 0x00000400,
	AllowMovementShip: 0x00000800,
	AllowMovementMagicalDisc: 0x00001000,
	AllowMovementEagle: 0x00002000,
	AllowMovementFly: 0x00004000,
	AllowMovementSwim: 0x00008000,
	AllowMovementWitchBroom: 0x00010000,
	AllowMovementSandLizard: 0x00020000,
	AllowMovementSandShip: 0x00040000,
	AllowMovementWasp: 0x00080000,
	AllowMovementUnused13: 0x00100000,
	AllowMovementUnused14: 0x00200000,
	AllowMovementUnused15: 0x00400000,
	PlayerInvisible: 0x04000000,
	AutoPoison: 0x08000000, // Auto-poisoning (you can dodge the trap with LUK but there will be no popup). It only poisons while the animation is active.
	Transparency: 0x00000008, // = Floor, Only for 3D walls
	AllowMovementMonster: 0x00000200, // = AllowMovementHorse
	No3DAnimation: 0x04000000, // = PlayerInvisible, Only for 3D objects
});

class Tile {
	constructor() {
		this.flags = TileFlags.None;

		this.GraphicIndex = 0;
		this.NumAnimationFrames = 0;
		/** CharacterDirection? */
		this.SitDirection = null;
		this.Sleep = false;
		this.AllowedTravelTypes = 0;
		this.CombatBackgroundIndex = 0;
		/// <summary>
		/// This is used for magic map drawer. Each pixel is represented by a color
		/// and this is the 0-based color index inside the map's palette.
		/// </summary>
		this.ColorIndex = 0;
	}

	get CharacterInvisible() { return hasFlag(this.flags, TileFlags.PlayerInvisible); } // player is invisible while standing on that tile
	get Background() { return hasFlag(this.flags, TileFlags.Background); } // used by foreground tiles which should appear in the back (e.g. carpets)
	get BringToFront() { return hasFlag(this.flags, TileFlags.BringToFront); } // overrides Background and will appear above the player (e.g. tree tops)
	get UseBackgroundTileFlags() { return hasFlag(this.flags, TileFlags.UseBackgroundTileFlags); }

	get Flags() { return this.flags; }
	set Flags(value) {
		this.flags = value;
		this.ProcessFlags();
	}

	AllowMovement(travelType) {
		return !hasFlag(this.Flags, TileFlags.BlockAllMovement) && (this.AllowedTravelTypes & (1 << travelType)) !== 0;
	}

	/**
	 * Overloads: static Tile.ProcessFlags(tile, flags) and instance tile.ProcessFlags().
	 */
	static ProcessFlags(tile, flags) {
		// Note: I guess tiles, 3D objects, 3D walls and map characters all use the same 32 bit flags.
		// Some are only useful in 2D, some only in 3D and some only on map or character.

		// Walls:
		// BlockSight = 0x02, // Not sure but beside walls this is also used by non-bocking doors or exits
		// Transparency = 0x08,
		// BlockMovement = 0x80,

		// Objects:
		// FloorObject = 0x08, // like holes in the ground
		// BlockMovement = 0x80,

		// 2D Map tiles:
		// Bit 1: Draw partial in background? Bottom of a wall in the back?
		// Bit 2: Draw in background
		// Bit 6: Draw above player (not sure as it is in combination with bit 2 often, but it seems to work if this overrides bit 2)
		// Bit 7: Block all movement if set?
		// Bit 8-18: Travel type allowed flags (1 means allowed, 0 means not allowed/blocking).
		//           I guess it goes up to bit 22 for a total of 15 possible travel types. There are only 11 used though.
		// Bit 23-25: Sit/sleep value
		//  0 -> no sitting nor sleeping
		//  1 -> sit and look up
		//  2 -> sit and look right
		//  3 -> sit and look down
		//  4 -> sit and look left
		//  5 -> sleep (always face down)
		// Bit 26: Player invisible (doors, behind towers/walls, etc)
		// Bit 28-31: Combat background index when battle event is triggered on that tile

		// Another possible explanation for bit 2/6 would be:
		// - Bit 2: Disable baseline rendering / use custom sprite ordering
		// - Bit 6: 0 = behind player, 1 = above player (only used if Bit 2 is set)

		const flagValue = flags >>> 0;

		tile.AllowedTravelTypes = (flagValue >>> 8) & 0xfff;
		const sitSleepValue = (flagValue >>> 23) & 0x07;
		tile.SitDirection = (sitSleepValue === 0 || sitSleepValue > 4) ? null : sitSleepValue - 1;
		tile.Sleep = sitSleepValue === 5;
		tile.CombatBackgroundIndex = flagValue >>> 28;
	}

	ProcessFlags() {
		Tile.ProcessFlags(this, this.Flags);
	}
}

export class Tileset {
	static TileFlags = TileFlags;
	static Tile = Tile;

	constructor() {
		this.Index = 0;
		this.Tiles = null;
	}

	static Load(tilesetReader, dataReader) {
		const tileset = new Tileset();

		dataReader.Position = 0;
		tilesetReader.ReadTileset(tileset, dataReader);

		return tileset;
	}

	AllowMovement(backgroundTile, foregroundTile, travelType) {
		if (foregroundTile === 0)
			return this.Tiles[backgroundTile - 1].AllowMovement(travelType);

		if (backgroundTile === 0)
			return this.Tiles[foregroundTile - 1].AllowMovement(travelType);

		const foreground = this.Tiles[foregroundTile - 1];

		return foreground.UseBackgroundTileFlags
			? this.Tiles[backgroundTile - 1].AllowMovement(travelType)
			: foreground.AllowMovement(travelType);
	}
}

export { TileFlags as Tileset_TileFlags, Tile as Tileset_Tile };
