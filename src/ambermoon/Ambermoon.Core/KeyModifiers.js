// Port of Ambermoon.Core/KeyModifiers.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// [Flags]
export const KeyModifiers = Object.freeze({
	None: 0,
	Shift: 1 << 0,
	Control: 1 << 1,
	Alt: 1 << 2,
});
