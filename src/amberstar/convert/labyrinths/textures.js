// Texture extraction for the labyrinth converter (see ../labyrinths.js).
//
// Amberstar draws its 3D views from pre-rendered images: every lab block (LABBLOCK.AMB) has one image per
// perspective (position relative to the party in a 144x144 view). The images of the block straight ahead
// (perspective location Forward1 = 8, the largest complete front view) are used to build the Ambermoon textures:
//  - walls: the front face of the wall block (+ the front view of a decoration/overlay drawn over it) is cut
//    out and rescaled to the 128x80 Ambermoon wall texture size
//  - objects: the front view becomes a billboard texture (all animation frames side by side)
//  - flat objects lying on the floor (holes, puddles, piles) are un-projected into top-down floor billboards
// All graphics keep the Amberstar palette indices (the labdata palette is the Amberstar palette, see palette()).
import { Graphic } from '../../../ambermoon/Ambermoon.Data.Common/Graphic.js';

export const WallTextureWidth = 128; // RenderMap3D.TextureWidth
export const WallTextureHeight = 80; // RenderMap3D.TextureHeight
export const FloorTextureSize = 64; // RenderMap3D.FloorTextureWidth/Height
export const ViewSize = 144; // Amberstar 3D view (144x144)

/** Amberstar lab block types */
export const LabBlockType = Object.freeze({ None: 0, Wall: 1, Overlay: 2, Object: 3 });
/** Perspective locations (Amberstar PerspectiveLocation) */
export const Location = Object.freeze({ Forward3: 2, Forward2: 5, Forward1: 8, PlayerLocation: 11 });

/** Palette index which is used for opaque black (Amberstar color 0 is transparent in sprites). */
export const OpaqueBlackIndex = 16;
/** Amberstar uses color 11 of the outdoor lab palettes as "sky" in the ceiling/sky images (transparent to the sky gradient). */
export const SkyColorIndex = 11;
/**
 * Palette index which marks sky pixels in Ambermoon textures (Labdata.CeilingColorIndex of outdoor labdata: the engine
 * replaces it with the sky color, RenderView.SetSkyColorReplacement). Not 11: color 11 is a normal (green) color in the
 * Amberstar wall, object and floor graphics and must not turn into sky. Outside of the 16 colors which are darkened at night.
 */
export const SkyMarkerIndex = 17;

/** Front facing perspective of a block at the given location or null. Dummy images (16x1 at 0,0) count as missing. */
export function frontPerspective(block, location = Location.Forward1) {
	const p = block?.perspectives.find(p => p.location === location && p.facing === 0) ?? null;
	if (!p || isDummy(p))
		return null;
	return p;
}

function isDummy(perspective) {
	const f = perspective.frames[0];
	return f.height <= 2 && perspective.renderX === 0 && perspective.renderY === 0;
}

export function rectOf(perspective, frame = 0) {
	const f = perspective.frames[frame];
	return { x: perspective.renderX, y: perspective.renderY, w: f.width, h: f.height };
}

/** Indexed canvas in Amberstar view coordinates. */
class ViewCanvas {
	constructor(width = ViewSize, height = ViewSize) {
		this.width = width;
		this.height = height;
		this.data = new Uint8Array(width * height);
		this.set = new Uint8Array(width * height); // 1 where something was drawn
	}

	draw(graphic, x, y, transparent0) {
		for (let gy = 0; gy < graphic.height; gy++) {
			const ty = y + gy;
			if (ty < 0 || ty >= this.height)
				continue;
			for (let gx = 0; gx < graphic.width; gx++) {
				const tx = x + gx;
				if (tx < 0 || tx >= this.width)
					continue;
				const c = graphic.data[gx + gy * graphic.width];
				if (transparent0 && c === 0)
					continue;
				this.data[tx + ty * this.width] = c;
				this.set[tx + ty * this.width] = 1;
			}
		}
	}

	/** Cuts out a rectangle and rescales it (nearest neighbour, palette indices stay intact). */
	crop(rect, width, height, mapColor) {
		const result = new Graphic(width, height, 0);
		for (let y = 0; y < height; y++) {
			const sy = rect.y + Math.min(rect.h - 1, Math.floor((y + 0.5) * rect.h / height));
			for (let x = 0; x < width; x++) {
				const sx = rect.x + Math.min(rect.w - 1, Math.floor((x + 0.5) * rect.w / width));
				let c = 0, drawn = false;
				if (sx >= 0 && sy >= 0 && sx < this.width && sy < this.height) {
					c = this.data[sx + sy * this.width];
					drawn = this.set[sx + sy * this.width] === 1;
				}
				result.Data[x + y * width] = mapColor(c, drawn);
			}
		}
		return result;
	}
}

/**
 * Geometry of a labdata's 3D view, taken from the front views of its (first) wall block:
 * face8/face5 are the screen rectangles of the near faces of the blocks 1 and 2 steps ahead.
 */
export function viewGeometry(labBlocks) {
	const wall = labBlocks.find(b => b.type === LabBlockType.Wall && frontPerspective(b) && frontPerspective(b, Location.Forward2));
	if (!wall) {
		// No walls (does not happen in the original data): use the typical Amberstar geometry
		return { face8: { x: 18, y: 38, w: 106, h: 80 }, face5: { x: 42, y: 58, w: 60, h: 45 } };
	}
	return { face8: rectOf(frontPerspective(wall)), face5: rectOf(frontPerspective(wall, Location.Forward2)) };
}

/**
 * Ambermoon wall height (block size is 512) for the Amberstar wall proportions. The front face of a block
 * is exactly one block wide, so height = 512 * faceHeight / faceWidth. Ambermoon compensates the different wall
 * heights with the projection aspect (RenderMap3D.SetMap -> AspectProcessor), so the Amberstar proportions stay.
 */
export function wallHeight(geometry) {
	const { w, h } = geometry.face8;
	return Math.max(256, Math.min(640, Math.round(512 * h / w)));
}

/**
 * Wall texture (128x80) from a wall block, optionally with an overlay (decoration like a door) drawn over it.
 * `wallBlock` may be null (overlay without a wall, or an object which fills the whole view).
 * Returns { graphic, transparent }.
 */
export function createWallTexture(geometry, wallBlock, overlayBlock, outdoor, fullViewObject = null) {
	const canvas = new ViewCanvas();
	let rect = geometry.face8;
	const wallFront = frontPerspective(wallBlock);
	if (wallFront) {
		rect = rectOf(wallFront);
		// Note: Walls are drawn opaque. Color 0 pixels show the background in Amberstar (sky/ceiling).
		canvas.draw(wallFront.frames[0], wallFront.renderX, wallFront.renderY, false);
	}
	const objectFront = frontPerspective(fullViewObject);
	if (objectFront) {
		const objectRect = rectOf(objectFront);
		canvas.draw(objectFront.frames[0], objectFront.renderX, objectFront.renderY, false);
		// Objects which have the size of a wall face are used directly, objects which cover the whole
		// view (they include the side walls) are cut at the wall face.
		if (!wallFront && Math.abs(objectRect.w - rect.w) <= rect.w / 10)
			rect = objectRect;
	}
	const overlayFront = frontPerspective(overlayBlock);
	if (overlayFront)
		canvas.draw(overlayFront.frames[0], overlayFront.renderX, overlayFront.renderY, true);
	const transparent = !wallFront && !objectFront;
	const graphic = canvas.crop(rect, WallTextureWidth, WallTextureHeight, (c, drawn) => {
		if (transparent)
			return drawn ? c : 0;
		if (c === 0)
			return OpaqueBlackIndex;
		return c;
	});
	if (outdoor && !transparent) {
		// Amberstar shows the background behind color 0 wall pixels. The mortar between the stones is dark in the
		// original (the sky is only visible above the wall). Only the small notches at the top edge of the wall show
		// the sky: column runs of color 0 starting at the top row which are at most MaxSkyNotch rows deep. Longer runs
		// are mortar at the texture edges, which would show up as bright sky colored seams between adjacent walls.
		const MaxSkyNotch = 4;
		const data = graphic.Data;
		for (let x = 0; x < WallTextureWidth; x++) {
			let y = 0;
			while (y < WallTextureHeight && data[x + y * WallTextureWidth] === OpaqueBlackIndex)
				y++;
			if (y <= MaxSkyNotch) {
				for (let i = 0; i < y; i++)
					data[x + i * WallTextureWidth] = SkyMarkerIndex;
			}
		}
	}
	return { graphic, transparent };
}

/** Transparent wall texture for invisible walls (blocking tiles without graphics). */
export function createInvisibleWallTexture() {
	return new Graphic(WallTextureWidth, WallTextureHeight, 0);
}

/** True if the object's front view covers (nearly) the whole wall face: it is converted to a wall. */
export function isFullViewObject(geometry, block) {
	const front = frontPerspective(block);
	if (!front)
		return false;
	const r = rectOf(front);
	return r.w >= geometry.face8.w * 0.95 && r.h >= geometry.face8.h * 0.9;
}

function toGraphic(amberstarGraphic) {
	const g = new Graphic(amberstarGraphic.width, amberstarGraphic.height, 0);
	g.Data.set(amberstarGraphic.data);
	return g;
}

function compound(frames) {
	const width = Math.max(...frames.map(f => f.Width));
	const height = Math.max(...frames.map(f => f.Height));
	const result = new Graphic(width * frames.length, height, 0);
	frames.forEach((f, i) => {
		// bottom aligned, horizontally centered (frames normally have the same size)
		const ox = i * width + Math.floor((width - f.Width) / 2), oy = height - f.Height;
		for (let y = 0; y < f.Height; y++)
			for (let x = 0; x < f.Width; x++)
				result.Data[ox + x + (oy + y) * result.Width] = f.Data[x + y * f.Width];
	});
	return { graphic: result, frameWidth: width, frameHeight: height };
}

/**
 * Scale factor for billboards. Amberstar draws an object at the near face of its tile (the bottom of an object
 * one step ahead is at the floor line of the wall face one step ahead), Ambermoon at the tile center which is
 * twice as far away. The factor brings the look from the party's usual positions close to the original without
 * making objects much too large when they are further away.
 */
export const BillboardScale = 1.5;
const ReferenceWallHeight = 341;
const BlockSize = 512;

/**
 * Billboard (or floor billboard) info for an object block. Returns null for empty blocks.
 * { graphic, frames, textureWidth, textureHeight, mappedWidth, mappedHeight, z, floor }
 */
export function createObjectTexture(geometry, block) {
	const front = frontPerspective(block);
	if (!front)
		return null;
	const { face8, face5 } = geometry;
	const r = rectOf(front);
	const floorNear = face8.y + face8.h, floorFar = face5.y + face5.h;
	const ceilNear = face8.y, ceilFar = face5.y;
	const flat = r.h < r.w * 0.5;

	if (flat && r.y >= floorFar)
		return createFlatObject(geometry, front, false);
	if (flat && r.y + r.h <= ceilFar + 3)
		return createFlatObject(geometry, front, true);

	const { graphic, frameWidth, frameHeight } = compound(front.frames.map(toGraphic));
	let mappedWidth = BlockSize * frameWidth / face8.w * BillboardScale;
	let mappedHeight = ReferenceWallHeight * frameHeight / face8.h * BillboardScale;
	const limit = Math.min(BlockSize / mappedWidth, ReferenceWallHeight / mappedHeight, 1);
	mappedWidth *= limit;
	mappedHeight *= limit;
	let z = 0;
	const bottom = r.y + r.h;
	if (r.y <= ceilNear + 2 && bottom < floorNear - face8.h / 4)
		z = ReferenceWallHeight - mappedHeight; // hanging from the ceiling
	else if (bottom < floorFar) // above the floor of the tile
		z = ReferenceWallHeight * (floorFar - bottom) / face5.h; // floating (measured at the far edge)
	z = Math.max(0, Math.min(ReferenceWallHeight - 1, z));
	return {
		graphic,
		frames: front.frames.length,
		textureWidth: frameWidth,
		textureHeight: frameHeight,
		mappedWidth: Math.max(1, Math.round(mappedWidth)),
		mappedHeight: Math.max(1, Math.round(mappedHeight)),
		z: Math.round(z),
		floor: false,
	};
}
/**
 * Objects lying on the floor (holes, puddles, piles) or attached to the ceiling become Ambermoon floor billboards
 * (flat, always facing the camera, top of the texture = far side). The Amberstar perspective is hand drawn and not
 * a real projection (flat objects are often drawn closer than their tile), so the depth can't be measured reliably.
 * Assumption: the objects have a square footprint. The front view is stretched vertically to a square texture.
 */
function createFlatObject(geometry, front, ceiling) {
	const { face8 } = geometry;
	const r = rectOf(front);
	const textureWidth = r.w;
	const textureHeight = r.w;
	const frames = front.frames.map(frame => {
		const g = new Graphic(textureWidth, textureHeight, 0);
		for (let v = 0; v < textureHeight; v++) {
			const fy = Math.min(frame.height - 1, Math.floor((v + 0.5) * frame.height / textureHeight));
			for (let u = 0; u < textureWidth; u++)
				g.Data[u + v * textureWidth] = frame.data[Math.min(frame.width - 1, u) + fy * frame.width];
		}
		return g;
	});
	const { graphic } = compound(frames);
	const size = Math.max(1, Math.round(Math.min(1, r.w / face8.w) * BlockSize));
	return {
		graphic,
		frames: frames.length,
		textureWidth,
		textureHeight,
		mappedWidth: size,
		mappedHeight: size,
		z: ceiling ? ReferenceWallHeight - 1 : 1,
		floor: true,
	};
}

/** Most frequent color of a part of a graphic (ignoring color 0 if possible). */
export function dominantColor(graphic, x0, y0, w, h) {
	const counts = new Array(32).fill(0);
	for (let y = Math.max(0, y0); y < Math.min(graphic.height, y0 + h); y++)
		for (let x = Math.max(0, x0); x < Math.min(graphic.width, x0 + w); x++)
			counts[graphic.data[x + y * graphic.width]]++;
	let best = 0;
	for (let i = 1; i < 32; i++)
		if (counts[i] > counts[best] || best === 0 && counts[i] > 0)
			best = i;
	return best;
}

/**
 * Floor or ceiling texture (64x64) from an Amberstar floor/ceiling background (a perspective image of 144 x n).
 * The part closest to the viewer (bottom of the floor image, top of the ceiling image) has the least perspective
 * distortion and the most detail. A 64 x 32 patch from its center is doubled in height (the rows are foreshortened
 * about 2:1 there) and the color 0 is made opaque.
 */
export function createFloorTexture(background, ceiling) {
	const size = FloorTextureSize;
	const result = new Graphic(size, size, 0);
	const rows = Math.min(size / 2, background.height);
	const x0 = Math.floor((background.width - size) / 2);
	const y0 = ceiling ? 0 : background.height - rows;
	for (let y = 0; y < size; y++) {
		const sy = y0 + Math.min(rows - 1, Math.floor(y * rows / size));
		for (let x = 0; x < size; x++) {
			const c = background.data[x0 + x + sy * background.width];
			result.Data[x + y * size] = c === 0 ? OpaqueBlackIndex : c;
		}
	}
	return result;
}

/**
 * Horizon graphic (Ambermoon lab background, 144x20) from the bottom of an outdoor ceiling (sky) image.
 * Sky pixels (color 11) become transparent so the sky gradient shows through.
 */
export function createHorizon(skyBackground) {
	const width = 144, height = 20;
	const result = new Graphic(width, height, 0);
	const y0 = skyBackground.height - height;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const c = skyBackground.data[Math.min(skyBackground.width - 1, x) + (y0 + y) * skyBackground.width];
			result.Data[x + y * width] = c === SkyColorIndex ? 0 : c === 0 ? OpaqueBlackIndex : c;
		}
	}
	return result;
}
