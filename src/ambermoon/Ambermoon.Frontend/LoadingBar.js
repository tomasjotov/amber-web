// Port of Ambermoon.Frontend/LoadingBar.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Size, FloatSize } from '../Ambermoon.Common/Size.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';

export class LoadingBar {
	static textureAtlasManager = null;
	static GraphicOffset = 0;
	/** Func<int, Graphic> */
	static graphicsProvider = null;

	static Initialize(textureAtlasManager, graphicsProvider) {
		LoadingBar.graphicsProvider = graphicsProvider;

		if (LoadingBar.textureAtlasManager !== textureAtlasManager) {
			LoadingBar.textureAtlasManager = textureAtlasManager;

			textureAtlasManager.AddFromGraphics(Layer.Images, LoadingBar.GetGraphics(100));
		}
	}

	static GetGraphics(offset) {
		LoadingBar.GraphicOffset = offset;
		const gfxProvider = LoadingBar.graphicsProvider;

		const graphics = [
			gfxProvider(0),
			gfxProvider(1),
			gfxProvider(2),
			gfxProvider(3)
		];

		const result = new Map();
		graphics.forEach((gfx, index) => result.set(offset + index, gfx));
		return result;
	}

	constructor(renderView, sizeFactor, bottomDistFactor) {
		this.destroyed = false;
		this.midParts = [];
		this.progressParts = [];

		this.renderView = renderView;

		renderView.ShowImageLayerOnly = true;

		const area = new Rect(renderView.RenderScreenArea);
		const textureAtlas = LoadingBar.textureAtlasManager.GetOrCreate(Layer.Images);
		const layer = renderView.GetLayer(Layer.Images);

		const CreateSprite = (texSize, size, displayLayer, textureIndex) => {
			const sprite = renderView.SpriteFactory.Create(size.Width, size.Height, true, displayLayer);
			sprite.Visible = false;
			sprite.TextureSize = new Size(texSize.Width, texSize.Height);
			sprite.Layer = layer;
			sprite.TextureAtlasOffset = textureAtlas.GetOffset(LoadingBar.GraphicOffset + textureIndex);
			// Important for visibility check, otherwise the virtual screen is used!
			sprite.ClipArea = area;

			return sprite;
		};

		const desiredScreenPortion = area.Width * sizeFactor;
		const DefaultWidth = 116; // 100 for the percentage and 16 for the borders
		const scale = desiredScreenPortion / DefaultWidth;

		const leftTexSize = new Size(8, 14);
		const rightTexSize = new Size(7, 14);
		const midTexSize = new Size(4, 14);
		const colorTexSize = new Size(4, 6);
		// Size * float -> FloatSize (the JS Size.op_Multiply would return a Size for integral factors)
		const leftSize = FloatSize.op_Multiply(new FloatSize(leftTexSize), scale).ToSize();
		const rightSize = FloatSize.op_Multiply(new FloatSize(rightTexSize), scale).ToSize();
		const midSize = FloatSize.op_Multiply(new FloatSize(midTexSize), scale).ToSize();
		const colorSize = FloatSize.op_Multiply(new FloatSize(colorTexSize), scale).ToSize();
		let scaledWidth = Util.Round(DefaultWidth * scale);

		while ((scaledWidth - leftSize.Width - rightSize.Width) % midSize.Width !== 0)
			++scaledWidth;

		const midPartCount = Math.trunc((scaledWidth - leftSize.Width - rightSize.Width) / midSize.Width);
		const colorYOffset = Math.trunc((midSize.Height - colorSize.Height) / 2);
		let x = Math.trunc((area.Width - scaledWidth) / 2);
		const y = area.Height - Util.Round(area.Height * bottomDistFactor);

		this.left = CreateSprite(leftTexSize, leftSize, 0, 0);
		this.left.X = x;
		this.left.Y = y;
		this.left.Visible = true;

		x += this.left.Width;

		for (let i = 0; i < midPartCount; i++) {
			const midPart = CreateSprite(midTexSize, midSize, 0, 2);
			const color = CreateSprite(colorTexSize, colorSize, 10, 3);

			midPart.X = x;
			midPart.Y = y;
			midPart.Visible = true;
			color.X = x;
			color.Y = y + colorYOffset;

			x += midPart.Width;

			this.midParts.push(midPart);
			this.progressParts.push(color);
		}

		this.right = CreateSprite(rightTexSize, rightSize, 0, 1);
		this.right.X = x;
		this.right.Y = y;
		this.right.Visible = true;
	}

	SetProgress(progress) {
		progress = Util.Limit(0.0, progress, 1.0);

		const width = this.midParts.length * this.midParts[0].Width;
		const barWidth = Util.Round(progress * width);

		const colorWidth = this.progressParts[0].Width;
		const numVisibleColors = Util.Limit(0, Math.trunc((barWidth + Math.trunc(colorWidth / 2)) / colorWidth), this.progressParts.length);

		for (let i = 0; i < numVisibleColors; i++)
			this.progressParts[i].Visible = true;
	}

	Destroy() {
		if (this.destroyed)
			return;

		this.left.Delete();
		this.right.Delete();

		this.midParts.forEach(midPart => midPart.Delete());
		this.midParts.length = 0;

		this.progressParts.forEach(progressPart => progressPart.Delete());
		this.progressParts.length = 0;

		this.renderView.ShowImageLayerOnly = false;
		this.renderView.Close();

		this.destroyed = true;
	}

	Render() {
		this.renderView.Render(null);
	}
}
