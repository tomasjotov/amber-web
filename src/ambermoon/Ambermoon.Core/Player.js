// Port of Ambermoon.Core/Player.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Player.cs - Basic player information

import { Position } from '../Ambermoon.Common/Position.js';
import { CharacterDirection } from '../Ambermoon.Common/Direction.js';
import { PlayerMovementAbility } from './PlayerMovementAbility.js';

export class Player {
	constructor() {
		/**
		 * On world maps this is the total coordinate.
		 * On all other 2D or 3D maps this is the map coordinate.
		 * The position is given in tiles.
		 */
		this.Position = new Position(0, 0);
		this.Direction = CharacterDirection.Down;
		this.MovementAbility = PlayerMovementAbility.NoMovement;
	}
}
