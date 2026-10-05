// Port of Ambermoon.Data.Common/IText.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Only the enum is ported; ITextNameProvider, ITextProcessor and IText are pure interfaces.

export const SpecialGlyph = Object.freeze({
	SoftSpace: 128, // expressed with a normal space character
	HardSpace: 129, // expressed with $
	NewLine: 130, // expressed with ^
	NoTrim: 131,
	FirstColor: 132 // everything >= this is a color from 0 to 31
});
