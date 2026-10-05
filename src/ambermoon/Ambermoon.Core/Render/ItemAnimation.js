// Port of Ambermoon.Core/Render/ItemAnimation.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { enumName } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { UIItem } from '../UI/UIItem.js';
import { Layer } from './Layer.js';
import { Graphics } from './Graphics.js';
import { TextureAtlasManager } from './TextureAtlasManager.js';

const Type = Object.freeze({
	Enchant: 0,
	Consume: 1,
	Destroy: 2,
	Move: 3,
	Shake: 4
});

const Layers = [
	Layer.UI, Layer.UI, Layer.Items, Layer.Items, Layer.Items
];

const DestroyAnimationPositions = [
	[0, -1, 1, -1, 1, -1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0],
	[0, -1, 1, -1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0],
	[1, -1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
	[1, -1, 1, -1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0],
	[1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
	[1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0],
	[0, -1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0]
];

export class ItemAnimation {
	static Type = Type;

	static GetItem(game, itemIndex) {
		return itemIndex == null ? null : game.ItemManager.GetItem(itemIndex);
	}

	static GetGraphicIndex(game, type, itemIndex) {
		switch (type) {
			case Type.Enchant:
				return Graphics.GetCustomUIGraphicIndex(UICustomGraphic.ItemMagicAnimation);
			case Type.Consume:
				return Graphics.GetUIGraphicIndex(UIGraphic.ItemConsume);
			default: {
				const graphicIndex = ItemAnimation.GetItem(game, itemIndex)?.GraphicIndex;
				if (graphicIndex == null)
					throw new AmbermoonException(ExceptionScope.Application, `No item was given for item animtion '${enumName(Type, type)}'`);
				return graphicIndex;
			}
		}
	}

	static PlayItemDestroyAnimation(game, renderView, position, graphicIndex, finishAction) {
		const sprites = new Array(128).fill(null);
		const animationPositionIndices = new Array(128).fill(0);
		const offset = TextureAtlasManager.Instance.GetOrCreate(Layer.Items).GetOffset(graphicIndex);
		const layer = renderView.GetLayer(Layer.Items);

		for (let y = 0; y < 8; ++y) {
			for (let x = 0; x < 8; ++x) {
				for (let i = 0; i < 2; ++i) {
					const index = i * 64 + x + y * 8;
					const sprite = sprites[index] = renderView.SpriteFactory.Create(1, 1, true, 255);
					sprite.Layer = layer;
					const textureFactor = layer.TextureFactor;
					sprite.TextureAtlasOffset = Position.op_Addition(offset, Position.op_Multiply(new Position(x * 2 + y % 2, y * 2 + x % 2), textureFactor));
					sprite.PaletteIndex = game.UIPaletteIndex;
					sprite.X = position.X + x * 2 + y % 2;
					sprite.Y = position.Y + y * 2 + x % 2;
					sprite.Visible = true;
					animationPositionIndices[index] = game.RandomInt(0, DestroyAnimationPositions.length - 1);
				}
			}
		}

		let numAnimationFrames = 8;

		const Animate = () => {
			if (--numAnimationFrames < 0) {
				for (let i = 0; i < 128; ++i)
					sprites[i]?.Delete();

				game.EndSequence();
				finishAction?.();
			} else {
				const frame = 7 - numAnimationFrames;

				for (let i = 0; i < 128; ++i) {
					const amplitude = i < 64 ? 1 : 2;
					const animationPositionIndex = animationPositionIndices[i];
					const centerX = position.X + 8;
					const xFactor = sprites[i].X < centerX ? -1 : 1;
					const x = DestroyAnimationPositions[animationPositionIndex][frame * 2] * amplitude;
					const y = DestroyAnimationPositions[animationPositionIndex][frame * 2 + 1] * amplitude;
					if (x === 0 && y === 0) {
						sprites[i].Visible = false;
					} else {
						sprites[i].X += 3 * xFactor * x;
						sprites[i].Y += 4 * y;
					}
				}

				game.AddTimedEvent(65, Animate);
			}
		};

		Animate();
	}

	/**
	 * Overloads:
	 * 1. Play(game, renderView, type, startPosition, finishAction = null, initialDelay = null, pixelsPerSecond = 300, visibilityChecker = null)
	 * 2. Play(game, renderView, type, startPosition, finishAction, initialDelay, targetPosition, Item item, pixelsPerSecond = 300, visibilityChecker = null)
	 * 3. Play(game, renderView, type, startPosition, finishAction, initialDelay, targetPosition, UIItem item, pixelsPerSecond = 300)
	 * 4. (private) Play(game, renderView, type, startPosition, finishAction, initialDelay, targetPosition, uint graphicIndex, UIItem item, pixelsPerSecond = 300, visibilityChecker = null)
	 * initialDelay is a TimeSpan in milliseconds (or null).
	 */
	static Play(game, renderView, type, startPosition, finishAction = null, initialDelay = null, ...rest) {
		if (rest.length === 0 || rest[0] === undefined || typeof rest[0] === 'number') {
			// Overload 1
			const pixelsPerSecond = rest[0] ?? 300;
			const visibilityChecker = rest[1] ?? null;
			playInternal(game, renderView, type, startPosition, finishAction, initialDelay, Position.Zero,
				ItemAnimation.GetGraphicIndex(game, type, null), null, pixelsPerSecond, visibilityChecker);
			return;
		}

		const targetPosition = rest[0];
		const itemOrGraphicIndex = rest[1];

		if (typeof itemOrGraphicIndex === 'number') {
			// Overload 4 (private)
			playInternal(game, renderView, type, startPosition, finishAction, initialDelay, targetPosition,
				itemOrGraphicIndex, rest[2] ?? null, rest[3] ?? 300, rest[4] ?? null);
		} else if (itemOrGraphicIndex instanceof UIItem) {
			// Overload 3
			const item = itemOrGraphicIndex;
			const pixelsPerSecond = rest[2] ?? 300;
			playInternal(game, renderView, type, startPosition, finishAction, initialDelay, targetPosition,
				ItemAnimation.GetGraphicIndex(game, type, item?.Item?.ItemIndex ?? null), item, pixelsPerSecond);
		} else {
			// Overload 2
			const item = itemOrGraphicIndex;
			const pixelsPerSecond = rest[2] ?? 300;
			const visibilityChecker = rest[3] ?? null;
			playInternal(game, renderView, type, startPosition, finishAction, initialDelay, targetPosition,
				ItemAnimation.GetGraphicIndex(game, type, item?.Index ?? null), null, pixelsPerSecond, visibilityChecker);
		}
	}

	static PlayMoveAnimation(game, startPosition, targetPosition, item, finishAction, pixelsPerSecond = 300) {
		const timePerFrame = 10;
		const dist = Position.op_Subtraction(targetPosition, startPosition);
		const distPerFrame = Math.trunc(pixelsPerSecond * timePerFrame / 1000);
		let moved = 0;
		const length = Math.fround(Math.sqrt(dist.X * dist.X + dist.Y * dist.Y));
		const maxMove = Util.Ceiling(length);

		const Move = () => {
			moved += distPerFrame;
			if (moved > maxMove)
				moved = maxMove;
			const factor = moved / length;
			item.Position = Position.op_Addition(startPosition, new Position(Util.Round(factor * dist.X), Util.Round(factor * dist.Y)));

			if (moved === maxMove) {
				item.Dragged = false;
				finishAction?.();
				finishAction = null;
			} else {
				game.AddTimedEvent(timePerFrame, Move);
			}
		};

		item.Dragged = true;
		item.ShowItemAmount = false;

		Move();
	}

	static PlayShakeAnimation(game, item, finishAction) {
		const baseX = item.Position.X;
		const minX = item.Position.X - 1;
		const maxX = item.Position.X + 1;
		let right = true;
		let runs = 7;

		const Shake = () => {
			if (right) {
				item.Position = new Position(item.Position.X + 1, item.Position.Y);

				if (item.Position.X === maxX)
					right = false;
			} else {
				item.Position = new Position(item.Position.X - 1, item.Position.Y);

				if (item.Position.X === minX || (runs === 0 && item.Position.X === baseX)) {
					right = true;

					if (--runs < 0) {
						finishAction?.();
						return;
					}
				}
			}

			game.AddTimedEvent(6, Shake);
		};

		Shake();
	}
}

/** The private Play overload (with graphic index). */
function playInternal(game, renderView, type, startPosition, finishAction, initialDelay, targetPosition, graphicIndex,
	item, pixelsPerSecond = 300, visibilityChecker = null) {
	const Start = () => {
		if (visibilityChecker?.() === false) {
			finishAction?.();
			return;
		}

		game.StartSequence();
		const typeIndex = type;
		const layer = Layers[typeIndex];
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(layer);
		const offset = textureAtlas.GetOffset(graphicIndex);

		switch (type) {
			case Type.Destroy: {
				ItemAnimation.PlayItemDestroyAnimation(game, renderView, startPosition, graphicIndex, finishAction);
				break;
			}
			case Type.Enchant:
			case Type.Consume: {
				let remainingFrames = type === Type.Enchant ? 8 : 11;
				const timePerFrame = type === Type.Enchant ? 110 : 60;
				const sprite = renderView.SpriteFactory.Create(16, 16, true, 255);
				sprite.TextureAtlasOffset = offset;
				sprite.Layer = renderView.GetLayer(layer);
				sprite.PaletteIndex = game.UIPaletteIndex;
				sprite.X = startPosition.X;
				sprite.Y = startPosition.Y;
				sprite.Visible = true;
				const Animate = () => {
					if (--remainingFrames === 0) {
						sprite?.Delete();
						game.EndSequence(false);
						finishAction?.();
					} else {
						const textureFactor = sprite.Layer.TextureFactor;
						sprite.TextureAtlasOffset = new Position(sprite.TextureAtlasOffset.X + 16 * textureFactor, sprite.TextureAtlasOffset.Y);
						game.AddTimedEvent(timePerFrame, Animate);
					}
				};
				game.AddTimedEvent(timePerFrame, Animate);
				break;
			}
			case Type.Move: {
				ItemAnimation.PlayMoveAnimation(game, startPosition, targetPosition, item, finishAction, pixelsPerSecond);
				break;
			}
			case Type.Shake: {
				ItemAnimation.PlayShakeAnimation(game, item, finishAction);
				break;
			}
			default: {
				throw new AmbermoonException(ExceptionScope.Application, `Invalid item animation type '${enumName(Type, type)}'`);
			}
		}
	};

	if (initialDelay != null)
		game.AddTimedEvent(initialDelay, Start);
	else
		Start();
}

export { Type as ItemAnimation_Type };
