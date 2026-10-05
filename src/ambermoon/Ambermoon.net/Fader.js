// Port of Ambermoon.net/Fader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { toByte } from '../../runtime.js';
import { Color } from '../Ambermoon.Core/Render/Color.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { Util } from '../Ambermoon.Common/Util.js';

export class Fader {
	constructor(renderView, startAlpha, endAlpha, displayLayer, destroyWhenFinished,
		initialVisible = false, baseColor = null) {
		this.startTime = null;
		this.reverse = false;
		this.duration = 1000;
		this.DestroyWhenFinished = false;
		this.HasFinished = false;
		/** event Action Finished (single handler, see AttachFinishEvent) */
		this.Finished = null;

		this.startAlpha = startAlpha;
		this.endAlpha = endAlpha;
		this.baseColor = baseColor ?? Color.Black;
		this.coloredRect = renderView.ColoredRectFactory.Create(320, 256,
			this.baseColor, displayLayer);
		this.coloredRect.Layer = renderView.GetLayer(Layer.MainMenuEffects);
		this.coloredRect.X = 0;
		this.coloredRect.Y = 0;
		this.coloredRect.Visible = initialVisible;
		this.DestroyWhenFinished = destroyWhenFinished;
	}

	AttachFinishEvent(handler) {
		this.Finished = () => {
			this.Finished = null;
			handler?.();
		};
	}

	DetachFinishEvent() {
		this.Finished = null;
	}

	Destroy() {
		this.coloredRect?.Delete();
		this.coloredRect = null;
	}

	SetColor(color) {
		if (this.coloredRect != null)
			this.coloredRect.Color = color;
	}

	Start(durationInMs, reverse = false) {
		// Note: The original passes the field 'duration' here (not durationInMs).
		this.StartAt(Date.now(), this.duration, reverse);
	}

	StartAt(startTime, durationInMs, reverse = false) {
		this.HasFinished = false;
		this.reverse = reverse;
		this.startTime = startTime;
		this.duration = durationInMs;
	}

	Update() {
		if (this.coloredRect == null || this.startTime == null || this.startTime > Date.now())
			return;

		const elapsed = Date.now() - this.startTime;

		if (elapsed >= this.duration) {
			if (this.DestroyWhenFinished)
				this.Destroy();
			else
				this.coloredRect.Color = new Color(this.baseColor, this.reverse ? this.startAlpha : this.endAlpha);
			this.startTime = null;
			this.HasFinished = true;
			this.Finished?.();
		} else {
			const factor = elapsed / this.duration;
			let alpha;

			if (this.reverse) {
				const diff = factor * (this.startAlpha - this.endAlpha);
				alpha = this.endAlpha + diff;
			} else {
				const diff = factor * (this.endAlpha - this.startAlpha);
				alpha = this.startAlpha + diff;
			}

			this.coloredRect.Color = new Color(this.baseColor, toByte(Util.Round(alpha)));
		}
	}
}
