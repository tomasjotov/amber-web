// Port of Ambermoon.Core/Render/Player3D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { hasFlag, toUInt } from '../../../runtime.js';
import { Position, FloatPosition } from '../../Ambermoon.Common/Position.js';
import { Direction, CharacterDirection } from '../../Ambermoon.Common/Direction.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Tileset } from '../../Ambermoon.Data.Common/Tileset.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { TravelType } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { EventType, ChangeTileEvent } from '../../Ambermoon.Data.Common/Event.js';
import { EventTrigger, MapExtensions } from '../MapExtensions.js';
import { Geometry } from '../Geometry/Geometry.js';
import { Global } from '../UI/Global.js';
import { RenderMap3D } from './RenderMap3D.js';

export class Player3D {
	// Original uses 120/512 but it feels bad.
	static get CollisionRadius() { return 72.0 * Global.DistancePerBlock / RenderMap3D.BlockSize; }
	static get TriggerEventRadius() { return 88.0 * Global.DistancePerBlock / RenderMap3D.BlockSize; } // TODO: use this

	constructor(game, player, mapManager, camera, map) {
		// primary constructor parameters
		this.player = player;
		this.mapManager = mapManager;

		this.game = game;
		this.map = map;
		this.angle = 0.0;
		this.lastPosition = null;
		this.Position = Position.Zero;
		this.Camera = camera;
	}

	get Angle() { return this.angle; }
	set Angle(value) {
		this.angle = value;

		while (this.angle <= -360.0)
			this.angle += 360.0;
		while (this.angle >= 360.0)
			this.angle -= 360.0;
	}

	ResetCameraPosition() {
		this.lastPosition = new Position(this.Position);
		const [x, z] = Geometry.BlockToCameraPosition(this.map.Map, this.Position);
		this.Camera.SetPosition(-x, z);
	}

	SetY(y) {
		this.Camera.SetPosition(-this.Camera.X, this.Camera.Z, y);
	}

	MoveTo(map, x, y, ticks, frameReset, newDirection, mapInitAction = null) {
		const game = this.game;

		if (newDirection === CharacterDirection.Random)
			newDirection = game.RandomInt(0, 3);

		this.lastPosition = new Position(this.Position);
		this.Position = new Position(x, y);

		if (this.map.Map !== map) {
			if (newDirection == null)
				throw new AmbermoonException(ExceptionScope.Application, 'Direction must be given when changing maps.');

			if (map.Type === MapType.Map2D) {
				game.Start2D(map, x, y, newDirection, false, mapInitAction);
			} else {
				this.map.SetMap(map, x, y, newDirection, game.CurrentPartyMember?.Race ?? Race.Human);
				mapInitAction?.(map);
				this.SetPosition(x, y, ticks, false);
				this.player.Position.X = this.Position.X;
				this.player.Position.Y = this.Position.Y;
				game.PlayerMoved(true);

				if (newDirection != null)
					this.Angle = newDirection * 90.0;
			}
		} else {
			const oldMapIndex = map.Index;
			this.SetPosition(x, y, ticks, false);
			game.PlayerMoved(oldMapIndex !== game.Map.Index);

			if (newDirection != null) {
				this.Angle = newDirection * 90.0;
				this.Camera.TurnTowards(this.Angle);
			}
		}

		this.player.Position.X = this.Position.X;
		this.player.Position.Y = this.Position.Y;
	}

	SetPosition(x, y, ticks, triggerEvents) {
		this.Position = new Position(x, y);
		this.ResetCameraPosition();

		if (triggerEvents) {
			MapExtensions.TriggerEvents(this.map.Map, this.game, EventTrigger.Move, toUInt(this.Position.X), toUInt(this.Position.Y), this.game.CurrentSavegame);
		}
	}

	TestCollision(x, z, lastMapX, lastMapY) {
		const [mapX, mapY] = Geometry.CameraToWorldPosition(this.map.Map, x, z);

		if (mapX < 0 || mapY < 0 || mapX > this.map.Map.Width - 0.5 || mapY > this.map.Map.Height - 0.5)
			return true;

		if (this.game.NoClip)
			return false;

		// This contains all collision bodies in a 3x3 area around the current position.
		const collisionDetectionInfo = this.map.GetCollisionDetectionInfoForPlayer(this.Position);

		return collisionDetectionInfo.TestCollision(lastMapX, lastMapY, mapX, mapY, Player3D.CollisionRadius, true);
	}

	GetTouchedPositions(radius) {
		return Geometry.CameraToTouchedBlockPositions(this.map.Map, this.Camera.X, this.Camera.Z, radius);
	}

	/**
	 * positionProvider: (distance, noX, noZ) => [newX, newY] (C# delegate with out parameters)
	 * mover: (distance, noX, noZ) => void
	 */
	Move(distance, ticks, positionProvider, mover, turning = false) {
		const game = this.game;
		const map = this.map;
		const Camera = this.Camera;
		const player = this.player;
		const mapManager = this.mapManager;

		const TriggerEvents = (touchedPositions, oldX, oldY, newX, newY) => {
			let anyEventTriggered = false;
			let anyEventTouched = false;
			const currentPosition = touchedPositions[0];

			for (const touchedPosition of touchedPositions) {
				let considerPosition = Position.op_Equality(touchedPosition, currentPosition);
				let considerNonExitPosition = considerPosition;

				if (!considerPosition) {
					const [touchX, touchY] = Geometry.BlockToCameraPosition(map.Map, touchedPosition);
					const sameXDirection = Math.sign(newX - oldX) === Math.sign(touchX - oldX);
					const sameYDirection = Math.sign(newY - oldY) === Math.sign(touchY - oldY);

					considerPosition = (sameXDirection && (sameYDirection || Math.abs(touchY - oldY) < 0.5 * Global.DistancePerBlock)) ||
						(sameYDirection && Math.abs(touchX - oldX) < 0.5 * Global.DistancePerBlock);
				}

				if (!considerNonExitPosition && considerPosition) {
					const [touchX, touchY] = Geometry.BlockToCameraPosition(map.Map, touchedPosition);
					considerNonExitPosition = Math.abs(touchY - newY) < 0.275 * Global.DistancePerBlock &&
						Math.abs(touchX - newX) < 0.275 * Global.DistancePerBlock;
				}

				// Tile change events that put something on the block where the player
				// stands should never be considered. Otherwise we would get stuck.
				if (considerPosition) {
					const block = map.Map.Blocks[touchedPosition.X][touchedPosition.Y];

					if (block.MapEventId !== 0 && game.CurrentSavegame.IsEventActive(map.Map.Index, block.MapEventId - 1)) {
						let event = map.Map.EventList[block.MapEventId - 1];

						do {
							if (event instanceof ChangeTileEvent) {
								const changeTileEvent = event;
								if (changeTileEvent.X === this.Position.X + 1 && changeTileEvent.Y === this.Position.Y + 1 &&
									changeTileEvent.WallIndex !== 0) {
									const labdata = mapManager.GetLabdataForMap(map.Map);
									const wall = labdata.Walls[changeTileEvent.WallIndex - 1];

									if (hasFlag(wall.Flags, Tileset.TileFlags.BlockAllMovement) ||
										!hasFlag(wall.Flags, Tileset.TileFlags.AllowMovementWalk)) {
										considerPosition = false;
										break;
									}
								}
							}

							event = event.Next;
						} while (event != null);
					}
				}

				if (considerPosition) {
					const Filter = event => {
						if (considerNonExitPosition)
							return true;

						if (event.Type === EventType.Teleport ||
							event.Type === EventType.EnterPlace ||
							event.Type === EventType.Chest ||
							event.Type === EventType.Door ||
							event.Type === EventType.Riddlemouth)
							return true;

						if (event.Next == null)
							return false;

						return Filter(event.Next);
					};

					let hasMapEvent = false;
					const oldMapIndex = map.Map.Index;
					const oldMapPosition = new Position(this.Position);
					if (!anyEventTriggered) {
						let triggered;
						[triggered, hasMapEvent] = MapExtensions.TriggerEvents(map.Map, game, EventTrigger.Move,
							toUInt(touchedPosition.X), toUInt(touchedPosition.Y), game.CurrentSavegame, Filter);
						anyEventTriggered = triggered;
					}

					if (!anyEventTouched && hasMapEvent)
						anyEventTouched = true;

					if (oldMapIndex !== game.Map.Index) {
						game.PlayerMoved(true);
						break; // map changed
					} else if (anyEventTriggered && !Position.op_Equality(oldMapPosition, this.Position)) {
						game.PlayerMoved(false, oldMapPosition);
						break; // teleported
					}
				}
			}

			if (!anyEventTouched)
				MapExtensions.ClearLastEvent(map.Map);

			return anyEventTriggered;
		};

		const MoveInternal = (noX, noZ) => {
			const oldX = Camera.X;
			const oldY = Camera.Z;
			mover(distance, noX, noZ);

			const touchedPositions = Geometry.CameraToTouchedBlockPositions(map.Map, Camera.X, Camera.Z, 0.75 * Global.DistancePerBlock);
			this.Position = touchedPositions[0];
			let moved = false;

			if (!Position.op_Equality(this.Position, this.lastPosition)) {
				player.Position.X = this.Position.X;
				player.Position.Y = this.Position.Y;
				this.lastPosition = new Position(this.Position);
				game.GameTime.MoveTick(map.Map, TravelType.Walk);
				moved = true;
				game.ResetMapCharacterInteraction(map.Map);
			}

			if (!TriggerEvents(touchedPositions, oldX, oldY, Camera.X, Camera.Z)) {
				if (moved)
					game.PlayerMoved(false, this.lastPosition);
				return true;
			}

			return false;
		};

		const TestMoveStop = (newX, newY) => {
			const touchedPositions = Geometry.CameraToTouchedBlockPositions(map.Map, Camera.X, Camera.Z, 0.75 * Global.DistancePerBlock);

			for (const touchedPosition of touchedPositions) {
				if (map.Map.StopMovingTowards(game.CurrentSavegame, touchedPosition.X, touchedPosition.Y)) {
					if (TriggerEvents(touchedPositions, Camera.X, Camera.Z, newX, newY))
						return true;
				}
			}

			return false;
		};

		const [cameraMapX, cameraMapY] = Geometry.CameraToWorldPosition(map.Map, Camera.X, Camera.Z);
		const collisionTestDistance = distance + (turning ? 0.334 : 0.2) * Global.DistancePerBlock;
		let [newX, newY] = positionProvider(collisionTestDistance, false, false);

		if (this.TestCollision(newX, newY, cameraMapX, cameraMapY)) {
			if (!TestMoveStop(newX, newY)) {
				// If collision is detected try to move only in x direction
				[newX, newY] = positionProvider(collisionTestDistance, false, true);

				if (!this.TestCollision(newX, newY, cameraMapX, cameraMapY)) { // we can move in x direction
					if (!TestMoveStop(newX, newY))
						return MoveInternal(false, true);
					return false;
				}

				// If collision is detected in x direction too, try to move only in z direction
				[newX, newY] = positionProvider(collisionTestDistance, true, false);

				if (!this.TestCollision(newX, newY, cameraMapX, cameraMapY)) { // we can move in z direction
					if (!TestMoveStop(newX, newY))
						return MoveInternal(true, false);
					return false;
				}

				// If we are here, we can't move at all
				game.DisplayOuch();
			}
		} else {
			// We can move freely
			if (!TestMoveStop(newX, newY))
				return MoveInternal(false, false);
		}

		return false;
	}

	MoveForward(distance, ticks, turning = false) {
		return this.Move(distance, ticks, (d, noX, noZ) => this.Camera.GetForwardPosition(d, noX, noZ),
			(d, noX, noZ) => this.Camera.MoveForward(d, noX, noZ), turning);
	}

	MoveBackward(distance, ticks, turning = false) {
		return this.Move(distance, ticks, (d, noX, noZ) => this.Camera.GetBackwardPosition(d, noX, noZ),
			(d, noX, noZ) => this.Camera.MoveBackward(d, noX, noZ), turning);
	}

	MoveLeft(distance, ticks, turning = false) {
		return this.Move(distance, ticks, (d, noX, noZ) => this.Camera.GetLeftPosition(d, noX, noZ),
			(d, noX, noZ) => this.Camera.MoveLeft(d, noX, noZ), turning);
	}

	MoveRight(distance, ticks, turning = false) {
		return this.Move(distance, ticks, (d, noX, noZ) => this.Camera.GetRightPosition(d, noX, noZ),
			(d, noX, noZ) => this.Camera.MoveRight(d, noX, noZ), turning);
	}

	TurnLeft(angle) { // in degrees
		this.Angle -= angle;
		this.Camera.TurnLeft(angle);
	}

	TurnRight(angle) { // in degrees
		this.Angle += angle;
		this.Camera.TurnRight(angle);
	}

	/**
	 * Overloads:
	 * - TurnTowards(float angle): turn to attacking monster or stand on a spinner (in degrees)
	 * - TurnTowards(FloatPosition position)
	 */
	TurnTowards(angleOrPosition) {
		if (typeof angleOrPosition === 'number') {
			const angle = angleOrPosition;
			this.Angle = angle;
			this.Camera.TurnTowards(angle);
			return;
		}

		const position = angleOrPosition;
		const [mapX, mapY] = Geometry.CameraToMapPosition(this.map.Map, this.Camera.X, this.Camera.Z);
		const playerPosition = new FloatPosition(mapX - 0.5 * Global.DistancePerBlock, mapY - 0.5 * Global.DistancePerBlock);
		let diffX = position.X - playerPosition.X;
		let diffY = position.Y - playerPosition.Y;
		const max = Math.max(Math.abs(diffX), Math.abs(diffY));

		if (max < 0.0001)
			return;

		diffX /= max;
		diffY /= max;
		const length = Math.sqrt(diffX * diffX + diffY * diffY);

		if (Math.abs(length) > 0.0001) {
			const x = diffX / length;
			const y = diffY / length;
			const angle = Math.atan2(y, x);
			this.TurnTowards(90.0 + (180.0 * angle / Math.PI));
		}
	}

	LevitateUp(distance) { // used for climbing up ladders/ropes or use levitation spell (distance is in the range of 0 to 1 where 1 is full room height)
		this.Camera.LevitateUp(distance);
	}

	LevitateDown(distance) { // used for climbing down ladders/ropes (distance is in the range of 0 to 1 where 1 is full room height)
		this.Camera.LevitateDown(distance);
	}

	get Direction() {
		let directionAngle = this.Angle;

		if (directionAngle > 315.0)
			directionAngle -= 360.0;
		if (directionAngle < -45.0)
			directionAngle += 360.0;

		if (directionAngle < 45.0)
			return CharacterDirection.Up;
		if (directionAngle < 135.0)
			return CharacterDirection.Right;
		if (directionAngle < 225.0)
			return CharacterDirection.Down;
		return CharacterDirection.Left;
	}

	get PreciseDirection() {
		let directionAngle = this.Angle;

		if (directionAngle > 337.5)
			directionAngle -= 360.0;
		if (directionAngle < -22.5)
			directionAngle += 360.0;

		if (directionAngle < 22.5)
			return Direction.Up;
		if (directionAngle < 67.5)
			return Direction.UpRight;
		if (directionAngle < 112.5)
			return Direction.Right;
		if (directionAngle < 157.5)
			return Direction.DownRight;
		if (directionAngle < 202.5)
			return Direction.Down;
		if (directionAngle < 247.5)
			return Direction.DownLeft;
		if (directionAngle < 292.5)
			return Direction.Left;
		return Direction.UpLeft;
	}
}
