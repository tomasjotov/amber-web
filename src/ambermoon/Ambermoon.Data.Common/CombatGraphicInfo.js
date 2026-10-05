// Port of Ambermoon.Data.Common/CombatGraphicInfo.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { GraphicInfo, GraphicFormat } from './Graphic.js';

export class CombatGraphicInfo {
	/** new CombatGraphicInfo() (default struct) or new CombatGraphicInfo(frames, width, height, palette = 18, ui = false) */
	constructor(frames, width, height, palette = 18, ui = false) {
		if (arguments.length === 0) {
			this.FrameCount = 0;
			this.GraphicInfo = new GraphicInfo();
			this.Palette = 0;
			return;
		}

		this.FrameCount = frames;
		this.GraphicInfo = new GraphicInfo();
		this.GraphicInfo.GraphicFormat = ui ? GraphicFormat.Palette3Bit : GraphicFormat.Palette5Bit;
		this.GraphicInfo.Width = width;
		this.GraphicInfo.Height = height;
		this.GraphicInfo.Alpha = true;
		this.GraphicInfo.PaletteOffset = ui ? 24 : 0;
		this.Palette = palette;
	}

	clone() {
		const clone = Object.assign(new CombatGraphicInfo(), this);
		clone.GraphicInfo = this.GraphicInfo.clone();
		return clone;
	}
}
