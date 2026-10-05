// Port of Ambermoon.Data.Common/IFantasyIntroData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// IFantasyIntroData is a pure interface and therefore not ported.

export const FantasyIntroCommand = Object.freeze({
	FadeIn: 0,
	MoveFairy: 1,
	PlayFairyAnimation: 2,
	AddWritingPart: 3,
	UpdateWritingSpark: 4,
	UpdateSparkLine: 5,
	UpdateSparkStar: 6,
	SetSparkLineColor: 7,
	SetSparkDotColor: 8,
	SetSparkStarFrame: 9,
	DrawSparkLine: 10,
	DrawSparkStar: 11,
	DrawSparkDot: 12,
	FadeOut: 13
});

/** Readonly struct with primary constructor (uint frames, FantasyIntroCommand command, params int[] parameters) */
export class FantasyIntroAction {
	constructor(frames = 0, command = 0, ...parameters) {
		// params int[]: also accept an explicitly passed array
		if (parameters.length === 1 && (Array.isArray(parameters[0]) || ArrayBuffer.isView(parameters[0])))
			parameters = parameters[0];

		this.Frames = frames;

		this.Command = command;

		this.Parameters = parameters;
	}
}

export const FantasyIntroGraphic = Object.freeze({
	/// <summary>
	/// Tiny stars falling the fairy and her wand.
	/// </summary>
	FairySparks: 0,
	/// <summary>
	/// Sprites of the fairy character.
	/// </summary>
	Fairy: 1,
	/// <summary>
	/// Background with a big blue Thalion logo in the center.
	/// The background is purple greyish and also contains small Thalion logos.
	/// </summary>
	Background: 2,
	/// <summary>
	/// 12 star frames (multiple color and sizes, each is 32x9 pixels in size).
	/// Each has the graphic (first 16 pixel block) and a mask (second 16 pixel block).
	/// The mask has color index 31 where colored pixels are and index 0 where only blackness is.
	/// </summary>
	WritingSparks: 3,
	/// <summary>
	/// The Fantasy writing.
	/// </summary>
	Writing: 4
});
