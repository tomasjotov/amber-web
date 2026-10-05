// Port of Ambermoon.Data.Common/ILightEffectProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ILightEffectProvider itself is a pure interface.

export class SkyPart {
	constructor() {
		this.Y = 0;
		this.Height = 0;
		this.Color = 0;
	}
}

export class PaletteReplacement {
	constructor() {
		this.ColorData = new Uint8Array(16 * 4);
	}
}

export class PaletteFading {
	constructor() {
		this.SourcePalette = 0;
		this.DestinationPalette = 0;
		this.SourceFactor = 0.0;
	}
}
