// Port of Ambermoon.Common/Direction.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { enumName } from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from './Exception.js';

export const Direction = Object.freeze({
	Up: 0,
	UpRight: 1,
	Right: 2,
	DownRight: 3,
	Down: 4,
	DownLeft: 5,
	Left: 6,
	UpLeft: 7
});

export const CharacterDirection = Object.freeze({
	Up: 0,
	Right: 1,
	Down: 2,
	Left: 3,
	Random: 4,
	Keep: 4 // = Random
});

export class DirectionExtensions {
	static ToDirection(characterDirection) {
		switch (characterDirection) {
			case CharacterDirection.Up: return Direction.Up;
			case CharacterDirection.Right: return Direction.Right;
			case CharacterDirection.Down: return Direction.Down;
			case CharacterDirection.Left: return Direction.Left;
			default:
				throw new AmbermoonException(ExceptionScope.Application, `Character direction ${enumName(CharacterDirection, characterDirection)} can not be converted to a general direction.`);
		}
	}

	static ToAngle(characterDirection) {
		switch (characterDirection) {
			case CharacterDirection.Up: return 0;
			case CharacterDirection.Right: return 90;
			case CharacterDirection.Down: return 180;
			case CharacterDirection.Left: return 270;
			default:
				throw new AmbermoonException(ExceptionScope.Application, `Character direction ${enumName(CharacterDirection, characterDirection)} can not be converted to an angle.`);
		}
	}
}
