// Port of Ambermoon.Data.Legacy/Font.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { IndexOutOfRangeException } from '../../runtime.js';

export class Font {
	constructor(glyphs, digitGlyphs) {
		this.glyphs = glyphs;
		this.digitGlyphs = digitGlyphs;
	}

	get GlyphCount() { return this.glyphs.Entries.length; }

	get GlyphHeight() { return 7; }

	GetGlyphGraphic(glyphIndex) {
		if (glyphIndex > 93)
			throw new IndexOutOfRangeException(`Glyph index ${glyphIndex} is out of range. Should be in the range of 0 to 93.`);

		return this.glyphs.Entries[glyphIndex];
	}

	GetDigitGlyphGraphic(glyphIndex) {
		if (glyphIndex > 9)
			throw new IndexOutOfRangeException(`Digit glyph index ${glyphIndex} is out of range. Should be in the range of 0 to 9.`);

		return this.digitGlyphs.Entries[glyphIndex];
	}
}
