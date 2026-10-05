// Port of Ambermoon.Data.Common/IOutroData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// IOutroData is a pure interface and therefore not ported.

export const OutroCommand = Object.freeze({
	PrintTextAndScroll: 0,
	WaitForClick: 1,
	ChangePicture: 2
});

export const OutroOption = Object.freeze({
	/// <summary>
	/// Valdyn is inside the party when you leave the machine room.
	/// And you got the yellow sphere from the dying moranian.
	/// </summary>
	ValdynInPartyNoYellowSphere: 0,
	/// <summary>
	/// Valdyn is inside the party when you leave the machine room.
	/// And you did not get the yellow sphere from the dying moranian.
	/// </summary>
	ValdynInPartyWithYellowSphere: 1,
	/// <summary>
	/// Valdyn is not inside the party when you leave the machine room.
	/// </summary>
	ValdynNotInParty: 2
});

/**
 * Readonly struct with init properties.
 * C# `new OutroAction { Command = ..., ... }` -> `new OutroAction({ Command: ..., ... })`.
 */
export class OutroAction {
	constructor(init = null) {
		this.Command = 0;
		this.LargeText = false;
		this.ScrollAmount = 0;
		this.TextDisplayX = 0;
		/** int? */
		this.TextIndex = null;
		/** uint? */
		this.ImageOffset = null;

		if (init)
			Object.assign(this, init);
	}
}

/**
 * Readonly struct with init properties.
 * C# `new OutroGraphicInfo { GraphicIndex = ..., ... }` -> `new OutroGraphicInfo({ GraphicIndex: ..., ... })`.
 */
export class OutroGraphicInfo {
	constructor(init = null) {
		this.GraphicIndex = 0;
		this.Width = 0;
		this.Height = 0;
		this.PaletteIndex = 0;

		if (init)
			Object.assign(this, init);
	}
}
