// Port of Ambermoon.Core/Render/Character2D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentOutOfRangeException, hasFlag, toByte, toInt, toUInt } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { CharacterDirection } from '../../Ambermoon.Common/Direction.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Map as DataMap } from '../../Ambermoon.Data.Common/Map.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { Tileset } from '../../Ambermoon.Data.Common/Tileset.js';
import { GameCore } from '../GameCore.js';
import { Global } from '../UI/Global.js';
import { RenderMap2D } from './RenderMap2D.js';

// Note: Player2D and MapCharacter2D derive from this class, so they are not imported here
// (would create an import cycle evaluated at module load time). Type checks use duck typing.
function isPlayer2D(character) {
	return typeof character.UpdateAppearance === 'function' && typeof character.Move === 'function';
}

function isMapCharacter2D(character) {
	return typeof character.CheckDeactivation === 'function' && typeof character.StopMonsterForOneTimeSlot === 'function';
}

const State = Object.freeze({
	Stand: 0,
	Sit: 1,
	Sleep: 2
});

// A 2D character like the player, NPCs or enemies
// is a movable sprite which supports animation.
// On each movement the animation frame changes.
// Some characters may have also animations while
// not moving. Characters will sit if they move onto
// a chair and will sleep if they move onto a bed.
export class Character2D {
	static State = State;

	constructor(game, layer, textureAtlas, spriteFactory, animationInfoProvider, map, startPosition,
		paletteIndexProvider, drawOffsetProvider) {
		this.topSprite = null; // for non-world maps the upper half is drawn separatly
		this.sprite = null;
		this.active = true;
		this.visible = true;
		this.CurrentBaseFrameIndex = 0;
		this.CurrentFrameIndex = 0;
		this.lastFrameReset = 0;
		this.baselineOffset = -1;
		this.Direction = CharacterDirection.Down;
		this.Map = null; // Note: No character will appear on world maps so the map is always a non-world map (only exception is the player)
		this.Position = null; // in tiles
		this.CurrentState = State.Stand;

		this.game = game;
		this.spriteFactory = spriteFactory;
		this.Map = map;
		this.textureAtlas = textureAtlas;
		this.animationInfoProvider = animationInfoProvider;
		this.paletteIndexProvider = paletteIndexProvider;
		this.drawOffsetProvider = drawOffsetProvider;
		const currentAnimationInfo = this.CurrentAnimationInfo;
		this.CurrentBaseFrameIndex = this.CurrentFrameIndex = currentAnimationInfo.StandFrameIndex;
		const textureOffset = textureAtlas.GetOffset(this.CurrentFrameIndex);
		const drawOffset = drawOffsetProvider?.(null) ?? new Position();
		if (currentAnimationInfo.UseTopSprite) {
			this.sprite = spriteFactory.CreateAnimated(currentAnimationInfo.FrameWidth, Math.min(currentAnimationInfo.FrameHeight, RenderMap2D.TILE_HEIGHT),
				textureAtlas.Texture.Width, currentAnimationInfo.NumStandFrames);
			this.topSprite = spriteFactory.CreateAnimated(currentAnimationInfo.FrameWidth, Math.max(0, currentAnimationInfo.FrameHeight - RenderMap2D.TILE_HEIGHT),
				textureAtlas.Texture.Width, currentAnimationInfo.NumStandFrames);
			this.topSprite.TextureAtlasOffset = textureOffset;
			const textureFactor = Math.trunc(layer.TextureFactor);
			this.sprite.TextureAtlasOffset = Position.op_Addition(textureOffset, new Position(0, (currentAnimationInfo.FrameHeight - RenderMap2D.TILE_HEIGHT) * textureFactor));
			this.topSprite.Layer = layer;
			this.topSprite.PaletteIndex = toByte(paletteIndexProvider());
			this.topSprite.ClipArea = GameCore.Map2DViewArea;
			this.topSprite.X = Global.Map2DViewX + (startPosition.X - Math.trunc(map.ScrollX)) * RenderMap2D.TILE_WIDTH + drawOffset.X;
			this.topSprite.Y = Global.Map2DViewY + (startPosition.Y - Math.trunc(map.ScrollY)) * RenderMap2D.TILE_HEIGHT + drawOffset.Y +
				RenderMap2D.TILE_HEIGHT - currentAnimationInfo.FrameHeight;
			this.sprite.X = this.topSprite.X;
			this.sprite.Y = this.topSprite.Y + this.topSprite.Height;
		} else {
			this.sprite = spriteFactory.CreateAnimated(currentAnimationInfo.FrameWidth, currentAnimationInfo.FrameHeight,
				textureAtlas.Texture.Width, currentAnimationInfo.NumStandFrames);
			this.sprite.TextureAtlasOffset = textureOffset;
			this.sprite.X = Global.Map2DViewX + (startPosition.X - Math.trunc(map.ScrollX)) * RenderMap2D.TILE_WIDTH + drawOffset.X;
			this.sprite.Y = Global.Map2DViewY + (startPosition.Y - Math.trunc(map.ScrollY)) * RenderMap2D.TILE_HEIGHT + drawOffset.Y;
		}
		this.sprite.Layer = layer;
		this.sprite.PaletteIndex = toByte(paletteIndexProvider());
		this.sprite.ClipArea = GameCore.Map2DViewArea;
		this.UpdateBaseline();
		this.Position = startPosition;
	}

	get CurrentAnimationInfo() { return this.animationInfoProvider(this.Direction); }
	get CurrentFrame() { return this.sprite.CurrentFrame; }
	get FrameCount() { return this.sprite.NumFrames; }

	get BaselineOffset() { return this.baselineOffset; }
	set BaselineOffset(value) {
		if (this.baselineOffset === value)
			return;

		this.baselineOffset = value;
		this.UpdateBaseline();
	}

	get DisplayArea() {
		return new Rect(this.topSprite?.X ?? this.sprite.X, this.topSprite?.Y ?? this.sprite.Y,
			Math.max(this.topSprite?.Width ?? 0, this.sprite.Width), (this.topSprite?.Height ?? 0) + this.sprite.Height);
	}

	get Visible() { return this.visible; }
	set Visible(value) {
		this.visible = value;

		this.sprite.Visible = this.visible && this.active;

		if (this.topSprite != null)
			this.topSprite.Visible = this.sprite.Visible;
	}

	get Active() { return this.active; }
	set Active(value) {
		this.active = value;

		this.sprite.Visible = this.visible && this.active;

		if (this.topSprite != null)
			this.topSprite.Visible = this.sprite.Visible;
	}

	get NumFrames() {
		let frames;
		switch (this.CurrentState) {
			case State.Stand:
				frames = this.CurrentAnimationInfo.NumStandFrames;
				break;
			case State.Sit:
				frames = this.CurrentAnimationInfo.NumSitFrames;
				break;
			case State.Sleep:
				frames = this.CurrentAnimationInfo.NumSleepFrames;
				break;
			default:
				throw new ArgumentOutOfRangeException('Invalid character state');
		}
		return Math.max(1, frames);
	}

	RecheckTopSprite() {
		const currentAnimationInfo = this.CurrentAnimationInfo;

		if (currentAnimationInfo.UseTopSprite && currentAnimationInfo.FrameHeight > RenderMap2D.TILE_HEIGHT) {
			if (this.topSprite == null) {
				this.sprite.Resize(currentAnimationInfo.FrameWidth, Math.min(currentAnimationInfo.FrameHeight, RenderMap2D.TILE_HEIGHT));
				this.topSprite = this.spriteFactory.CreateAnimated(currentAnimationInfo.FrameWidth, Math.max(0, currentAnimationInfo.FrameHeight - RenderMap2D.TILE_HEIGHT),
					this.textureAtlas.Texture.Width, currentAnimationInfo.NumStandFrames);
				this.topSprite.TextureAtlasOffset = this.sprite.TextureAtlasOffset;
				const textureFactor = Math.trunc(this.sprite.Layer?.TextureFactor ?? 1);
				this.sprite.TextureAtlasOffset = Position.op_Addition(this.sprite.TextureAtlasOffset, new Position(0, this.topSprite.Height * textureFactor));
				this.topSprite.Layer = this.sprite.Layer;
				this.topSprite.PaletteIndex = this.sprite.PaletteIndex;
				this.topSprite.ClipArea = GameCore.Map2DViewArea;
				this.topSprite.X = this.sprite.X;
				this.topSprite.Y = this.sprite.Y;
				this.sprite.Y += this.topSprite.Height;
			}
		} else {
			if (this.topSprite != null) {
				this.sprite.TextureAtlasOffset = this.topSprite.TextureAtlasOffset;
				this.sprite.Resize(currentAnimationInfo.FrameWidth, currentAnimationInfo.FrameHeight);
				this.sprite.X = this.topSprite.X;
				this.sprite.Y = this.topSprite.Y;
				this.topSprite.Delete();
				this.topSprite = null;
			}
		}
	}

	Destroy() {
		this.sprite?.Delete();
		this.topSprite?.Delete();
	}

	UpdateBaseline() {
		if (isPlayer2D(this) && this.baselineOffset === GameCore.MaxBaseLine) {
			this.sprite.BaseLineOffset = GameCore.MaxBaseLine;
			if (this.topSprite != null)
				this.topSprite.BaseLineOffset = GameCore.MaxBaseLine;
		} else {
			const drawOffset = this.drawOffsetProvider?.(this.Direction) ?? new Position();
			this.sprite.BaseLineOffset = this.baselineOffset + 1 - drawOffset.Y + (this.topSprite == null ? drawOffset.Y :
				Math.max(0, RenderMap2D.TILE_HEIGHT - this.CurrentAnimationInfo.FrameHeight % RenderMap2D.TILE_HEIGHT) - RenderMap2D.TILE_HEIGHT);
			if (this.topSprite != null)
				this.topSprite.BaseLineOffset = this.baselineOffset + 1 - drawOffset.Y + this.CurrentAnimationInfo.FrameHeight;
			else if ((drawOffset.Y + this.CurrentAnimationInfo.FrameHeight) % RenderMap2D.TILE_HEIGHT !== 0)
				this.sprite.BaseLineOffset = Math.max(this.sprite.BaseLineOffset, (RenderMap2D.TILE_HEIGHT + drawOffset.Y) % RenderMap2D.TILE_HEIGHT + 1);
			else this.sprite.BaseLineOffset = Math.max(this.sprite.BaseLineOffset, RenderMap2D.TILE_HEIGHT - 1);
			// TODO: travel types should be divided into tiles like the player in indoor 2D maps
			// so that each part can use a suitable baseline and it looks much better (when riding through trees it looks bad even in original)
		}
	}

	SetDirection(direction, ticks) {
		this.MoveTo(this.Map.Map, toUInt(this.Position.X), toUInt(this.Position.Y), ticks, true, direction);
	}

	MoveTo(map, x, y, ticks, frameReset, newDirection, mapInitAction = null) {
		if (newDirection === CharacterDirection.Random)
			newDirection = this.game.RandomInt(0, 3);

		if (map !== this.Map.Map) {
			if (newDirection == null)
				throw new AmbermoonException(ExceptionScope.Application, 'Direction must be given when changing maps.');

			if (map.Type === MapType.Map2D) {
				this.game.Start2D(map, x, y, newDirection, false, mapInitAction);
				return;
			} else {
				this.game.Start3D(map, x, y, newDirection, false, mapInitAction);
				return;
			}
		} else if (newDirection == null) {
			// Only adjust direction when not changing the map.

			// Note: Whenever y changes the front/back frame is used.
			// Only for pure x movements the side frames are used.
			if (y < this.Position.Y) {
				// Move back (look up)
				this.Direction = CharacterDirection.Up;
			} else if (y > this.Position.Y) {
				// Move front (look down)
				this.Direction = CharacterDirection.Down;
			} else if (x < this.Position.X) {
				// Move purely left
				this.Direction = CharacterDirection.Left;
			} else if (x > this.Position.X) {
				// Move purely right
				this.Direction = CharacterDirection.Right;
			}
		} else {
			this.Direction = newDirection;
		}

		let moved = true;
		const sprite = this.sprite;
		const topSprite = this.topSprite;

		if (x === 0xffffffff || y === 0xffffffff) {
			this.Position.X = toInt(x);
			this.Position.Y = toInt(y);
			sprite.Visible = false;
			if (topSprite != null)
				topSprite.Visible = false;
		} else {
			const animationInfo = this.CurrentAnimationInfo;
			const tileType = this.Map.get(x, y).Type;
			if (topSprite == null)
				sprite.Resize(animationInfo.FrameWidth, animationInfo.FrameHeight);
			else {
				topSprite.Resize(animationInfo.FrameWidth, animationInfo.FrameHeight - RenderMap2D.TILE_HEIGHT);
				sprite.Resize(animationInfo.FrameWidth, RenderMap2D.TILE_HEIGHT);
			}
			if (animationInfo.IgnoreTileType) {
				this.CurrentState = State.Stand;
			} else {
				switch (tileType) {
					case DataMap.TileType.ChairUp:
					case DataMap.TileType.ChairRight:
					case DataMap.TileType.ChairDown:
					case DataMap.TileType.ChairLeft:
						this.CurrentState = State.Sit;
						break;
					case DataMap.TileType.Bed:
						this.CurrentState = State.Sleep;
						break;
					default:
						this.CurrentState = State.Stand;
						break;
				}
			}
			sprite.NumFrames = this.NumFrames;
			if (topSprite != null)
				topSprite.NumFrames = this.NumFrames;
			if (animationInfo.IgnoreTileType) {
				this.CurrentBaseFrameIndex = animationInfo.StandFrameIndex;
			} else {
				switch (tileType) {
					case DataMap.TileType.ChairUp:
						this.CurrentBaseFrameIndex = animationInfo.SitFrameIndex;
						break;
					case DataMap.TileType.ChairRight:
						this.CurrentBaseFrameIndex = animationInfo.SitFrameIndex + 1;
						break;
					case DataMap.TileType.ChairDown:
						this.CurrentBaseFrameIndex = animationInfo.SitFrameIndex + 2;
						break;
					case DataMap.TileType.ChairLeft:
						this.CurrentBaseFrameIndex = animationInfo.SitFrameIndex + 3;
						break;
					case DataMap.TileType.Bed:
						this.CurrentBaseFrameIndex = animationInfo.SleepFrameIndex;
						break;
					default:
						this.CurrentBaseFrameIndex = animationInfo.StandFrameIndex;
						break;
				}
			}
			if (!animationInfo.NoDirections && this.CurrentBaseFrameIndex === animationInfo.StandFrameIndex)
				this.CurrentBaseFrameIndex += this.Direction * sprite.NumFrames;
			this.CurrentFrameIndex = this.CurrentBaseFrameIndex;
			if (topSprite == null)
				sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(this.CurrentFrameIndex);
			else {
				topSprite.TextureAtlasOffset = this.textureAtlas.GetOffset(this.CurrentFrameIndex);
				const textureFactor = Math.trunc(sprite.Layer?.TextureFactor ?? 1);
				sprite.TextureAtlasOffset = Position.op_Addition(topSprite.TextureAtlasOffset, new Position(0, topSprite.Height * textureFactor));
			}
			if (frameReset) {
				sprite.CurrentFrame = 0;
				if (topSprite != null)
					topSprite.CurrentFrame = 0;
				this.lastFrameReset = ticks;
			} else {
				sprite.CurrentFrame = sprite.CurrentFrame; // this may correct the value if NumFrames has changed
				if (topSprite != null)
					topSprite.CurrentFrame = sprite.CurrentFrame;
			}
			if (this.Position.X === x && this.Position.Y === y)
				moved = false;
			else {
				this.Position.X = toInt(x);
				this.Position.Y = toInt(y);
			}
			const drawOffset = this.drawOffsetProvider?.(this.Direction) ?? new Position();
			sprite.PaletteIndex = toByte(this.paletteIndexProvider());
			if (topSprite == null) {
				sprite.X = Global.Map2DViewX + (this.Position.X - Math.trunc(this.Map.ScrollX)) * RenderMap2D.TILE_WIDTH + drawOffset.X;
				sprite.Y = Global.Map2DViewY + (this.Position.Y - Math.trunc(this.Map.ScrollY)) * RenderMap2D.TILE_HEIGHT + drawOffset.Y;
			} else {
				topSprite.X = Global.Map2DViewX + (this.Position.X - Math.trunc(this.Map.ScrollX)) * RenderMap2D.TILE_WIDTH + drawOffset.X;
				topSprite.Y = Global.Map2DViewY + (this.Position.Y - Math.trunc(this.Map.ScrollY)) * RenderMap2D.TILE_HEIGHT + drawOffset.Y +
					RenderMap2D.TILE_HEIGHT - animationInfo.FrameHeight;
				sprite.X = topSprite.X;
				sprite.Y = topSprite.Y + topSprite.Height;
				topSprite.PaletteIndex = sprite.PaletteIndex;
				topSprite.Visible = GameCore.Map2DViewArea.IntersectsWith(this.DisplayArea);
			}
			sprite.Visible = GameCore.Map2DViewArea.IntersectsWith(this.DisplayArea);
			const hidePlayer = tileType === DataMap.TileType.Invisible && this.game.CanSee();
			if (sprite.Visible && hidePlayer)
				sprite.Visible = false;
			if (topSprite != null && topSprite.Visible && hidePlayer)
				topSprite.Visible = false;
			this.UpdateBaseline();
		}

		if (moved) {
			if (isPlayer2D(this))
				this.Map.CheckIfMonstersSeePlayer(x, y);
			else if (isMapCharacter2D(this) && this.IsMonster)
				this.Map.CheckIfMonsterSeesPlayer(this, this.sprite.Visible);
		}
	}

	/**
	 * Overloads:
	 * - protected Update(ticks, gameTime, mapAnimation, tileFlags)
	 * - public virtual Update(ticks, gameTime, allowInstantMovement, lastPlayerPosition, mapAnimation, tileFlags)
	 * Subclasses override the 6 argument version. To call the 4 argument version from a subclass use super.Update(...).
	 */
	Update(ticks, gameTime, ...args) {
		if (args.length === 2) {
			const [mapAnimation, tileFlags] = args;
			const sprite = this.sprite;
			const elapsedTicks = toUInt(ticks - this.lastFrameReset);

			const numFrameTicks = Math.trunc(elapsedTicks / this.CurrentAnimationInfo.TicksPerFrame);
			let frame = 0;
			const x = this.Position.X - Math.trunc(this.Map.ScrollX);
			const y = this.Position.Y - Math.trunc(this.Map.ScrollY);
			const tileIndex = y * RenderMap2D.NUM_VISIBLE_TILES_X + x;

			for (let i = 0; i < numFrameTicks; i++) {
				frame = mapAnimation.UpdateFrameIndex(frame, sprite.NumFrames, tileIndex,
					hasFlag(tileFlags, Tileset.TileFlags.WaveAnimation), hasFlag(tileFlags, Tileset.TileFlags.RandomAnimationStart));
			}

			sprite.CurrentFrame = frame;
			if (this.topSprite != null)
				this.topSprite.CurrentFrame = sprite.CurrentFrame;
			this.CurrentFrameIndex = this.CurrentBaseFrameIndex + sprite.CurrentFrame;
			return;
		}

		const [/* allowInstantMovement */, /* lastPlayerPosition */, mapAnimation, tileFlags] = args;
		Character2D.prototype.Update.call(this, ticks, gameTime, mapAnimation, tileFlags);
	}

	SetCurrentFrame(frameIndex) {
		this.sprite.CurrentFrame = frameIndex; // this will take care of modulo frame count
		if (this.topSprite != null)
			this.topSprite.CurrentFrame = frameIndex;
		this.CurrentFrameIndex = this.CurrentBaseFrameIndex + this.sprite.CurrentFrame;
	}
}
