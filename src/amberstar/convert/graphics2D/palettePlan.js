// Palette planning for the Amberstar tileset palettes (see ../graphics2D.js).
//
// Amberstar tileset palettes have 16 colors, Ambermoon palettes 32. The upper 16 slots are free and are used
//  1. for colors of the party sprite which differ between the tileset palettes. The party sprite is drawn with the
//     palette of the current map (GameCore.GetPlayerPaletteIndex = Map.PaletteIndex - 1), but there is only one
//     player graphic set for all maps. Its colors therefore must be at the same slots in all tileset palettes.
//  2. for the minimap (magic map / "Map view" spell) colors. The engine maps Tile.ColorIndex through a fixed
//     table (GraphicProvider.PaletteIndexFromColorIndex, different for world and non-world maps) to a palette
//     slot. We choose the ColorIndex of each tile so that the resulting slot holds the Amberstar minimap color.

// Copy of GraphicProvider.ColorIndexMapping (Ambermoon.Data.Legacy/GraphicProvider.js, not exported there).
// Offset 0: 2D non-world maps, 16: 2D world maps, 32: 3D maps.
export const ColorIndexMapping = [
	0x00, 0x1F, 0x1E, 0x1D, 0x1C, 0x1B, 0x1A, 0x12, 0x13, 0x14, 0x11, 0x10, 0x09, 0x0A, 0x18, 0x17,
	0x00, 0x01, 0x1F, 0x12, 0x1C, 0x14, 0x15, 0x06, 0x08, 0x0A, 0x04, 0x02, 0x0E, 0x0C, 0x13, 0x10,
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
];
export const ColorIndexOffsetNonWorld2D = 0;
export const ColorIndexOffsetWorld2D = 16;

const sameColor = (a, b) => a != null && b != null && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function colorDistance(a, b) {
	a ??= [0, 0, 0];
	b ??= [0, 0, 0];
	return 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
}

/** 32 color slots of one tileset palette. Colors are Amberstar colors ([r, g, b], 0..224 like the loader returns). */
export class PalettePlan {
	constructor(colors16) {
		this.slots = new Array(32).fill(null);
		colors16.slice(0, 16).forEach((c, i) => { this.slots[i] = c; });
		this.slots[0] = null; // transparent, never usable as a color
	}

	isFree(slot) { return slot >= 16 && this.slots[slot] == null; }
	holds(slot, color) { return slot !== 0 && sameColor(this.slots[slot], color); }
	canHold(slot, color) { return this.holds(slot, color) || this.isFree(slot); }

	/** Final 32 colors for PaletteRegistry.addAmberstar (unused slots black, slot 0 is made transparent there). */
	colors(originalColor0) {
		return this.slots.map((c, i) => i === 0 ? originalColor0 : (c ?? [0, 0, 0]));
	}
}

/**
 * Finds a slot which holds `color` in all plans (or can be assigned in all plans) and assigns it.
 * `preferred` is a list of high slots to try first for new assignments. Returns the slot or null.
 */
export function allocateSharedSlot(plans, color, preferred = []) {
	for (let slot = 1; slot < 32; slot++) {
		if (plans.every(p => p.holds(slot, color)))
			return slot;
	}
	const order = [...preferred, ...Array.from({ length: 16 }, (_, i) => 16 + i)];
	for (const slot of order) {
		if (plans.every(p => p.canHold(slot, color))) {
			plans.forEach(p => { p.slots[slot] = color; });
			return slot;
		}
	}
	return null;
}

/** High slots which are not reachable through the ColorIndexMapping of the given offsets. */
export function unmappedHighSlots(offsets) {
	const used = new Set(offsets.flatMap(o => ColorIndexMapping.slice(o, o + 16)));
	return Array.from({ length: 16 }, (_, i) => 16 + i).filter(s => !used.has(s));
}

/**
 * Chooses Tile.ColorIndex values for the Amberstar minimap colors of one tileset.
 *  plan     PalettePlan of the tileset (free high slots get assigned)
 *  colors   the 16 Amberstar tileset colors (minimap color k is colors[k])
 *  usage    Map<k, count> of the minimap colors used by the tiles
 *  offsets  ColorIndexMapping offsets of the map types this tileset is used with
 * Returns { mapping: k -> ColorIndex, inexact: [k...] }.
 */
export function planMinimapColors(plan, colors, usage, offsets) {
	const mapping = new Array(16).fill(0);
	const inexact = [];
	const order = [...usage.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

	for (const k of order) {
		const color = colors[k];
		let best = null;
		let bestNew = Infinity;
		for (let c = 1; c < 16; c++) {
			const slots = offsets.map(o => ColorIndexMapping[o + c]);
			if (!slots.every(s => plan.canHold(s, color)))
				continue;
			const newAssignments = new Set(slots.filter(s => !plan.holds(s, color))).size;
			if (newAssignments < bestNew) {
				best = c;
				bestNew = newAssignments;
			}
		}
		if (best != null) {
			for (const o of offsets)
				plan.slots[ColorIndexMapping[o + best]] = color;
			mapping[k] = best;
			continue;
		}
		// No exact solution left: nearest color (unassigned slots end up black).
		let bestDistance = Infinity;
		for (let c = 1; c < 16; c++) {
			const distance = Math.max(...offsets.map(o => colorDistance(plan.slots[ColorIndexMapping[o + c]], color)));
			if (distance < bestDistance) {
				bestDistance = distance;
				best = c;
			}
		}
		mapping[k] = best;
		inexact.push(k);
	}
	return { mapping, inexact };
}
