// Port of Ambermoon.Core/Render/Player2D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { toUInt } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { CharacterDirection } from '../../Ambermoon.Common/Direction.js';
import { Map as DataMap } from '../../Ambermoon.Data.Common/Map.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { TravelType, TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { EventType, TeleportEvent, DoorEvent, ConditionEvent } from '../../Ambermoon.Data.Common/Event.js';
import { EventTrigger } from '../MapExtensions.js';
import { EventExtensions } from '../EventExtensions.js';
import { PlayerMovementAbility } from '../PlayerMovementAbility.js';
import { Character2D } from './Character2D.js';
import { TextureAtlasManager } from './TextureAtlasManager.js';
import { Layer } from './Layer.js';
import { RenderMap2D } from './RenderMap2D.js';

export class Player2D extends Character2D {
	constructor(game, layer, player, map, spriteFactory, startPosition, mapManager) {
		super(game, layer, TextureAtlasManager.Instance.GetOrCreate(Layer.Characters),
			spriteFactory, direction => game.GetPlayerAnimationInfo(direction), map, startPosition,
			() => game.GetPlayerPaletteIndex(), direction => game.GetPlayerDrawOffset(direction));
		this.game = game;
		this.player = player;
		this.mapManager = mapManager;
	}

	/**
	 * x,y in tiles
	 * C#: bool Move(int x, int y, uint ticks, TravelType travelType, out bool eventTriggered,
	 *     bool displayOuchIfBlocked = true, CharacterDirection? prevDirection = null, bool updateDirectionIfNotMoving = true)
	 * @returns {[boolean, boolean]} [canMove, eventTriggered]
	 */
	Move(x, y, ticks, travelType, displayOuchIfBlocked = true, prevDirection = null,
		updateDirectionIfNotMoving = true) {
		let eventTriggered = false;
		const game = this.game;
		const player = this.player;
		const mapManager = this.mapManager;

		if (player.MovementAbility === PlayerMovementAbility.NoMovement)
			return [false, eventTriggered];

		let canMove = true;
		const map = this.Map.Map;
		let newX = this.Position.X + x;
		let newY = this.Position.Y + y;
		let tile = null;

		if (!map.IsWorldMap) {
			// Don't leave the map.
			if (newX < 0 || newY < 0 || newX >= map.Width || newY >= map.Height)
				canMove = false;
			else
				tile = this.Map.get(toUInt(newX), toUInt(newY));
		} else {
			while (newX < 0)
				newX += map.Width;
			while (newY < 0)
				newY += map.Height;

			tile = this.Map.get(toUInt(newX), toUInt(newY));
		}

		if (canMove) {
			const tileset = mapManager.GetTilesetForMap(map);
			canMove = tile.AllowMovement(tileset, travelType);

			if (!canMove && travelType === TravelType.Swim && tile.AllowMovement(tileset, TravelType.Walk))
				canMove = true; // go on land

			if (!TravelTypeExtensions.IgnoreEvents(travelType)) {
				// check if there is a place, teleport, riddlemouth, chest
				// or door event at the new position
				const mapEventId = this.Map.get(toUInt(newX), toUInt(newY))?.MapEventId ?? null;

				if (mapEventId > 0 && game.CurrentSavegame.IsEventActive(map.Index, mapEventId - 1)) {
					let trigger = EventTrigger.Move;
					let lastEventStatus = false;

					// returns [bool, event]
					const HasSpecialEvent = (ev, map) => {
						let event = null;

						if (ev == null)
							return [false, event];

						if (ev.Type === EventType.EnterPlace ||
							(ev instanceof TeleportEvent && ev.Transition !== TeleportEvent.TransitionType.WindGate) ||
							ev.Type === EventType.Riddlemouth ||
							(ev.Type === EventType.Chest && this.Map.Map.IsWorldMap) ||
							(ev instanceof DoorEvent && game.CurrentSavegame.IsDoorLocked(ev.DoorIndex))) {
							event = ev;
							return [true, event];
						}

						if (ev.Next == null)
							return [false, event];

						if (ev instanceof ConditionEvent) {
							let aborted;
							[ev, trigger, lastEventStatus, aborted] = EventExtensions.ExecuteEvent(ev, map, game, trigger, toUInt(newX),
								toUInt(newY), lastEventStatus);

							if (aborted || ev == null)
								return [false, event];
						} else {
							ev = ev.Next;
						}

						return HasSpecialEvent(ev, map);
					};

					const mapAtNewPosition = this.Map.GetMapFromTile(toUInt(newX), toUInt(newY));
					const [hasSpecialEvent, event] = HasSpecialEvent(mapAtNewPosition.EventList[mapEventId - 1], mapAtNewPosition);

					if (hasSpecialEvent) {
						if (TravelTypeExtensions.BlockedByTeleport(travelType)) {
							// Web port: Amberstar travel exits leave the transport outside and continue on foot.
							if (event instanceof TeleportEvent && game.renderView.GameData?.IsAmberstar && event.NewTravelType === TravelType.Walk) {
								// allowed
							} else if (event instanceof TeleportEvent && !mapManager.GetMap(event.MapIndex).UseTravelTypes) {
								canMove = false;
							} else if (event instanceof DoorEvent) {
								canMove = false;
							}
						}

						if (canMove) {
							if (EventExtensions.TriggerEventChain(mapAtNewPosition, game, EventTrigger.Move, toUInt(newX), toUInt(newY),
								mapAtNewPosition.EventList[mapEventId - 1])) {
								eventTriggered = true;
								return [false, eventTriggered];
							}
						}
					}
				}
			}

			if (canMove && tile.Type === DataMap.TileType.Water && TravelTypeExtensions.BlockedByWater(travelType))
				canMove = false;
		}

		if (canMove) {
			const oldMap = map;
			let scrollX = 0;
			let scrollY = 0;
			prevDirection ??= this.Direction;
			let newDirection = CharacterDirection.Down;
			const lastPlayerPosition = new Position(player.Position);

			if (x > 0 && (map.IsWorldMap || (newX >= 6 && this.Map.ScrollX < this.Map.Map.Width - RenderMap2D.NUM_VISIBLE_TILES_X)))
				scrollX = 1;
			else if (x < 0 && (map.IsWorldMap || (newX <= map.Width - 7 && this.Map.ScrollX > 0)))
				scrollX = -1;

			if (y > 0 && (map.IsWorldMap || (newY >= 5 && this.Map.ScrollY < this.Map.Map.Height - RenderMap2D.NUM_VISIBLE_TILES_Y)))
				scrollY = 1;
			else if (y < 0 && (map.IsWorldMap || (newY <= map.Height - 6 && this.Map.ScrollY > 0)))
				scrollY = -1;

			if (y > 0)
				newDirection = CharacterDirection.Down;
			else if (y < 0)
				newDirection = CharacterDirection.Up;
			else if (x > 0)
				newDirection = CharacterDirection.Right;
			else if (x < 0)
				newDirection = CharacterDirection.Left;

			game.CurrentSavegame.CharacterDirection = player.Direction = newDirection;

			this.Map.Scroll(scrollX, scrollY);

			if (oldMap === this.Map.Map) {
				const frameReset = this.NumFrames === 1 || newDirection !== prevDirection;
				const prevState = this.CurrentState;

				this.MoveTo(oldMap, toUInt(newX), toUInt(newY), ticks, frameReset, null);

				game.ResetMapCharacterInteraction(map);

				if (!TravelTypeExtensions.IgnoreEvents(travelType)) {
					this.Map.TriggerEvents(this, EventTrigger.Move, toUInt(newX),
						toUInt(newY), mapManager, ticks, game.CurrentSavegame);
				}

				if (oldMap === this.Map.Map) { // might have changed by map change events
					if (!frameReset && this.CurrentState === prevState)
						this.SetCurrentFrame((this.CurrentFrame + 1) % this.NumFrames);

					player.Position.X = this.Position.X;
					player.Position.Y = this.Position.Y;

					tile = this.Map.get(toUInt(player.Position.X), toUInt(player.Position.Y));
					const hidePlayer = tile.Type === DataMap.TileType.Invisible && game.CanSee();
					this.Visible = travelType !== TravelType.Walk || !hidePlayer;

					game.PlayerMoved(false, lastPlayerPosition);
				}
			} else {
				// adjust player position on map transition
				const position = this.Map.GetCenterPosition();

				this.MoveTo(this.Map.Map, toUInt(position.X), toUInt(position.Y), ticks, false, player.Direction);

				game.ResetMapCharacterInteraction(map);

				if (!TravelTypeExtensions.IgnoreEvents(travelType)) {
					this.Map.TriggerEvents(this, EventTrigger.Move, toUInt(position.X),
						toUInt(position.Y), mapManager, ticks, game.CurrentSavegame);
				}

				if (this.Map.Map.Type === MapType.Map2D) {
					player.Position.X = this.Position.X;
					player.Position.Y = this.Position.Y;

					// Note: For 3D maps the game/3D map will handle player position updating.

					tile = this.Map.get(toUInt(player.Position.X), toUInt(player.Position.Y));
					const hidePlayer = tile.Type === DataMap.TileType.Invisible && game.CanSee();
					this.Visible = travelType !== TravelType.Walk || !hidePlayer;

					game.PlayerMoved(true, null, true, oldMap);
				}
			}
		} else {
			if (displayOuchIfBlocked)
				game.DisplayOuch();

			if (updateDirectionIfNotMoving) {
				// If not able to move, the direction should be adjusted
				let newDirection = this.Direction;

				if (y > 0)
					newDirection = CharacterDirection.Down;
				else if (y < 0)
					newDirection = CharacterDirection.Up;
				else if (x > 0)
					newDirection = CharacterDirection.Right;
				else if (x < 0)
					newDirection = CharacterDirection.Left;

				if (newDirection !== this.Direction) {
					this.MoveTo(this.Map.Map, toUInt(this.Position.X), toUInt(this.Position.Y), ticks, true, newDirection);
					player.Direction = newDirection;
					game.CurrentSavegame.CharacterDirection = newDirection;
					this.UpdateAppearance(game.CurrentTicks);
					tile = this.Map.get(toUInt(this.Position.X), toUInt(this.Position.Y));
					const hidePlayer = tile.Type === DataMap.TileType.Invisible && game.CanSee();
					this.Visible = travelType !== TravelType.Walk || !hidePlayer;
				}
			}
		}

		return [canMove, eventTriggered];
	}

	UpdateAppearance(ticks) {
		this.MoveTo(this.Map.Map, toUInt(this.Position.X), toUInt(this.Position.Y), ticks, true, null);
	}

	MoveTo(map, x, y, ticks, frameReset, newDirection, mapInitAction = null) {
		if (this.Map.Map !== map)
			this.Visible = true; // reset visibility before changing map

		super.MoveTo(map, x, y, ticks, frameReset, newDirection, mapInitAction);

		if (frameReset && map.Type === MapType.Map2D && !map.UseTravelTypes)
			this.SetCurrentFrame(this.CurrentFrameIndex + 1); // Middle move frame = stand frame
	}

	Update(ticks, gameTime, ...args) {
		if (args.length === 2) {
			// protected base overload Update(ticks, gameTime, mapAnimation, tileFlags)
			super.Update(ticks, gameTime, ...args);
			return;
		}

		// do not animate so don't call base.Update here
	}
}
