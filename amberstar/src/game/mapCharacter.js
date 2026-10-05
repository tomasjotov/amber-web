// Port of Amberstar.Game.Characters.MapCharacter.
import { MapCharacterWalkType } from '../data/enums.js';
import { directionOffset } from '../data/enums.js';
import { random } from './util.js';

export class MapCharacter {
	constructor(map, index, positions, state, canMoveChecker) {
		this.map = map;
		this.index = index;
		this.data = map.characters[index];
		this.positions = positions;
		this.canMoveChecker = canMoveChecker;
		this.currentPathLength = 0;
		this.direction = 0;
		this._position = { x: 0, y: 0 }; // 1-based
		this.#updatePosition(state);
	}

	get characterIndex() { return this.data.index; }
	get type() { return this.data.type; }
	get icon() { return this.data.icon; }
	get position() { return { x: this._position.x - 1, y: this._position.y - 1 }; }

	#updatePosition(state) {
		const tryWalkTo = p => {
			if (p && this.canMoveChecker(p.x - 1, p.y - 1, this.data.travelType))
				this._position = { ...p };
		};

		switch (this.data.walkType) {
			case MapCharacterWalkType.Stationary:
				this._position = { ...this.positions[0] };
				break;
			case MapCharacterWalkType.Path: {
				const totalSteps = state.hour * 12 + Math.floor(state.minute / 5);
				if (this._position.x === 0 && this._position.y === 0)
					this._position = { ...this.positions[totalSteps] };
				else
					tryWalkTo(this.positions[totalSteps]);
				break;
			}
			case MapCharacterWalkType.Chase:
				if (this._position.x === 0 && this._position.y === 0)
					this._position = { ...this.positions[0] };
				else
					this.#chase(state);
				break;
			default: // random
				if (this._position.x === 0 && this._position.y === 0)
					this._position = { ...this.positions[0] };
				else
					this.#moveRandomly();
				break;
		}
	}

	#setupNewRandomPath() {
		this.currentPathLength = random(1, 4);
		let dir = this.direction + 1;
		dir += random(0, 1);
		dir &= 3;
		this.direction = dir;
		const p = this._position;
		switch (this.direction) {
			case 0:
				if (this.currentPathLength <= p.y)
					this.currentPathLength += p.y - this.currentPathLength - 1;
				break;
			case 1:
				if (this.currentPathLength > this.map.width - p.x)
					this.currentPathLength += this.map.width - p.x - this.currentPathLength - 1;
				break;
			case 2:
				if (this.currentPathLength > this.map.height - p.y)
					this.currentPathLength += this.map.height - p.y - this.currentPathLength - 1;
				break;
			case 3:
				if (this.currentPathLength <= p.x)
					this.currentPathLength += p.x - this.currentPathLength - 1;
				break;
		}
	}

	#moveRandomly() {
		if (this.currentPathLength <= 0)
			this.#setupNewRandomPath();
		for (let i = 0; i < 4; i++) {
			const [ox, oy] = directionOffset(this.direction);
			const pos = this.position;
			if (this.canMoveChecker(pos.x + ox, pos.y + oy, this.data.travelType)) {
				this.currentPathLength--;
				this._position = { x: this._position.x + ox, y: this._position.y + oy };
				return;
			}
			this.#setupNewRandomPath();
		}
		this.currentPathLength = 0;
	}

	#chase(state) {
		// Move one field (also diagonally) closer to the party
		const target = state.partyPosition;
		const p = this.position;
		const dx = Math.sign(target.x - p.x), dy = Math.sign(target.y - p.y);
		if (dx === 0 && dy === 0)
			return;
		if (Math.max(Math.abs(target.x - p.x), Math.abs(target.y - p.y)) > 8)
			return; // too far away to notice the party
		for (const [ox, oy] of [[dx, dy], [dx, 0], [0, dy]]) {
			if ((ox || oy) && this.canMoveChecker(p.x + ox, p.y + oy, this.data.travelType)) {
				this._position = { x: this._position.x + ox, y: this._position.y + oy };
				return;
			}
		}
	}

	update(game) {
		this.#updatePosition(game.state);
	}
}
