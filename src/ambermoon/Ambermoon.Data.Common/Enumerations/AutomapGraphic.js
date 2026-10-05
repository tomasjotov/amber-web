// Port of Ambermoon.Data.Common/Enumerations/AutomapGraphic.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const AutomapGraphic = Object.freeze({
	// Note: All automap graphics use the second palette from the 3 executable palettes.
	// Note: Fill inner map area with AA7744 (index 6). Lines (like walls) are drawn with 663300 (index 7).
	// Note: All map border images use 3 bit palette format with palette index offset 0.
	// Note: The image data starts at offset 0x100. Before that there seem to be some
	// information data.
	MapUpperLeft: 0, // 32x32
	MapUpperRight: 1, // 32x32
	MapLowerLeft: 2, // 32x32
	MapLowerRight: 3, // 32x32
	MapBorderTop1: 4, // 16x32
	MapBorderTop2: 5, // 16x32
	MapBorderTop3: 6, // 16x32
	MapBorderTop4: 7, // 16x32
	MapBorderRight1: 8, // 32x32
	MapBorderRight2: 9, // 32x32
	MapBorderBottom1: 10, // 16x32
	MapBorderBottom2: 11, // 16x32
	MapBorderBottom3: 12, // 16x32
	MapBorderBottom4: 13, // 16x32
	MapBorderLeft1: 14, // 32x32
	MapBorderLeft2: 15, // 32x32
	// Note: All following automap graphics use the 5 bit palette format and have a size of 16x16 per frame.
	PinLowerHalf: 16,
	PinUpperHalf: 17,
	PinDirectionUp: 18,
	PinDirectionUpRight: 19,
	PinDirectionRight: 20,
	PinDirectionDownRight: 21,
	PinDirectionDown: 22,
	PinDirectionDownLeft: 23,
	PinDirectionLeft: 24,
	PinDirectionUpLeft: 25,
	Riddlemouth: 26, // 4 frames
	Teleport: 27, // 4 frames
	Spinner: 28, // 4 frames
	Trap: 29, // 4 frames (skull)
	TrapDoor: 30, // 4 frames (hole)
	Special: 31, // 4 frames (exclamation mark)
	Monster: 32, // 4 frames (red sphere)
	DoorClosed: 33, // 1 frame
	DoorOpen: 34, // 1 frame
	Merchant: 35, // 1 frame
	Inn: 36, // 1 frame
	ChestClosed: 37, // 1 frame
	Exit: 38, // 1 frame (X)
	ChestOpen: 39, // 1 frame
	Pile: 40, // 1 frame
	Person: 41, // 1 frame (green sphere)
	GotoPoint: 42 // 7 frames
});
