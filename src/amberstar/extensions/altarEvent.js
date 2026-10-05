// The custom map event of the Amberstar altar (see altar.js). It is not an Ambermoon event type: the engine executes
// it in the default case of EventExtensions.ExecuteEvent through ExecuteCustom.
import { Event } from '../../ambermoon/Ambermoon.Data.Common/Event.js';

export const AmberstarAltarEventType = 0x80;

export class AmberstarAltarEvent extends Event {
	constructor() {
		super();
		this.Type = AmberstarAltarEventType;
		/** map text index of the altar message (shown without the 13 pieces) */
		this.TextIndex = 0;
	}

	/** Called by EventExtensions.ExecuteEvent for unknown event types. Returns false if not executed. */
	ExecuteCustom(game, map, trigger, x, y) {
		const altar = game.renderView.GameData?.AmberstarExtensions?.altar;
		return altar ? altar.Trigger(game, map, trigger, x, y, this) : false;
	}

	toString() {
		return `Amberstar altar: Text ${this.TextIndex}`;
	}
}
