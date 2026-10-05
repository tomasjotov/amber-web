// Port of Ambermoon.Data.Common/Render/Character2DAnimationInfo.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

/** Struct (namespace Ambermoon.Render) */
export class Character2DAnimationInfo {
	constructor() {
		this.FrameWidth = 0;
		this.FrameHeight = 0;
		this.StandFrameIndex = 0;
		this.SitFrameIndex = 0;
		this.SleepFrameIndex = 0;
		this.NumStandFrames = 0;
		this.NumSitFrames = 0;
		this.NumSleepFrames = 0;
		this.TicksPerFrame = 0;
		this.NoDirections = false;
		this.IgnoreTileType = false;
		this.UseTopSprite = false;
	}

	clone() {
		return Object.assign(new Character2DAnimationInfo(), this);
	}
}
