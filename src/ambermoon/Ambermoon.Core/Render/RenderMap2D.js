// Port of Ambermoon.Core/Render/RenderMap2D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, Event, firstOrDefault, getValue, hasFlag, removeItem, toByte, toUInt } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Map as DataMap } from '../../Ambermoon.Data.Common/Map.js';
import { Tileset } from '../../Ambermoon.Data.Common/Tileset.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { EventTrigger, MapExtensions } from '../MapExtensions.js';
import { GameCore } from '../GameCore.js';
import { Raycast2D } from '../Geometry/Raycast2D.js';
import { Global } from '../UI/Global.js';
import { MapAnimation } from './MapAnimation.js';
import { MapCharacter2D } from './MapCharacter2D.js';
import { TextureAtlasManager } from './TextureAtlasManager.js';
import { Layer } from './Layer.js';
import { Graphics } from './Graphics.js';

class Transport {
	constructor() {
		// This is the array index in the savegame transport location array.
		this.Index = 0;
		this.Position = null;
		this.Sprite = null;
		this.Offset = null;
	}
}

export class RenderMap2D {
	static TILE_WIDTH = 16;
	static TILE_HEIGHT = 16;
	static NUM_VISIBLE_TILES_X = 11; // maps will always be at least 11x11 in size
	static NUM_VISIBLE_TILES_Y = 9; // maps will always be at least 11x11 in size
	static NUM_TILES = RenderMap2D.NUM_VISIBLE_TILES_X * RenderMap2D.NUM_VISIBLE_TILES_Y;
	static Transport = Transport;

	constructor(game, map, mapManager, renderView, initialScrollX = 0, initialScrollY = 0) {
		this.Map = null;
		this.adjacentMaps = null;
		this.tileset = null;
		this.mapManager = null;
		this.renderView = null;
		this.textureAtlas = null;
		this.backgroundTileSprites = [];
		this.foregroundTileSprites = [];
		this.mapTransports = [];
		this.ticksPerFrame = 0;
		this.worldMap = false;
		this.lastFrame = 0;
		this.lastUpdateScroll = null;
		this.lastUpdateMap = null;
		this.mapCharacters = new Map();
		this.MapChanged = new Event();
		this.ScrollX = 0;
		this.ScrollY = 0;

		this.game = game;
		this.mapManager = mapManager;
		this.renderView = renderView;
		this.mapAnimation = new MapAnimation(game);

		const spriteFactory = renderView.SpriteFactory;
		const TILE_WIDTH = RenderMap2D.TILE_WIDTH;
		const TILE_HEIGHT = RenderMap2D.TILE_HEIGHT;

		for (let row = 0; row < RenderMap2D.NUM_VISIBLE_TILES_Y; ++row) {
			for (let column = 0; column < RenderMap2D.NUM_VISIBLE_TILES_X; ++column) {
				const backgroundSprite = spriteFactory.CreateAnimated(TILE_WIDTH, TILE_HEIGHT, 0, 1);
				const foregroundSprite = spriteFactory.CreateAnimated(TILE_WIDTH, TILE_HEIGHT, 0, 1);

				backgroundSprite.Visible = true;
				backgroundSprite.X = Global.Map2DViewX + column * TILE_WIDTH;
				backgroundSprite.Y = Global.Map2DViewY + row * TILE_HEIGHT;
				foregroundSprite.Visible = false;
				foregroundSprite.X = Global.Map2DViewX + column * TILE_WIDTH;
				foregroundSprite.Y = Global.Map2DViewY + row * TILE_HEIGHT;

				this.backgroundTileSprites.push(backgroundSprite);
				this.foregroundTileSprites.push(foregroundSprite);
			}
		}

		this.SetMap(map, initialScrollX, initialScrollY);
	}

	Update(ticks, gameTime, monstersCanMoveImmediately, lastPlayerPosition) {
		const frame = Math.trunc(ticks / this.ticksPerFrame);

		if (frame !== this.lastFrame) {
			this.mapAnimation.Tick();

			let index = 0;

			for (let row = 0; row < RenderMap2D.NUM_VISIBLE_TILES_Y; ++row) {
				for (let column = 0; column < RenderMap2D.NUM_VISIBLE_TILES_X; ++column) {
					const tile = this.get(this.ScrollX + column, this.ScrollY + row);

					if (tile.BackTileIndex !== 0) {
						const background = this.backgroundTileSprites[index];

						if (background.NumFrames > 1) {
							const backTile = this.tileset.Tiles[tile.BackTileIndex - 1];

							background.CurrentFrame = toUInt(this.mapAnimation.UpdateFrameIndex(
								background.CurrentFrame,
								background.NumFrames,
								index, hasFlag(backTile.Flags, Tileset.TileFlags.WaveAnimation),
								hasFlag(backTile.Flags, Tileset.TileFlags.RandomAnimationStart)
							));
						}
					}

					if (tile.FrontTileIndex !== 0) {
						const foreground = this.foregroundTileSprites[index];

						if (foreground.NumFrames > 1) {
							const frontTile = this.tileset.Tiles[tile.FrontTileIndex - 1];

							foreground.CurrentFrame = toUInt(this.mapAnimation.UpdateFrameIndex(
								foreground.CurrentFrame,
								foreground.NumFrames,
								index, hasFlag(frontTile.Flags, Tileset.TileFlags.WaveAnimation),
								hasFlag(frontTile.Flags, Tileset.TileFlags.RandomAnimationStart)
							));
						}
					}

					++index;
				}
			}

			this.lastFrame = frame;
		}

		for (const [, Value] of this.mapCharacters)
			Value.Update(ticks, gameTime, monstersCanMoveImmediately, lastPlayerPosition, this.mapAnimation, Value.TileFlags);
	}

	Pause() {
		for (const [, Value] of this.mapCharacters)
			Value.Paused = true;
	}

	Resume() {
		for (const [, Value] of this.mapCharacters)
			Value.Paused = false;
	}

	IsTilePoisoning(x, y) {
		if (this.Map == null)
			return false;

		const tile = this.get(toUInt(x), toUInt(y));

		if (tile.FrontTileIndex !== 0) {
			const frontTile = this.tileset.Tiles[tile.FrontTileIndex - 1];

			if (hasFlag(frontTile.Flags, Tileset.TileFlags.AutoPoison))
				return true;
		}

		if (tile.BackTileIndex !== 0) {
			const backTile = this.tileset.Tiles[tile.BackTileIndex - 1];

			if (hasFlag(backTile.Flags, Tileset.TileFlags.AutoPoison))
				return true;
		}

		return false;
	}

	static TestCharacterInteraction(mapCharacter, cursor, position) {
		if (!mapCharacter.Visible || !mapCharacter.Active)
			return false;

		if (Position.op_Equality(position, mapCharacter.Position))
			return true;

		return cursor && mapCharacter.IsRealCharacter && Position.op_Equality(position, new Position(mapCharacter.Position.X, mapCharacter.Position.Y - 1));
	}

	TriggerEvents(player, trigger, x, y, mapManager, ticks, savegame) {
		const Map = this.Map;

		if (trigger !== EventTrigger.Always) {
			// First check character interaction
			const position = new Position(x, y);
			for (const [, Value] of [...this.mapCharacters]) {
				if (RenderMap2D.TestCharacterInteraction(Value, trigger !== EventTrigger.Move, position) &&
					Value.Interact(trigger, this.get(toUInt(Value.Position.X),
						toUInt(Value.Position.Y)).Type === DataMap.TileType.Bed))
					return true;
			}
		}

		if (x >= Map.Width) {
			if (y >= Map.Height)
				return MapExtensions.TriggerEvents(this.adjacentMaps[2], this.game, trigger, x - Map.Width,
					y - Map.Height, savegame);
			else
				return MapExtensions.TriggerEvents(this.adjacentMaps[0], this.game, trigger, x - Map.Width,
					y, savegame);
		} else if (y >= Map.Height) {
			return MapExtensions.TriggerEvents(this.adjacentMaps[1], this.game, trigger, x, y - Map.Height,
				savegame);
		} else {
			return MapExtensions.TriggerEvents(Map, this.game, trigger, x, y, savegame);
		}
	}

	GetEvent(x, y, savegame) {
		const Map = this.Map;

		if (x >= Map.Width) {
			if (y >= Map.Height)
				return MapExtensions.GetEvent(this.adjacentMaps[2], x - Map.Width, y - Map.Height, savegame);
			else
				return MapExtensions.GetEvent(this.adjacentMaps[0], x - Map.Width, y, savegame);
		} else if (y >= Map.Height) {
			return MapExtensions.GetEvent(this.adjacentMaps[1], x, y - Map.Height, savegame);
		} else {
			return MapExtensions.GetEvent(Map, x, y, savegame);
		}
	}

	/**
	 * Converts a map view position (pixels) to a tile position
	 * (x gives the tile column index and y the tile row index).
	 *
	 * Note that x and y can exceed map width or height for world
	 * maps as there can be 2x2 world maps displayed at the same
	 * time. The tile position will still be relative to the
	 * first map though.
	 * @param position Position inside the map view in pixels
	 * @returns Null if not a valid map position or the transformed position otherwise
	 */
	PositionToTile(position) {
		if (position.X < 0 || position.Y < 0 ||
			position.X >= Global.Map2DViewWidth || position.Y >= Global.Map2DViewHeight)
			return null;

		return new Position(
			this.ScrollX + Math.trunc(position.X / RenderMap2D.TILE_WIDTH),
			this.ScrollY + Math.trunc(position.Y / RenderMap2D.TILE_HEIGHT)
		);
	}

	GetCenterPosition() {
		return new Position(this.ScrollX + Math.trunc(RenderMap2D.NUM_VISIBLE_TILES_X / 2), this.ScrollY + Math.trunc(RenderMap2D.NUM_VISIBLE_TILES_Y / 2));
	}

	GetCharacterFromTile(x, y) {
		return firstOrDefault(this.mapCharacters.values(), mapCharacter => mapCharacter.Active && mapCharacter.Position.X === x && mapCharacter.Position.Y === y);
	}

	GetMapFromTile(x, y) {
		const Map = this.Map;

		if (this.adjacentMaps == null)
			return Map;

		if (x >= Map.Width) {
			if (y >= Map.Height)
				return this.adjacentMaps[2];
			else
				return this.adjacentMaps[0];
		} else if (y >= Map.Height) {
			return this.adjacentMaps[1];
		} else {
			return Map;
		}
	}

	/**
	 * Indexer: this[Position position] or this[uint x, uint y]
	 */
	get(x, y) {
		if (arguments.length === 1) {
			const position = x;
			return this.get(toUInt(position.X), toUInt(position.Y));
		}

		const Map = this.Map;

		if (x >= Map.Width) {
			if (y >= Map.Height)
				return this.adjacentMaps[2].Tiles[x - Map.Width][y - Map.Height];
			else
				return this.adjacentMaps[0].Tiles[x - Map.Width][y];
		} else if (y >= Map.Height) {
			return this.adjacentMaps[1].Tiles[x][y - Map.Height];
		} else {
			return Map.Tiles[x][y];
		}
	}

	Destroy() {
		for (const tile of this.backgroundTileSprites)
			tile.Visible = false;
		for (const tile of this.foregroundTileSprites)
			tile.Visible = false;
		this.ClearTransports();
		this.ClearCharacters();
	}

	ClearCharacters() {
		[...this.mapCharacters.values()].forEach(character => character.Destroy());
		this.mapCharacters.clear();
	}

	ClearTransports() {
		this.mapTransports.forEach(transport => transport.Sprite?.Delete());
		this.mapTransports.length = 0;
	}

	RepositionTransports(lastMap) {
		const Map = this.Map;

		if (lastMap == null || !lastMap.UseTravelTypes || !Map.UseTravelTypes)
			return;

		const offset = Position.op_Subtraction(Map.MapOffset, lastMap.MapOffset);

		if (Math.abs(offset.X) >= 2 * Map.Width || Math.abs(offset.Y) >= 2 * Map.Height) {
			this.ClearTransports();
			return;
		}

		for (const transport of this.mapTransports.slice()) { // ToList is needed as we might modify the collection
			let lastMapIndex = lastMap.Index;

			if (transport.Position.X >= lastMap.Width) {
				if (transport.Position.Y >= lastMap.Height)
					lastMapIndex = lastMap.DownRightMapIndex;
				else
					lastMapIndex = lastMap.RightMapIndex;
			} else if (transport.Position.Y >= lastMap.Height)
				lastMapIndex = lastMap.RightMapIndex;

			if (lastMapIndex !== Map.Index &&
				lastMapIndex !== Map.RightMapIndex &&
				lastMapIndex !== Map.DownMapIndex &&
				lastMapIndex !== Map.DownRightMapIndex) {
				transport.Sprite.Delete();
				removeItem(this.mapTransports, transport);
			} else {
				transport.Position.X += offset.X * RenderMap2D.TILE_WIDTH;
				transport.Position.Y += offset.Y * RenderMap2D.TILE_HEIGHT;
			}
		}
	}

	UpdateTransports() {
		for (const transport of this.mapTransports) {
			transport.Sprite.X = Global.Map2DViewX + Math.trunc(transport.Position.X - this.ScrollX) * RenderMap2D.TILE_WIDTH + transport.Offset.X;
			transport.Sprite.Y = Global.Map2DViewY + Math.trunc(transport.Position.Y - this.ScrollY) * RenderMap2D.TILE_HEIGHT + transport.Offset.Y;
		}
	}

	RemoveTransport(index) {
		const transport = firstOrDefault(this.mapTransports, t => t.Index === index);

		if (transport != null) {
			transport.Sprite.Delete();
			removeItem(this.mapTransports, transport);
		}
	}

	PlaceTransport(mapIndex, x, y, travelType, index) {
		if (this.mapTransports.some(t => t.Index === index))
			return;

		const Map = this.Map;
		const adjacentMaps = this.adjacentMaps;
		const position = new Position(x, y);

		if (mapIndex !== Map.Index) {
			if (mapIndex !== adjacentMaps[0].Index &&
				mapIndex !== adjacentMaps[1].Index &&
				mapIndex !== adjacentMaps[2].Index)
				return;

			if (mapIndex === adjacentMaps[0].Index || mapIndex === adjacentMaps[2].Index)
				position.X += Map.Width;
			if (mapIndex === adjacentMaps[1].Index || mapIndex === adjacentMaps[2].Index)
				position.Y += Map.Height;
		}

		const TILE_WIDTH = RenderMap2D.TILE_WIDTH;
		const TILE_HEIGHT = RenderMap2D.TILE_HEIGHT;
		const info = getValue(this.renderView.GameData.StationaryImageInfos, travelType);
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.Characters);
		const sprite = this.renderView.SpriteFactory.Create(info.Width, info.Height, false);
		const offset = new Position(Math.trunc((TILE_WIDTH - info.Width) / 2) - 2, Math.trunc((TILE_HEIGHT - info.Height) / 2) - 2);
		sprite.Layer = this.renderView.GetLayer(Layer.Characters);
		sprite.ClipArea = GameCore.Map2DViewArea;
		sprite.BaseLineOffset = Math.trunc(TILE_HEIGHT / 2);
		sprite.PaletteIndex = toByte(this.game.GetPlayerPaletteIndex());
		sprite.TextureAtlasOffset = textureAtlas.GetOffset(Graphics.TransportGraphicOffset + TravelTypeExtensions.AsStationaryImageIndex(travelType));
		sprite.X = Global.Map2DViewX + (position.X - this.ScrollX) * TILE_WIDTH + offset.X;
		sprite.Y = Global.Map2DViewY + (position.Y - this.ScrollY) * TILE_HEIGHT + offset.Y;
		sprite.Visible = true;
		const transport = new Transport();
		transport.Index = index;
		transport.Position = position;
		transport.Sprite = sprite;
		transport.Offset = offset;
		this.mapTransports.push(transport);
	}

	UpdateTile(x, y) {
		const ScrollX = this.ScrollX;
		const ScrollY = this.ScrollY;

		if (x < ScrollX || y < ScrollY || x >= ScrollX + RenderMap2D.NUM_VISIBLE_TILES_X || y >= ScrollY + RenderMap2D.NUM_VISIBLE_TILES_Y)
			return; // not visible

		const spriteIndex = x - ScrollX + (y - ScrollY) * RenderMap2D.NUM_VISIBLE_TILES_X;
		const tile = this.get(x, y);
		const backgroundTileSprites = this.backgroundTileSprites;
		const foregroundTileSprites = this.foregroundTileSprites;

		if (tile.BackTileIndex === 0) {
			backgroundTileSprites[spriteIndex].Visible = false;
		} else {
			const backTile = this.tileset.Tiles[tile.BackTileIndex - 1];
			const backGraphicIndex = backTile.GraphicIndex;
			backgroundTileSprites[spriteIndex].TextureAtlasOffset = this.textureAtlas.GetOffset(backGraphicIndex - 1);
			backgroundTileSprites[spriteIndex].NumFrames = toUInt(backTile.NumAnimationFrames);
			backgroundTileSprites[spriteIndex].CurrentFrame = 0;
			backgroundTileSprites[spriteIndex].Alternate = hasFlag(backTile.Flags, Tileset.TileFlags.WaveAnimation);
			backgroundTileSprites[spriteIndex].Visible = true;
		}

		if (tile.FrontTileIndex === 0) {
			foregroundTileSprites[spriteIndex].Visible = false;
		} else {
			const frontTile = this.tileset.Tiles[tile.FrontTileIndex - 1];
			const frontGraphicIndex = frontTile.GraphicIndex;
			foregroundTileSprites[spriteIndex].TextureAtlasOffset = this.textureAtlas.GetOffset(frontGraphicIndex - 1);
			foregroundTileSprites[spriteIndex].NumFrames = toUInt(frontTile.NumAnimationFrames);
			foregroundTileSprites[spriteIndex].CurrentFrame = 0;
			foregroundTileSprites[spriteIndex].Alternate = hasFlag(frontTile.Flags, Tileset.TileFlags.WaveAnimation);
			foregroundTileSprites[spriteIndex].Visible = true;
			foregroundTileSprites[spriteIndex].BaseLineOffset = frontTile.BringToFront ? RenderMap2D.TILE_HEIGHT + 2 : frontTile.Background ? -1 : 0;
		}
	}

	UpdateTiles() {
		const renderView = this.renderView;
		const tileset = this.tileset;
		const backLayer = renderView.GetLayer(Layer.MapBackground1 + tileset.Index - 1);
		const frontLayer = renderView.GetLayer(Layer.MapForeground1 + tileset.Index - 1);
		this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.MapBackground1 + tileset.Index - 1);
		const textureAtlas = this.textureAtlas;
		let index = 0;
		const mapChange = this.Map !== this.lastUpdateMap;
		if (mapChange)
			this.lastUpdateScroll = null;
		this.lastUpdateMap = this.Map;
		this.lastUpdateScroll = new Position(this.ScrollX, this.ScrollY);
		const Map = this.Map;
		const backgroundTileSprites = this.backgroundTileSprites;
		const foregroundTileSprites = this.foregroundTileSprites;

		for (let row = 0; row < RenderMap2D.NUM_VISIBLE_TILES_Y; ++row) {
			for (let column = 0; column < RenderMap2D.NUM_VISIBLE_TILES_X; ++column) {
				const tile = this.get(this.ScrollX + column, this.ScrollY + row);

				backgroundTileSprites[index].Layer = backLayer;
				backgroundTileSprites[index].TextureAtlasWidth = textureAtlas.Texture.Width;
				backgroundTileSprites[index].PaletteIndex = toByte(Map.PaletteIndex - 1);
				foregroundTileSprites[index].Layer = frontLayer;
				foregroundTileSprites[index].TextureAtlasWidth = textureAtlas.Texture.Width;
				foregroundTileSprites[index].PaletteIndex = toByte(Map.PaletteIndex - 1);

				if (tile.BackTileIndex === 0) {
					backgroundTileSprites[index].Visible = false;
				} else {
					const backTile = tileset.Tiles[tile.BackTileIndex - 1];
					const backGraphicIndex = backTile.GraphicIndex;
					backgroundTileSprites[index].TextureAtlasOffset = textureAtlas.GetOffset(backGraphicIndex - 1);
					backgroundTileSprites[index].NumFrames = toUInt(backTile.NumAnimationFrames);
					backgroundTileSprites[index].CurrentFrame = 0;
					backgroundTileSprites[index].Alternate = hasFlag(backTile.Flags, Tileset.TileFlags.WaveAnimation);
					backgroundTileSprites[index].Visible = true;
					backgroundTileSprites[index].BaseLineOffset = 0;
				}

				if (tile.FrontTileIndex === 0) {
					foregroundTileSprites[index].Visible = false;
				} else {
					const frontTile = tileset.Tiles[tile.FrontTileIndex - 1];
					const frontGraphicIndex = frontTile.GraphicIndex;
					foregroundTileSprites[index].TextureAtlasOffset = textureAtlas.GetOffset(frontGraphicIndex - 1);
					foregroundTileSprites[index].NumFrames = toUInt(frontTile.NumAnimationFrames);
					foregroundTileSprites[index].CurrentFrame = 0;
					foregroundTileSprites[index].Visible = true;
					foregroundTileSprites[index].Alternate = hasFlag(frontTile.Flags, Tileset.TileFlags.WaveAnimation);
					foregroundTileSprites[index].BaseLineOffset = frontTile.BringToFront ? (Map.UseTravelTypes ? RenderMap2D.TILE_HEIGHT : 2 * RenderMap2D.TILE_HEIGHT) + 2 : frontTile.Background ? -1 : 0;
				}

				++index;
			}
		}

		this.Update(0, this.game.GameTime, false, null);
	}

	/**
	 * Overloads:
	 * - IsMapVisible(index) -> bool
	 * - IsMapVisible(index, ref localMapX, ref localMapY) -> [bool, localMapX, localMapY]
	 */
	IsMapVisible(index, localMapX, localMapY) {
		const Map = this.Map;

		if (arguments.length === 1) {
			if (Map == null) // current map might be a 3D map, then Map is null here
				return false;

			if (Map.Index === index)
				return true;

			if (!Map.IsWorldMap)
				return false;

			return index === Map.RightMapIndex ||
				index === Map.DownMapIndex ||
				index === Map.DownRightMapIndex;
		}

		if (Map == null) // current map might be a 3D map, then Map is null here
			return [false, localMapX, localMapY];

		if (Map.Index === index)
			return [true, localMapX, localMapY];

		if (!Map.IsWorldMap)
			return [false, localMapX, localMapY];

		if (index === Map.RightMapIndex ||
			index === Map.DownRightMapIndex)
			localMapX = toUInt(localMapX + Map.Width);

		if (index === Map.DownMapIndex ||
			index === Map.DownRightMapIndex)
			localMapY = toUInt(localMapY + Map.Height);

		return [index === Map.RightMapIndex ||
			index === Map.DownMapIndex ||
			index === Map.DownRightMapIndex, localMapX, localMapY];
	}

	/**
	 * Overloads:
	 * - LimitScrollOffset(ref uint x, ref uint y, Map? map = null) -> [x, y]
	 * - LimitScrollOffset(Position position, out Map newMap) -> [newMap] (position is modified in place)
	 */
	LimitScrollOffset(x, y, map = null) {
		const NUM_VISIBLE_TILES_X = RenderMap2D.NUM_VISIBLE_TILES_X;
		const NUM_VISIBLE_TILES_Y = RenderMap2D.NUM_VISIBLE_TILES_Y;

		if (x instanceof Position) {
			const position = x;
			const Map = this.Map;
			let newMap = Map;

			if (Map.IsWorldMap) {
				if (position.X < 0) {
					newMap = this.game.MapManager.GetMap(Map.LeftMapIndex);
					position.X += Map.Width;
				}
				if (position.Y < 0) {
					newMap = this.game.MapManager.GetMap(newMap.UpMapIndex);
					position.Y += newMap.Height;
				}

				position.X = Util.Limit(0, position.X - Math.trunc(NUM_VISIBLE_TILES_X / 2), Map.Width - 1);
				position.Y = Util.Limit(0, position.Y - Math.trunc(NUM_VISIBLE_TILES_Y / 2), Map.Height - 1);
			} else {
				position.X = Util.Limit(0, position.X - Math.trunc(NUM_VISIBLE_TILES_X / 2), Map.Width - NUM_VISIBLE_TILES_X);
				position.Y = Util.Limit(0, position.Y - Math.trunc(NUM_VISIBLE_TILES_Y / 2), Map.Height - NUM_VISIBLE_TILES_Y);
			}

			return [newMap];
		}

		map ??= this.Map;

		if (map.IsWorldMap) {
			x = toUInt(Util.Limit(0, x - Math.trunc(NUM_VISIBLE_TILES_X / 2), map.Width - 1));
			y = toUInt(Util.Limit(0, y - Math.trunc(NUM_VISIBLE_TILES_Y / 2), map.Height - 1));
		} else {
			x = toUInt(Util.Limit(0, x - Math.trunc(NUM_VISIBLE_TILES_X / 2), map.Width - NUM_VISIBLE_TILES_X));
			y = toUInt(Util.Limit(0, y - Math.trunc(NUM_VISIBLE_TILES_Y / 2), map.Height - NUM_VISIBLE_TILES_Y));
		}

		return [x, y];
	}

	SetMap(map, initialScrollX = 0, initialScrollY = 0) {
		if (this.Map === map || map == null)
			return;

		if (map.Type !== MapType.Map2D)
			throw new AmbermoonException(ExceptionScope.Application, 'Tried to load a 3D map into a 2D render map.');

		const lastMap = this.Map;
		map.Reset();
		this.Map = map;
		this.tileset = this.mapManager.GetTilesetForMap(map);
		this.ticksPerFrame = map.TicksPerAnimationFrame;

		if (map.IsWorldMap) {
			this.worldMap = true;
			this.adjacentMaps = [
				this.mapManager.GetMap(map.RightMapIndex),
				this.mapManager.GetMap(map.DownMapIndex),
				this.mapManager.GetMap(map.DownRightMapIndex)
			];
		} else {
			this.worldMap = false;
			this.adjacentMaps = null;
		}

		if (map.UseTravelTypes)
			this.RepositionTransports(lastMap);

		this.ClearCharacters();

		this.ScrollTo(initialScrollX, initialScrollY, true); // also updates tiles etc

		this.AddCharacters(map);

		if (map.IsWorldMap)
			this.InvokeMapChangedHandler(lastMap, map, this.adjacentMaps[0], this.adjacentMaps[1], this.adjacentMaps[2]);
		else
			this.InvokeMapChangedHandler(lastMap, map);
	}

	InvokeMapChange() {
		const Map = this.Map;

		if (Map.IsWorldMap) {
			this.InvokeMapChangedHandler(null, Map,
				this.mapManager.GetMap(Map.RightMapIndex),
				this.mapManager.GetMap(Map.DownMapIndex),
				this.mapManager.GetMap(Map.DownRightMapIndex));
		} else
			this.InvokeMapChangedHandler(null, Map);
	}

	AddCharacters(map) {
		for (let characterIndex = 0; characterIndex < map.CharacterReferences.length; ++characterIndex) {
			const characterReference = map.CharacterReferences[characterIndex];

			if (characterReference == null)
				break;

			const mapCharacter = MapCharacter2D.Create(this.game, this.renderView, this.mapManager, this, characterIndex, characterReference);
			mapCharacter.Active = !this.game.CurrentSavegame.GetCharacterBit(map.Index, characterIndex);
			if (this.mapCharacters.has(characterIndex))
				throw new ArgumentException('An item with the same key has already been added.');
			this.mapCharacters.set(characterIndex, mapCharacter);
		}
	}

	CheckIfMonsterSeesPlayer(monster, visible) {
		const game = this.game;

		if (this.Map.IsWorldMap) {
			game.MonsterSeesPlayer = false;
			return;
		}

		monster.CheckedIfSeesPlayer = true;
		monster.SeesPlayer = false;

		if (!game.MonsterSeesPlayer && visible) {
			monster.SeesPlayer = this.MonsterSeesPlayer(monster.Position, null, null);

			if (monster.SeesPlayer)
				game.MonsterSeesPlayer = true;
		} else if (game.MonsterSeesPlayer) {
			this.CheckIfMonstersSeePlayer();
		}
	}

	CheckIfMonstersSeePlayer(playerX = null, playerY = null) {
		const game = this.game;

		game.MonsterSeesPlayer = false;

		if (!this.Map.IsWorldMap) {
			let check = true;

			for (const [, Value] of [...this.mapCharacters].filter(c => c[1].Active && c[1].IsMonster)) {
				if (check) {
					Value.CheckedIfSeesPlayer = true;
					Value.SeesPlayer = false;

					if (this.MonsterSeesPlayer(Value.Position, playerX, playerY)) {
						Value.SeesPlayer = true;
						game.MonsterSeesPlayer = true;
						check = false;
					}
				} else {
					Value.CheckedIfSeesPlayer = false;
				}
			}
		}
	}

	MonsterSeesPlayer(monsterPosition, playerX = null, playerY = null) {
		const game = this.game;
		const position = new Position(playerX ?? toUInt(game.RenderPlayer.Position.X), playerY ?? toUInt(game.RenderPlayer.Position.Y));
		return !Raycast2D.TestRay(this.Map, position.X, position.Y, monsterPosition.X, monsterPosition.Y, tile => tile.BlocksSight(this.tileset));
	}

	UpdateCharacterVisibility(characterIndex) {
		if (this.Map.CharacterReferences[characterIndex] == null)
			throw new AmbermoonException(ExceptionScope.Application, 'Null map character');

		getValue(this.mapCharacters, characterIndex).Active = !this.game.CurrentSavegame.GetCharacterBit(this.Map.Index, characterIndex);

		this.CheckIfMonstersSeePlayer();
	}

	InvokeMapChangedHandler(lastMap, ...maps) {
		this.MapChanged.invoke(lastMap, maps);
	}

	Scroll(x, y) {
		const newScrollX = this.ScrollX + x;
		const newScrollY = this.ScrollY + y;
		const Map = this.Map;

		if (this.worldMap) {
			if (newScrollX < 0 || newScrollY < 0 || newScrollX >= Map.Width || newScrollY >= Map.Height) {
				let newMap;

				if (newScrollX < 0)
					newMap = this.mapManager.GetMap(Map.LeftMapIndex);
				else if (newScrollX >= Map.Width)
					newMap = this.mapManager.GetMap(Map.RightMapIndex);
				else
					newMap = Map;

				if (newScrollY < 0)
					newMap = this.mapManager.GetMap(newMap.UpMapIndex);
				else if (newScrollY >= Map.Height)
					newMap = this.mapManager.GetMap(newMap.DownMapIndex);

				const newMapScrollX = newScrollX < 0 ? toUInt(Map.Width + newScrollX) : toUInt(newScrollX % Map.Width);
				const newMapScrollY = newScrollY < 0 ? toUInt(Map.Height + newScrollY) : toUInt(newScrollY % Map.Height);

				this.SetMap(newMap, newMapScrollX, newMapScrollY);
				this.game.MonsterSeesPlayer = false;

				return true;
			}
		} else {
			if (newScrollX < 0 || newScrollY < 0 || newScrollX > Map.Width - RenderMap2D.NUM_VISIBLE_TILES_X || newScrollY > Map.Height - RenderMap2D.NUM_VISIBLE_TILES_Y)
				return false;
		}

		this.ScrollTo(toUInt(newScrollX), toUInt(newScrollY), false);

		return true;
	}

	/**
	 * Overloads: ScrollToPlayer(uint x, uint y) and ScrollToPlayer(Position playerPosition)
	 */
	ScrollToPlayer(playerPosition, y) {
		if (arguments.length >= 2) {
			this.ScrollToPlayer(new Position(playerPosition, y));
			return;
		}

		playerPosition ??= this.game.PartyPosition;

		let x = toUInt(playerPosition.X);
		let y2 = toUInt(playerPosition.Y);
		[x, y2] = this.LimitScrollOffset(x, y2);
		this.ScrollTo(x, y2);
	}

	ScrollTo(x, y, forceUpdate = false) {
		if (!forceUpdate && this.ScrollX === x && this.ScrollY === y)
			return;

		this.ScrollX = x;
		this.ScrollY = y;

		if (!this.worldMap) {
			// check scroll offset for non-world maps
			if (this.ScrollX > this.Map.Width - RenderMap2D.NUM_VISIBLE_TILES_X)
				throw new AmbermoonException(ExceptionScope.Render, 'Map scroll x position is outside the map bounds.');
			if (this.ScrollY > this.Map.Height - RenderMap2D.NUM_VISIBLE_TILES_Y)
				throw new AmbermoonException(ExceptionScope.Render, 'Map scroll y position is outside the map bounds.');
		}

		this.UpdateTiles();
		this.UpdateTransports();
	}

	GetCombatBackgroundIndex(map, x, y) {
		const tile = map.Tiles[x][y];
		const tilesetTile = tile.BackTileIndex === 0
			? this.tileset.Tiles[tile.FrontTileIndex - 1]
			: this.tileset.Tiles[tile.BackTileIndex - 1];
		return tilesetTile.CombatBackgroundIndex;
	}

	StopMonstersForOneTimeSlot() {
		for (const [, Value] of [...this.mapCharacters].filter(c => c[1]?.Active === true && c[1]?.IsMonster === true))
			Value.StopMonsterForOneTimeSlot();
	}
}
