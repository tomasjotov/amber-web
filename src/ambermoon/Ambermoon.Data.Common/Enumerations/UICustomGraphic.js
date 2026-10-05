// Port of Ambermoon.Data.Common/Enumerations/UICustomGraphic.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const UICustomGraphic = Object.freeze({
	ScrollbarSmallVertical: 0, // chests, merchants, etc
	ScrollbarSmallVerticalHighlighted: 1,
	ScrollbarLargeVertical: 2, // inventory
	ScrollbarLargeVerticalHighlighted: 3,
	ScrollbarBackgroundSmallVertical: 4,
	ScrollbarSmallVerticalDisabled: 5,
	ScrollbarBackgroundLargeVertical: 6,
	ScrollbarLargeVerticalDisabled: 7,
	ItemSlotBackground: 8,
	ItemSlotDisabled: 9, // locked chests
	PortraitBackground: 10, // black to blue gradient
	PortraitBorder: 11, // thin 1-pixel border for top and bottom of portraits
	MapDisableOverlay: 12, // 320x144 (2D maps use 176x144, 3D maps use only 144x144, battle use 320x95)
	AmbermoonInfoBox: 13, // 128x19
	BiggerInfoBox: 14, // 144x40
	BattleFieldYellowBorder: 15,
	BattleFieldOrangeBorder: 16,
	BattleFieldGreenHighlight: 17,
	HealingStarAnimation: 18, // 7x7, 3 frames
	BattleFieldBlockedMovementCursor: 19, // Blinking red cross (14x11)
	ItemMagicAnimation: 20, // 16x16, 8 frames (some blinking stars)
	BrokenItemOverlay: 21, // 16x16
	AutomapWallFrames: 22, // 8x8, 16 frames
	FakeWallOverlay: 23 // 8x8
});
