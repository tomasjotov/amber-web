// Port of Ambermoon.Core/Render/ISurface3D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Only the enums are ported; ISurface3D and ISurface3DFactory are pure interfaces.

export const SurfaceType = Object.freeze({
	Floor: 0,
	Ceiling: 1,
	Wall: 2,
	Billboard: 3, // monsters, NPCs, trees, etc
	BillboardFloor: 4 // holes, lava, etc
});

/**
 * Only used for wall surfaces.
 * Other surfaces will ignore this.
 */
export const WallOrientation = Object.freeze({
	/** Wall facing front */
	Normal: 0,
	/** Wall facing left */
	Rotated90: 1,
	/** Wall facing back */
	Rotated180: 2,
	/** Wall facing right */
	Rotated270: 3
});
