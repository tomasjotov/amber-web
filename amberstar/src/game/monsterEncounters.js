// Starts battles when monsters on the map reach the party (not part of the C# port).
import { MapCharacterType } from '../data/enums.js';

export class MonsterEncounters {
	constructor() {
		this.ignored = new Set();
	}

	reset() {
		this.ignored.clear();
	}

	/** Checks all monster characters of a screen and starts a battle if one is next to the party */
	check(game, map, characters, onChanged) {
		if (game.screenHandler.activeScreen?.map !== map && game.screenHandler.activeScreen?.characters !== characters)
			return false;
		const p = game.state.partyPosition;
		for (const c of characters) {
			if (c.type !== MapCharacterType.Monster || !game.state.isMapCharacterActive(map.index, 1 + c.index))
				continue;
			const cp = c.position;
			const near = Math.max(Math.abs(cp.x - p.x), Math.abs(cp.y - p.y)) <= 1;
			if (!near) {
				this.ignored.delete(c.index);
				continue;
			}
			if (this.ignored.has(c.index))
				continue;
			this.ignored.add(c.index);
			game.startBattle(c.characterIndex, victory => {
				if (victory) {
					game.state.setMapCharacterActive(map.index, 1 + c.index, false);
					onChanged?.();
				}
			});
			return true;
		}
		return false;
	}
}
