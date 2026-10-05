// Port of Ambermoon.Core/Render/Character3D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Event, toUInt } from '../../../runtime.js';
import { Position, FloatPosition } from '../../Ambermoon.Common/Position.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { PositionExtensions } from '../Geometry/PositionExtensions.js';
import { GameCore } from '../GameCore.js';
import { Global } from '../UI/Global.js';

const State = Object.freeze({
	IdleOnTile: 0,
	Idle: 1,
	MovingToTile: 2,
	MovingTowardsPlayer: 3,
	BlockedToPlayer: 4
});

const TimePerMovement = 2000; // in ms

// Position * float in C# yields a FloatPosition.
function multiplyToFloat(position, factor) {
	return FloatPosition.op_Multiply(new FloatPosition(position), factor);
}

export class Character3D {
	static TimePerMovement = TimePerMovement;
	static get TicksPerMovement() { return Math.trunc(TimePerMovement * GameCore.TicksPerSecond / 1000); }
	static get BlockDivider() { return 1.0 / Global.DistancePerBlock; }
	static State = State;

	constructor(game) {
		this.lastTilePosition = Position.Zero;
		this.targetTilePosition = null;
		this.RealPosition = FloatPosition.Zero;
		this.direction = null;
		this.currentState = State.IdleOnTile;
		this.lastMoveTicks = 0;
		this.movedTicks = 0;
		this.ticksPerMovement = Character3D.TicksPerMovement;
		this.NextMoveTimeSlot = 0xffffffff;
		this.RandomMovementRequested = new Event();
		this.MoveRequested = new Event();
		this.Paused = false;

		this.game = game;
		this.ResetMovementTimer();
		this.lastMoveTicks = game.CurrentMapTicks;
	}

	get Position() { return this.RealPosition.Round(Character3D.BlockDivider); }
	get Moving() { return this.currentState === State.MovingToTile || this.currentState === State.MovingTowardsPlayer; }

	Place(x, y, waitForManualStart) {
		this.targetTilePosition = null;
		this.lastTilePosition = new Position(x, y);
		this.RealPosition = multiplyToFloat(this.lastTilePosition, Global.DistancePerBlock);
		this.direction = null;
		this.currentState = State.IdleOnTile;
		this.lastMoveTicks = this.game.CurrentMapTicks;
		this.NextMoveTimeSlot = waitForManualStart ? 0xffffffff : (this.game.GameTime.TimeSlot + 1) % 288;
	}

	MoveToTile(x, y, lastPosition = null) {
		const TicksPerMovement = Character3D.TicksPerMovement;

		const InitMovement = () => {
			this.targetTilePosition = new Position(x, y);
			this.direction = PositionExtensions.GetDirectionTo(this.lastTilePosition, this.targetTilePosition);
			this.lastMoveTicks = this.game.CurrentMapTicks;
			this.movedTicks = 0;
			this.ticksPerMovement = toUInt(PositionExtensions.GetMaxDistance(this.lastTilePosition, this.targetTilePosition) * TicksPerMovement);
		};

		if (lastPosition != null) { // Fixed route
			if (this.targetTilePosition == null || this.targetTilePosition.X !== x || this.targetTilePosition.Y !== y) {
				// New position and last position is given (fixed route).
				// In this case we ensure that the character is synced with
				// its path and place him at the last position.

				if (Math.max(Math.abs(lastPosition.X - x), Math.abs(lastPosition.Y - y)) > 1) {
					// If the distance between two consecutive positions is greater than
					// 1 in any direction, the character jumps to the new position instead.
					lastPosition = new Position(x, y);
				}

				this.Place(toUInt(lastPosition.X), toUInt(lastPosition.Y), false);
				this.lastTilePosition = new Position(lastPosition);
				InitMovement();
				this.currentState = this.direction == null ? State.IdleOnTile : State.MovingToTile;
			}
			return;
		}

		if (this.currentState === State.Idle && this.targetTilePosition != null) {
			// partial tile movement
			const diff = FloatPosition.op_Subtraction(multiplyToFloat(this.targetTilePosition, Global.DistancePerBlock), this.RealPosition);
			const xDiff = diff.X / Global.DistancePerBlock;
			const yDiff = diff.Y / Global.DistancePerBlock;
			const maxDiff = Math.max(xDiff, yDiff);
			this.ticksPerMovement = toUInt(this.ticksPerMovement + toUInt(Util.Round(maxDiff * TicksPerMovement)));
		} else {
			InitMovement();
		}

		this.currentState = State.MovingToTile;
	}

	MoveTowardsPlayer(playerPosition, ticks) {
		const TicksPerMovement = Character3D.TicksPerMovement;
		const diff = FloatPosition.op_Subtraction(playerPosition, this.RealPosition);
		diff.Normalize();
		let stepSize = 0.25 * Global.DistancePerBlock;

		if (this.currentState === State.BlockedToPlayer) {
			const moveTicks = Math.min(toUInt(ticks - this.lastMoveTicks), toUInt(this.ticksPerMovement - this.movedTicks));
			this.lastMoveTicks = ticks;
			stepSize = moveTicks * Global.DistancePerBlock / TicksPerMovement;
		}

		const nextPosition = FloatPosition.op_Addition(this.RealPosition, FloatPosition.op_Multiply(diff, stepSize));

		if (this.MoveRequested.hasHandlers && this.MoveRequested.invoke(nextPosition) === false) {
			this.currentState = State.BlockedToPlayer;
			return;
		}

		this.targetTilePosition = new Position(Util.Round(playerPosition.X / Global.DistancePerBlock), Util.Round(playerPosition.Y / Global.DistancePerBlock));
		this.direction = PositionExtensions.GetDirectionTo(this.lastTilePosition, this.targetTilePosition);
		this.currentState = State.MovingTowardsPlayer;
		this.NextMoveTimeSlot = 0xffffffff;
		this.lastMoveTicks = this.game.CurrentMapTicks;

		const distance = Math.min(0.25, PositionExtensions.GetMaxDistance(this.RealPosition, playerPosition) / Global.DistancePerBlock);

		if (distance < 0.01 * Global.DistancePerBlock) {
			this.currentState = FloatPosition.op_Equality(this.RealPosition, multiplyToFloat(this.targetTilePosition, Global.DistancePerBlock))
				? State.IdleOnTile : State.Idle;
			return;
		}

		this.ticksPerMovement = toUInt(Util.Round(distance * TicksPerMovement));
	}

	LostPlayer() {
		this.Stop(false);
	}

	Stop(waitForManualStart) {
		switch (this.currentState) {
			case State.MovingToTile:
				this.currentState = FloatPosition.op_Equality(this.RealPosition, multiplyToFloat(this.targetTilePosition, Global.DistancePerBlock))
					? State.IdleOnTile : State.Idle;
				break;
			case State.MovingTowardsPlayer:
				this.currentState = FloatPosition.op_Equality(this.RealPosition, multiplyToFloat(this.targetTilePosition, Global.DistancePerBlock))
					? State.IdleOnTile : State.Idle;
				this.targetTilePosition = null;
				break;
		}

		this.NextMoveTimeSlot = waitForManualStart ? 0xffffffff : (this.game.GameTime.TimeSlot + 1) % 288;
		this.lastMoveTicks = this.game.CurrentMapTicks;
		this.movedTicks = 0;
	}

	ResetMovementTimer() {
		this.NextMoveTimeSlot = (this.game.GameTime.TimeSlot + 1) % 288;
	}

	Update(ticks, playerPosition, moveRandom, canSeePlayer, onlyMoveWhenSeePlayer, monster) {
		if (this.Paused)
			return;

		const game = this.game;
		const TicksPerMovement = Character3D.TicksPerMovement;

		switch (this.currentState) {
			case State.IdleOnTile:
				if (monster && !moveRandom) {
					// Such monster do not move at all
					return;
				} else if (canSeePlayer) {
					if (monster) {
						this.movedTicks = 0;
						this.MoveTowardsPlayer(playerPosition, ticks);
					} else if (moveRandom && game.GameTime.TimeSlot >= this.NextMoveTimeSlot) {
						this.ResetMovementTimer();
						this.RandomMovementRequested.invoke();
					}
				} else if (!onlyMoveWhenSeePlayer && moveRandom && game.GameTime.TimeSlot >= this.NextMoveTimeSlot) {
					this.ResetMovementTimer();
					this.RandomMovementRequested.invoke();
				}
				break;
			case State.Idle:
				if (canSeePlayer) {
					if (monster) {
						this.movedTicks = 0;
						this.MoveTowardsPlayer(playerPosition, ticks);
					} else if (moveRandom && game.GameTime.TimeSlot >= this.NextMoveTimeSlot) {
						this.ResetMovementTimer();
						this.MoveToTile(toUInt(this.targetTilePosition.X), toUInt(this.targetTilePosition.Y));
					}
				} else if (!onlyMoveWhenSeePlayer && moveRandom && game.GameTime.TimeSlot >= this.NextMoveTimeSlot) {
					this.ResetMovementTimer();

					if (this.targetTilePosition == null)
						this.RandomMovementRequested.invoke();
					else
						this.MoveToTile(toUInt(this.targetTilePosition.X), toUInt(this.targetTilePosition.Y));
				}
				break;
			case State.MovingToTile:
			{
				if (monster && canSeePlayer) {
					this.movedTicks = 0;
					this.lastTilePosition = this.Position;
					this.MoveTowardsPlayer(playerPosition, ticks);
				} else {
					if (ticks > this.lastMoveTicks) {
						const moveTicks = Math.min(toUInt(ticks - this.lastMoveTicks), toUInt(this.ticksPerMovement - this.movedTicks));
						this.lastMoveTicks = ticks;
						const diff = Position.op_Subtraction(this.targetTilePosition, this.lastTilePosition);
						diff.Normalize();
						const stepSize = moveTicks * Global.DistancePerBlock / TicksPerMovement;

						this.RealPosition.X += diff.X * stepSize;
						this.RealPosition.Y += diff.Y * stepSize;
						this.movedTicks += moveTicks;

						if (this.movedTicks === this.ticksPerMovement) { // finished movement
							this.currentState = State.IdleOnTile;
							this.lastTilePosition = this.Position;
						}
					}
				}

				break;
			}
			case State.MovingTowardsPlayer:
			{
				if (!canSeePlayer) {
					this.LostPlayer();
					return;
				}

				const moveTicks = Math.min(toUInt(ticks - this.lastMoveTicks), toUInt(this.ticksPerMovement - this.movedTicks));
				this.lastMoveTicks = ticks;
				const diff = FloatPosition.op_Subtraction(playerPosition, this.RealPosition);
				diff.Normalize();
				const stepSize = moveTicks * Global.DistancePerBlock / TicksPerMovement;
				const nextPosition = FloatPosition.op_Addition(this.RealPosition, FloatPosition.op_Multiply(diff, stepSize));

				if (this.MoveRequested.hasHandlers && this.MoveRequested.invoke(nextPosition) === false) {
					this.Stop(false);
					this.currentState = State.BlockedToPlayer;
					return;
				}

				this.RealPosition = nextPosition;
				this.movedTicks += moveTicks;

				if (this.movedTicks === this.ticksPerMovement) { // finished movement
					this.currentState = State.IdleOnTile;
					this.lastTilePosition = this.Position;
					this.movedTicks = 0;
					this.MoveTowardsPlayer(playerPosition, ticks);
				}

				break;
			}
			case State.BlockedToPlayer:
			{
				if (!canSeePlayer) {
					this.LostPlayer();
					return;
				}

				this.MoveTowardsPlayer(playerPosition, ticks);

				break;
			}
		}
	}
}
