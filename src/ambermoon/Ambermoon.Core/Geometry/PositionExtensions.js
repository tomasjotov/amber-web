// Port of Ambermoon.Core/Geometry/PositionExtensions.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// PositionExtensions.cs - Extensions for positions

import { Direction } from '../../Ambermoon.Common/Direction.js';

let directions = null;

function getDirections() {
	if (directions === null) {
		directions = [
			Direction.UpLeft,
			Direction.Up,
			Direction.UpRight,
			Direction.Left,
			null,
			Direction.Right,
			Direction.DownLeft,
			Direction.Down,
			Direction.DownRight
		];
	}
	return directions;
}

export class PositionExtensions {
	/** Returns Direction or null */
	static GetDirectionTo(position, target) {
		let xOffset = 1;

		if (target.X > position.X) { // right
			xOffset = 2;
		} else if (target.X < position.X) { // left
			xOffset = 0;
		}

		let yOffset = 1;

		if (target.Y > position.Y) { // down
			yOffset = 2;
		} else if (target.Y < position.Y) { // up
			yOffset = 0;
		}

		return getDirections()[xOffset + yOffset * 3];
	}

	/** Overloads: (Position, Position) -> uint, (FloatPosition, FloatPosition) -> float. Same formula. */
	static GetMaxDistance(position, target) {
		return Math.max(Math.abs(target.X - position.X), Math.abs(target.Y - position.Y));
	}
}
