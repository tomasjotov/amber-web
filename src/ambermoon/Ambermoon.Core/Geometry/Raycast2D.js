// Port of Ambermoon.Core/Geometry/Raycast2D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Raycast2D.cs - 2D raycasting

import { RenderMap2D } from '../Render/RenderMap2D.js';

export class Raycast2D {
	/**
	 * Tests if a cast ray collisions with the map environment.
	 * The collision check is represented by a passed collision tester.
	 * Returns true if a collision was detected, otherwise false.
	 * The positions must be given in tiles.
	 * This method is optimized for 1x2 tile characters and will only
	 * work correctly with them (e.g. 2D indoor maps).
	 */
	static TestRay(map, startX, startY, endX, endY, collisionTester) {
		if (Math.abs(endX - startX) >= RenderMap2D.NUM_VISIBLE_TILES_X * RenderMap2D.TILE_WIDTH ||
			Math.abs(endY - startY) >= RenderMap2D.NUM_VISIBLE_TILES_Y * RenderMap2D.TILE_HEIGHT)
			return true; // As we use this to check sight we handle an out-off-screen distance as "collision" -> "sight blocking".

		if (startX === endX) {
			if (Math.abs(endY - startY) < 2)
				return false;

			if (startY > endY)
				[startY, endY] = [endY, startY];

			const distInTiles = endY - startY;

			for (let y = 1; y < distInTiles; ++y) {
				if (collisionTester(map.Tiles[startX][startY + y]))
					return true;
			}

			return false;
		} else if (startY === endY) {
			// Note: The characters in y-direction are 2 tiles height so we test two rows for sight.

			if (startX > endX)
				[startX, endX] = [endX, startX];

			const distInTiles = endX - startX;
			let upperCollision = false;
			let lowerCollision = false;

			for (let x = 1; x < distInTiles; ++x) {
				if (!upperCollision && collisionTester(map.Tiles[startX + x][startY]))
					upperCollision = true;
				if (!lowerCollision && collisionTester(map.Tiles[startX + x][startY + 1]))
					lowerCollision = true;

				if (upperCollision && lowerCollision)
					return true;
			}

			return false;
		} else {
			// x and y differ
			const distX = Math.abs(endX - startX);
			const distY = Math.abs(endY - startY);
			const sweep = distY > distX;
			let tileWidth = RenderMap2D.TILE_WIDTH;
			let tileHeight = RenderMap2D.TILE_HEIGHT;

			if (sweep) {
				[startX, startY] = [startY, startX];
				[endX, endY] = [endY, endX];
				[tileWidth, tileHeight] = [tileHeight, tileWidth];
			}

			if (startX > endX) {
				[startX, endX] = [endX, startX];
				[startY, endY] = [endY, startY];
			}

			// Note: m = dy/dx
			const deltaX = endX - startX;
			const deltaY = endY - startY;
			const range = sweep ? deltaX - 1 : deltaX; // eslint-disable-line no-unused-vars

			for (let x = 1; x < deltaX; ++x) {
				// f(x) = startY - m*x
				const startYInPixel = startY * tileHeight + (sweep ? tileWidth : tileHeight);
				const xOffset = sweep ? Math.trunc(tileWidth / 2) : 0;
				const fx = startYInPixel + Math.trunc(deltaY * (xOffset + x * tileWidth) / deltaX);
				const onEdge = fx % tileHeight === 0;
				const tileY = Math.trunc(fx / tileHeight);
				const tileX = startX + x;

				if (collisionTester(map.Tiles[sweep ? tileY : tileX][sweep ? tileX : tileY])) {
					if (!onEdge || collisionTester(map.Tiles[sweep ? tileY - 1 : tileX][sweep ? tileX : tileY - 1]))
						return true;
				}
			}

			return false;
		}
	}
}
