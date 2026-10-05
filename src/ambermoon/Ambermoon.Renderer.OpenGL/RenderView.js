// Port of Ambermoon.Renderer.OpenGL/RenderView.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// RenderView.cs - The render view (IRenderView / IGameRenderView implementation for WebGL2)
//
// Construction (see the C# constructors, Silk.NET windowing is replaced by a context provider object):
//
//   const contextProvider = { gl: canvas.getContext('webgl2', {...}), canvas, Identifier: 'main' };
//   // or CreateContextProvider(canvas) from ./IContextProvider.js
//
//   const useFrameBuffer = { value: true };      // C# ref bool (a plain boolean is accepted as well)
//   const useEffectFrameBuffer = { value: true }; // C# ref bool
//
//   const renderView = new GameRenderView(contextProvider, gameData, graphicInfoProvider, fontProvider, textProcessor,
//       () => textureAtlasManager, canvas.width, canvas.height, new Size(cssWidth, cssHeight),
//       useFrameBuffer, useEffectFrameBuffer,
//       () => ({ Key: graphicFilter, Value: graphicFilterOverlay }), // Func<KeyValuePair<int, int>> ({ Key, Value } or [key, value])
//       () => effects,                                // Func<int>
//       additionalPalettes,                           // Graphic[] (may be empty)
//       DeviceType.Desktop, SizingPolicy.FitRatio, OrientationPolicy.Support180DegreeRotation);
//
//   // after construction useFrameBuffer.value / useEffectFrameBuffer.value are false if the frame buffers are not available
//   renderView.Render(null); // each frame (FloatPosition viewportOffset or null)
//
// RenderView (without game data) is constructed the same way with
//   new RenderView(contextProvider, paletteProvider, textureAtlasManagerProvider, framebufferWidth, framebufferHeight, windowSize,
//       useFrameBuffer, useEffectFrameBuffer, screenBufferModeProvider, effectProvider, additionalPalettes,
//       cameraProvider = null, deviceType, sizingPolicy, orientationPolicy)

import { getValue, enumValues, enumName, ArgumentException, InvalidOperationException, Event } from '../../runtime.js';
import { Position, FloatPosition } from '../Ambermoon.Common/Position.js';
import { Size, FloatSize } from '../Ambermoon.Common/Size.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { Misc } from '../Ambermoon.Core/Misc.js';
import { Global } from '../Ambermoon.Core/UI/Global.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { WindowMode } from '../Ambermoon.Core/Render/IRenderView.js';
import { TextureAtlasManager } from '../Ambermoon.Core/Render/TextureAtlasManager.js';
import { State } from './State.js';
import { Context } from './Context.js';
import { FrameBuffer } from './FrameBuffer.js';
import { ScreenShader } from './ScreenShader.js';
import { EffectShader } from './EffectShader.js';
import { ScreenRenderBuffer } from './ScreenRenderBuffer.js';
import { RenderLayer, RenderLayerFactory } from './RenderLayer.js';
import { SpriteFactory } from './Sprite.js';
import { ColoredRectFactory } from './ColoredRect.js';
import { TextureAtlasBuilderFactory } from './TextureAtlas.js';
import { Matrix4 } from './Matrix.js';
import { Camera3D } from './Camera3D.js';
import { Surface3DFactory } from './Surface3D.js';
import { RenderTextFactory } from './RenderText.js';
import { FowFactory } from './Fow.js';
import { DeviceType, SizingPolicy, Orientation, OrientationPolicy, Rotation } from './Enums.js';

/** file class DummyPaletteProvider : IPaletteProvider */
class DummyPaletteProvider {
	constructor() {
		this.Palettes = new Map();
	}
}

/** C# ref bool parameter: either a boolean or a box { value: boolean } */
function readRef(ref) {
	return (ref != null && typeof ref === 'object') ? !!ref.value : !!ref;
}

function writeRef(ref, value) {
	if (ref != null && typeof ref === 'object')
		ref.value = value;
}

/** KeyValuePair<int, int> from the screen buffer mode provider: [key, value] array or { Key, Value } */
function keyValue(pair) {
	if (pair == null)
		return [0, 0];
	if (Array.isArray(pair))
		return [pair[0] ?? 0, pair[1] ?? 0];
	return [pair.Key ?? 0, pair.Value ?? 0];
}

export class RenderView extends RenderLayerFactory {
	constructor(contextProvider, paletteProvider, textureAtlasManagerProvider,
		framebufferWidth, framebufferHeight, windowSize, useFrameBuffer, useEffectFrameBuffer,
		screenBufferModeProvider, effectProvider, additionalPalettes,
		cameraProvider = null,
		deviceType = DeviceType.Desktop, sizingPolicy = SizingPolicy.FitRatio,
		orientationPolicy = OrientationPolicy.Support180DegreeRotation) {
		super(new State(contextProvider));

		this.screenshotDataHandler = null;
		this.disposed = false;
		this.context = null;
		this.useFrameBuffer = false;
		this.frameBuffer = null;
		this.screenShader = null;
		this.screenBuffer = null;
		this.useEffectFrameBuffer = false;
		this.effectFrameBuffer = null;
		this.effectShader = null;
		this.effectBuffer = null;
		this.camera3D = null;
		this.frameBufferWindowPixelRatio = 1.0;
		// Area inside the window where the rendering happens.
		// Note that this area is in screen coordinates and not
		// necessarily in pixels!
		this.renderDisplayArea = null;
		// The content size of the window in screen coordinates (not pixels!)
		this.windowSize = null;
		// The size of the framebuffer in pixels
		this.frameBufferSize = null;
		// This is the total size of the framebuffer in pixels.
		// It includes black areas if the aspect ratio of the
		// framebuffer does not match the aspect ratio of the
		// virtual screen.
		this.renderScreenArea = null;
		this.sizingPolicy = SizingPolicy.FitRatio;
		this.orientationPolicy = OrientationPolicy.Support180DegreeRotation;
		this.deviceType = DeviceType.Desktop;
		this.rotation = Rotation.None;
		this.layers = new Map(); // SortedDictionary<Layer, RenderLayer> (sorted on iteration)
		this.spriteFactory = null;
		this.coloredRectFactory = null;
		this.windowMode = WindowMode.Normal;
		this.sizeFactorX = 1.0;
		this.sizeFactorY = 1.0;
		this.screenBufferModeProvider = null;
		this.effectProvider = null;
		this.accessViolationDetected = false;

		this.Closed = new Event();
		this.Click = new Event();
		this.DoubleClick = new Event();
		this.Drag = new Event();
		this.KeyPress = new Event();
		this.SystemKeyPress = new Event();
		this.StopDrag = new Event();

		/** FullscreenRequestHandler: (windowMode) => bool */
		this.FullscreenRequestHandler = null;
		this.IsLandscapeRatio = true;
		this.ShowImageLayerOnly = false;
		this.DrugColorComponent = null;

		paletteProvider ??= new DummyPaletteProvider();
		this.frameBufferSize = new Size(framebufferWidth, framebufferHeight);
		this.renderDisplayArea = new Rect(new Position(0, 0), windowSize);
		this.renderScreenArea = new Rect(FloatPosition.op_Multiply(this.frameBufferWindowPixelRatio, this.renderDisplayArea.Position).Round(), this.frameBufferSize);
		this.windowSize = new Size(windowSize);
		this.sizingPolicy = sizingPolicy;
		this.orientationPolicy = orientationPolicy;
		this.deviceType = deviceType;
		this.camera3D = cameraProvider?.(this.State) ?? null;
		this.IsLandscapeRatio = framebufferWidth > framebufferHeight;

		this.context = new Context(this.State, framebufferWidth, framebufferHeight, 1.0);
		this.Resize(framebufferWidth, framebufferHeight);

		// factories
		const visibleArea = new Rect(0, 0, Global.VirtualScreenWidth, Global.VirtualScreenHeight);
		this.spriteFactory = new SpriteFactory(visibleArea);
		this.coloredRectFactory = new ColoredRectFactory(visibleArea);

		this.screenBufferModeProvider = screenBufferModeProvider;
		this.effectProvider = effectProvider;

		const factoryAndConverter = new TextureAtlasBuilderFactory(this.State);
		TextureAtlasManager.RegisterFactory(factoryAndConverter);
		TextureAtlasManager.RegisterConverter(factoryAndConverter);

		const textureAtlasManager = textureAtlasManagerProvider();
		const palette = TextureAtlasManager.CreatePalette(paletteProvider, ...(additionalPalettes ?? []));

		const Set320x256View = (renderLayer) => {
			// To keep the aspect ration of 16:10 we use a virtual screen of 409,6 x 256.
			// All positions are in this screen even though position values will only be
			// in the range 320 x 256. There will be a black border left and right.
			// The factor 200/256 is used to transform all positions. All X coordinates
			// are increased by (409,6 - 320) / 2 (44.8) to center the display. But this
			// values has to be factored by 200/256 as well and will become exactly 35.
			const factorY = 200.0 / 256.0;
			const factorX = factorY;// factorY * (1.0f + 0.4f / 410.0f);

			renderLayer.PositionTransformation = (position) =>
				new FloatPosition(35.0 + position.X * factorX, position.Y * factorY);
			renderLayer.SizeTransformation = (size) =>
				new FloatSize(size.Width * factorX, size.Height * factorY);
		};

		for (const layer of enumValues(Layer)) {
			if (layer === Layer.None)
				continue;

			try {
				const texture = textureAtlasManager.GetOrCreate(layer)?.Texture ?? null;
				const renderLayer = this.Create(layer, texture, palette);

				if (layer !== Layer.Map3DBackground && layer !== Layer.Map3DBackgroundFog && layer !== Layer.Map3DCeiling && layer !== Layer.Map3D && layer !== Layer.Billboards3D)
					renderLayer.Visible = true;

				if (getValue(RenderLayer.DefaultLayerConfigs, layer).Use320x256)
					Set320x256View(renderLayer);
				else if (layer === Layer.SubPixelText) {
					renderLayer.PositionTransformation = (position) => FloatPosition.op_Multiply(0.1, position);
					renderLayer.SizeTransformation = (size) => FloatSize.op_Multiply(0.1, size);
				}

				this.AddLayer(renderLayer);
			} catch (ex) {
				throw new AmbermoonException(ExceptionScope.Render, `Unable to create layer '${enumName(Layer, layer)}': ${ex?.message ?? ex}`);
			}
		}

		try {
			this.frameBuffer = new FrameBuffer(this.State);
			this.screenShader = ScreenShader.Create(this.State);
			this.screenBuffer = new ScreenRenderBuffer(this.State, this.screenShader);
			this.useFrameBuffer = readRef(useFrameBuffer);
		} catch {
			this.frameBuffer?.Dispose();
			this.frameBuffer = null;
			this.screenShader = null;
			this.screenBuffer?.Dispose();
			this.screenBuffer = null;
			writeRef(useFrameBuffer, false);
		}

		try {
			this.effectFrameBuffer = new FrameBuffer(this.State);
			this.effectShader = EffectShader.Create(this.State);
			this.effectBuffer = new ScreenRenderBuffer(this.State, this.effectShader);
			this.useEffectFrameBuffer = readRef(useEffectFrameBuffer);
		} catch {
			this.effectFrameBuffer?.Dispose();
			this.effectFrameBuffer = null;
			this.effectShader = null;
			this.effectBuffer?.Dispose();
			this.effectBuffer = null;
			writeRef(useEffectFrameBuffer, false);
		}
	}

	get RenderFactorX() { return this.frameBufferSize.Width / Global.VirtualScreenWidth; }
	get RenderFactorY() { return this.frameBufferSize.Height / Global.VirtualScreenHeight; }
	get WindowFactorX() { return this.renderDisplayArea.Width / Global.VirtualScreenWidth; }
	get WindowFactorY() { return this.renderDisplayArea.Height / Global.VirtualScreenHeight; }

	// The rendering area in pixels
	get RenderScreenArea() { return new Rect(this.renderScreenArea); }
	get SpriteFactory() { return this.spriteFactory; }
	get ColoredRectFactory() { return this.coloredRectFactory; }

	// #region Coordinate transformations

	get PositionTransformation() {
		return (position) => new FloatPosition(position.X * this.RenderFactorX, position.Y * this.RenderFactorY);
	}

	get SizeTransformation() {
		return (size) => new FloatSize(size.Width * this.RenderFactorX, size.Height * this.RenderFactorY);
	}

	// #endregion

	get AllowFramebuffer() { return this.frameBuffer != null; }
	get AllowEffects() { return this.effectFrameBuffer != null; }

	UsePalette(layer, use) {
		getValue(this.layers, layer)?.UsePalette(use);
	}

	SetTextureFactor(layer, factor) {
		getValue(this.layers, layer)?.SetTextureFactor(factor);
	}

	Close() {
		this.Dispose();

		this.Closed.invoke(this, null);
	}

	TryUseFrameBuffer() {
		if (this.AllowFramebuffer) {
			this.useFrameBuffer = true;
			return true;
		}

		this.useFrameBuffer = false;
		return false;
	}

	TryUseEffects() {
		if (this.AllowEffects) {
			this.useEffectFrameBuffer = true;
			return true;
		}

		this.useEffectFrameBuffer = false;
		return false;
	}

	get WindowMode() {
		return this.windowMode;
	}

	set WindowMode(value) {
		if (this.windowMode === value || this.FullscreenRequestHandler == null)
			return;

		if (this.FullscreenRequestHandler(this.windowMode))
			this.windowMode = value;
	}

	SetRotation(orientation) {
		const deviceType = this.deviceType;
		const sizingPolicy = this.sizingPolicy;
		const orientationPolicy = this.orientationPolicy;

		if (deviceType === DeviceType.Desktop ||
			sizingPolicy === SizingPolicy.FitRatioKeepOrientation ||
			sizingPolicy === SizingPolicy.FitWindowKeepOrientation) {
			this.rotation = Rotation.None;
			return;
		}

		if (orientation === Orientation.Default)
			orientation = (deviceType === DeviceType.MobilePortrait) ? Orientation.PortraitTopDown : Orientation.LandscapeLeftRight;

		if (sizingPolicy === SizingPolicy.FitRatioForcePortrait ||
			sizingPolicy === SizingPolicy.FitWindowForcePortrait) {
			if (orientation === Orientation.LandscapeLeftRight)
				orientation = Orientation.PortraitTopDown;
			else if (orientation === Orientation.LandscapeRightLeft)
				orientation = Orientation.PortraitBottomUp;
		} else if (sizingPolicy === SizingPolicy.FitRatioForceLandscape ||
			sizingPolicy === SizingPolicy.FitWindowForceLandscape) {
			if (orientation === Orientation.PortraitTopDown)
				orientation = Orientation.LandscapeLeftRight;
			else if (orientation === Orientation.PortraitBottomUp)
				orientation = Orientation.LandscapeRightLeft;
		}

		switch (orientation) {
			case Orientation.PortraitTopDown:
				if (deviceType === DeviceType.MobilePortrait)
					this.rotation = Rotation.None;
				else
					this.rotation = Rotation.Deg90;
				break;
			case Orientation.LandscapeLeftRight:
				if (deviceType === DeviceType.MobilePortrait)
					this.rotation = Rotation.Deg270;
				else
					this.rotation = Rotation.None;
				break;
			case Orientation.PortraitBottomUp:
				if (deviceType === DeviceType.MobilePortrait) {
					if (orientationPolicy === OrientationPolicy.Support180DegreeRotation)
						this.rotation = Rotation.Deg180;
					else
						this.rotation = Rotation.None;
				} else {
					if (orientationPolicy === OrientationPolicy.Support180DegreeRotation)
						this.rotation = Rotation.Deg270;
					else
						this.rotation = Rotation.Deg90;
				}
				break;
			case Orientation.LandscapeRightLeft:
				if (deviceType === DeviceType.MobilePortrait) {
					if (orientationPolicy === OrientationPolicy.Support180DegreeRotation)
						this.rotation = Rotation.Deg270;
					else
						this.rotation = Rotation.Deg90;
				} else {
					if (orientationPolicy === OrientationPolicy.Support180DegreeRotation)
						this.rotation = Rotation.Deg180;
					else
						this.rotation = Rotation.None;
				}
				break;
		}
	}

	/**
	 * Resize(width, height, windowWidth = null, windowHeight = null) (IRenderView)
	 * or the internal overload Resize(width, height, orientation) (called with exactly 3 arguments).
	 */
	Resize(width, height, windowWidthOrOrientation = null, windowHeight = null) {
		if (arguments.length === 3 && windowWidthOrOrientation != null) {
			this.ResizeWithOrientation(width, height, windowWidthOrOrientation);
			return;
		}

		const windowWidth = windowWidthOrOrientation;

		if (windowWidth != null)
			this.windowSize.Width = windowWidth;
		if (windowHeight != null)
			this.windowSize.Height = windowHeight;

		switch (this.deviceType) {
			default:
			case DeviceType.Desktop:
			case DeviceType.MobileLandscape:
				this.ResizeWithOrientation(width, height, Orientation.LandscapeLeftRight);
				break;
			case DeviceType.MobilePortrait:
				this.ResizeWithOrientation(width, height, Orientation.PortraitTopDown);
				break;
		}

		this.context.Resize(this.frameBufferSize.Width, this.frameBufferSize.Height, null);
	}

	/** C# overload Resize(int width, int height, Orientation orientation) */
	ResizeWithOrientation(width, height, orientation) {
		const frameBufferSize = this.frameBufferSize;
		const windowSize = this.windowSize;

		frameBufferSize.Width = width;
		frameBufferSize.Height = height;
		this.frameBufferWindowPixelRatio = Math.fround(frameBufferSize.Width / windowSize.Width);

		this.SetRotation(orientation);

		if (this.sizingPolicy === SizingPolicy.FitWindow ||
			this.sizingPolicy === SizingPolicy.FitWindowKeepOrientation ||
			this.sizingPolicy === SizingPolicy.FitWindowForcePortrait ||
			this.sizingPolicy === SizingPolicy.FitWindowForceLandscape) {
			this.renderDisplayArea = new Rect(0, 0, width, height);

			this.sizeFactorX = 1.0;
			this.sizeFactorY = 1.0;
		} else {
			const windowRatio = Math.fround(width / height);
			let virtualRatio = Math.fround(Global.VirtualAspectRatio);

			if (this.rotation === Rotation.Deg90 || this.rotation === Rotation.Deg270)
				virtualRatio = Math.fround(1.0 / virtualRatio);

			if (Misc.FloatEqual(windowRatio, virtualRatio)) {
				this.renderDisplayArea = new Rect(0, 0, windowSize.Width, windowSize.Height);
			} else if (windowRatio < virtualRatio) {
				const newHeight = Misc.Round(windowSize.Width / virtualRatio);
				this.renderDisplayArea = new Rect(0, Math.trunc((windowSize.Height - newHeight) / 2), windowSize.Width, newHeight);

				const newFrameBufferHeight = Misc.Round(frameBufferSize.Width / virtualRatio);
				frameBufferSize.Height = newFrameBufferHeight;
			} else { // windowRatio > virtualRatio
				const newWidth = Misc.Round(windowSize.Height * virtualRatio);
				this.renderDisplayArea = new Rect(Math.trunc((windowSize.Width - newWidth) / 2), 0, newWidth, windowSize.Height);

				const newFrameBufferWidth = Misc.Round(frameBufferSize.Height * virtualRatio);
				frameBufferSize.Width = newFrameBufferWidth;
			}

			if (this.rotation === Rotation.Deg90 || this.rotation === Rotation.Deg270) {
				this.sizeFactorX = frameBufferSize.Height / this.renderDisplayArea.Width;
				this.sizeFactorY = frameBufferSize.Width / this.renderDisplayArea.Height;
			} else {
				this.sizeFactorX = frameBufferSize.Width / this.renderDisplayArea.Width;
				this.sizeFactorY = frameBufferSize.Height / this.renderDisplayArea.Height;
			}
		}

		this.renderScreenArea = new Rect(FloatPosition.op_Multiply(this.frameBufferWindowPixelRatio, this.renderDisplayArea.Position).Round(), frameBufferSize);

		this.State.Gl.viewport(this.renderScreenArea.X, this.renderScreenArea.Y, this.renderScreenArea.Width, this.renderScreenArea.Height);
	}

	/**
	 * dataHandler: (width, height, rgbData: Uint8Array) => void
	 * The data is RGB (3 bytes per pixel), rows bottom-up like glReadPixels.
	 */
	TakeScreenshot(dataHandler) {
		if (this.screenshotDataHandler == null)
			this.screenshotDataHandler = dataHandler;
	}

	AddLayer(layer) {
		if (!(layer instanceof RenderLayer))
			throw new InvalidOperationException('The given layer is not valid for this renderer.'); // InvalidCastException

		if (this.layers.has(layer.Layer))
			throw new ArgumentException('An item with the same key has already been added.');

		this.layers.set(layer.Layer, layer);
	}

	GetLayer(layer) {
		return getValue(this.layers, layer);
	}

	ShowLayer(layer, show) {
		getValue(this.layers, layer).Visible = show;
	}

	BindEffectBuffer(viewOffset) {
		this.effectFrameBuffer.Bind(this.frameBufferSize.Width, this.frameBufferSize.Height);
		const viewport = this.RenderScreenArea;
		this.State.Gl.viewport(viewport.X + viewOffset.X, viewport.Y - viewOffset.Y,
			viewport.Width, viewport.Height);
	}

	/**
	 * Reads the screenshot from the default frame buffer (WebGL: called after rendering so the
	 * drawing buffer is still valid without preserveDrawingBuffer).
	 */
	ReadScreenshot() {
		if (this.screenshotDataHandler == null)
			return;

		try {
			const gl = this.State.Gl;
			const area = this.RenderScreenArea;
			const rgba = new Uint8Array(area.Width * area.Height * 4);
			const buffer = new Uint8Array(area.Width * area.Height * 3);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.readBuffer(gl.BACK);
			gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
			// WebGL only guarantees RGBA/UNSIGNED_BYTE for the default frame buffer -> convert to RGB
			gl.readPixels(area.X, area.Y, area.Width, area.Height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);

			for (let i = 0, j = 0; i < buffer.length; i += 3, j += 4) {
				buffer[i + 0] = rgba[j + 0];
				buffer[i + 1] = rgba[j + 1];
				buffer[i + 2] = rgba[j + 2];
			}

			const handler = this.screenshotDataHandler;
			this.screenshotDataHandler = null;
			handler(area.Width, area.Height, buffer);
		} catch {
			// ignore
			this.screenshotDataHandler = null;
		}
	}

	Render(viewportOffset = null) {
		if (this.disposed)
			return;

		// Note: The C# code reads the screenshot from the back buffer before rendering (= last frame).
		// In WebGL the drawing buffer is cleared after compositing, so the screenshot is taken at the
		// end of this method instead (see ReadScreenshot).

		const State = this.State;
		const gl = State.Gl;
		const frameBufferSize = this.frameBufferSize;

		try {
			this.context.SetRotation(this.rotation);

			const render3DMap = !this.ShowImageLayerOnly && getValue(this.layers, Layer.Map3D).Visible;
			const viewOffset = new Position(
				Util.Round((viewportOffset?.X ?? 0.0) * this.renderDisplayArea.Width),
				Util.Round((viewportOffset?.Y ?? 0.0) * this.renderDisplayArea.Height)
			);

			if (!this.ShowImageLayerOnly) {
				if (this.useEffectFrameBuffer)
					this.BindEffectBuffer(viewOffset);
				else {
					gl.bindFramebuffer(gl.FRAMEBUFFER, null);
					gl.viewport(0, 0, frameBufferSize.Width, frameBufferSize.Height);
				}
			}

			gl.clearColor(0.0, 0.0, 0.0, 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			let set2DViewport = this.ShowImageLayerOnly;
			viewOffset.X -= Util.Floor(0.49 * frameBufferSize.Width / Global.VirtualScreenWidth);
			viewOffset.Y -= Util.Floor(0.49 * frameBufferSize.Height / Global.VirtualScreenHeight);

			const sortedLayers = [...this.layers].sort((a, b) => a[0] - b[0]);

			for (const [key, value] of sortedLayers) {
				if (this.ShowImageLayerOnly && key !== Layer.Images)
					continue;

				if (render3DMap) {
					if (key === Layer.Map3DBackground) {
						const viewport = this.RenderScreenArea;

						if (this.useEffectFrameBuffer)
							gl.viewport(0, 0, viewport.Width, viewport.Height);
						else {
							gl.viewport(viewport.X + viewOffset.X, viewport.Y + viewOffset.Y,
								viewport.Width, viewport.Height);
						}
					} else if (key === Layer.Map3DCeiling) {
						// Setup 3D stuff
						this.camera3D.Activate();
						State.RestoreProjectionMatrix(State.ProjectionMatrix3D);
						const mapViewArea = new Rect(Global.Map3DViewX, Global.Map3DViewY, Global.Map3DViewWidth + 1, Global.Map3DViewHeight + 1);
						mapViewArea.Position = this.PositionTransformation(new FloatPosition(mapViewArea.Position)).Round();
						mapViewArea.Size = this.SizeTransformation(new FloatSize(mapViewArea.Size)).ToSize();
						const viewport = this.RenderScreenArea;
						if (this.useEffectFrameBuffer) {
							gl.viewport(mapViewArea.X, viewport.Height - (mapViewArea.Y + mapViewArea.Height),
								mapViewArea.Width, mapViewArea.Height);
						} else {
							// Web port: GL y is measured from the bottom of the whole drawing buffer (the original used the
							// render area height, which shifts the 3D view down when the screen is letterboxed vertically).
							gl.viewport(
								viewport.X + mapViewArea.X,
								gl.drawingBufferHeight - (viewport.Y + mapViewArea.Y + mapViewArea.Height),
								mapViewArea.Width, mapViewArea.Height
							);
						}
						gl.enable(gl.CULL_FACE);
						gl.disable(gl.DEPTH_TEST);
					} else if (key === Layer.Map3D) {
						gl.enable(gl.DEPTH_TEST);
					} else if (key === Layer.Billboards3D) {
						gl.disable(gl.CULL_FACE);
					} else if (key === Global.First2DLayer) {
						// Reset to 2D stuff
						gl.clear(gl.DEPTH_BUFFER_BIT);
						State.RestoreModelViewMatrix(Matrix4.Identity);
						State.RestoreProjectionMatrix(State.ProjectionMatrix2D);

						const viewport = this.RenderScreenArea;

						if (!this.useFrameBuffer) {
							if (this.useEffectFrameBuffer)
								gl.viewport(0, 0, viewport.Width, viewport.Height);
							else
								gl.viewport(viewport.X + viewOffset.X, viewport.Y + viewOffset.Y,
									viewport.Width, viewport.Height);
						} else {
							this.frameBuffer.Bind(viewport.Width, viewport.Height);
							gl.clearColor(0.0, 0.0, 0.0, 0.0);
							gl.viewport(0, 0, viewport.Width, viewport.Height);
							gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
							gl.clearColor(0.0, 0.0, 0.0, 1.0);
						}
						set2DViewport = true;
					}
				} else if (!set2DViewport) {
					const viewport = this.RenderScreenArea;

					if (!this.useFrameBuffer) {
						if (this.useEffectFrameBuffer)
							gl.viewport(0, 0, viewport.Width, viewport.Height);
						else
							gl.viewport(viewport.X + viewOffset.X, viewport.Y + viewOffset.Y,
								viewport.Width, viewport.Height);
					} else {
						this.frameBuffer.Bind(viewport.Width, viewport.Height);
						gl.viewport(0, 0, viewport.Width, viewport.Height);
						gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
					}

					set2DViewport = true;
				}

				if (this.useEffectFrameBuffer && key === Global.LastLayer) {
					gl.bindFramebuffer(gl.FRAMEBUFFER, null);
					const viewport = this.RenderScreenArea;
					gl.viewport(viewport.X, viewport.Y, viewport.Width, viewport.Height);
					gl.clear(gl.DEPTH_BUFFER_BIT);
				}

				if (key === Global.LastLayer) {
					if (this.useFrameBuffer)
						this.RenderToScreen(viewOffset, this.useEffectFrameBuffer);
					if (this.useEffectFrameBuffer)
						this.RenderEffects(viewOffset);
					if (this.DrugColorComponent != null) {
						// System.Drawing.Color.FromArgb(255, Color.FromArgb(0x202020 | (0x800000 >> (8 * (component % 3)))))
						const rgb = 0x202020 | (0x800000 >> (8 * (this.DrugColorComponent % 3)));
						gl.blendColor(((rgb >> 16) & 0xff) / 255.0, ((rgb >> 8) & 0xff) / 255.0, (rgb & 0xff) / 255.0, 1.0);
					}
					gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_CONSTANT_COLOR);
				} else if (key === Layer.MobileOverlays) {
					gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				} else if (value.Config.EnableBlending) {
					gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
				}

				if (value.Config.EnableBlending)
					gl.enable(gl.BLEND);
				else
					gl.disable(gl.BLEND);

				if (!value.Config.RenderToVirtualScreen) {
					State.PushProjectionMatrix(State.FullScreenProjectionMatrix2D);

					const viewport = this.RenderScreenArea;

					const currentViewport = gl.getParameter(gl.VIEWPORT);

					let x = viewport.Position.X;
					let y = viewport.Position.Y;

					if (!this.ShowImageLayerOnly && (this.useFrameBuffer || this.useEffectFrameBuffer)) {
						x = 0;
						y = 0;
					}

					gl.viewport(x, y, viewport.Width, viewport.Height);

					try {
						value.Render();
					} finally {
						gl.viewport(currentViewport[0], currentViewport[1], currentViewport[2], currentViewport[3]);
						State.PopProjectionMatrix();
					}
				} else {
					value.Render();
				}
			}

			this.accessViolationDetected = false;
		} finally {
			// C#: catch (AccessViolationException) { ... } - there is no such exception in JS, so all errors are propagated.
		}

		this.ReadScreenshot();
	}

	RenderToScreen(viewOffset, useEffects) {
		const gl = this.State.Gl;

		if (useEffects)
			this.BindEffectBuffer(Position.Zero);
		else
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.screenBuffer.SetSize(this.frameBufferSize);
		this.screenShader.Use(this.screenBuffer.ProjectionMatrix);
		this.screenShader.SetResolution(this.frameBufferSize);
		this.screenShader.SetSampler(0); // we use texture unit 0 -> see Gl.ActiveTexture below
		const [filterKey, filterValue] = keyValue(this.screenBufferModeProvider?.() ?? [0, 0]);
		this.screenShader.SetMode(filterKey, filterValue);
		gl.activeTexture(gl.TEXTURE0);
		this.frameBuffer.BindAsTexture();
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		const viewport = this.RenderScreenArea;
		if (useEffects) {
			gl.viewport(0, 0, viewport.Width, viewport.Height);
		} else {
			gl.viewport(viewport.X + viewOffset.X, viewport.Y - viewOffset.Y,
				viewport.Width, viewport.Height);
		}
		this.screenBuffer.Render();
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.enable(gl.DEPTH_TEST);
	}

	RenderEffects(viewOffset) {
		const gl = this.State.Gl;

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.frameBufferSize.Width, this.frameBufferSize.Height);
		gl.clear(gl.COLOR_BUFFER_BIT);
		this.effectBuffer.SetSize(this.frameBufferSize);
		this.effectShader.Use(this.effectBuffer.ProjectionMatrix);
		this.effectShader.SetResolution(this.frameBufferSize);
		this.effectShader.SetSampler(0); // we use texture unit 0 -> see Gl.ActiveTexture below
		this.effectShader.SetMode(this.effectProvider?.() ?? 0);
		gl.activeTexture(gl.TEXTURE0);
		this.effectFrameBuffer.BindAsTexture();
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		const viewport = this.RenderScreenArea;
		gl.viewport(viewport.X + viewOffset.X, viewport.Y - viewOffset.Y,
			viewport.Width, viewport.Height);
		this.effectBuffer.Render();
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.enable(gl.DEPTH_TEST);
	}

	/**
	 * GameToScreen(Position), GameToScreen(Size) or GameToScreen(Rect)
	 */
	GameToScreen(value) {
		if (value instanceof Rect) {
			let rect = value;
			const position = this.GameToScreen(rect.Position);
			const size = this.GameToScreen(rect.Size);
			rect = new Rect(position, size);

			rect.Clip(this.renderDisplayArea);

			if (rect.Empty)
				return null;

			return rect;
		}

		if (value instanceof Size || value instanceof FloatSize) {
			const size = value;
			return this.ViewToScreen(new Size(Misc.Round(size.Width * this.WindowFactorX), Misc.Round(size.Height * this.WindowFactorY)));
		}

		const position = value;
		return this.ViewToScreen(new Position(Misc.Round(position.X * this.WindowFactorX), Misc.Round(position.Y * this.WindowFactorY)));
	}

	/**
	 * ViewToScreen(Position), ViewToScreen(Size) or ViewToScreen(Rect)
	 */
	ViewToScreen(value) {
		const renderDisplayArea = this.renderDisplayArea;

		if (value instanceof Rect) {
			let rect = value;
			const position = this.ViewToScreen(rect.Position);
			const size = this.ViewToScreen(rect.Size);
			rect = new Rect(position, size);

			rect.Clip(renderDisplayArea);

			if (rect.Empty)
				return null;

			return rect;
		}

		if (value instanceof Size || value instanceof FloatSize) {
			const size = value;
			const swapDimensions = this.rotation === Rotation.Deg90 || this.rotation === Rotation.Deg270;

			const width = swapDimensions ? size.Height : size.Width;
			const height = swapDimensions ? size.Width : size.Height;

			return new Size(width, height);
		}

		const position = value;
		const rotatedX = position.X;
		const rotatedY = position.Y;
		let relX;
		let relY;

		switch (this.rotation) {
			case Rotation.None:
			default:
				relX = rotatedX;
				relY = rotatedY;
				break;
			case Rotation.Deg90:
				relX = renderDisplayArea.Width - rotatedY;
				relY = rotatedX;
				break;
			case Rotation.Deg180:
				relX = renderDisplayArea.Width - rotatedX;
				relY = renderDisplayArea.Height - rotatedY;
				break;
			case Rotation.Deg270:
				relX = rotatedY;
				relY = renderDisplayArea.Height - rotatedX;
				break;
		}

		return new Position(renderDisplayArea.X + relX, renderDisplayArea.Y + relY);
	}

	ScreenToLayer(position, layer) {
		if (getValue(RenderLayer.DefaultLayerConfigs, layer).Use320x256) {
			position = this.ScreenToView(position);

			const WindowFactorX = this.renderDisplayArea.Width / 409.6; // = 409.6 = 320 * (float)(256 / 200)
			const WindowFactorY = this.renderDisplayArea.Height / 256.0;

			// 44.8 = (409.6 - 320) / 2
			return new Position(Misc.Round(position.X / WindowFactorX - 44.8), Misc.Round(position.Y / WindowFactorY));
		} else {
			return this.ScreenToGame(position);
		}
	}

	// This is used to convert mouse coordinates to game coordinates
	ScreenToGame(position) {
		position = this.ScreenToView(position);

		return new Position(Misc.Round(position.X / this.WindowFactorX), Misc.Round(position.Y / this.WindowFactorY));
	}

	/**
	 * ScreenToView(Position), ScreenToView(Size) or ScreenToView(Rect)
	 */
	ScreenToView(value) {
		const renderDisplayArea = this.renderDisplayArea;

		if (value instanceof Rect) {
			const rect = value;
			const clippedRect = new Rect(rect);

			clippedRect.Clip(renderDisplayArea);

			if (clippedRect.Empty)
				return null;

			const position = this.ScreenToView(clippedRect.Position);
			const size = this.ScreenToView(clippedRect.Size);

			return new Rect(position, size);
		}

		if (value instanceof Size || value instanceof FloatSize) {
			const size = value;
			const swapDimensions = this.rotation === Rotation.Deg90 || this.rotation === Rotation.Deg270;

			const width = swapDimensions ? size.Height : size.Width;
			const height = swapDimensions ? size.Width : size.Height;

			return new Size(width, height);
		}

		const position = value;
		const relX = position.X - renderDisplayArea.X;
		const relY = position.Y - renderDisplayArea.Y;
		let rotatedX;
		let rotatedY;

		switch (this.rotation) {
			case Rotation.None:
			default:
				rotatedX = relX;
				rotatedY = relY;
				break;
			case Rotation.Deg90:
				rotatedX = relY;
				rotatedY = renderDisplayArea.Width - relX;
				break;
			case Rotation.Deg180:
				rotatedX = renderDisplayArea.Width - relX;
				rotatedY = renderDisplayArea.Height - relY;
				break;
			case Rotation.Deg270:
				rotatedX = renderDisplayArea.Height - relY;
				rotatedY = relX;
				break;
		}

		return new Position(rotatedX, rotatedY);
	}

	Dispose() {
		if (!this.disposed) {
			for (const layer of this.layers.values())
				layer?.Dispose();

			this.layers.clear();

			this.disposed = true;
		}
	}
}

export class GameRenderView extends RenderView {
	/**
	 * new GameRenderView(contextProvider, gameData, graphicInfoProvider, fontProvider, textProcessor, textureAtlasManagerProvider,
	 *     framebufferWidth, framebufferHeight, windowSize, useFrameBuffer, useEffectFrameBuffer,
	 *     screenBufferModeProvider, effectProvider, additionalPalettes,
	 *     deviceType = DeviceType.Desktop, sizingPolicy = SizingPolicy.FitRatio,
	 *     orientationPolicy = OrientationPolicy.Support180DegreeRotation)
	 *
	 * useFrameBuffer / useEffectFrameBuffer: boolean or { value: boolean } (C# ref bool, set to false if not available)
	 */
	constructor(contextProvider, gameData, graphicInfoProvider, fontProvider, textProcessor, textureAtlasManagerProvider,
		framebufferWidth, framebufferHeight, windowSize, useFrameBuffer, useEffectFrameBuffer,
		screenBufferModeProvider, effectProvider, additionalPalettes,
		deviceType = DeviceType.Desktop, sizingPolicy = SizingPolicy.FitRatio,
		orientationPolicy = OrientationPolicy.Support180DegreeRotation) {
		super(contextProvider, graphicInfoProvider, textureAtlasManagerProvider, framebufferWidth, framebufferHeight, windowSize,
			useFrameBuffer, useEffectFrameBuffer, screenBufferModeProvider, effectProvider, additionalPalettes,
			state => new Camera3D(state), deviceType, sizingPolicy, orientationPolicy);

		this.surface3DFactory = null;
		this.renderTextFactory = null;
		this.fowFactory = null;
		this.paletteReplacement = null;
		this.horizonPaletteReplacement = null;
		this.paletteFading = null;

		/** Action<float> */
		this.AspectProcessor = (aspect) => this.UpdateAspect(aspect);
		this.GameData = gameData;
		this.GraphicInfoProvider = graphicInfoProvider;
		this.FontProvider = fontProvider;
		this.TextProcessor = textProcessor;

		// factories
		const visibleArea = new Rect(0, 0, Global.VirtualScreenWidth, Global.VirtualScreenHeight);
		this.surface3DFactory = new Surface3DFactory(visibleArea);
		this.renderTextFactory = new RenderTextFactory(visibleArea);
		this.fowFactory = new FowFactory(visibleArea);

		// Web port: the fade uniform starts at 0 in WebGL, so 3D maps entered without a fade would stay black.
		try {
			this.Set3DFade(1.0);
		} catch {
			// layers not available
		}
	}

	get Surface3DFactory() { return this.surface3DFactory; }
	get RenderTextFactory() { return this.renderTextFactory; }
	get FowFactory() { return this.fowFactory; }
	get Camera3D() { return this.camera3D; }

	UpdateAspect(aspect) {
		this.context?.UpdateAspect(aspect);
	}

	get PaletteReplacement() {
		return this.paletteReplacement;
	}

	set PaletteReplacement(value) {
		if (this.paletteReplacement !== value) {
			this.paletteReplacement = value;

			this.GetLayer(Layer.Billboards3D).RenderBuffer.Billboard3DShader.SetPaletteReplacement(this.paletteReplacement);
			this.GetLayer(Layer.Map3D).RenderBuffer.Texture3DShader.SetPaletteReplacement(this.paletteReplacement);
		}
	}

	get HorizonPaletteReplacement() {
		return this.horizonPaletteReplacement;
	}

	set HorizonPaletteReplacement(value) {
		if (this.horizonPaletteReplacement !== value) {
			this.horizonPaletteReplacement = value;

			this.GetLayer(Layer.Map3DBackground).RenderBuffer.SkyShader.SetPaletteReplacement(this.horizonPaletteReplacement);
		}
	}

	get PaletteFading() {
		return this.paletteFading;
	}

	set PaletteFading(value) {
		if (this.paletteFading !== value) {
			this.paletteFading = value;

			this.GetLayer(Layer.MainMenuGraphics).RenderBuffer.FadingTextureShader.SetPaletteFading(this.paletteFading);
		}
	}

	SetLight(light) {
		this.GetLayer(Layer.Billboards3D).RenderBuffer.Billboard3DShader.SetLight(light);
		this.GetLayer(Layer.Map3D).RenderBuffer.Texture3DShader.SetLight(light);
		this.GetLayer(Layer.Map3DBackground).RenderBuffer.SkyShader.SetLight(light);
	}

	Set3DFade(fade) {
		this.GetLayer(Layer.Billboards3D).RenderBuffer.Billboard3DShader.SetFade(fade);
		this.GetLayer(Layer.Map3D).RenderBuffer.Texture3DShader.SetFade(fade);
		//(GetLayer(Layer.Map3DBackground) as RenderLayer).RenderBuffer.SkyShader.SetFade(fade);
	}

	SetSkyColorReplacement(skyColor, replaceColor) {
		this.GetLayer(Layer.Billboards3D).RenderBuffer.Billboard3DShader.SetSkyColorReplacement(skyColor, replaceColor);
		this.GetLayer(Layer.Map3D).RenderBuffer.Texture3DShader.SetSkyColorReplacement(skyColor, replaceColor);
	}

	SetFog(fogColor, distance) {
		this.GetLayer(Layer.Billboards3D).RenderBuffer.Billboard3DShader.SetFog(fogColor, distance);
		this.GetLayer(Layer.Map3D).RenderBuffer.Texture3DShader.SetFog(fogColor, distance);
	}

	/** Web port: enhanced 3D rendering (palette aware texture filtering, wall shading, smooth fog). */
	get Enhanced3D() {
		return this.enhanced3D ?? false;
	}

	set Enhanced3D(value) {
		value = !!value;
		if (this.enhanced3D === value)
			return;
		this.enhanced3D = value;
		this.GetLayer(Layer.Billboards3D).RenderBuffer.Billboard3DShader.SetEnhanced(value);
		this.GetLayer(Layer.Map3D).RenderBuffer.Texture3DShader.SetEnhanced(value);
	}
}
