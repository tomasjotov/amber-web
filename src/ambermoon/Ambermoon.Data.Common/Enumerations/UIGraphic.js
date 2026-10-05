// Port of Ambermoon.Data.Common/Enumerations/UIGraphic.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const UIGraphic = Object.freeze({
	DisabledOverlay16x16: 0,
	FrameUpperLeft: 1,
	FrameLeft: 2,
	FrameLowerLeft: 3,
	FrameTop: 4,
	FrameBottom: 5,
	FrameUpperRight: 6,
	FrameRight: 7,
	FrameLowerRight: 8,
	StatusDead: 9,
	StatusAttack: 10,
	StatusDefend: 11,
	StatusUseMagic: 12,
	StatusFlee: 13,
	StatusMove: 14,
	StatusUseItem: 15,
	StatusHandStop: 16,
	StatusHandTake: 17,
	StatusLamed: 18,
	StatusPoisoned: 19,
	StatusPetrified: 20,
	StatusDiseased: 21,
	StatusAging: 22,
	StatusIrritated: 23,
	StatusCrazy: 24,
	StatusSleep: 25,
	StatusPanic: 26,
	StatusBlind: 27,
	StatusOverweight: 28,
	StatusDrugs: 29,
	StatusExhausted: 30,
	StatusRangeAttack: 31,
	Eagle: 32, // 32x29 (5-bit)
	DamageSplash: 33, // 32x26 (5-bit)
	Ouch: 34, // 32x23
	StarBlinkAnimation: 35, // 4 frames (16x9, 5-bit)
	PlusBlinkAnimation: 36, // 4 frames (16x10)
	LeftPortraitBorder: 37, // 16x36
	CharacterValueBarFrames: 38, // 16x36
	RightPortraitBorder: 39, // 16x36
	SmallBorder1: 40, // 16x1
	SmallBorder2: 41, // 16x1
	Candle: 42, // light buff icon (16x16)
	Shield: 43, // magic protection buff icon (16x16)
	Sword: 44, // magic attack buff icon (16x16)
	Star: 45, // anti-magic buff icon (16x16)
	Eye: 46, // clairvoyance buff icon (16x16)
	Map: 47, // mystic map buff icon (16x16)
	Windchain: 48, // 32x15
	MonsterEyeInactive: 49, // 32x32
	MonsterEyeActive: 50, // 32x32
	Night: 51, // 32x32
	Dusk: 52, // 32x32
	Day: 53, // 32x32
	Dawn: 54, // 32x32
	ButtonFrame: 55, // 32x17
	ButtonFramePressed: 56, // 32x17
	ButtonDisabledOverlay: 57, // 32x11 (1-bit)
	Compass: 58, // 32x32
	Attack: 59, // 16x9
	Defense: 60, // 16x9
	Skull: 61, // 32x34
	EmptyCharacterSlot: 62, // 32x34
	ItemConsume: 63, // 11 frames with 16x16 pixels
	Talisman: 64, // healer's golden symbol / talisman (32x29, 5-bit)
	Unused: 65, // seems to be unused in original code, 26 bytes
	BrokenItemOverlay: 66, // 16x16 (1-bit) is colored with color index 26
	CatSkull: 67 // Ambermoon Advanced only
});
