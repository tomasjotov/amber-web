// Port of Ambermoon.net/Intro.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import {
	toByte, toShort, toUShort, idiv, round, getValue, tryGetValue, max, first, firstOrDefault, removeItem,
	Queue, NotImplementedException
} from '../../runtime.js';
import { IntroGraphic, IntroText, IntroTextCommandType } from '../Ambermoon.Data.Common/IIntroData.js';
import { Color as TextColor } from '../Ambermoon.Data.Common/Enumerations/Color.js';
import { PaletteFading } from '../Ambermoon.Data.Common/ILightEffectProvider.js';
import { IntroData } from '../Ambermoon.Data.Legacy/Serialization/IntroData.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { Color } from '../Ambermoon.Core/Render/Color.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { TextAlign } from '../Ambermoon.Core/Render/TextAlign.js';
import { TextureAtlasManager } from '../Ambermoon.Core/Render/TextureAtlasManager.js';

const IntroActionType = Object.freeze({
	Starfield: 0,
	ThalionLogoFlyIn: 1,
	AmbermoonFlyIn: 2,
	TextCommands: 3,
	DisplayObjects: 4,
	TwinlakeAnimation: 5,
	TownDestruction: 6,
	EndScreen: 7
});

const ShortMaxValue = 32767;
const LongMaxValue = Number.MAX_SAFE_INTEGER;

/** IntroData.GraphicPalettes[introGraphic] */
function graphicPalette(introGraphic) {
	return getValue(IntroData.GraphicPalettes, introGraphic);
}

class IntroAction {
	constructor(type) {
		this.Type = type;
	}

	Update(ticks, frameCounter) {
		throw new Error('abstract');
	}

	Destroy() {
		throw new Error('abstract');
	}

	static CreateAction(actionType, intro, finishHandler, renderView, startTicks, introData, rng, introFont, introFontLarge) {
		switch (actionType) {
			case IntroActionType.Starfield: return new IntroActionStarfield(renderView, rng);
			case IntroActionType.ThalionLogoFlyIn: return new IntroActionLogoFlyin(IntroGraphic.ThalionLogo, actionType, renderView, startTicks, finishHandler, introData, introFontLarge);
			case IntroActionType.AmbermoonFlyIn: return new IntroActionLogoFlyin(IntroGraphic.Ambermoon, actionType, renderView, startTicks, finishHandler, introData, introFontLarge);
			case IntroActionType.DisplayObjects: return new IntroActionDisplayObjects(renderView, startTicks, introFontLarge, introData, finishHandler);
			case IntroActionType.TwinlakeAnimation: return new IntroActionTwinlake(renderView, startTicks, introData, finishHandler, introFontLarge);
			case IntroActionType.TextCommands: return new IntroActionTextCommands(renderView, introData, introFont, intro, finishHandler, startTicks);
			case IntroActionType.TownDestruction: return new IntroActionTownDestruction(renderView, startTicks, introData, finishHandler);
			case IntroActionType.EndScreen: return new IntroActionEndScreen(renderView, startTicks, introFontLarge, introData, finishHandler);
			default: throw new NotImplementedException();
		}
	}
}

const StartScale = 0x7630;
const ScaleDecrease = 250;

class IntroActionStarfield extends IntroAction {
	static scaleValues = [];
	static StartScale = StartScale;
	static ScaleDecrease = ScaleDecrease;

	static {
		let scale = StartScale;

		do {
			IntroActionStarfield.scaleValues.push(scale);
			scale -= ScaleDecrease;
		} while (scale >= 0);
	}

	constructor(renderView, rng) {
		super(IntroActionType.Starfield);

		this.stars = new Array(150).fill(null);
		this.starBasePositions = new Array(150).fill(null);
		this.starScaleValues = new Array(150).fill(0);
		this.stopTicks = -1;

		const layer = renderView.GetLayer(Layer.IntroEffects);

		for (let i = 0; i < this.stars.length; i++) {
			const star = this.stars[i] = renderView.ColoredRectFactory.Create(1, 1, Color.White, 0);
			star.Layer = layer;
			star.Visible = true;

			let r1 = (rng() % 0x3e80) - 0x1f40;
			let r2 = (rng() % 0x6400) - 0x3200;

			r1 *= 256;
			r2 *= 256;

			const basePosition = this.starBasePositions[i] = new Position(r2, r1); // note: they are swapped in original as well!

			// The original code works a bit different. We need the amount of visible positions per star for some calculation.
			let currentScale = StartScale;
			let validPositionCount = 0;

			while (currentScale > 0) {
				const x = 160 + Math.trunc(basePosition.X / currentScale);
				const y = 100 + Math.trunc(basePosition.Y / currentScale);

				if (x >= 0 && y >= 0 && x < 320 && y < 200)
					++validPositionCount;

				currentScale -= ScaleDecrease;
			}

			// This is the start frame or start scale
			// of this star.
			const r = rng() % validPositionCount;
			this.starScaleValues[i] = IntroActionStarfield.scaleValues[r];
		}
	}

	StopAt(ticks) {
		this.stopTicks = ticks;
	}

	Update(ticks, frameCounter) {
		if (this.stopTicks !== -1 && ticks >= this.stopTicks && this.stars[0].X === 0)
			return;

		for (let i = 0; i < this.stars.length; i++) {
			while (true) {
				const basePosition = this.starBasePositions[i];
				let scale = this.starScaleValues[i];

				const x = 160 + Math.trunc(basePosition.X / scale);
				const y = 100 + Math.trunc(basePosition.Y / scale);

				scale -= ScaleDecrease;

				if (scale < 0)
					scale = StartScale;

				this.starScaleValues[i] = scale;

				if (x >= 0 && y >= 0 && x < 320 && y < 200) {
					this.stars[i].X = x;
					this.stars[i].Y = 4 + y;
					break;
				}
			}
		}

		// TODO: as we have black borders we might to want to extrapolate the
		// stars to that area. I guess we need 150 more stars which continue at
		// the border. But it's fine for the first version this way.
	}

	Destroy() {
		for (let i = 0; i < this.stars.length; i++)
			this.stars[i]?.Delete();
	}
}

class IntroActionLogoFlyin extends IntroAction {
	// Note: For fade out always palette[2] is used as the target.
	// As it is all white in colors 10 to 1F and there is at least
	// 1 full black color in this area for palette[0] and palette[1]
	// which are used for the logos, we have always the full 15 color
	// change ticks and therefore the fade duration is 15*4 = 60.
	static FadeDuration = 60;

	constructor(introGraphic, actionType, renderView, startTicks, finishHandler, introData, largeFont) {
		super(actionType);

		this.presentsText = null;
		this.scalingFactor = 2048; // start value 0x800
		this.scalingPerTick = 32;
		this.fadeOutStartTicks = -1;
		this.textClipArea = null;

		// Before starting the scaling, the palette is faded.
		// Nothing is displayed in this time so we can just increase the start ticks.
		this.startTicks = startTicks + 1; // for the +1 see description in Update
		this.finishHandler = finishHandler;

		const size = introGraphic === IntroGraphic.ThalionLogo
			? new Size(128, 82) // Thalion logo
			: new Size(272, 87); // Ambermoon text
		this.scalingPerTick = actionType === IntroActionType.ThalionLogoFlyIn
			? 32 // Thalion logo
			: 64; // Ambermoon text
		this.logo = renderView.SpriteFactory.CreateWithAlpha(0, 0, 200);
		this.logo.Layer = renderView.GetLayer(Layer.IntroGraphics);
		this.logo.TextureSize = size;
		this.logo.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.IntroGraphics).GetOffset(introGraphic);
		this.logo.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(introGraphic) - 1);
		this.logo.X = 160; // start in the center
		this.logo.Y = 100; // start in the center of the 200 height portion
		this.logo.Alpha = 0;
		this.logo.Visible = true;

		this.imageWidth = size.Width;
		this.imageHeight = size.Height;

		if (actionType === IntroActionType.ThalionLogoFlyIn) {
			this.textClipArea = new Rect(0, 160, 320, 0);
			this.presentsText = largeFont.CreateText(renderView, Layer.IntroText, new Rect(0, 160, 320, 22), getValue(introData.Texts, IntroText.Presents), 20, TextAlign.Center, 255, this.textClipArea);
			this.presentsText.Visible = false;
		}
	}

	Update(ticks, frameCounter) {
		const FadeDuration = IntroActionLogoFlyin.FadeDuration;

		if (ticks < this.startTicks)
			return;

		// The original prepares all frames in a buffer.
		// Then
		//   Wait 1 tick
		//   Start palette fade (= fade in)
		//   Wait 1 tick
		// Then for each frame it does:
		//   Wait 1 tick
		//   Render frame (and prepare next)
		//
		// So essentially it starts 1 tick later and then starts the fade.
		// Therefore we increased startTicks by 1 in the constructor.
		// The scaling should only start after 3 ticks (2 ticks as we adjusted startTicks).
		// Thus we added "if (elapsed >= 2)" and "elapsed -= 2" below.

		if (this.fadeOutStartTicks === -1) { // not fading out yet
			let elapsed = ticks - this.startTicks;

			this.logo.Alpha = toByte(Math.min(255, Math.trunc(elapsed * 255 / FadeDuration)));

			if (elapsed >= 2) {
				elapsed -= 2;

				this.logo.Visible = true;

				if (this.scalingFactor >= 256) {
					this.scalingFactor = 256 + (2048 - (elapsed * this.scalingPerTick));

					if (this.scalingFactor >= 256) {
						const width = Math.max(1, Math.trunc((this.imageWidth * 256) / this.scalingFactor));
						const height = Math.max(1, Math.trunc((this.imageHeight * 256) / this.scalingFactor));
						this.logo.Resize(width, height);
						this.logo.X = 160 - Math.trunc(width / 2);
						this.logo.Y = 100 - Math.trunc(height / 2);
					}
				}

				// The text is shown after 250 ticks.
				// The tick counter is reset after the first tick after
				// starfield setup so it matches our startTicks.
				elapsed = ticks - this.startTicks; // use normal value again
				const presentShowDelay = 192; // In original it was 250
				if (this.presentsText != null && elapsed >= presentShowDelay) {
					// Thalion logo has the additional text "PRESENTS". It is handled here.
					// After 250 ticks, the PRESENTS text is shown.
					this.presentsText.Visible = true;
					const oldTextHeight = this.textClipArea.Height;
					const newTextHeight = Math.min(22, 1 + Math.trunc((elapsed - presentShowDelay) / 2)); // 2 ticks per pixel line (it reveals directly the first line so use "1 + " here.

					if (newTextHeight !== oldTextHeight) {
						this.textClipArea = this.textClipArea.SetHeight(newTextHeight);
						this.presentsText.ClipArea = this.textClipArea;
					}

					// If text was fully displayed,
					// wait for 220 additional ticks.
					// Then fade out starts.
					if (elapsed >= presentShowDelay + 220)
						this.fadeOutStartTicks = ticks;
				} else if (this.presentsText == null) {
					// Ambermoon logo has no additional text. It's handled here.
					// The delay is 260 but this includes the fade out of the previous Thalion logo.
					// So it would be 260 - 60. But it does not fit exactly so we use a different value.
					if (elapsed >= 260 - 60)
						this.fadeOutStartTicks = ticks;
				}
			}
		} else { // fading out
			const fadeAmount = Math.min(1 + Math.trunc(FadeDuration / 4), Math.trunc((ticks - this.fadeOutStartTicks) / 4));

			if (fadeAmount === 1 + Math.trunc(FadeDuration / 4)) {
				this.logo.Visible = false;

				if (this.presentsText != null)
					this.presentsText.Visible = false;

				this.finishHandler?.();
				this.finishHandler = null;
			} else {
				const alpha = toByte(Math.max(0, 255 - fadeAmount * 16));

				this.logo.Alpha = alpha;

				if (this.presentsText != null)
					this.presentsText.Alpha = alpha;
			}
		}
	}

	Destroy() {
		this.logo?.Delete();
		this.presentsText?.Destroy();
	}
}

class IntroActionTextCommands extends IntroAction {
	constructor(renderView, introData, introFont, intro, finishHandler, startTicks) {
		super(IntroActionType.TextCommands);

		this.texts = [];
		this.commands = new Queue();
		this.currentTextColor = TextColor.Black;
		this.waitEndTicks = -1;
		this.fading = false;
		this.fadeAlphaChange = 0;
		this.lastFadeTicks = 0;

		// To avoid the need for additional palettes just to mimic the dynamic
		// text coloring of the Amiga version, we just map the colors to an
		// appropriate index in the primary UI palette.
		// We know which colors are possible anyway.
		this.colorMapping = new Map([
			[0x0000, TextColor.Black],
			[0x0ccc, TextColor.BrightGray], // it almost fits with ccb instead of ccc
			[0x0e92, TextColor.LightOrange] // it almost fits with f90 instead of e92
		]);

		this.renderView = renderView;
		this.introFont = introFont;
		this.introData = introData;
		this.intro = intro;
		this.finishHandler = finishHandler;
		this.startTicks = startTicks;
		this.lastTicks = startTicks;
		this.lineHeight = max(introFont.GlyphGraphics.values(), g => g.Height);

		for (const command of introData.TextCommands)
			this.commands.Enqueue(command);
	}

	static GetColorFadeDuration(color) {
		// Dependent on color, the distance in the Amiga differs.
		// Per 4 ticks, 1 component is increased at max until the target color is reached.
		// There are only 4 cases:
		// ccc -> 000
		// e92 -> 000
		// 000 -> ccc
		// 000 -> e92
		// The last two have the same dist and duration than the first two.
		// So the parameter color just gives the non-black color

		return color === TextColor.BrightGray
			? 0xc * 4
			: 0xe * 4;
	}

	Update(ticks, frameCounter) {
		if (ticks === this.lastTicks)
			return;

		if ((ticks - this.startTicks) % 4 === 3) {
			this.lastTicks = ticks;
			return;
		}

		this.lastTicks = ticks;

		if (this.waitEndTicks === -1)
			this.waitEndTicks = ticks + 50; // start value

		if (this.fading) {
			if (this.fadeAlphaChange !== 0) {
				const fadeIncrements = Math.trunc((ticks - this.lastFadeTicks) / 4);
				this.lastFadeTicks += fadeIncrements * 4;

				for (let i = 0; i < fadeIncrements && this.fading; i++) {
					// update alpha here
					for (const text of this.texts) {
						if (this.fadeAlphaChange > 0 && text.Alpha < 255)
							text.Alpha = toByte(Math.min(255, text.Alpha + this.fadeAlphaChange));
						else if (this.fadeAlphaChange < 0 && text.Alpha > 0)
							text.Alpha = toByte(Math.max(0, text.Alpha + this.fadeAlphaChange));
					}

					const endAlpha = this.fadeAlphaChange > 0 ? 255 : 0;

					if (!this.texts.some(text => text.Alpha !== endAlpha))
						this.fading = false;
				}
			} else {
				this.fading = false;
			}
		}

		if (this.waitEndTicks > ticks)
			return;

		if (this.commands.Count !== 0) {
			const nextCommand = this.commands.Dequeue();

			const HandleTextColorChange = oldColor => {
				// Note: Black can't be used as a color as index 0 is ignored as a mask color.
				// Instead use the alpha then. Black is always used for text fade out and
				// every other color for fade in.
				if (this.currentTextColor === TextColor.Black) {
					const duration = IntroActionTextCommands.GetColorFadeDuration(oldColor);
					this.fadeAlphaChange = Math.trunc(4 * -255 / duration);
					this.fading = true;
					this.lastFadeTicks = ticks;
				} else {
					const duration = IntroActionTextCommands.GetColorFadeDuration(this.currentTextColor);
					this.texts.forEach(text => text.TextColor = this.currentTextColor);
					this.fadeAlphaChange = Math.trunc(4 * 255 / duration);
					this.fading = true;
					this.lastFadeTicks = ticks;
				}
			};

			switch (nextCommand.Type) {
				case IntroTextCommandType.Clear:
					this.texts.forEach(text => text?.Destroy());
					this.texts.length = 0;
					break;
				case IntroTextCommandType.Add:
					// Texts are displayed in the lower area starting at Y=200
					this.AddText(nextCommand.Args[0], 200 + nextCommand.Args[1], nextCommand.Args[2]);
					break;
				case IntroTextCommandType.Render:
					this.texts.forEach(text => text.Visible = true);
					if (this.currentTextColor !== TextColor.Black)
						HandleTextColorChange(TextColor.Black);
					break;
				case IntroTextCommandType.Wait:
					this.waitEndTicks = ticks + nextCommand.Args[0];
					break;
				case IntroTextCommandType.SetTextColor:
				{
					const oldColor = this.currentTextColor;
					const [found, color] = tryGetValue(this.colorMapping, nextCommand.Args[0]);
					this.currentTextColor = found ? color : 0;
					if (!found)
						throw new AmbermoonException(ExceptionScope.Data, 'Unsupported intro text color.');
					HandleTextColorChange(oldColor);
					break;
				}
				case IntroTextCommandType.ActivatePaletteFading:
					this.intro.StartMeteorGlowing(ticks);
					break;
				default:
					throw new AmbermoonException(ExceptionScope.Data, 'Unsupported intro text command.');
			}
		} else {
			this.finishHandler?.();
			this.finishHandler = null;
		}
	}

	AddText(x, y, index) {
		if (index === 3 || index === 4) // My name must fit in there :D
			x -= 20;

		// The clip area is important. Otherwise the virtual screen is used which is only 320x200 and the text only starts at Y = 200.
		let text = this.introFont.CreateText(this.renderView, Layer.IntroText, new Rect(x, y, 320 - x, 12), this.introData.TextCommandTexts[index], 200, TextAlign.Left,
			0, new Rect(0, 200, 320, 256));
		text.Visible = false;
		text.Place(new Rect(x, y, 320 - x, this.lineHeight), TextAlign.Left);
		text.TextColor = this.currentTextColor;
		this.texts.push(text);

		if (index === 4) { // "Jurie Horneman"
			// Some self credit for all the hard work. :P
			y += 14;
			text = this.introFont.CreateText(this.renderView, Layer.IntroText, new Rect(x, y, 320 - x, 12), 'ROBERT SCHNECKENHAUS', 200, TextAlign.Left,
				0, new Rect(0, 200, 320, 256));
			text.Visible = false;
			text.Place(new Rect(x, y, 320 - x, this.lineHeight), TextAlign.Left);
			text.TextColor = this.currentTextColor;
			this.texts.push(text);
		}
	}

	Destroy() {
		this.texts.forEach(text => text?.Destroy());
		this.texts.length = 0;
	}
}

const MaxZoom = 22248;
const FadeOutZoom = 22184;
const MeteorEndZoom = 18868;
const MeteorSparkAppearZoom = 21000;
const MeteorObjectIndex = 3;
const SunObjectIndex = 4;

class IntroActionDisplayObjects extends IntroAction {
	// This is located at the end of the second last data hunk in the ambermoon_intro.
	// There might be a zero word after it. The section starts with the word 00 05
	// which gives the amount of zoom infos.
	// Lyramion, Morag, Forest Moon, Meteor and Sun
	static ZoomInfos = Object.freeze([
		Object.freeze({
			EndOffsetX: -136,
			EndOffsetY: -24,
			InitialDistance: 22000,
			ImageWidth: 128,
			ImageHeight: 128,
			ZoomToWidth: 512,
			ZoomToHeight: 512,
			IntroGraphic: IntroGraphic.Lyramion
		}),
		Object.freeze({
			EndOffsetX: -256,
			EndOffsetY: 70,
			InitialDistance: 21700,
			ImageWidth: 64,
			ImageHeight: 64,
			ZoomToWidth: 256,
			ZoomToHeight: 256,
			IntroGraphic: IntroGraphic.Morag
		}),
		Object.freeze({
			EndOffsetX: 200,
			EndOffsetY: -150,
			InitialDistance: 21500,
			ImageWidth: 64,
			ImageHeight: 64,
			ZoomToWidth: 100,
			ZoomToHeight: 100,
			IntroGraphic: IntroGraphic.ForestMoon
		}),
		Object.freeze({
			EndOffsetX: -18,
			EndOffsetY: -210,
			InitialDistance: 19000,
			ImageWidth: 96,
			ImageHeight: 88,
			ZoomToWidth: 288,
			ZoomToHeight: 264,
			IntroGraphic: IntroGraphic.Meteor
		}),
		Object.freeze({
			EndOffsetX: -300,
			EndOffsetY: -32,
			InitialDistance: 8000,
			ImageWidth: 64,
			ImageHeight: 64,
			ZoomToWidth: 512,
			ZoomToHeight: 512,
			IntroGraphic: IntroGraphic.SunAnimation
		})
	]);

	// This is stored between code in the ambermoon_intro.
	// If the current zoom is below MaxZoom, the zoom is
	// increased by Increase each tick. If MaxZoom is exceeded,
	// the next ZoomTransitionInfo is used.
	static ZoomTransitionInfos = Object.freeze([
		[0x10, 0x4268],
		[0x0c, 0x42cc],
		[0x0a, 0x4330],
		[0x08, 0x4394],
		[0x07, 0x43f8],
		[0x06, 0x445c],
		[0x05, 0x44c0],
		[0x04, 0x4524],
		[0x03, 0x4588],
		[0x02, 0x45ec],
		[0x01, 0x4650],
		[0x00, 0x4742], // In this case there is special handling
		[0x01, 0x477c],
		[0x02, 0x47e0],
		[0x03, 0x4a38],
		[0x04, 0x4a9c]
	].map(([Increase, MaxZoom]) => Object.freeze({ Increase, MaxZoom })));

	// This is stored between code in the ambermoon_intro.
	// If the current zoom is above the given zoom, the town
	// image and text is shown for the given duration.
	static TownShowInfos = Object.freeze([
		Object.freeze({ ZoomLevel: 0x52f0 - 100 /* Adjusted a little */, Duration: 200 - 10 /* Adjusted a little */ }), // Gemstone
		Object.freeze({ ZoomLevel: 0x54c4 - 50 /* Adjusted a little */, Duration: 150 + 5 /* Adjusted a little */ }), // Illien
		Object.freeze({ ZoomLevel: 0x5654 /* Adjusted a little */, Duration: 100 - 10 /* Adjusted a little */ }) // Snakesign
	]);

	static TownNameXValues = Object.freeze([
		92,
		120,
		91
	]);

	// Sun is using animationFrameCounter / 4 to get the frame index

	CreateTownText(townIndex) {
		this.townText?.Destroy();
		this.townText = this.largeFont.CreateText(this.renderView, Layer.IntroText, new Rect(IntroActionDisplayObjects.TownNameXValues[townIndex], 170, 160, 128),
			getValue(this.introData.Texts, IntroText.Gemstone + townIndex), 200, TextAlign.Left, 255, new Rect(0, 170, 320, 256));
		this.townText.Visible = true;
	}

	constructor(renderView, startTicks, largeFont, introData, finishHandler) {
		super(IntroActionType.DisplayObjects);

		this.objects = new Array(5).fill(null);
		this.glowingMeteorOverlay = null;
		this.meteorSparks = new Array(2).fill(null);
		this.townText = null;
		this.currentZoom = -7000; // start value
		this.zoomWaitCounter = -1;
		this.lastTicks = 0;
		this.zoomTransitionInfoIndex = 0;
		this.meteorSparkFrameCounter = -1;
		this.currentTownIndex = -1;
		this.currentTownStartTicks = -1;
		this.meteorGlowTarget = -1;
		this.lastGlowTicks = 0;
		this.numGlowFadeIncrements = 0; // the amount of changes to fully go from no glow to full glow
		this.fadeOutTicks = -1;

		this.renderView = renderView;
		this.largeFont = largeFont;
		this.introData = introData;
		this.finishHandler = finishHandler;
		this.lastTicks = startTicks;
		const layer = renderView.GetLayer(Layer.IntroGraphics);
		this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.IntroGraphics);
		const textureAtlasWidth = this.textureAtlas.Texture.Width;

		// Note: The objects are ordered in render order so the
		// last one is drawn over the others. Thus we use the
		// index for the display layer and multiply it by 50.
		for (let i = 0; i < 5; i++) {
			const graphicIndex = i === SunObjectIndex ? IntroGraphic.SunAnimation : IntroGraphic.Lyramion + i;
			const info = IntroActionDisplayObjects.ZoomInfos[i];
			this.objects[i] = i === SunObjectIndex
				? renderView.SpriteFactory.CreateAnimated(info.ImageWidth, info.ImageHeight, textureAtlasWidth, 12, true, toByte(4 + i * 50))
				: renderView.SpriteFactory.Create(info.ImageWidth, info.ImageHeight, true, toByte(4 + i * 50));
			this.objects[i].TextureSize = new Size(info.ImageWidth, info.ImageHeight);
			this.objects[i].Layer = layer;
			this.objects[i].ClipArea = new Rect(0, 0, 320, 200);
			this.objects[i].TextureAtlasOffset = this.textureAtlas.GetOffset(graphicIndex);
			this.objects[i].PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(graphicIndex) - 1);
			this.objects[i].Visible = false;
		}

		for (let i = 0; i < 2; i++) {
			this.meteorSparks[i] = renderView.SpriteFactory.CreateAnimated(64, 47, textureAtlasWidth, 15, true, 210);
			this.meteorSparks[i].Layer = layer;
			this.meteorSparks[i].TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.MeteorSparks);
			this.meteorSparks[i].BaseFrame = i * 15;
			this.meteorSparks[i].PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.MeteorSparks) - 1);
			this.meteorSparks[i].Visible = false;
			this.meteorSparks[i].X = 48 + i * 144;
			this.meteorSparks[i].Y = 153;
		}

		this.town = renderView.SpriteFactory.Create(160, 128, true, 150);
		this.town.Layer = layer;
		this.town.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.Gemstone);
		this.town.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.Gemstone) - 1);
		this.town.Visible = false;

		this.black = renderView.ColoredRectFactory.Create(320, 256, Color.Black, 120);
		this.black.Layer = renderView.GetLayer(Layer.IntroEffects);
		this.black.X = 0;
		this.black.Y = 0;
		this.black.Visible = false;

		const meteorPalette = introData.IntroPalettes[graphicPalette(IntroGraphic.Meteor)];
		this.numGlowFadeIncrements = Intro.GetPaletteFadeDuration(meteorPalette, 0, meteorPalette, 16, 16, 1);
	}

	StartMeteorGlowing(ticks) {
		this.meteorGlowTarget = 255;
		const meteor = this.objects[MeteorObjectIndex];
		this.glowingMeteorOverlay?.Delete();
		this.glowingMeteorOverlay = this.renderView.SpriteFactory.CreateWithAlpha(meteor.Width, meteor.Height, 250);
		this.glowingMeteorOverlay.TextureSize = new Size(meteor.TextureSize);
		this.glowingMeteorOverlay.Alpha = 0;
		this.glowingMeteorOverlay.Layer = meteor.Layer;
		this.glowingMeteorOverlay.ClipArea = new Rect(0, 0, 320, 200);
		this.glowingMeteorOverlay.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.GlowingMeteor);
		this.glowingMeteorOverlay.PaletteIndex = toByte(this.renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.GlowingMeteor) - 1);
		this.glowingMeteorOverlay.X = meteor.X;
		this.glowingMeteorOverlay.Y = meteor.Y;
		this.glowingMeteorOverlay.Visible = true;
		this.lastGlowTicks = ticks;
	}

	Update(ticks, frameCounter) {
		if (ticks === this.lastTicks)
			return;

		const elapsed = ticks - this.lastTicks;
		this.lastTicks = ticks;

		this.CheckTownDisplay(ticks);

		if (!this.town.Visible) {
			// Update the sun frame
			this.objects[SunObjectIndex].CurrentFrame = Math.trunc(frameCounter / 4);

			if (this.meteorSparkFrameCounter === -1) {
				if (this.currentZoom >= MeteorSparkAppearZoom)
					this.meteorSparkFrameCounter = 0;
			}

			for (let i = 0; i < 2; i++) {
				if (this.meteorSparkFrameCounter !== -1)
					this.meteorSparks[i].CurrentFrame = Math.trunc(this.meteorSparkFrameCounter / 4);

				this.meteorSparks[i].Visible = this.meteorSparkFrameCounter !== -1;
			}

			this.ProcessTicks(elapsed);

			if (this.currentZoom >= FadeOutZoom) {
				if (this.fadeOutTicks === -1) {
					this.fadeOutTicks = ticks;
					this.black.Color = Color.Transparent;
				}

				const elapsedFadeTicks = ticks - this.fadeOutTicks;

				this.black.DisplayLayer = 255;
				this.black.Visible = true;
				if (elapsedFadeTicks >= 1)
					this.black.Color = new Color(0, toByte(Math.min(255, Math.trunc((ticks - this.fadeOutTicks + 1) * 15 / 2)))); // every odd tick
				this.meteorGlowTarget = -1; // stop meteor glowing

				if (this.black.Color.A >= 210)
					this.zoomWaitCounter = 0; // stop zooming

				if (this.black.Color.A === 255 && this.finishHandler != null) {
					this.finishHandler();
					this.finishHandler = null;
				}
			}

			// Meteor glowing
			if (this.meteorGlowTarget !== -1) {
				const glowTicks = Math.trunc((ticks - this.lastGlowTicks) / 4);
				this.lastGlowTicks += glowTicks * 4;

				for (let t = 0; t < glowTicks; t++) {
					if (this.glowingMeteorOverlay.Alpha < this.meteorGlowTarget) {
						const add = idiv(255, this.numGlowFadeIncrements);

						if (this.glowingMeteorOverlay.Alpha + add >= this.meteorGlowTarget) {
							this.glowingMeteorOverlay.Alpha = toByte(this.meteorGlowTarget);
							this.meteorGlowTarget = 0;
						} else {
							this.glowingMeteorOverlay.Alpha = toByte(Math.min(255, this.glowingMeteorOverlay.Alpha + add));
						}
					} else if (this.glowingMeteorOverlay.Alpha > this.meteorGlowTarget) {
						const add = idiv(-255, this.numGlowFadeIncrements);

						if (this.glowingMeteorOverlay.Alpha + add <= this.meteorGlowTarget) {
							this.glowingMeteorOverlay.Alpha = toByte(this.meteorGlowTarget);
							this.meteorGlowTarget = 255;
						} else {
							this.glowingMeteorOverlay.Alpha = toByte(Math.max(0, this.glowingMeteorOverlay.Alpha + add));
						}
					}
				}
			}
		} else {
			for (const obj of this.objects) {
				obj.Visible = false;
			}

			this.meteorSparks[0].Visible = false;
			this.meteorSparks[1].Visible = false;

			if (this.glowingMeteorOverlay != null)
				this.glowingMeteorOverlay.Visible = false;
		}
	}

	Destroy() {
		for (const obj of this.objects)
			obj?.Delete();

		for (const spark of this.meteorSparks)
			spark?.Delete();

		this.town?.Delete();
		this.townText?.Destroy();
		this.glowingMeteorOverlay?.Delete();
		this.black?.Delete();
	}

	CheckTownDisplay(ticks) {
		const TownShowInfos = IntroActionDisplayObjects.TownShowInfos;

		if (this.currentTownIndex === 3)
			return;

		const nextTownIndex = this.currentTownIndex + 1;

		if (nextTownIndex < 3 && this.currentZoom >= TownShowInfos[nextTownIndex].ZoomLevel) {
			this.currentTownIndex = nextTownIndex;
			this.currentTownStartTicks = ticks;
			this.town.X = 80;
			this.town.Y = 36;
			this.town.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.Gemstone + this.currentTownIndex);
			this.town.Visible = true;
			this.black.Visible = true;
			this.CreateTownText(this.currentTownIndex);
		} else if (this.currentTownIndex >= 0) {
			this.town.Visible = TownShowInfos[this.currentTownIndex].Duration + 1 > (ticks - this.currentTownStartTicks);
			this.black.Visible = this.town.Visible || this.currentZoom >= FadeOutZoom;

			if (nextTownIndex === 3 && !this.town.Visible)
				this.currentTownIndex = 3;

			if (!this.town.Visible) {
				for (let i = 0; i < this.objects.length; i++) {
					if (i !== SunObjectIndex)
						this.objects[i].Visible = true;
				}

				this.townText?.Destroy();
				this.townText = null;
			}
		}
	}

	ProcessTicks(ticks) {
		const ZoomTransitionInfos = IntroActionDisplayObjects.ZoomTransitionInfos;
		const ZoomInfos = IntroActionDisplayObjects.ZoomInfos;

		for (let i = 0; i < ticks; i++) {
			if (!this.town.Visible) {
				if (this.zoomWaitCounter !== 0) {
					if (this.zoomWaitCounter < 0) {
						let zoomTransition = ZoomTransitionInfos[this.zoomTransitionInfoIndex];

						while (this.currentZoom >= zoomTransition.MaxZoom && this.zoomTransitionInfoIndex < 15) {
							zoomTransition = ZoomTransitionInfos[++this.zoomTransitionInfoIndex];
						}

						if (zoomTransition.Increase === 0) {
							this.zoomWaitCounter = 150;
							++this.zoomTransitionInfoIndex;
						} else {
							this.currentZoom = Math.min(this.currentZoom + zoomTransition.Increase, MaxZoom);
						}
					} else {
						if (--this.zoomWaitCounter === 0)
							this.zoomWaitCounter = -1;
					}
				}

				if (this.meteorSparkFrameCounter !== -1) {
					if (++this.meteorSparkFrameCounter === 60)
						this.meteorSparkFrameCounter = 28;
				}

				// Zoom / Move
				for (let n = 0; n < 5; n++) {
					if (n === MeteorObjectIndex && this.currentZoom >= MeteorEndZoom)
						continue;

					const obj = this.objects[n];
					const info = ZoomInfos[n];
					let distance = info.InitialDistance - this.currentZoom;

					if (distance <= ShortMaxValue) {
						distance += 256;

						if (distance > 0 && distance <= ShortMaxValue) {
							let offsetX = info.EndOffsetX * 256;
							let offsetY = info.EndOffsetY * 256;
							offsetX = Math.trunc(offsetX / distance);
							offsetY = Math.trunc(offsetY / distance);
							offsetX += 160;
							offsetY = 100 - offsetY;

							let width = info.ZoomToWidth * 256;
							let height = info.ZoomToHeight * 256;
							width = Math.trunc(width / distance);
							height = Math.trunc(height / distance);

							offsetX -= Math.trunc(width / 2);
							offsetY -= Math.trunc(height / 2);

							obj.Resize(width, height);
							obj.X = offsetX;
							obj.Y = offsetY;
							obj.Visible = width >= 1 && height >= 1;

							if (n === MeteorObjectIndex && this.glowingMeteorOverlay != null) {
								this.glowingMeteorOverlay.X = obj.X;
								this.glowingMeteorOverlay.Y = obj.Y;
								this.glowingMeteorOverlay.Resize(width, height);
							}
						} else if (n !== 0) {
							obj.Visible = false; // Hide objects beside Lyramion
						}
					}
				}
			}
		}
	}
}

class IntroActionTwinlake extends IntroAction {
	constructor(renderView, startTicks, introData, finishHandler, largeFont) {
		super(IntroActionType.TwinlakeAnimation);

		this.images = new Array(95).fill(null);
		this.activeFrame = -1;

		this.startTicks = startTicks;
		const layer = renderView.GetLayer(Layer.IntroGraphics);
		this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.IntroGraphics);
		const paletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.Twinlake) - 1);
		let partAtlasOffset = max(introData.Graphics.keys());

		this.frame = renderView.SpriteFactory.Create(288, 200, true, 0);
		this.frame.Layer = layer;
		this.frame.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.Frame);
		this.frame.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.Frame) - 1);
		this.frame.X = 16;
		this.frame.Y = 0;
		this.frame.Visible = true;

		this.black = renderView.ColoredRectFactory.Create(320, 256, Color.Black, 255);
		this.black.ClipArea = new Rect(0, 0, 320, 256);
		this.black.Layer = renderView.GetLayer(Layer.IntroEffects);
		this.black.X = 0;
		this.black.Y = 0;
		this.black.Visible = true;

		this.images[0] = renderView.SpriteFactory.Create(256, 177, true, 20);
		this.images[0].Layer = layer;
		this.images[0].TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.Twinlake);
		this.images[0].PaletteIndex = paletteIndex;
		this.images[0].X = 32;
		this.images[0].Y = 7;
		this.images[0].Visible = true;

		for (let i = 1; i < 95; i++) {
			const twinlakePart = introData.TwinlakeImageParts[i - 1];
			const graphic = twinlakePart.Graphic;
			this.images[i] = renderView.SpriteFactory.Create(graphic.Width, graphic.Height, true, toByte(50 + i * 2));
			this.images[i].Layer = layer;
			this.images[i].TextureAtlasOffset = this.textureAtlas.GetOffset(++partAtlasOffset);
			this.images[i].PaletteIndex = paletteIndex;
			this.images[i].X = 32 + twinlakePart.Position.X;
			this.images[i].Y = 7 + twinlakePart.Position.Y;
			this.images[i].Visible = false;
		}

		this.twinlakeText = largeFont.CreateText(renderView, Layer.IntroText, new Rect(90, 203, 320 - 90, 22), getValue(introData.Texts, IntroText.Twinlake), 20, TextAlign.Left, 255, new Rect(90, 203, 320, 225));
		this.twinlakeText.Visible = true;

		this.finishHandler = finishHandler;
	}

	Destroy() {
		this.frame.Delete();
		this.black.Delete();
		this.twinlakeText.Destroy();

		for (const image of this.images)
			image?.Delete();
	}

	Update(ticks, frameCounter) {
		let elapsed = ticks - this.startTicks;

		this.black.Color = new Color(0, toByte(Math.max(0, 255 - elapsed * 8)));

		if (elapsed >= 250) {
			elapsed -= 250;
			const frame = Math.trunc(elapsed / 4);

			if (frame < 94) {
				if (frame !== this.activeFrame) {
					if (this.activeFrame !== -1)
						this.images[this.activeFrame + 1].Visible = false;

					this.images[frame + 1].Visible = true;
				}
			} else {
				elapsed -= 94 * 4;
				this.black.Color = new Color(0, toByte(Math.min(255, Math.trunc(elapsed * 15 / 4))));

				if (this.black.Color.A === 255 && this.finishHandler != null) {
					this.finishHandler();
					this.finishHandler = null;
				}
			}
		}
	}
}

const TownDestructionMinZoom = 0x7b0;
const TimePerTown = 350 + 64;

class IntroActionTownDestruction extends IntroAction {
	static MinZoom = TownDestructionMinZoom;
	static TimePerTown = TimePerTown;

	constructor(renderView, startTicks, introData, finishHandler) {
		super(IntroActionType.TownDestruction);

		this.lastTicks = 0;
		this.currentZoom = 14000; // start value
		this.meteorX = 9700; // start value
		this.meteorY = 5700; // start value
		this.currentTownIndex = 0;
		this.townImageOffset = 0; // 0: normal, 3: destroyed version
		this.fadeInStartTicks = -1;
		this.fadeOutStartTicks = -1;

		this.finishHandler = finishHandler;
		this.lastTicks = startTicks;
		const layer = renderView.GetLayer(Layer.IntroGraphics);
		this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.IntroGraphics);

		this.meteor = renderView.SpriteFactory.Create(96, 88, true, 120);
		this.meteor.TextureSize = new Size(96, 88);
		this.meteor.Layer = layer;
		this.meteor.ClipArea = new Rect(0, 0, 320, 200);
		this.meteor.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.Meteor);
		this.meteor.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.Meteor) - 1);
		this.meteor.Visible = false;

		this.town = renderView.SpriteFactory.Create(160, 128, true, 50);
		this.town.Layer = layer;
		this.town.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.Gemstone);
		this.town.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.Gemstone) - 1);
		this.town.X = 80;
		this.town.Y = 36;
		this.town.Visible = true;

		this.effect = renderView.ColoredRectFactory.Create(420, 256, Color.Black, 250);
		this.effect.Layer = renderView.GetLayer(Layer.IntroEffects);
		this.effect.ClipArea = new Rect(0, 0, 420, 256);
		this.effect.X = -50;
		this.effect.Y = 0;
		this.effect.Visible = true;

		const paletteData = introData.IntroPalettes[5].Data;
		this.flashColor = new Color(
			paletteData[4],
			paletteData[5],
			paletteData[6],
			paletteData[7]
		);

		this.nextTownTicks = startTicks + TimePerTown;
		this.fadeInStartTicks = startTicks;
		this.fadeOutStartTicks = startTicks + TimePerTown - 64;
	}

	Update(ticks, frameCounter) {
		if (ticks === this.lastTicks)
			return;

		const elapsed = ticks - this.lastTicks;

		if (elapsed >= 2) {
			this.lastTicks = ticks - elapsed % 1;

			this.ProcessTicks(elapsed, ticks);
		}

		if (this.fadeInStartTicks !== -1) {
			this.effect.Color = new Color(0, toByte(Math.max(0, 255 - (ticks - this.fadeInStartTicks) * 4)));

			if (this.effect.Color.A === 0)
				this.fadeInStartTicks = -1;
		} else if (this.fadeOutStartTicks !== -1 && ticks >= this.fadeOutStartTicks) {
			this.effect.Color = new Color(0, toByte(Math.min(255, (ticks - this.fadeOutStartTicks) * 4)));

			if (this.effect.Color.A === 255)
				this.fadeOutStartTicks = -1;
		}
	}

	Destroy() {
		this.meteor?.Delete();
		this.town?.Delete();
		this.effect?.Delete();
	}

	ProcessTicks(ticks, totalTicks) {
		// Fade flash
		if (this.townImageOffset === 3 && this.effect.Color.R !== 0 && this.effect.Color.A > 0) {
			this.effect.Color = new Color(this.flashColor, toByte(Math.max(0, this.effect.Color.A - 16)));
		}

		if (this.currentZoom <= -512) {
			if (totalTicks < this.nextTownTicks)
				return;

			if (this.fadeOutStartTicks === -1) {
				if (++this.currentTownIndex === 3) {
					if (this.finishHandler != null) {
						this.finishHandler();
						this.finishHandler = null;
						this.nextTownTicks = LongMaxValue;
						return;
					}
				}

				// Reset meteor
				this.currentZoom = 14000;
				this.meteorX = this.currentTownIndex === 1 ? -9700 : 9700;
				this.meteorY = 5700;
				// Reset town image
				this.townImageOffset = 0;
				this.nextTownTicks = totalTicks + TimePerTown;
				this.fadeOutStartTicks = totalTicks + TimePerTown - 64;
				this.fadeInStartTicks = totalTicks;
				this.town.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.Gemstone + this.currentTownIndex);
			}
		} else {
			const xChange = this.currentTownIndex === 1 ? -208 : 208;

			for (let i = 0; i < Math.trunc(ticks / 2); i++) {
				this.meteorX -= xChange;
				this.meteorY -= 124;
				this.currentZoom -= 256;

				if (this.currentZoom < TownDestructionMinZoom) {
					if (this.townImageOffset !== 3) {
						this.townImageOffset = 3; // show destroyed version now
						this.town.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.Gemstone + this.currentTownIndex + this.townImageOffset);
						this.effect.Color = new Color(this.flashColor, 192); // flash the screen
					}
				}

				const factor = this.currentZoom + 256;
				let offsetX = this.meteorX * 256;
				let offsetY = this.meteorY * 256;
				offsetX = idiv(offsetX, factor);
				offsetY = idiv(offsetY, factor);
				offsetX += 160;
				offsetY = 100 - offsetY;

				const width = idiv(0x60000, factor);
				const height = idiv(0x60000, factor);

				offsetX -= Math.trunc(width / 2);
				offsetY -= Math.trunc(height / 2);

				this.meteor.Resize(width, height);
				this.meteor.X = offsetX;
				this.meteor.Y = offsetY;
				this.meteor.Visible = width >= 1 && height >= 1;
			}
		}
	}
}

class IntroActionEndScreen extends IntroAction {
	constructor(renderView, startTicks, largeFont, introData, finishHandler) {
		super(IntroActionType.EndScreen);

		this.clouds = new Array(4).fill(null);
		this.black = new Array(3).fill(null);
		this.texts = new Array(3).fill(null);
		this.startTicks = 0;
		this.fadeInStartTicks = -1;
		this.paletteFadeStartTicks = -1;

		this.renderView = renderView;
		this.finishHandler = finishHandler;
		this.startTicks = startTicks;
		const layer = renderView.GetLayer(Layer.MainMenuGraphics); // use 320x200 here
		this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.MainMenuGraphics);

		this.background = renderView.SpriteFactory.Create(320, 200, true, 0);
		this.background.Layer = layer;
		this.background.TextureSize = new Size(320, 256);
		this.background.TextureAtlasOffset = this.textureAtlas.GetOffset(IntroGraphic.MainMenuBackground);
		this.background.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.MainMenuBackground) - 1);
		this.background.X = 0;
		this.background.Y = 0;
		this.background.Visible = true;

		for (let i = 0; i < 4; i++) {
			const cloud = this.clouds[i] = renderView.SpriteFactory.Create(112, 100, true, 50);
			cloud.Layer = layer;
			cloud.TextureSize = new Size(112, 128);
			cloud.TextureAtlasOffset = this.textureAtlas.GetOffset(i < 2 ? IntroGraphic.CloudsLeft : IntroGraphic.CloudsRight);
			cloud.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.CloudsLeft) - 1);
			cloud.X = i < 2 ? 80 : 208 - 80;
			cloud.Y = (i % 2) * 100;
			cloud.Visible = true;
		}

		for (let i = 0; i < 3; i++) {
			const black = this.black[i] = renderView.ColoredRectFactory.Create(i === 0 ? 320 : 80, 200, Color.Black, 250);
			black.Layer = renderView.GetLayer(Layer.MainMenuEffects); // use 320x200 here
			black.X = i < 2 ? 0 : 240;
			black.Y = 0;
			black.Visible = true;
		}

		let paletteData = introData.IntroPalettes[5].Data;
		// color[31]
		this.startBlack = new Color(
			paletteData[124],
			paletteData[125],
			paletteData[126],
			paletteData[127]
		);
		paletteData = introData.IntroPalettes[graphicPalette(IntroGraphic.MainMenuBackground)].Data;
		// color[15]
		this.endBlack = new Color(
			paletteData[60],
			paletteData[61],
			paletteData[62],
			paletteData[63]
		);

		const yOffsetsText = [85, 114, 136];

		for (let i = 0; i < 3; i++) {
			const text = this.texts[i] = largeFont.CreateText(renderView, Layer.MainMenuText, new Rect(0, Math.trunc(yOffsetsText[i] * 200 / 256) + (i - 1) * 4, 320, 22),
				getValue(introData.Texts, IntroText.Lyramion + i), 200, TextAlign.Center);
			text.TextColor = TextColor.BrightBrown; // almost the right color with FC9 instead of FC8 (close enough)
			text.Visible = true;
		}

		this.fadeInStartTicks = startTicks;
	}

	Update(ticks, frameCounter) {
		const factor = this.paletteFadeStartTicks === -1 ? 0.0 : Util.Limit(0.0, (ticks - this.paletteFadeStartTicks) / (4 * 50.0), 1.0);

		const paletteFading = new PaletteFading();
		paletteFading.SourcePalette = toByte(this.renderView.GraphicInfoProvider.FirstIntroPaletteIndex + 5 - 1);
		paletteFading.DestinationPalette = toByte(this.renderView.GraphicInfoProvider.FirstIntroPaletteIndex + graphicPalette(IntroGraphic.MainMenuBackground) - 1);
		paletteFading.SourceFactor = 1.0 - factor;
		this.renderView.PaletteFading = paletteFading;

		const currentBlack = Color.op_Addition(Color.op_Multiply(this.endBlack, factor), Color.op_Multiply(this.startBlack, 1.0 - factor));
		this.black[1].Color = currentBlack;
		this.black[2].Color = currentBlack;

		let elapsed = ticks - this.startTicks;

		if (elapsed >= 300) {
			for (const text of this.texts)
				text.Visible = false;

			elapsed -= 300;

			const xOffset = 80 - (1 + Math.trunc(elapsed / 2));

			if (xOffset <= -170) {
				if (Util.FloatEqual(factor, 1.0) && this.finishHandler != null) {
					this.finishHandler();
					this.finishHandler = null;
					return;
				}
			} else {
				for (let i = 0; i < 4; i++) {
					this.clouds[i].X = i < 2 ? xOffset : 208 - xOffset;
				}

				this.black[1].X = this.clouds[0].X - 80;
				this.black[2].X = this.clouds[2].X + 112;

				if (xOffset <= -27 && this.paletteFadeStartTicks === -1)
					this.paletteFadeStartTicks = ticks;
			}
		}

		if (this.fadeInStartTicks !== -1) {
			this.black[0].Color = new Color(0, toByte(Math.max(0, 255 - (ticks - this.fadeInStartTicks) * 4)));

			if (this.black[0].Color.A === 0)
				this.fadeInStartTicks = -1;
		}
	}

	Destroy() {
		this.background?.Delete();
		for (const cloud of this.clouds)
			cloud?.Delete();
		for (const b of this.black)
			b?.Delete();
		for (const text of this.texts)
			text?.Destroy();
	}
}

const TicksPerSecond = 50.0;

export class Intro {
	static IntroActionType = IntroActionType;
	static IntroAction = IntroAction;
	static IntroActionStarfield = IntroActionStarfield;
	static IntroActionLogoFlyin = IntroActionLogoFlyin;
	static IntroActionTextCommands = IntroActionTextCommands;
	static IntroActionDisplayObjects = IntroActionDisplayObjects;
	static IntroActionTwinlake = IntroActionTwinlake;
	static IntroActionTownDestruction = IntroActionTownDestruction;
	static IntroActionEndScreen = IntroActionEndScreen;
	static TicksPerSecond = TicksPerSecond;

	Random() {
		const next = this.randomSeed * 0xd117;
		this.randomSeed = toUShort(next & 0xffff);
		return toShort((next >>> 8) & 0x7fff);
	}

	static GetPaletteFadeDuration(palette1, paletteOffset1, palette2, paletteOffset2, numColors, ticksPerColorChange) {
		let colorChanges = 0;

		for (let i = 0; i < numColors; ++i) {
			const lr = palette1.Data[(paletteOffset1 + i) * 4 + 0] >> 4;
			const rr = palette2.Data[(paletteOffset2 + i) * 4 + 0] >> 4;
			const lg = palette1.Data[(paletteOffset1 + i) * 4 + 1] >> 4;
			const rg = palette2.Data[(paletteOffset2 + i) * 4 + 1] >> 4;
			const lb = palette1.Data[(paletteOffset1 + i) * 4 + 2] >> 4;
			const rb = palette2.Data[(paletteOffset2 + i) * 4 + 2] >> 4;

			const dist = Util.Max(Math.abs(rr - lr), Math.abs(rg - lg), Math.abs(rb - lb));

			if (dist > colorChanges) {
				colorChanges = dist; // this can be at max 15

				if (colorChanges === 15)
					break;
			}
		}

		return colorChanges * ticksPerColorChange;
	}

	constructor(renderView, introData, introFont, introFontLarge, finishAction, startMusicAction) {
		this.ticks = 0;
		this.actions = [];
		this.animationFrameCounter = 0;
		/** Queue<KeyValuePair<long, Func<IntroAction>>> -> Queue of { Key, Value } */
		this.actionQueue = new Queue();
		this.randomSeed = 0x0011;
		this.time = 0.0;
		this.destroyed = false;

		this.finishAction = finishAction;
		this.introData = introData;
		this.introFont = introFont;
		this.introFontLarge = introFontLarge;
		this.renderView = renderView;
		this.startMusicAction = startMusicAction;

		this.ScheduleAction(0, IntroActionType.Starfield);
		// Between the starfield setup and Thalion logo, the palette
		// is faded which takes 15 color changes with 4 ticks per change.
		this.ScheduleAction(15 * 4, IntroActionType.ThalionLogoFlyIn, () => {
			this.DestroyAction(IntroActionType.ThalionLogoFlyIn);

			this.ScheduleAction(this.ticks, IntroActionType.AmbermoonFlyIn, () => {
				this.DestroyAction(IntroActionType.AmbermoonFlyIn);

				// It seems we might be 1 tick off and this will affect the static star image.
				// Try to use 812 if possible. This way we always show the same stars in the background (hopefully).
				const baseTicks = 802;

				// After Ambermoon logo there is a delay of 150 ticks.
				// But this includes the 60 ticks for fading out.
				// There are 3 more ticks in-between.
				// So in total 93 ticks.
				let delay = 93;

				// Stop the starfield animation at exaclty the right ticks
				first(this.actions, a => a.Type === IntroActionType.Starfield).StopAt(baseTicks + delay);
				// Planets and texts appear 20 ticks later
				delay += 20;
				this.ScheduleAction(baseTicks + delay, IntroActionType.TextCommands);
				this.ScheduleAction(baseTicks + delay, IntroActionType.DisplayObjects, () => {
					this.DestroyAction(IntroActionType.Starfield);
					this.DestroyAction(IntroActionType.TextCommands);
					this.DestroyAction(IntroActionType.DisplayObjects);
					this.ScheduleAction(this.ticks + 2, IntroActionType.TwinlakeAnimation, () => {
						this.DestroyAction(IntroActionType.TwinlakeAnimation);
						this.ScheduleAction(this.ticks + 40, IntroActionType.TownDestruction, () => {
							this.DestroyAction(IntroActionType.TownDestruction);
							this.ScheduleAction(this.ticks, IntroActionType.EndScreen, () => {
								this.DestroyAction(IntroActionType.EndScreen);
								this.End();
							});
						});
					});
				});
			});
		});
	}

	DestroyAction(actionType) {
		for (const action of this.actions.filter(a => a.Type === actionType)) {
			action.Destroy();
			removeItem(this.actions, action);
		}
	}

	ScheduleAction(startTicks, actionType, finishHandler = null, additionalAction = null) {
		const adder = () => {
			additionalAction?.();
			return IntroAction.CreateAction(actionType, this, finishHandler, this.renderView, startTicks, this.introData, () => this.Random(), this.introFont, this.introFontLarge);
		};

		this.actionQueue.Enqueue({ Key: startTicks, Value: adder });
	}

	StartMeteorGlowing(ticks) {
		const action = firstOrDefault(this.actions, a => a.Type === IntroActionType.DisplayObjects);
		(action instanceof IntroActionDisplayObjects ? action : null)?.StartMeteorGlowing(ticks);
	}

	Update(deltaTime) {
		const lastTime = this.time;
		this.time += deltaTime;
		const oldTicks = round(TicksPerSecond * lastTime);
		this.ticks = round(TicksPerSecond * this.time);

		if (this.startMusicAction != null && this.ticks >= 1) {
			// Music starts after 1 tick
			this.startMusicAction?.();
			this.startMusicAction = null;
		}

		while (this.actionQueue.Count > 0) {
			if (this.actionQueue.Peek().Key <= this.ticks)
				this.actions.push(this.actionQueue.Dequeue().Value());
			else
				break;
		}

		this.animationFrameCounter = (this.animationFrameCounter + (this.ticks - oldTicks)) % 48;

		for (const action of this.actions.slice()) {
			action.Update(this.ticks, this.animationFrameCounter);
		}
	}

	Click() {
		this.End(true);
	}

	End(byClick = false) {
		if (!this.destroyed) {
			this.Destroy();
			this.finishAction?.(byClick);
		}
	}

	Destroy() {
		if (!this.destroyed) {
			this.actions.forEach(action => action.Destroy());
			this.actions.length = 0;
			this.destroyed = true;
		}
	}
}
