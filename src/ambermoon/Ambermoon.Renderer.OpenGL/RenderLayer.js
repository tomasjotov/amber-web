// Port of Ambermoon.Renderer.OpenGL/RenderLayer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// RenderLayer.cs - Render layer (one per Layer value) and its factory

import { getValue, enumName } from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { LayerConfig } from './LayerConfig.js';
import { RenderBuffer } from './RenderBuffer.js';
import { Texture } from './Texture.js';
import { Fow } from './Fow.js';
import { Surface3D } from './Surface3D.js';

function config(values) {
	return new LayerConfig(values);
}

export class RenderLayer {
	static DefaultLayerConfigs = new Map([
		[Layer.Map3DBackground, config({
			BaseZ: 0.00,
			EnableBlending: false,
			SupportAnimations: false,
			SupportColoredRects: true,
			Opaque: true
		})],
		[Layer.Map3DBackgroundFog, config({
			BaseZ: 0.00,
			EnableBlending: true,
			SupportAnimations: false,
			SupportColoredRects: true,
			Opaque: false
		})],
		[Layer.Map3DCeiling, config({
			Layered: false,
			BaseZ: 0.00,
			EnableBlending: false
		})],
		[Layer.Map3D, config({
			Layered: false,
			BaseZ: 0.00,
			EnableBlending: false
		})],
		[Layer.Billboards3D, config({
			Layered: false,
			BaseZ: 0.00,
			EnableBlending: false
		})],
		[Layer.MapBackground1, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground2, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground3, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground4, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground5, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground6, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground7, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground8, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground9, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.MapBackground10, config({
			Layered: false,
			BaseZ: 0.01,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.Characters, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground1, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground2, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground3, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground4, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground5, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground6, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground7, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground8, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground9, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.MapForeground10, config({
			Layered: false,
			BaseZ: 0.31,
			EnableBlending: false
		})],
		[Layer.FOW, config({
			// Note: this uses neither colored rects
			// nor textured sprites. Have a look at IFow.
			BaseZ: 0.31,
			EnableBlending: true,
			SupportAnimations: false,
			SupportTextures: false
		})],
		[Layer.CombatBackground, config({
			BaseZ: 0.61,
			EnableBlending: false,
			SupportAnimations: false,
			Opaque: true
		})],
		[Layer.BattleMonsterRow, config({
			BaseZ: 0.62,
			EnableBlending: false
		})],
		[Layer.BattleEffects, config({
			BaseZ: 0.62,
			EnableBlending: false
		})],
		[Layer.UI, config({
			BaseZ: 0.70,
			EnableBlending: false,
			SupportColoredRects: true
		})],
		[Layer.Items, config({
			BaseZ: 0.70,
			EnableBlending: false
		})],
		[Layer.Text, config({
			BaseZ: 0.70,
			EnableBlending: false
		})],
		[Layer.SubPixelText, config({
			BaseZ: 0.70,
			EnableBlending: false
		})],
		[Layer.SmallDigits, config({
			BaseZ: 0.70,
			EnableBlending: false
		})],
		[Layer.MobileOverlays, config({
			BaseZ: 0.70,
			EnableBlending: true,
			SupportColoredRects: true
		})],
		[Layer.MainMenuGraphics, config({
			BaseZ: 0.70,
			SupportPaletteFading: true
		})],
		[Layer.MainMenuText, config({
			BaseZ: 0.70
		})],
		[Layer.MainMenuEffects, config({
			BaseZ: 0.70,
			EnableBlending: true,
			SupportColoredRects: true
		})],
		[Layer.IntroGraphics, config({
			BaseZ: 0.70,
			EnableBlending: true,
			SupportColoredRects: true,
			Use320x256: true
		})],
		[Layer.IntroText, config({
			BaseZ: 0.70,
			EnableBlending: true,
			Use320x256: true
		})],
		[Layer.IntroEffects, config({
			BaseZ: 0.70,
			EnableBlending: true,
			SupportColoredRects: true,
			SupportTextures: false,
			Use320x256: true
		})],
		[Layer.OutroGraphics, config({
			BaseZ: 0.70,
			EnableBlending: false,
			Opaque: true
		})],
		[Layer.OutroText, config({
			BaseZ: 0.70,
			EnableBlending: true
		})],
		[Layer.FantasyIntroGraphics, config({
			BaseZ: 0.70,
			Use320x256: true
		})],
		[Layer.FantasyIntroEffects, config({
			BaseZ: 0.70,
			EnableBlending: true,
			SupportColoredRects: true,
			SupportTextures: false,
			Use320x256: true
		})],
		[Layer.Misc, config({
			BaseZ: 0.70,
			EnableBlending: true,
			SupportColoredRects: true
		})],
		[Layer.Images, config({
			BaseZ: 0.70,
			EnableBlending: true,
			RenderToVirtualScreen: false
		})],
		[Layer.Effects, config({
			BaseZ: 0.97,
			EnableBlending: true,
			SupportColoredRects: true,
			SupportTextures: false
		})],
		[Layer.Cursor, config({
			BaseZ: 0.98,
			EnableBlending: false
		})],
		[Layer.DrugEffect, config({
			BaseZ: 0.99,
			EnableBlending: true,
			SupportColoredRects: true,
			SupportTextures: false
		})]
	]);

	constructor(state, layer, texture, palette) {
		if (layer === Layer.None)
			throw new AmbermoonException(ExceptionScope.Application, 'Layer.None should never be used.');

		this.Layer = Layer.None;
		this.Visible = false;
		this.PositionTransformation = null;
		this.SizeTransformation = null;
		this.Texture = null;
		this.Config = null;
		this.RenderBuffer = null;
		this.state = null;
		this.renderBufferColorRects = null;
		this.renderBufferSemiTransparent = null;
		this.renderBufferSemiTransparentFactory = null;
		this.palette = null;
		this.disposed = false;

		this.state = state;
		this.Config = getValue(RenderLayer.DefaultLayerConfigs, layer).clone();
		const supportAnimations = this.Config.SupportAnimations;
		const layered = this.Config.Layered;
		const opaque = this.Config.Opaque;

		this.RenderBuffer = new RenderBuffer(state,
			/* is3D: */ layer === Layer.Map3DCeiling || layer === Layer.Map3D || layer === Layer.Billboards3D,
			supportAnimations, layered,
			/* noTexture: */ !this.Config.SupportTextures,
			/* isBillboard: */ layer === Layer.Billboards3D,
			/* isText: */ layer === Layer.Text || layer === Layer.SmallDigits || layer === Layer.SubPixelText,
			opaque,
			/* fow: */ layer === Layer.FOW,
			/* sky: */ layer === Layer.Map3DBackground,
			/* texturesWithAlpha: */ layer === Layer.Misc || layer === Layer.OutroText || layer === Layer.IntroText || layer === Layer.IntroGraphics,
			/* imageWithoutPalette: */ layer === Layer.Images || layer === Layer.MobileOverlays,
			this.Config.TextureFactor,
			/* fading: */ this.Config.SupportPaletteFading,
			/* subPixel: */ layer === Layer.SubPixelText);

		this.renderBufferSemiTransparentFactory = () =>
			new RenderBuffer(state, false, supportAnimations, layered, false, false, false, opaque, layer === Layer.FOW,
				layer === Layer.Map3DBackground, layer === Layer.Misc || layer === Layer.OutroText || layer === Layer.IntroText || layer === Layer.IntroGraphics,
				layer === Layer.Images || layer === Layer.MobileOverlays, this.Config.TextureFactor, this.Config.SupportPaletteFading, layer === Layer.SubPixelText);

		if (this.Config.SupportColoredRects)
			this.renderBufferColorRects = new RenderBuffer(state, false, false, true, true);

		this.Layer = layer;
		this.Texture = texture;
		this.palette = palette;
	}

	get TextureFactor() { return this.Config.TextureFactor; }

	UsePalette(use) {
		if (this.Config.UsePalette === use || !this.Config.SupportTextures || this.Layer === Layer.Images || this.Layer === Layer.MobileOverlays)
			return;

		this.Config = this.Config.With({ UsePalette: use });
	}

	SetTextureFactor(factor) {
		if (this.Config.TextureFactor === factor || !this.Config.SupportTextures || this.Layer === Layer.Images || this.Layer === Layer.MobileOverlays)
			return;

		this.Config = this.Config.With({ TextureFactor: factor });
		this.RenderBuffer.SetTextureFactor(factor);
	}

	/** Binds the layer texture to unit 0 and the palette to unit 1 (code shared by all textured layers). */
	bindTextures(shader, texture, usePalette) {
		const gl = this.state.Gl;

		shader.SetSampler(0); // we use texture unit 0 -> see Gl.ActiveTexture below
		gl.activeTexture(gl.TEXTURE0);
		texture.Bind();

		if (usePalette && this.palette != null) {
			shader.SetPalette(1);
			gl.activeTexture(gl.TEXTURE1);
			this.palette.Bind();
		}

		shader.SetAtlasSize(this.Texture.Width, this.Texture.Height);
	}

	Render() {
		if (!this.Visible)
			return;

		const state = this.state;
		const gl = state.Gl;
		const Config = this.Config;

		if (this.Layer === Layer.FOW) {
			const fowShader = this.RenderBuffer.FowShader;

			fowShader.UpdateMatrices(state);
			fowShader.SetZ(Config.BaseZ);
		} else {
			if (this.renderBufferColorRects != null) {
				this.EnsureCorrectRenderOrder(this.renderBufferColorRects);

				const colorShader = this.renderBufferColorRects.ColorShader;

				colorShader.UpdateMatrices(state);
				colorShader.SetZ(Config.BaseZ);

				this.renderBufferColorRects.Render();
			}

			if (this.Texture != null) {
				if (!(this.Texture instanceof Texture))
					throw new AmbermoonException(ExceptionScope.Render, 'Invalid texture for this renderer.');

				const texture = this.Texture;
				const layer = this.Layer;

				if (layer === Layer.Map3D || layer === Layer.Map3DCeiling) {
					const shader = this.RenderBuffer.Texture3DShader;

					shader.UsePalette(Config.UsePalette);
					shader.SetPaletteCount(this.palette.Height);
					shader.UpdateMatrices(state);

					this.bindTextures(shader, texture, true);
				} else if (layer === Layer.Billboards3D) {
					const shader = this.RenderBuffer.Billboard3DShader;

					shader.UsePalette(Config.UsePalette);
					shader.SetPaletteCount(this.palette.Height);
					shader.UpdateMatrices(state);

					this.bindTextures(shader, texture, true);
				} else if (layer === Layer.Text || layer === Layer.SmallDigits) {
					const shader = this.RenderBuffer.TextShader;

					shader.UsePalette(Config.UsePalette);
					shader.SetPaletteCount(this.palette.Height);
					shader.UpdateMatrices(state);

					this.bindTextures(shader, texture, true);
					shader.SetZ(Config.BaseZ);
				} else if (layer === Layer.SubPixelText) {
					const shader = this.RenderBuffer.SubPixelTextShader;

					shader.UsePalette(Config.UsePalette);
					shader.SetPaletteCount(this.palette.Height);
					shader.UpdateMatrices(state);

					this.bindTextures(shader, texture, true);
					shader.SetZ(Config.BaseZ);
				} else if (layer === Layer.Images || layer === Layer.MobileOverlays) {
					const shader = this.RenderBuffer.ImageShader;

					shader.UpdateMatrices(state);

					this.bindTextures(shader, texture, false);
					shader.SetZ(Config.BaseZ);
				} else {
					const special = layer === Layer.Misc || layer === Layer.OutroText || layer === Layer.IntroText || layer === Layer.IntroGraphics;
					const sky = layer === Layer.Map3DBackground;
					const shader =
						Config.SupportPaletteFading
							? this.RenderBuffer.FadingTextureShader
							: special
								? this.RenderBuffer.AlphaTextureShader
								: sky
									? this.RenderBuffer.SkyShader
									: this.RenderBuffer.Opaque
										? this.RenderBuffer.OpaqueTextureShader
										: this.RenderBuffer.TextureShader;

					shader.UsePalette(Config.UsePalette);
					shader.SetPaletteCount(this.palette.Height);
					shader.UpdateMatrices(state);

					this.bindTextures(shader, texture, true);
					shader.SetZ(Config.BaseZ);
				}
			}
		}

		this.RenderBuffer?.Render();

		if (this.renderBufferSemiTransparent != null) {
			this.EnsureCorrectRenderOrder(this.renderBufferSemiTransparent);

			gl.depthMask(false);
			this.renderBufferSemiTransparent.Render();
			gl.depthMask(true);
		}
	}

	/**
	 * GetDrawIndex(sprite, textColorIndex = null), GetDrawIndex(surface) or GetDrawIndex(fow)
	 */
	GetDrawIndex(node, textColorIndex = null) {
		if (node instanceof Surface3D)
			return this.RenderBuffer.GetDrawIndex(node);

		if (node instanceof Fow)
			return this.RenderBuffer.GetDrawIndex(node, this.PositionTransformation, this.SizeTransformation);

		return this.RenderBuffer.GetDrawIndex(node, this.PositionTransformation,
			this.SizeTransformation, textColorIndex);
	}

	GetDrawIndexWithAlpha(sprite) {
		this.renderBufferSemiTransparent ??= this.renderBufferSemiTransparentFactory();

		return this.renderBufferSemiTransparent.GetDrawIndex(sprite, this.PositionTransformation,
			this.SizeTransformation);
	}

	FreeDrawIndex(index) {
		this.RenderBuffer.FreeDrawIndex(index);
	}

	FreeDrawIndexWithAlpha(index) {
		this.renderBufferSemiTransparent?.FreeDrawIndex(index);
	}

	/**
	 * UpdatePosition(index, sprite), UpdatePosition(index, surface) or UpdatePosition(index, fow)
	 */
	UpdatePosition(index, node) {
		if (node instanceof Surface3D) {
			this.RenderBuffer.UpdatePosition(index, node);
			return;
		}

		// ISprite and IFow both have a BaseLineOffset
		this.RenderBuffer.UpdatePosition(index, node, node.BaseLineOffset, this.PositionTransformation, this.SizeTransformation);
	}

	UpdatePositionWithAlpha(index, sprite) {
		this.renderBufferSemiTransparent.UpdatePosition(index, sprite, sprite.BaseLineOffset, this.PositionTransformation, this.SizeTransformation);
	}

	/**
	 * UpdateTextureAtlasOffset(index, sprite) or UpdateTextureAtlasOffset(index, surface)
	 */
	UpdateTextureAtlasOffset(index, node) {
		this.RenderBuffer.UpdateTextureAtlasOffset(index, node);
	}

	UpdateTextureAtlasOffsetWithAlpha(index, sprite) {
		this.renderBufferSemiTransparent.UpdateTextureAtlasOffset(index, sprite);
	}

	UpdateMaskColor(index, maskColor) {
		this.RenderBuffer.UpdateMaskColor(index, maskColor);
	}

	UpdateMaskColorWithAlpha(index, maskColor) {
		this.renderBufferSemiTransparent.UpdateMaskColor(index, maskColor);
	}

	UpdateDisplayLayer(index, displayLayer) {
		this.RenderBuffer.UpdateDisplayLayer(index, displayLayer);
	}

	UpdateAlpha(index, alpha) {
		let renderBuffer = this.RenderBuffer;

		if (alpha > 0 && alpha < 255)
			renderBuffer = this.renderBufferSemiTransparent;

		renderBuffer.UpdateAlpha(index, alpha);
	}

	UpdateExtrude(index, extrude) {
		this.RenderBuffer.UpdateExtrude(index, extrude);
	}

	UpdatePaletteIndex(index, paletteIndex) {
		this.RenderBuffer.UpdatePaletteIndex(index, paletteIndex);
	}

	UpdatePaletteIndexWithAlpha(index, paletteIndex) {
		this.renderBufferSemiTransparent.UpdatePaletteIndex(index, paletteIndex);
	}

	UpdateTextColorIndex(index, textColorIndex) {
		this.RenderBuffer.UpdateTextColorIndex(index, textColorIndex);
	}

	UpdateFOWCenter(index, center) {
		this.RenderBuffer.UpdateCenter(index, center, this.PositionTransformation);
	}

	UpdateFOWRadius(index, radius) {
		this.RenderBuffer.UpdateRadius(index, radius);
	}

	GetColoredRectDrawIndex(coloredRect) {
		return this.renderBufferColorRects.GetDrawIndex(coloredRect, this.PositionTransformation, this.SizeTransformation);
	}

	FreeColoredRectDrawIndex(index) {
		this.renderBufferColorRects.FreeDrawIndex(index);
	}

	UpdateColoredRectPosition(index, coloredRect) {
		this.renderBufferColorRects.UpdatePosition(index, coloredRect, 0, this.PositionTransformation, this.SizeTransformation);
	}

	UpdateColoredRectColor(index, color) {
		this.renderBufferColorRects.UpdateColor(index, color);
	}

	UpdateColoredRectDisplayLayer(index, displayLayer) {
		this.renderBufferColorRects.UpdateDisplayLayer(index, displayLayer);
	}

	EnsureCorrectRenderOrder(renderBuffer) {
		if (!this.Config.EnableBlending)
			return; // No need for it

		renderBuffer.EnsureCorrectRenderOrder();
	}

	Dispose() {
		if (!this.disposed) {
			this.RenderBuffer?.Dispose();
			this.renderBufferColorRects?.Dispose();
			this.renderBufferSemiTransparent?.Dispose();
			if (this.Texture instanceof Texture)
				this.Texture?.Dispose();
			this.Visible = false;

			this.disposed = true;
		}
	}
}

export class RenderLayerFactory {
	constructor(state) {
		this.State = state;
	}

	Create(layer, texture, palette) {
		if (texture != null && !(texture instanceof Texture))
			throw new AmbermoonException(ExceptionScope.Render, 'The given texture is not valid for this renderer.');
		if (palette != null && !(palette instanceof Texture))
			throw new AmbermoonException(ExceptionScope.Render, 'The given palette is not valid for this renderer.');

		if (layer === Layer.None)
			throw new AmbermoonException(ExceptionScope.Render, `Cannot create render layer for layer ${enumName(Layer, layer)}`);

		return new RenderLayer(this.State, layer, texture, palette);
	}
}
