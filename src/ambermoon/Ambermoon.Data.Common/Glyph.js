// Port of Ambermoon.Data.Common/Glyph.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class Glyph {
	constructor() {
		this.Advance = 0;
		/** Graphic */
		this.Graphic = null;
	}

	clone() {
		return Object.assign(new Glyph(), this);
	}
}
