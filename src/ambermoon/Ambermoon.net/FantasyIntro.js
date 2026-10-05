// Port of Ambermoon.net/FantasyIntro.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { toByte, toUShort, toUInt, getValue, tryGetValue, max, range, removeItem } from '../../runtime.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../Ambermoon.Data.Common/Graphic.js';
import { FantasyIntroAction, FantasyIntroCommand, FantasyIntroGraphic } from '../Ambermoon.Data.Common/IFantasyIntroData.js';
import { DataReader } from '../Ambermoon.Data.Legacy/Serialization/DataReader.js';
import { GraphicReader } from '../Ambermoon.Data.Legacy/Serialization/GraphicReader.js';
import { FantasyIntroData } from '../Ambermoon.Data.Legacy/Serialization/FantasyIntroData.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { Color } from '../Ambermoon.Core/Render/Color.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { TextureAtlasManager } from '../Ambermoon.Core/Render/TextureAtlasManager.js';
import { Resources } from './Resources.js';

// ---- .NET List<T>.Sort(Comparison<T>) (introspective sort, NOT stable) ----
// The order of equal elements matters for exact behavior, so the .NET algorithm is replicated.

function netSwap(keys, i, j) {
	const t = keys[i];
	keys[i] = keys[j];
	keys[j] = t;
}

function netSwapIfGreater(keys, comparer, i, j) {
	if (comparer(keys[i], keys[j]) > 0)
		netSwap(keys, i, j);
}

function netInsertionSort(keys, lo, length, comparer) {
	for (let i = 0; i < length - 1; i++) {
		const t = keys[lo + i + 1];
		let j = i;
		while (j >= 0 && comparer(t, keys[lo + j]) < 0) {
			keys[lo + j + 1] = keys[lo + j];
			j--;
		}
		keys[lo + j + 1] = t;
	}
}

function netDownHeap(keys, lo, i, n, comparer) {
	const d = keys[lo + i - 1];
	while (i <= (n >> 1)) {
		let child = 2 * i;
		if (child < n && comparer(keys[lo + child - 1], keys[lo + child]) < 0)
			child++;
		if (!(comparer(d, keys[lo + child - 1]) < 0))
			break;
		keys[lo + i - 1] = keys[lo + child - 1];
		i = child;
	}
	keys[lo + i - 1] = d;
}

function netHeapSort(keys, lo, n, comparer) {
	for (let i = n >> 1; i >= 1; i--)
		netDownHeap(keys, lo, i, n, comparer);
	for (let i = n; i > 1; i--) {
		netSwap(keys, lo, lo + i - 1);
		netDownHeap(keys, lo, 1, i - 1, comparer);
	}
}

function netPickPivotAndPartition(keys, lo, length, comparer) {
	const hi = length - 1;
	const middle = hi >> 1;
	netSwapIfGreater(keys, comparer, lo, lo + middle);
	netSwapIfGreater(keys, comparer, lo, lo + hi);
	netSwapIfGreater(keys, comparer, lo + middle, lo + hi);
	const pivot = keys[lo + middle];
	netSwap(keys, lo + middle, lo + hi - 1);
	let left = 0;
	let right = hi - 1;
	while (left < right) {
		while (comparer(keys[lo + ++left], pivot) < 0);
		while (comparer(pivot, keys[lo + --right]) < 0);
		if (left >= right)
			break;
		netSwap(keys, lo + left, lo + right);
	}
	if (left !== hi - 1)
		netSwap(keys, lo + left, lo + hi - 1);
	return left;
}

function netIntroSort(keys, lo, length, depthLimit, comparer) {
	let partitionSize = length;
	while (partitionSize > 1) {
		if (partitionSize <= 16) {
			if (partitionSize === 2) {
				netSwapIfGreater(keys, comparer, lo, lo + 1);
				return;
			}
			if (partitionSize === 3) {
				netSwapIfGreater(keys, comparer, lo, lo + 1);
				netSwapIfGreater(keys, comparer, lo, lo + 2);
				netSwapIfGreater(keys, comparer, lo + 1, lo + 2);
				return;
			}
			netInsertionSort(keys, lo, partitionSize, comparer);
			return;
		}
		if (depthLimit === 0) {
			netHeapSort(keys, lo, partitionSize, comparer);
			return;
		}
		depthLimit--;
		const p = netPickPivotAndPartition(keys, lo, partitionSize, comparer);
		netIntroSort(keys, lo + p + 1, partitionSize - (p + 1), depthLimit, comparer);
		partitionSize = p;
	}
}

function netListSort(keys, comparer) {
	if (keys.length > 1)
		netIntroSort(keys, 0, keys.length, 2 * ((31 - Math.clz32(keys.length)) + 1), comparer);
}

export class FantasyIntro {
	static textureAtlas = null;
	static borderTextureIndexOffset = 0;

	static EnsureTextures(renderView, fantasyIntroData) {
		if (FantasyIntro.textureAtlas == null) {
			TextureAtlasManager.Instance.AddFromGraphics(Layer.FantasyIntroGraphics,
				new Map([...fantasyIntroData.Graphics].map(([key, value]) => [key, value])));
			const borders256 = DataReader.FromData(Resources.Borders256);
			FantasyIntro.borderTextureIndexOffset = max(fantasyIntroData.Graphics.keys()) + 1;
			const borderGraphicInfo = new GraphicInfo();
			borderGraphicInfo.Width = 45;
			borderGraphicInfo.Height = 256;
			borderGraphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
			borderGraphicInfo.Alpha = false;
			const graphicReader = new GraphicReader();
			const LoadBorder = () => {
				const border = new Graphic();
				graphicReader.ReadGraphic(border, borders256, borderGraphicInfo);
				return border;
			};
			const borders = new Map();
			for (const i of range(0, 2))
				borders.set(FantasyIntro.borderTextureIndexOffset + i, LoadBorder());
			TextureAtlasManager.Instance.AddFromGraphics(Layer.FantasyIntroGraphics, borders);
			FantasyIntro.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.FantasyIntroGraphics);
			renderView.GetLayer(Layer.FantasyIntroGraphics).Texture = FantasyIntro.textureAtlas.Texture;
		}
	}

	constructor(renderView, fantasyIntroData, finishAction) {
		this.actions = null;
		this.writingSparks = new Map();
		this.sparks = new Map();
		this.sparkLines = new Map();
		this.sparkDots = new Map();
		this.colors = new Array(32).fill(null);
		this.time = 0;
		this.fadeStartFrames = -1;
		this.fadeOut = false;
		this.lastFrame = -1;
		this.playFairyAnimation = false;
		this.fairyAnimationIndex = 0;
		this.Active = false;
		this.randomState = 17;

		this.finishAction = finishAction;
		this.renderView = renderView;
		this.renderLayer = renderView.GetLayer(Layer.FantasyIntroGraphics);
		this.colorLayer = renderView.GetLayer(Layer.FantasyIntroEffects);
		this.paletteOffset = renderView.GraphicInfoProvider.FirstFantasyIntroPaletteIndex;

		FantasyIntro.EnsureTextures(renderView, fantasyIntroData);

		const textureAtlas = FantasyIntro.textureAtlas;
		const borderTextureIndexOffset = FantasyIntro.borderTextureIndexOffset;
		const renderLayer = this.renderLayer;
		const extendedScreenArea = new Rect(-45, 0, 410, 256);

		this.backgroundLeftBorder = renderView.SpriteFactory.Create(45, 256, true, 1);
		this.backgroundLeftBorder.Layer = renderLayer;
		this.backgroundLeftBorder.PaletteIndex = this.GetPaletteIndex(FantasyIntroGraphic.Background);
		this.backgroundLeftBorder.TextureAtlasOffset = textureAtlas.GetOffset(borderTextureIndexOffset);
		this.backgroundLeftBorder.X = -45;
		this.backgroundLeftBorder.Y = 0;
		this.backgroundLeftBorder.ClipArea = extendedScreenArea;
		this.backgroundLeftBorder.Visible = false;

		this.backgroundRightBorder = renderView.SpriteFactory.Create(45, 256, true, 1);
		this.backgroundRightBorder.Layer = renderLayer;
		this.backgroundRightBorder.PaletteIndex = this.GetPaletteIndex(FantasyIntroGraphic.Background);
		this.backgroundRightBorder.TextureAtlasOffset = textureAtlas.GetOffset(borderTextureIndexOffset + 1);
		this.backgroundRightBorder.X = 320;
		this.backgroundRightBorder.Y = 0;
		this.backgroundRightBorder.ClipArea = extendedScreenArea;
		this.backgroundRightBorder.Visible = false;

		this.background = renderView.SpriteFactory.Create(320, 256, true, 1);
		this.background.Layer = renderLayer;
		this.background.PaletteIndex = this.GetPaletteIndex(FantasyIntroGraphic.Background);
		this.background.TextureAtlasOffset = textureAtlas.GetOffset(FantasyIntroGraphic.Background);
		this.background.X = 0;
		this.background.Y = 0;
		this.background.Visible = false;

		this.fairy = renderView.SpriteFactory.Create(64, 71, true, 50);
		this.fairy.Layer = renderLayer;
		this.fairy.PaletteIndex = this.GetPaletteIndex(FantasyIntroGraphic.Fairy);
		this.fairy.TextureAtlasOffset = textureAtlas.GetOffset(FantasyIntroGraphic.Fairy);
		this.fairy.ClipArea = extendedScreenArea;
		this.fairy.Visible = false;

		this.writing = renderView.SpriteFactory.Create(0, 83, true, 10); // width will be increased later up to 208
		this.writing.Layer = renderLayer;
		this.writing.PaletteIndex = this.GetPaletteIndex(FantasyIntroGraphic.Writing);
		this.writing.TextureAtlasOffset = textureAtlas.GetOffset(FantasyIntroGraphic.Writing);
		this.writing.X = 64;
		this.writing.Y = 146;
		this.writing.Visible = false;

		this.fadeArea = renderView.ColoredRectFactory.Create(extendedScreenArea.Width, extendedScreenArea.Height, Color.Black, 255);
		this.fadeArea.Layer = this.colorLayer;
		this.fadeArea.X = -45;
		this.fadeArea.Y = -0;
		this.fadeArea.ClipArea = extendedScreenArea.CreateModified(-1, -1, 2, 2);
		this.fadeArea.Visible = false; // start with a black screen

		// Note: all colors beside the background graphic use the
		// first palette so we just use paletteOffset here.
		const colorPaletteData = renderView.GraphicInfoProvider.Palettes.get(this.paletteOffset).Data;
		for (let i = 0; i < 32; ++i) {
			// Index 0 is transparent and 16 too as Amiga sprites can only use the upper 16 colors.
			if (i % 16 === 0)
				this.colors[i] = Color.Transparent;
			else
				this.colors[i] = new Color(colorPaletteData[i * 4 + 0], colorPaletteData[i * 4 + 1], colorPaletteData[i * 4 + 2]);
		}

		// As we have a larger viewport we let the fairy fly a bit further in the end.
		const fantasyIntroActions = [...fantasyIntroData.Actions];
		const lastFairyMovements = fantasyIntroActions.filter(a => a.Command === FantasyIntroCommand.MoveFairy).reverse().slice(0, 5);
		let lastFrames = lastFairyMovements[4].Frames;
		let lastX = lastFairyMovements[4].Parameters[0];
		let lastY = lastFairyMovements[4].Parameters[1];
		const additionalFrameCount = 365 - lastX;
		const actionList = [];

		for (let i = 0; i < 4; ++i)
			removeItem(fantasyIntroActions, lastFairyMovements[i]);

		for (const action of fantasyIntroActions)
			actionList.push(action);

		for (let i = 0; i < additionalFrameCount; ++i) {
			lastFrames = toUInt(lastFrames + (1 + i % 2));
			++lastX;
			if (i % 2 === 1)
				--lastY;
			actionList.push(new FantasyIntroAction(lastFrames, FantasyIntroCommand.MoveFairy, lastX, lastY));
		}

		netListSort(actionList, (a, b) => (a.Frames < b.Frames ? -1 : a.Frames > b.Frames ? 1 : 0));

		this.actions = actionList; // Queue<FantasyIntroAction> (array used as queue, see actionQueueIndex)
		this.actionQueueIndex = 0;
	}

	GetPaletteIndex(fantasyIntroGraphic) {
		return toByte(this.paletteOffset + getValue(FantasyIntroData.GraphicPalettes, fantasyIntroGraphic) - 1);
	}

	GetFairyFrameTextureOffset() {
		const textureFactor = Math.trunc(this.renderLayer.TextureFactor);
		const position = FantasyIntro.textureAtlas.GetOffset(FantasyIntroGraphic.Fairy);
		position.X += (this.fairyAnimationIndex % 6) * 64 * textureFactor;
		position.Y += Math.trunc(this.fairyAnimationIndex / 6) * 71 * textureFactor;
		return position;
	}

	EnsureSparkLine(index) {
		let [found, sparkLine] = tryGetValue(this.sparkLines, index);

		if (!found) {
			sparkLine = this.renderView.ColoredRectFactory.Create(2, 1, Color.Transparent, 25);
			sparkLine.Layer = this.colorLayer;
			sparkLine.ClipArea = new Rect(0, 0, 320, 256);
			this.sparkLines.set(index, sparkLine);
		}

		return sparkLine;
	}

	EnsureSparkDot(index) {
		let [found, sparkDot] = tryGetValue(this.sparkDots, index);

		if (!found) {
			sparkDot = this.renderView.ColoredRectFactory.Create(1, 1, Color.Transparent, 20);
			sparkDot.Layer = this.colorLayer;
			sparkDot.ClipArea = new Rect(0, 0, 320, 256);
			this.sparkDots.set(index, sparkDot);
		}

		// Dots and sparks share an index
		const [sparkFound, spark] = tryGetValue(this.sparks, index);
		if (sparkFound) {
			spark.Delete();
			this.sparks.delete(index);
		}

		return sparkDot;
	}

	EnsureWritingSpark(index) {
		let [found, spark] = tryGetValue(this.writingSparks, index);

		if (!found) {
			spark = this.renderView.SpriteFactory.Create(16, 9, true, 30);
			spark.Layer = this.renderLayer;
			spark.ClipArea = new Rect(0, 0, 320, 256);
			spark.TextureAtlasOffset = FantasyIntro.textureAtlas.GetOffset(FantasyIntroGraphic.WritingSparks);
			spark.PaletteIndex = this.GetPaletteIndex(FantasyIntroGraphic.WritingSparks);
			spark.Visible = false;
			this.writingSparks.set(index, spark);
		}

		return spark;
	}

	EnsureSpark(index) {
		let [found, spark] = tryGetValue(this.sparks, index);

		if (!found) {
			spark = this.renderView.SpriteFactory.Create(16, 5, true, 30);
			spark.Layer = this.renderLayer;
			spark.ClipArea = new Rect(0, 0, 320, 256);
			spark.TextureAtlasOffset = FantasyIntro.textureAtlas.GetOffset(FantasyIntroGraphic.FairySparks);
			spark.PaletteIndex = this.GetPaletteIndex(FantasyIntroGraphic.FairySparks);
			spark.Visible = false;
			this.sparks.set(index, spark);
		}

		// Dots and sparks share an index
		const [dotFound, sparkDot] = tryGetValue(this.sparkDots, index);
		if (dotFound) {
			sparkDot.Delete();
			this.sparkDots.delete(index);
		}

		return spark;
	}

	UpdateWritingSpark(index, x, y, frameIndex) {
		const spark = this.EnsureWritingSpark(index);
		spark.X = x;
		spark.Y = y;
		const textureFactor = Math.trunc(spark.Layer.TextureFactor);
		spark.TextureAtlasOffset = Position.op_Addition(FantasyIntro.textureAtlas.GetOffset(FantasyIntroGraphic.WritingSparks), new Position(0, frameIndex * 9 * textureFactor));
		spark.Visible = true;
	}

	UpdateSparkLine(index, x, y) {
		const sparkLine = this.EnsureSparkLine(index);
		sparkLine.X = x;
		sparkLine.Y = y;
		sparkLine.Visible = x >= 0;
	}

	UpdateSparkOrDot(index, x, y) {
		const [found, spark] = tryGetValue(this.sparks, index);

		if (found) {
			spark.X = x;
			spark.Y = y;
			spark.Visible = x >= 0;
		} else {
			const sparkDot = this.EnsureSparkDot(index);
			sparkDot.X = x;
			sparkDot.Y = y;
			sparkDot.Visible = x >= 0;
		}
	}

	UpdateSparkLineColor(index, colorIndex) {
		this.EnsureSparkLine(index).Color = this.colors[colorIndex & 0x1f];
	}

	UpdateSparkDotColor(index, colorIndex) {
		this.EnsureSparkDot(index).Color = this.colors[colorIndex & 0x1f];
	}

	get actionCount() {
		return this.actions.length - this.actionQueueIndex;
	}

	Update(deltaTime) {
		if (this.time === 0) {
			this.Active = true;
			this.backgroundLeftBorder.Visible = true;
			this.backgroundRightBorder.Visible = true;
			this.background.Visible = true;
			this.fadeArea.Visible = true;
		}

		this.time += deltaTime;
		const frame = Util.Floor(this.time / 0.02); // 20 ms per frame (= 50 interleaved screen renders)

		// lock (actions)
		{
			if (this.Active && this.actionCount === 0)
				this.Abort();
			else if (frame === this.lastFrame)
				return;

			this.lastFrame = frame;

			if (this.Active) {
				while (this.actionCount !== 0 && this.actions[this.actionQueueIndex].Frames <= frame) {
					this.ProcessAction(frame, this.actions[this.actionQueueIndex++]);
				}
			}
		}

		if (this.fairy != null && frame % 2 === 0) {
			if (this.playFairyAnimation) {
				++this.fairyAnimationIndex;

				if (this.fairyAnimationIndex === 3) // skip frame 3 at transition
					this.fairyAnimationIndex = 4;
				else if (this.fairyAnimationIndex === 23) {
					this.fairyAnimationIndex = 0;
					this.playFairyAnimation = false;
				}
			} else {
				// While moving / idle just loop the first 4 frames.
				this.fairyAnimationIndex = (this.fairyAnimationIndex + 1) & 0x3;
			}

			this.fairy.TextureAtlasOffset = this.GetFairyFrameTextureOffset();
		}

		if (this.fadeStartFrames >= 0 && frame - this.fadeStartFrames < 32) {
			let factor = frame - this.fadeStartFrames;
			factor = Math.trunc((factor * factor) / 4);
			const alpha = toByte(Util.Limit(0, this.fadeOut ? factor : 255 - factor, 255));
			this.fadeArea.Color = new Color(this.fadeArea.Color, alpha);
			this.fadeArea.Visible = true;
		} else {
			this.fadeArea.Visible = false;

			if (!this.Active)
				this.Destroy();
		}
	}

	ProcessAction(frame, action) {
		switch (action.Command) {
			case FantasyIntroCommand.FadeIn:
			{
				this.Fade(frame, false);
				break;
			}
			case FantasyIntroCommand.FadeOut:
			{
				this.Fade(frame, true);
				break;
			}
			case FantasyIntroCommand.MoveFairy:
			{
				this.fairy.X = action.Parameters[0];
				this.fairy.Y = action.Parameters[1];
				this.fairy.Visible = true;
				this.playFairyAnimation = false;
				break;
			}
			case FantasyIntroCommand.PlayFairyAnimation:
			{
				this.playFairyAnimation = true;
				break;
			}
			case FantasyIntroCommand.AddWritingPart:
			{
				// Each time by 4 pixels
				this.writing.Resize(this.writing.Width + 4, this.writing.Height);
				this.writing.Visible = true;
				break;
			}
			case FantasyIntroCommand.DrawSparkLine:
			{
				const index = action.Parameters[0];
				const sparkLine = this.EnsureSparkLine(index);
				sparkLine.Visible = true;
				break;
			}
			case FantasyIntroCommand.DrawSparkStar:
			{
				const index = action.Parameters[0];
				const spark = this.EnsureSpark(index);
				spark.Visible = true;
				break;
			}
			case FantasyIntroCommand.DrawSparkDot:
			{
				const index = action.Parameters[0];
				const sparkDot = this.EnsureSparkDot(index);
				sparkDot.Visible = true;
				break;
			}
			case FantasyIntroCommand.UpdateSparkLine:
			{
				this.UpdateSparkLine(action.Parameters[0], action.Parameters[1], action.Parameters[2]);
				break;
			}
			case FantasyIntroCommand.UpdateSparkStar:
			{
				this.UpdateSparkOrDot(action.Parameters[0], action.Parameters[1], action.Parameters[2]);
				break;
			}
			case FantasyIntroCommand.SetSparkLineColor:
			{
				this.UpdateSparkLineColor(action.Parameters[0], action.Parameters[1]);
				break;
			}
			case FantasyIntroCommand.SetSparkDotColor:
			{
				this.UpdateSparkDotColor(action.Parameters[0], action.Parameters[1]);
				break;
			}
			case FantasyIntroCommand.SetSparkStarFrame:
			{
				const index = action.Parameters[0];
				const frameIndex = action.Parameters[1];
				const spark = this.EnsureSpark(index);
				const textureFactor = Math.trunc(spark.Layer.TextureFactor);
				spark.TextureAtlasOffset = Position.op_Addition(FantasyIntro.textureAtlas.GetOffset(FantasyIntroGraphic.FairySparks), new Position(0, frameIndex * 5 * textureFactor));
				break;
			}
			case FantasyIntroCommand.UpdateWritingSpark:
			{
				const index = action.Parameters[0];
				const x = action.Parameters[1];
				const y = action.Parameters[2];
				const frameIndex = action.Parameters[3];
				const [found, spark] = x < 0 ? tryGetValue(this.writingSparks, index) : [false, null];
				if (x < 0 && found) {
					spark.Visible = false;
				} else if (x >= 0) {
					this.UpdateWritingSpark(index, x, y, frameIndex);
				}
				break;
			}
		}
	}

	Fade(frame, fadeOut) {
		this.fadeStartFrames = frame;
		this.fadeOut = fadeOut;
	}

	Abort() {
		this.Destroy();
	}

	Destroy() {
		this.Active = false;
		this.backgroundLeftBorder?.Delete();
		this.backgroundRightBorder?.Delete();
		this.background?.Delete();
		this.fairy?.Delete();
		this.writing?.Delete();
		this.fadeArea?.Delete();
		for (const writingSpark of this.writingSparks.values())
			writingSpark?.Delete();
		for (const spark of this.sparks.values())
			spark?.Delete();
		for (const sparkLine of this.sparkLines.values())
			sparkLine?.Delete();
		for (const sparkDot of this.sparkDots.values())
			sparkDot?.Delete();
		this.finishAction?.();
	}

	Random() {
		const next = toUInt(this.randomState * 53527);
		this.randomState = toUShort(next & 0xFFFF);
		return (next >>> 8) & 0x7FFF;
	}
}
