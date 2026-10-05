// Port of Ambermoon.Data.Legacy/FontProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Font } from './Font.js';

export class FontProvider {
	constructor(executableData) {
		this.executableData = executableData;
	}

	GetFont() {
		return new Font(this.executableData.Glyphs, this.executableData.DigitGlyphs);
	}
}
