// Port of Ambermoon.Data.Common/CombatBackgroundInfo.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class CombatBackgroundInfo {
	constructor() {
		this.GraphicIndex = 0;
		/**
		 * 3 palettes for daylight (07:00-18:59),
		 * twilight (05:00-06:59, 19:00-20:59)
		 * and night (21:00-04:59) in that order.
		 */
		this.Palettes = null;
	}

	clone() {
		return Object.assign(new CombatBackgroundInfo(), this);
	}
}
