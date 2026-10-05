// Port of Ambermoon.Data.Common/Enumerations/Color.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const Color = Object.freeze({
	Black: 0,
	Beige: 1,
	White: 2,
	BrightBlue: 3,
	LightBlue: 4,
	Blue: 5,
	DarkerBlue: 6,
	DarkBlue: 7,
	BrightBrown: 8,
	LightBrown: 9,
	Brown: 10,
	DarkerBrown: 11,
	DarkBrown: 12,
	VeryDarkBrown: 13,
	DarkYellow: 14,
	Yellow: 15,
	LightYellow: 16,
	LightOrange: 17,
	Orange: 18,
	Pink: 19,
	Red: 20,
	LightRed: 21,
	LightGreen: 22,
	Green: 23,
	DarkGreen: 24,
	Purple: 25,
	VeryDarkGray: 26,
	DarkGray: 27,
	DarkerGray: 28,
	Gray: 29,
	LightGray: 30,
	BrightGray: 31,
	ActivePartyMember: 16, // = LightYellow
	PartyMember: 20, // = Red
	DeadPartyMember: 4, // = LightBlue
	BattlePlayer: 2, // = White
	BattleMonster: 21, // = LightRed
	Dark: 0, // = Black
	Bright: 31, // = BrightGray
	Disabled: 28, // = DarkerGray
	MonsterInfoHeader: 29 // = Gray
});

const textAnimationColors = [
	Color.LightRed,
	Color.LightYellow,
	Color.White,
	Color.LightYellow,
	Color.LightRed,
	Color.Red
];
const textBlinkColors = [
	Color.White,
	Color.LightBlue,
	Color.Blue,
	Color.DarkerBlue,
	Color.DarkBlue,
	Color.DarkerBlue,
	Color.Blue,
	Color.LightBlue,
	Color.White,
	Color.White
];

export class TextColors {
	static get TextAnimationColors() { return textAnimationColors; }
	static get TextBlinkColors() { return textBlinkColors; }
}
