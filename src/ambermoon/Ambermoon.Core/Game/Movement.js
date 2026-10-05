// Port of Ambermoon.Core/Game/Movement.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Partial class GameCore (Movement part) plus the nested class GameCore.Movement.

import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { Key } from '../Key.js';
import { Movement3D } from '../ICoreConfiguration.js';
import { Global } from '../UI/Global.js';
import { GameCore_Lifecycle } from './Lifecycle.js';

export class GameCore_Movement {
	static initFields(self) {
		self.keys = new Array(EnumHelper.GetValues(Key).length).fill(false);
		// pressedKeyProvider (readonly Func<List<Key>>) and movement (readonly Movement) are assigned by the GameCore constructor.
		self.lastMoveTicksReset = 0;
	}

	ResetMoveKeys(forceDisable = false) {
		const pressedKeys = this.pressedKeyProvider?.();

		const ResetKey = key => { this.keys[key] = !forceDisable && pressedKeys?.includes(key) === true; };

		ResetKey(Key.Up);
		ResetKey(Key.Down);
		ResetKey(Key.Left);
		ResetKey(Key.Right);
		ResetKey(Key.W);
		ResetKey(Key.A);
		ResetKey(Key.S);
		ResetKey(Key.D);
		ResetKey(Key.Q);
		ResetKey(Key.E);

		if (!this.WindowActive && !this.layout.PopupActive && this.layout.ButtonGridPage === 0) {
			this.layout.ReleaseButton(0, true);
			this.layout.ReleaseButton(1, true);
			this.layout.ReleaseButton(2, true);
			this.layout.ReleaseButton(3, true);
			this.layout.ReleaseButton(5, true);
			this.layout.ReleaseButton(6, true);
			this.layout.ReleaseButton(7, true);
			this.layout.ReleaseButton(8, true);
		}

		this.lastMoveTicksReset = this.CurrentTicks;
	}

	/**
	 * Overloads:
	 * - Move(bool fromNumpadButton, float speedFactor3D, params CursorType[] cursorTypes) (2+ arguments)
	 * - Move(bool tapped = false) (0 or 1 argument, private)
	 */
	Move(...args) {
		if (args.length >= 2)
			this.MoveByCursorTypes(args[0], args[1], ...args.slice(2));
		else
			this.MoveByKeys(args.length > 0 ? args[0] : false);
	}

	/** Port helper: C# Move(bool fromNumpadButton, float speedFactor3D, params CursorType[] cursorTypes) */
	MoveByCursorTypes(fromNumpadButton, speedFactor3D, ...cursorTypes) {
		const movement = this.movement;
		const player3D = this.player3D;

		if (this.Is3D) {
			const moveForward = cursorTypes.includes(CursorType.ArrowForward);
			const moveBackward = cursorTypes.includes(CursorType.ArrowBackward);
			const turnLeft = moveForward ? cursorTypes.includes(CursorType.ArrowTurnLeft) : cursorTypes.includes(CursorType.ArrowRotateLeft);
			const turnRight = moveForward ? cursorTypes.includes(CursorType.ArrowTurnRight) : cursorTypes.includes(CursorType.ArrowRotateRight);

			if (this.CanPartyMove()) {
				const strafeLeft = cursorTypes.includes(CursorType.ArrowStrafeLeft);
				const strafeRight = cursorTypes.includes(CursorType.ArrowStrafeRight);

				if (moveForward) {
					if (strafeLeft || turnLeft) {
						player3D.TurnLeft(movement.TurnSpeed3D * 0.7 * speedFactor3D);
						player3D.MoveForward(movement.MoveSpeed3D * Global.DistancePerBlock * 0.75 * speedFactor3D, this.CurrentTicks, true);
					} else if (strafeRight || turnRight) {
						player3D.TurnRight(movement.TurnSpeed3D * 0.7 * speedFactor3D);
						player3D.MoveForward(movement.MoveSpeed3D * Global.DistancePerBlock * 0.75 * speedFactor3D, this.CurrentTicks, true);
					} else
						player3D.MoveForward(movement.MoveSpeed3D * Global.DistancePerBlock * speedFactor3D, this.CurrentTicks);
				} else if (moveBackward) {
					if (strafeLeft || turnLeft) {
						player3D.TurnLeft(movement.TurnSpeed3D * 0.7 * speedFactor3D);
						player3D.MoveBackward(movement.MoveSpeed3D * Global.DistancePerBlock * 0.75 * speedFactor3D, this.CurrentTicks, true);
					} else if (strafeRight || turnRight) {
						player3D.TurnRight(movement.TurnSpeed3D * 0.7 * speedFactor3D);
						player3D.MoveBackward(movement.MoveSpeed3D * Global.DistancePerBlock * 0.75 * speedFactor3D, this.CurrentTicks, true);
					} else
						player3D.MoveBackward(movement.MoveSpeed3D * Global.DistancePerBlock * speedFactor3D, this.CurrentTicks);
				} else if (cursorTypes.includes(CursorType.ArrowStrafeLeft))
					player3D.MoveLeft(movement.MoveSpeed3D * Global.DistancePerBlock * speedFactor3D, this.CurrentTicks);
				else if (cursorTypes.includes(CursorType.ArrowStrafeRight))
					player3D.MoveRight(movement.MoveSpeed3D * Global.DistancePerBlock * speedFactor3D, this.CurrentTicks);
			}

			if (!moveForward && !moveBackward) {
				const PlayTurnSequence = (steps, turnAction) => {
					this.PlayTimedSequence(steps, () => {
						turnAction?.();
						this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
					}, 65);
				};

				if (cursorTypes.includes(CursorType.ArrowTurnLeft)) {
					player3D.TurnLeft(movement.TurnSpeed3D * 0.7 * speedFactor3D);
					if (!fromNumpadButton && this.CanPartyMove())
						player3D.MoveForward(movement.MoveSpeed3D * Global.DistancePerBlock * 0.75 * speedFactor3D, this.CurrentTicks, true);
				} else if (cursorTypes.includes(CursorType.ArrowTurnRight)) {
					player3D.TurnRight(movement.TurnSpeed3D * 0.7 * speedFactor3D);
					if (!fromNumpadButton && this.CanPartyMove())
						player3D.MoveForward(movement.MoveSpeed3D * Global.DistancePerBlock * 0.75 * speedFactor3D, this.CurrentTicks, true);
				} else if (cursorTypes.includes(CursorType.ArrowRotateLeft)) {
					if (fromNumpadButton) {
						PlayTurnSequence(12, () => this.player3D.TurnLeft(15.0));
					} else {
						player3D.TurnLeft(movement.TurnSpeed3D * 0.7 * speedFactor3D);
						if (this.CanPartyMove())
							player3D.MoveBackward(movement.MoveSpeed3D * Global.DistancePerBlock * 0.75 * speedFactor3D, this.CurrentTicks, true);
					}
				} else if (cursorTypes.includes(CursorType.ArrowRotateRight)) {
					if (fromNumpadButton) {
						PlayTurnSequence(12, () => this.player3D.TurnRight(15.0));
					} else {
						player3D.TurnRight(movement.TurnSpeed3D * 0.7 * speedFactor3D);
						if (this.CanPartyMove())
							player3D.MoveBackward(movement.MoveSpeed3D * Global.DistancePerBlock * 0.75 * speedFactor3D, this.CurrentTicks, true);
					}
				}
			}

			if (cursorTypes.length === 1 && (cursorTypes[0] < CursorType.ArrowForward || cursorTypes[0] > CursorType.Wait)) {
				this.clickMoveActive = false;
				this.UntrapMouse();
			}

			this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
		} else {
			switch (cursorTypes[0]) {
				case CursorType.ArrowUpLeft:
					this.Move2D(-1, -1);
					break;
				case CursorType.ArrowUp:
					this.Move2D(0, -1);
					break;
				case CursorType.ArrowUpRight:
					this.Move2D(1, -1);
					break;
				case CursorType.ArrowLeft:
					this.Move2D(-1, 0);
					break;
				case CursorType.ArrowRight:
					this.Move2D(1, 0);
					break;
				case CursorType.ArrowDownLeft:
					this.Move2D(-1, 1);
					break;
				case CursorType.ArrowDown:
					this.Move2D(0, 1);
					break;
				case CursorType.ArrowDownRight:
					this.Move2D(1, 1);
					break;
				default:
					this.clickMoveActive = false;
					break;
			}

			this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player2D.Direction;
		}
	}

	Move2D(x, y) {
		if (!this.CanPartyMove())
			return false;

		const Move = () => {
			const diagonal = x !== 0 && y !== 0;
			const player2D = this.player2D;

			let [moved, eventTriggered] = player2D.Move(x, y, this.CurrentTicks, this.TravelType, !diagonal, null, !diagonal);

			if (!moved) {
				if (eventTriggered || !diagonal)
					return false;

				const prevDirection = player2D.Direction;

				[moved, eventTriggered] = player2D.Move(0, y, this.CurrentTicks, this.TravelType, false, prevDirection, false);

				if (!moved) {
					if (eventTriggered)
						return false;

					return player2D.Move(x, 0, this.CurrentTicks, this.TravelType, true, prevDirection)[0];
				}
			}

			return true;
		};

		const result = Move();

		if (result)
			this.GameTime.MoveTick(this.Map, this.travelType);

		return result;
	}

	DisallowMoving() {
		return this.paused || this.WindowActive || !this.InputEnable || this.allInputDisabled || this.pickingNewLeader || this.pickingTargetPlayer || this.pickingTargetInventory;
	}

	/** Port helper: C# private void Move(bool tapped = false) */
	MoveByKeys(tapped = false) {
		if (this.DisallowMoving())
			return;

		const keys = this.keys;
		const is3D = this.is3D;
		const movement = this.movement;
		const CoreConfiguration = this.CoreConfiguration;

		const left = ((!is3D || !CoreConfiguration.TurnWithArrowKeys) && keys[Key.Left]) || ((!is3D || CoreConfiguration.Movement3D === Movement3D.WASDQE) && keys[Key.A]);
		const right = ((!is3D || !CoreConfiguration.TurnWithArrowKeys) && keys[Key.Right]) || ((!is3D || CoreConfiguration.Movement3D === Movement3D.WASDQE) && keys[Key.D]);
		const up = keys[Key.Up] || keys[Key.W];
		const down = keys[Key.Down] || keys[Key.S];
		const turnLeft = (CoreConfiguration.TurnWithArrowKeys && keys[Key.Left]) || (CoreConfiguration.Movement3D === Movement3D.WASDQE ? keys[Key.Q] : keys[Key.A]);
		const turnRight = (CoreConfiguration.TurnWithArrowKeys && keys[Key.Right]) || (CoreConfiguration.Movement3D === Movement3D.WASDQE ? keys[Key.E] : keys[Key.D]);

		if (left && !right) {
			if (!is3D) {
				// diagonal movement is handled in up/down
				if (!up && !down)
					this.Move2D(-1, 0);
			} else if (this.CanPartyMove()) {
				this.player3D.MoveLeft(movement.MoveSpeed3D * Global.DistancePerBlock, this.CurrentTicks);
				this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
			}
		} else if (right && !left) {
			if (!is3D) {
				// diagonal movement is handled in up/down
				if (!up && !down)
					this.Move2D(1, 0);
			} else if (this.CanPartyMove()) {
				this.player3D.MoveRight(movement.MoveSpeed3D * Global.DistancePerBlock, this.CurrentTicks);
				this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
			}
		}
		if (is3D) {
			if (turnLeft && !turnRight) {
				const turns = tapped ? 6 : 1;

				this.player3D.TurnLeft(movement.TurnSpeed3D * turns);
				this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
			} else if (!turnLeft && turnRight) {
				const turns = tapped ? 6 : 1;

				this.player3D.TurnRight(movement.TurnSpeed3D * turns);
				this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
			}
		}
		if (up && !down) {
			if (!is3D) {
				const x = left && !right ? -1 :
					right && !left ? 1 : 0;
				this.Move2D(x, -1);
			} else if (this.CanPartyMove()) {
				let moved = this.player3D.MoveForward(movement.MoveSpeed3D * Global.DistancePerBlock, this.CurrentTicks);
				this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;

				if (tapped && moved) {
					// Tapping in 3D will move 6 times to make some distance
					for (let i = 0; i < 5; i++) {
						moved = this.player3D.MoveForward(movement.MoveSpeed3D * Global.DistancePerBlock, this.CurrentTicks);
						this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;

						if (!moved)
							break;
					}
				}
			}
		} else if (down && !up) {
			if (!is3D) {
				const x = left && !right ? -1 :
					right && !left ? 1 : 0;
				this.Move2D(x, 1);
			} else if (this.CanPartyMove()) {
				this.player3D.MoveBackward(movement.MoveSpeed3D * Global.DistancePerBlock, this.CurrentTicks);
				this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
			}
		}
	}
}

/** Nested class GameCore.Movement (primary constructor Movement(bool legacyMode, bool mobile)) */
export class Movement {
	constructor(legacyMode, mobile) {
		this.legacyMode = legacyMode;
		this.mobile = mobile;
		this.tickDivider = [
			Movement.GetTickDivider3D(legacyMode), // 3D movement
			// 2D movement
			7,  // Indoor
			4,  // Outdoor walk
			8,  // Horse
			4,  // Raft
			8,  // Ship
			4,  // Magical disc
			15, // Eagle
			30, // Fly
			4,  // Swim
			10, // Witch broom
			8,  // Sand lizard
			8,  // Sand ship
			15, // Wasp
		];
		this.MoveSpeed3D = Movement.GetMoveSpeed3D(legacyMode, mobile);
		this.TurnSpeed3D = Movement.GetTurnSpeed3D(legacyMode, mobile);
	}

	TickDivider(is3D, worldMap, travelType) {
		return this.tickDivider[is3D ? 0 : !worldMap ? (this.mobile ? 2 : 1) : 2 + travelType];
	}

	MovementTicks(is3D, worldMap, travelType) {
		return Math.trunc(GameCore_Lifecycle.TicksPerSecond / this.TickDivider(is3D, worldMap, travelType));
	}

	static GetTickDivider3D(legacyMode) { return legacyMode ? 8 : 60; }
	static GetMoveSpeed3D(legacyMode, mobile) { return mobile ? 0.03 : legacyMode ? 0.25 : 0.04; }
	static GetTurnSpeed3D(legacyMode, mobile) { return mobile ? 1.5 : legacyMode ? 15.0 : 2.0; }
}

export { Movement as GameCore_Movement_Movement };
