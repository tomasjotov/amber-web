// Port of Ambermoon.Core/Geometry/Geometry.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Geometry.cs - Geometry helpers

import { Position } from '../../Ambermoon.Common/Position.js';
import { Global } from '../UI/Global.js';
import { Misc } from '../Misc.js';

export class Geometry {
	/**
	 * Converts a block position (3D tile position) to a camera position.
	 * Returns [x, z] (out parameters).
	 */
	static BlockToCameraPosition(map, blockPosition) {
		const x = -blockPosition.X * Global.DistancePerBlock - 0.5 * Global.DistancePerBlock;
		const z = (map.Height - blockPosition.Y) * Global.DistancePerBlock - 0.5 * Global.DistancePerBlock;
		return [x, z];
	}

	/**
	 * Converts a camera position to a block position (3D tile position).
	 */
	static CameraToBlockPosition(map, x, z) {
		return new Position(Misc.Round((-x - 0.5 * Global.DistancePerBlock) / Global.DistancePerBlock),
			map.Height - Misc.Round((z + 0.5 * Global.DistancePerBlock) / Global.DistancePerBlock));
	}

	static CameraToTouchedBlockPositions(map, x, z, touchRadius) {
		const positions = [];

		const tileX = (-x - 0.5 * Global.DistancePerBlock) / Global.DistancePerBlock;
		const tileY = (z + 0.5 * Global.DistancePerBlock) / Global.DistancePerBlock;
		const mainTilePosition = new Position(Misc.Round(tileX), map.Height - Misc.Round(tileY));
		positions.push(mainTilePosition);

		for (let ty = Math.max(0, mainTilePosition.Y - 1); ty <= Math.min(map.Height - 1, mainTilePosition.Y + 1); ++ty) {
			for (let tx = Math.max(0, mainTilePosition.X - 1); tx <= Math.min(map.Width - 1, mainTilePosition.X + 1); ++tx) {
				if (tx === mainTilePosition.X && ty === mainTilePosition.Y)
					continue;

				if (Math.abs(tx - tileX) * Global.DistancePerBlock < touchRadius &&
					Math.abs(map.Height - ty - tileY) * Global.DistancePerBlock < touchRadius)
					positions.push(new Position(tx, ty));
			}
		}

		return positions;
	}

	/**
	 * Converts a camera position to a map position.
	 *
	 * Map positions start at the upper-left tile and use a specific size per tile.
	 * Returns [mapX, mapY] (out parameters).
	 */
	static CameraToMapPosition(map, x, z) {
		const mapX = -x;
		const mapY = map.Height * Global.DistancePerBlock - z;
		return [mapX, mapY];
	}

	/**
	 * Converts a camera position to a world position.
	 *
	 * World positions are map positions with Z = 0 at the bottom and Z > 0 at the top.
	 * Returns [mapX, mapY] (out parameters).
	 */
	static CameraToWorldPosition(map, x, z) {
		const mapX = -x;
		const mapY = z;
		return [mapX, mapY];
	}
}
