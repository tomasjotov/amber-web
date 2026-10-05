// Port of Ambermoon.Core/Render/BattleAnimation.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Event } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { Global } from '../UI/Global.js';

const AnimationScaleType = Object.freeze({
	None: 0,
	XOnly: 1,
	YOnly: 2,
	Both: 3
});

const HorizontalAnchor = Object.freeze({
	Left: 0,
	Center: 1,
	Right: 2
});

const VerticalAnchor = Object.freeze({
	Top: 0,
	Center: 1,
	Bottom: 2
});

export class BattleAnimation {
	static AnimationScaleType = AnimationScaleType;
	static HorizontalAnchor = HorizontalAnchor;
	static VerticalAnchor = VerticalAnchor;

	constructor(sprite) {
		// Note: Positions are always center positions
		this.baseSpriteLocation = null;
		this.baseSpriteSize = null;
		this.sprite = null;
		this.textureFactor = 0;
		this.baseTextureCoords = null;
		this.startAnimationTicks = 0;
		this.ticksPerFrame = 0;
		this.frameIndices = null;
		this.scale = 1.0;
		this.endScale = 1.0;
		this.startScale = 1.0;
		this.endX = 0;
		this.endY = 0;
		this.startX = 0;
		this.startY = 0;
		this.wasVisible = false;
		this.AnchorX = HorizontalAnchor.Center;
		this.AnchorY = VerticalAnchor.Center;
		this.Finished = true;
		this.ScaleType = AnimationScaleType.Both;
		/** When scaling the center point is in relation to this reference scale. */
		this.ReferenceScale = 1.0;
		this.AnimationFinished = new Event();
		this.AnimationUpdated = new Event();

		this.baseSpriteLocation = new Position(sprite.X + Math.trunc(sprite.Width / 2), sprite.Y + Math.trunc(sprite.Height / 2));
		this.baseSpriteSize = new Size(sprite.Width, sprite.Height);
		this.sprite = sprite;
		this.textureFactor = sprite.Layer?.TextureFactor ?? 1;
		this.baseTextureCoords = new Position(sprite.TextureAtlasOffset);
		sprite.TextureSize ??= this.baseSpriteSize;
		this.Scale = 1.0;
		sprite.ClipArea ??= Global.CombatBackgroundArea;
		this.wasVisible = sprite.Visible;
	}

	/**
	 * Overloads:
	 * SetStartFrame(Position textureOffset, Size size, Position? centerPosition = null, float initialScale = 1.0f, bool mirrorX = false,
	 *     Size? customTextureSize = null, HorizontalAnchor anchorX = Center, VerticalAnchor anchorY = Center)
	 * SetStartFrame(Position? centerPosition, float initialScale = 1.0f)
	 */
	SetStartFrame(...args) {
		if (args[1] instanceof Size) {
			const [textureOffset, size, centerPosition = null, initialScale = 1.0, mirrorX = false, customTextureSize = null,
				anchorX = HorizontalAnchor.Center, anchorY = VerticalAnchor.Center] = args;
			if (centerPosition != null)
				this.baseSpriteLocation = new Position(centerPosition);
			this.baseSpriteSize = new Size(size);
			this.baseTextureCoords = new Position(textureOffset);
			this.sprite.TextureAtlasOffset = new Position(textureOffset);
			this.sprite.TextureSize = customTextureSize ?? this.baseSpriteSize;
			this.sprite.MirrorX = mirrorX;
			this.AnchorX = anchorX;
			this.AnchorY = anchorY;
			this.Scale = this.startScale = initialScale;
		} else {
			const [centerPosition = null, initialScale = 1.0] = args;
			if (centerPosition != null)
				this.baseSpriteLocation = new Position(centerPosition);

			this.Scale = this.startScale = initialScale;
		}
	}

	get Visible() {
		return this.sprite.Visible;
	}
	set Visible(value) {
		this.sprite.Visible = this.wasVisible = value;
	}

	set Position(value) {
		this.sprite.X = value.X;
		this.sprite.Y = value.Y;
	}

	get Scale() {
		return this.scale;
	}
	set Scale(value) {
		this.scale = value;

		const baseLocation = new Position(this.baseSpriteLocation);
		let refScaleX;
		switch (this.ScaleType) {
			case AnimationScaleType.None: refScaleX = 1.0; break;
			case AnimationScaleType.YOnly: refScaleX = 1.0; break;
			default: refScaleX = this.ReferenceScale; break;
		}
		let refScaleY;
		switch (this.ScaleType) {
			case AnimationScaleType.None: refScaleY = 1.0; break;
			case AnimationScaleType.XOnly: refScaleY = 1.0; break;
			default: refScaleY = this.ReferenceScale; break;
		}
		const baseSize = new Size(Util.Round(refScaleX * this.baseSpriteSize.Width), Util.Round(refScaleY * this.baseSpriteSize.Height));

		let newWidth;
		switch (this.ScaleType) {
			case AnimationScaleType.None: newWidth = this.sprite.Width; break;
			case AnimationScaleType.YOnly: newWidth = this.sprite.Width; break;
			default: newWidth = Util.Round(this.baseSpriteSize.Width * this.scale); break;
		}
		let newHeight;
		switch (this.ScaleType) {
			case AnimationScaleType.None: newHeight = this.sprite.Height; break;
			case AnimationScaleType.XOnly: newHeight = this.sprite.Height; break;
			default: newHeight = Util.Round(this.baseSpriteSize.Height * this.scale); break;
		}
		let newX;
		switch (this.AnchorX) {
			case HorizontalAnchor.Left: newX = baseLocation.X - Math.trunc(baseSize.Width / 2); break;
			case HorizontalAnchor.Right: newX = baseLocation.X + Math.trunc(baseSize.Width / 2) - newWidth; break;
			default: newX = baseLocation.X - Math.trunc(newWidth / 2); break;
		}
		let newY;
		switch (this.AnchorY) {
			case VerticalAnchor.Top: newY = baseLocation.Y - Math.trunc(baseSize.Height / 2); break;
			case VerticalAnchor.Bottom: newY = baseLocation.Y + Math.trunc(baseSize.Height / 2) - newHeight; break;
			default: newY = baseLocation.Y - Math.trunc(newHeight / 2); break;
		}
		this.Position = new Position(newX, newY);
		this.sprite.Resize(newWidth, newHeight);
	}

	Destroy() {
		this.sprite?.Delete();
	}

	Play(frameIndices, ticksPerFrame, ticks, endPosition = null, endScale = null) {
		this.Finished = false;
		this.frameIndices = frameIndices;
		this.ticksPerFrame = Math.max(1, ticksPerFrame);
		this.startScale = this.scale;
		this.endScale = endScale ?? this.startScale;
		this.startX = this.baseSpriteLocation.X;
		this.startY = this.baseSpriteLocation.Y;
		this.endX = endPosition?.X ?? this.startX;
		this.endY = endPosition?.Y ?? this.startY;
		this.startAnimationTicks = ticks;
	}

	PlayWithoutAnimating(durationInTicks, ticks, endPosition = null, endScale = null) {
		this.Play([0], durationInTicks, ticks, endPosition, endScale);
	}

	Reset(frame = 0) {
		this.sprite.TextureAtlasOffset = Position.op_Addition(this.baseTextureCoords, new Position(frame * this.baseSpriteSize.Width * this.textureFactor, 0));
		this.Finished = true;
	}

	Update(ticks) {
		if (this.ticksPerFrame === 0) {
			this.Finished = true;
			this.AnimationFinished.invoke();
			return !this.Finished;
		}

		if (ticks < this.startAnimationTicks) {
			this.sprite.Visible = false;
			return true;
		} else if (!this.sprite.Visible && this.wasVisible) {
			this.sprite.Visible = true;
		}

		const elapsed = ticks - this.startAnimationTicks;
		const frame = Math.trunc(elapsed / this.ticksPerFrame);

		if (frame >= this.frameIndices.length) {
			this.baseSpriteLocation.X = this.endX;
			this.baseSpriteLocation.Y = this.endY;
			this.Scale = this.endScale; // Note: scale will also set the new position
			this.Finished = true;
			this.AnimationFinished.invoke();
			return !this.Finished;
		}

		const animationTime = this.frameIndices.length * this.ticksPerFrame;
		const factor = Math.fround(elapsed / animationTime);
		this.baseSpriteLocation.X = this.startX + Util.Round((this.endX - this.startX) * factor);
		this.baseSpriteLocation.Y = this.startY + Util.Round((this.endY - this.startY) * factor);
		this.Scale = this.startScale + (this.endScale - this.startScale) * factor; // Note: scale will also set the new position
		this.sprite.TextureAtlasOffset = Position.op_Addition(this.baseTextureCoords, new Position(this.frameIndices[frame] * this.sprite.TextureSize.Width * this.textureFactor, 0));
		this.AnimationUpdated.invoke(factor);

		return true;
	}

	SetDisplayLayer(displayLayer) {
		this.sprite.DisplayLayer = displayLayer;
	}
}

export {
	AnimationScaleType as BattleAnimation_AnimationScaleType,
	HorizontalAnchor as BattleAnimation_HorizontalAnchor,
	VerticalAnchor as BattleAnimation_VerticalAnchor
};
