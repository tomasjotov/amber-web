// Port of Ambermoon.Core/MouseButtons.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// [Flags]
export const MouseButtons = Object.freeze({
	None: 0,
	Left: 1 << 0,
	Right: 1 << 1,
	Middle: 1 << 2,
});
