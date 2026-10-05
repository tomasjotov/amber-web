// Port of Ambermoon.Data.Common/IIntroData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// IIntroTwinlakeImagePart, IIntroTextCommand and IIntroData are pure interfaces and therefore not ported.

export const IntroGraphic = Object.freeze({
	Frame: 0, // unknown
	MainMenuBackground: 1,
	Gemstone: 2,
	Illien: 3,
	Snakesign: 4,
	DestroyedGemstone: 5,
	DestroyedIllien: 6,
	DestroyedSnakesign: 7,
	ThalionLogo: 8,
	Ambermoon: 9,
	SunAnimation: 10,
	Lyramion: 11,
	Morag: 12,
	ForestMoon: 13,
	Meteor: 14,
	MeteorSparks: 15,
	CloudsLeft: 16,
	CloudsRight: 17,
	GlowingMeteor: 18,
	Twinlake: 19,
});

export const IntroText = Object.freeze({
	Gemstone: 0,
	Illien: 1,
	Snakesign: 2,
	Presents: 3,
	Twinlake: 4,
	Lyramion: 5,
	SeventyYears: 6,
	After: 7,
	Continue: 8,
	NewGame: 9,
	Intro: 10,
	Quit: 11
});

export const IntroTextCommandType = Object.freeze({
	Clear: 0,
	Add: 1,
	Render: 2,
	Wait: 3,
	SetTextColor: 4,
	ActivatePaletteFading: 5 // In original this activates palette fading which let's the meteor glow
});
