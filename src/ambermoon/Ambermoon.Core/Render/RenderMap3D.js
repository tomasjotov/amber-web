// Port of Ambermoon.Core/Render/RenderMap3D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, Event, Queue, getValue, last, hasFlag, removeItem, toByte, toUInt, tryGetValue } from '../../../runtime.js';
import { Position, FloatPosition } from '../../Ambermoon.Common/Position.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { Random } from '../../Ambermoon.Common/Random.js';
import { CollectionExtensions } from '../../Ambermoon.Common/CollectionExtensions.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Map as DataMap, MapFlags } from '../../Ambermoon.Data.Common/Map.js';
import { Tileset } from '../../Ambermoon.Data.Common/Tileset.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { AutomapType } from '../../Ambermoon.Data.Common/Enumerations/AutomapType.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { World } from '../../Ambermoon.Data.Common/Enumerations/World.js';
import { ActiveSpellType } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { EventType, ConditionEvent, ChangeTileEvent, ChestEvent, DoorEvent, PopupTextEvent } from '../../Ambermoon.Data.Common/Event.js';
import { EventTrigger, MapExtensions } from '../MapExtensions.js';
import { EventExtensions } from '../EventExtensions.js';
import { InteractionExtensions } from '../InteractionExtensions.js';
import { GameCore } from '../GameCore.js';
import { Geometry } from '../Geometry/Geometry.js';
import { PositionExtensions } from '../Geometry/PositionExtensions.js';
import { CollisionDetectionInfo3D, CollisionLine3D, CollisionSphere3D } from '../Geometry/CollisionDetectionInfo3D.js';
import { Global } from '../UI/Global.js';
import { Window } from '../UI/Window.js';
import { Color } from './Color.js';
import { Layer } from './Layer.js';
import { SurfaceType, WallOrientation } from './ISurface3D.js';
import { TextAlign } from './TextAlign.js';
import { TextureAtlasManager } from './TextureAtlasManager.js';
import { Player3D } from './Player3D.js';
import { Character3D } from './Character3D.js';

// using static Ambermoon.Data.Map.CharacterReference;
const Flags = () => DataMap.CharacterReference.Flags;

// Position * float in C# yields a FloatPosition.
function multiplyToFloat(position, factor) {
	return FloatPosition.op_Multiply(new FloatPosition(position), factor);
}

class MapObject {
	constructor(map, surface, objectIndex, alternateAnimation, noAnimation, numFrames, fps = 1.0) {
		this.animateForward = true;
		this.surface = surface;
		this.map = map;
		this.objectIndex = objectIndex;
		this.alternateAnimation = alternateAnimation;
		this.noAnimation = noAnimation;
		this.numFrames = numFrames;
		this.ticksPerFrame = Math.max(1, toUInt(Util.Round(GameCore.TicksPerSecond / Math.max(0.001, fps))));
	}

	Destroy() {
		this.surface?.Delete();
	}

	Update(ticks) {
		if (this.numFrames <= 1 || !this.surface.Visible)
			return;

		let frame;

		if (this.noAnimation) {
			frame = Math.trunc(this.numFrames / 2);
		} else {
			frame = Math.trunc(ticks / this.ticksPerFrame);

			if (this.alternateAnimation) {
				if (this.animateForward && Math.trunc(frame / this.numFrames) % 2 === 1)
					this.animateForward = false;
				else if (!this.animateForward && Math.trunc(frame / this.numFrames) % 2 === 0)
					this.animateForward = true;
				frame %= this.numFrames;
				if (!this.animateForward)
					frame = this.numFrames - frame - 1;
			} else
				frame %= this.numFrames;
		}

		// TODO: If this layer is scaled, this won't work anymore.
		this.surface.TextureAtlasOffset = Position.op_Addition(this.map.GetObjectTextureOffset(this.objectIndex),
			new Position(Math.trunc(frame * this.surface.TextureWidth), 0));
	}
}

class MapCharacter {
	// This is used to avoid multiple monster encounters in the same update frame (e.g. 2 monsters move onto the player at the same time).
	static interacting = false;

	constructor(game, map, surface, characterIndex, characterReference, objectPosition, textureIndex, parent,
		alternateAnimation, noAnimation, numFrames, fps = 1.0) {
		this.active = true;
		this.animateForward = true;
		this.lastInteractionTicks = 0;
		this.children = [];
		this.parent = null;
		this.character3D = null;

		this.game = game;
		this.surface = surface;
		this.map = map;
		this.characterIndex = characterIndex;
		this.numFrames = numFrames;
		this.ticksPerFrame = Math.max(1, toUInt(Util.Round(GameCore.TicksPerSecond / Math.max(0.001, fps))));
		this.characterReference = characterReference;
		this.textureIndex = textureIndex;
		this.objectPosition = objectPosition;
		this.alternateAnimation = alternateAnimation;
		this.noAnimation = noAnimation;
		this.parent = parent;
		if (parent != null)
			this.character3D = parent.character3D;
		else {
			this.character3D = new Character3D(game);
			this.character3D.RandomMovementRequested.add(() => this.MoveRandom());
			this.character3D.MoveRequested.add(position => this.TestPossibleCharacterMovement(position));
			this.ResetPosition(game.GameTime);
		}
	}

	get TileFlags() { return this.characterReference?.TileFlags ?? Tileset.TileFlags.None; }
	get Type() { return this.characterReference?.Type ?? null; }
	get EventId() { return this.characterReference?.EventIndex ?? 0; }
	get MapObjectIndex() { return this.characterReference?.GraphicIndex ?? 0; }

	static Reset() { MapCharacter.interacting = false; }

	ResetLastInteractionTime() { this.lastInteractionTicks = this.game.CurrentTicks; }

	ResetMovementTimer() { this.character3D?.ResetMovementTimer(); }

	AddChild(child) {
		this.children.push(child);
	}

	Destroy() {
		this.children.forEach(c => c?.Destroy());
		this.children.length = 0;
		this.surface?.Delete();
	}

	get Active() { return this.parent?.Active ?? this.active; }
	set Active(value) {
		if (this.parent != null)
			return;

		if (this.active === value)
			return;

		this.active = value;
		const visible = this.active && this.HasValidPosition;
		this.surface.Visible = visible;
		this.children.forEach(c => {
			c.active = this.active;
			c.surface.Visible = visible;
		});
	}

	get HasValidPosition() {
		const position = this.Position;
		return position != null && position.X !== 0 && position.Y !== 0;
	}

	Pause() {
		if (this.parent == null)
			this.character3D.Paused = true;
	}

	Resume() {
		if (this.parent == null)
			this.character3D.Paused = false;
	}

	get Position() { return this.character3D.Position; }
	set Position(value) {
		this.character3D.Place(toUInt(value.X), toUInt(value.Y), false);
		this.UpdatePosition();
	}

	ResetPosition(gameTime) {
		const characterReference = this.characterReference;
		const position = new Position(characterReference.Positions.length === 1
			? characterReference.Positions[0]
			: characterReference.Positions[gameTime.TimeSlot % characterReference.Positions.length]);
		position.Offset(-1, -1); // positions are 1-based
		this.Position = position;
		this.ResetFrame();

		this.children.forEach(child => child.ResetPosition(gameTime));
	}

	ResetFrame() {
		const frame = Math.trunc(this.numFrames / 2);

		// TODO: If this layer is scaled, this won't work anymore.
		this.surface.TextureAtlasOffset = Position.op_Addition(this.map.GetObjectTextureOffset(this.textureIndex),
			new Position(Math.trunc(frame * this.surface.TextureWidth), 0));
	}

	static GetDistance(x1, y1, x2, y2) {
		const diffX = x2 - x1;
		const diffY = y2 - y1;
		return Math.sqrt(diffX * diffX + diffY * diffY);
	}

	CheckDeactivation(deactivatedEventIndex) {
		if (this.characterReference.EventIndex === deactivatedEventIndex) {
			if (this.Active && this.characterReference.Type === CharacterType.MapObject)
				this.Deactivate();
			return true;
		}

		return false;
	}

	Deactivate() {
		this.Active = false;
		this.game.CurrentSavegame.SetCharacterBit(this.map.Map.Index, this.characterIndex, true);

		if (this.game.CurrentMapCharacter === this)
			this.game.CurrentMapCharacter = null;
	}

	Interact(trigger, bed) {
		if (this.parent != null || !this.Active || this.character3D.Paused)
			return false;

		const game = this.game;
		const map = this.map;
		const characterReference = this.characterReference;
		const character3D = this.character3D;
		const surface = this.surface;
		const children = this.children;
		const ExtrudeStep = RenderMap3D.ExtrudeStep;
		const BlockSize = RenderMap3D.BlockSize;

		game.CurrentMapCharacter = null;

		const TriggerCharacterEvents = eventIndex => {
			if (game.CurrentTicks - this.lastInteractionTicks < GameCore.TicksPerSecond)
				return false;

			let event = map.Map.EventList[eventIndex - 1];

			if (event instanceof ConditionEvent) {
				const conditionEvent = event;
				switch (conditionEvent.TypeOfCondition) {
					case ConditionEvent.ConditionType.Eye:
						if (trigger !== EventTrigger.Eye)
							return false;
						event = conditionEvent.Next;
						trigger = EventTrigger.Always;
						break;
					case ConditionEvent.ConditionType.Hand:
						if (trigger !== EventTrigger.Hand)
							return false;
						event = conditionEvent.Next;
						trigger = EventTrigger.Always;
						break;
					case ConditionEvent.ConditionType.UseItem:
					{
						if (trigger < EventTrigger.Item0)
							return false;
						const itemIndex = trigger - EventTrigger.Item0;
						if (conditionEvent.ObjectIndex !== itemIndex)
							return false;
						event = conditionEvent.Next;
						trigger = EventTrigger.Always;
						break;
					}
				}
			}
			this.lastInteractionTicks = 0xffffffff;
			MapCharacter.interacting = true;
			game.CurrentMapCharacter = this;
			const position = game.RenderPlayer.Position;
			return EventExtensions.TriggerEventChain(map.Map, game, trigger, toUInt(position.X), toUInt(position.Y), event, true);
		};

		if (characterReference.Type === CharacterType.Monster) {
			if (trigger === EventTrigger.Move) {
				if (game.CurrentTicks - this.lastInteractionTicks < GameCore.TicksPerSecond)
					return false;

				if (game.Teleporting || game.Map !== map.Map)
					return false;

				if (game.Fading || game.PopupActive || game.CurrentWindow.Window !== Window.MapView)
					return false;

				// First set this to max so we won't trigger this again while we are interacting.
				this.lastInteractionTicks = 0xffffffff;
				MapCharacter.interacting = true;
				game.CurrentMapCharacter = this;

				// Turn the player towards the monster.
				const player3D = game.RenderPlayer;
				player3D.TurnTowards(character3D.RealPosition);
				const [mapX, mapY] = Geometry.CameraToMapPosition(map.Map, player3D.Camera.X, player3D.Camera.Z);
				const playerPosition = new FloatPosition(mapX - 0.5 * Global.DistancePerBlock, mapY - 0.5 * Global.DistancePerBlock);
				const distance = MapCharacter.GetDistance(playerPosition.X, playerPosition.Y, character3D.RealPosition.X, character3D.RealPosition.Y);
				let extrude = surface.Extrude = (-BlockSize / 10.0) * Math.max(0.0, 1.0 - distance) * Global.DistancePerBlock / BlockSize;
				children.forEach(c => {
					if (!hasFlag(c.TileFlags, Tileset.TileFlags.Floor))
						extrude -= ExtrudeStep;
					c.surface.Extrude = extrude;
				});
				const RestoreExtrude = () => {
					let extrude = surface.Extrude = 8.0 * ExtrudeStep;
					children.forEach(c => {
						if (!hasFlag(c.TileFlags, Tileset.TileFlags.Floor))
							extrude -= ExtrudeStep;
						c.surface.Extrude = extrude;
					});
				};
				const StartBattle = failedEscape => {
					game.StartBattle(characterReference.Index, failedEscape, toUInt(game.PartyPosition.X), toUInt(game.PartyPosition.Y), battleEndInfo => {
						this.lastInteractionTicks = game.CurrentTicks;
						MapCharacter.interacting = false;
						game.CurrentMapCharacter = null;

						if (battleEndInfo.MonstersDefeated) {
							this.Deactivate();
						} else {
							RestoreExtrude();
							character3D.ResetMovementTimer();
						}
					}, characterReference.CombatBackgroundIndex);
				};
				game.ShowDecisionPopup(game.DataNameProvider.WantToFightMessage, response => {
					if (response === PopupTextEvent.Response.Yes) {
						StartBattle(false);
					} else {
						const attributes = game.CurrentPartyMember.Attributes;
						const dex = attributes[Attribute.Dexterity].TotalCurrentValue;
						const luk = attributes[Attribute.Luck].TotalCurrentValue;
						if (game.RandomInt(0, 149) >= dex + luk) {
							StartBattle(true);
						} else {
							// successfully fled
							RestoreExtrude();
							this.lastInteractionTicks = game.CurrentTicks;
							MapCharacter.interacting = false;
							game.CurrentMapCharacter = null;
							character3D.ResetMovementTimer();
						}
					}
				}, 2, 0, TextAlign.Left, false);

				return true;
			}
		} else {
			if (hasFlag(characterReference.CharacterFlags, Flags().TextPopup)) {
				if (characterReference.EventIndex !== 0 && game.CurrentSavegame.IsEventActive(map.Map.Index, characterReference.EventIndex - 1)) {
					return TriggerCharacterEvents(characterReference.EventIndex);
				} else if (trigger === EventTrigger.Eye) {
					// Popup NPCs can't be looked at but only talked to.
					return false;
				} else if (trigger === EventTrigger.Mouth) {
					this.ShowPopup(map.Map.GetText(characterReference.Index, game.DataNameProvider.TextBlockMissing));
					return true;
				}

				return false;
			}

			const HandleConversation = conversationPartner => {
				if (trigger === EventTrigger.Eye) {
					game.ShowTextPopup(game.ProcessText(conversationPartner.Texts[conversationPartner.LookAtTextIndex]), null);
					return true;
				} else if (trigger === EventTrigger.Mouth || (trigger === EventTrigger.Move && characterReference.NPCTalksToYou)) {
					if (conversationPartner == null)
						throw new AmbermoonException(ExceptionScope.Data, 'Invalid NPC or party member index.');

					trigger = EventTrigger.Mouth; // important if the NPC talks to you

					InteractionExtensions.ExecuteEvents(conversationPartner, game, trigger, this.characterIndex);
					return true;
				} else {
					return false;
				}
			};

			switch (characterReference.Type) {
				case CharacterType.PartyMember:
					return HandleConversation(getValue(game.CurrentSavegame.PartyMembers, characterReference.Index));
				case CharacterType.NPC:
					return HandleConversation(game.CharacterManager.GetNPC(characterReference.Index));
				case CharacterType.MapObject:
					if (characterReference.EventIndex !== 0 && game.CurrentSavegame.IsEventActive(map.Map.Index, characterReference.EventIndex - 1))
						return TriggerCharacterEvents(characterReference.EventIndex);
					break;
			}
		}

		return false;
	}

	ShowPopup(text) {
		this.game.ShowMessagePopup(text, null, TextAlign.Left);
	}

	UpdatePosition() {
		this.map.UpdateCharacterSurfaceCoordinates(this.character3D.RealPosition, this.surface, this.objectPosition);

		const visible = this.active && this.HasValidPosition;
		this.surface.Visible = visible;
		this.children.forEach(c => { c.surface.Visible = visible; });
	}

	UpdateCurrentMovement(ticks) {
		if (!this.character3D.Moving && this.characterReference.Type !== CharacterType.MapObject)
			this.ResetFrame();
		else {
			if (this.surface.Visible && this.numFrames > 1) {
				let frame;

				if (this.noAnimation) {
					frame = Math.trunc(this.numFrames / 2);
				} else {
					frame = Math.trunc(ticks / this.ticksPerFrame);

					if (this.alternateAnimation) {
						const cycle = Math.trunc(frame / this.numFrames) % 2;

						if (this.animateForward && cycle === 1)
							this.animateForward = false;
						else if (!this.animateForward && cycle === 0)
							this.animateForward = true;
						frame %= this.numFrames;
						if (!this.animateForward)
							frame = this.numFrames - frame - 1;
					} else
						frame %= this.numFrames;
				}

				// TODO: If this layer is scaled, this won't work anymore.
				this.surface.TextureAtlasOffset = Position.op_Addition(this.map.GetObjectTextureOffset(this.textureIndex),
					new Position(Math.trunc(frame * this.surface.TextureWidth), 0));
			}
		}

		this.children.forEach(c => c.UpdateCurrentMovement(ticks));

		this.UpdatePosition();
	}

	TestPathCollision(position, blockingTiles) {
		const DistancePerBlock = Global.DistancePerBlock;
		const testPosition = multiplyToFloat(this.Position, DistancePerBlock);

		const TestRoundedPosition = position => {
			const blockIndex = toUInt(position.X + position.Y * this.map.Map.Width);
			return blockingTiles.includes(blockIndex);
		};

		while (true) {
			if (PositionExtensions.GetMaxDistance(testPosition, position) < DistancePerBlock / 4)
				return false;

			const distance = FloatPosition.op_Subtraction(position, testPosition);

			if (distance.X < -DistancePerBlock / 8)
				testPosition.X -= DistancePerBlock / 4;
			else if (distance.X > DistancePerBlock / 8)
				testPosition.X += DistancePerBlock / 4;

			if (distance.Y < -DistancePerBlock / 8)
				testPosition.Y -= DistancePerBlock / 4;
			else if (distance.Y > DistancePerBlock / 8)
				testPosition.Y += DistancePerBlock / 4;

			let roundedTestPosition = testPosition.Round(1.0 / DistancePerBlock);

			if (TestRoundedPosition(roundedTestPosition)) {
				// If we are on the edge, test the other tile.
				// Note: This might not work if Global.DistancePerBlock is no longer 1.0f.
				const xFraction = testPosition.X - Math.trunc(testPosition.X);
				const yFraction = testPosition.Y - Math.trunc(testPosition.Y);

				if (Util.FloatEqual(Math.abs(xFraction), 0.5)) {
					if (Math.trunc(testPosition.X) === roundedTestPosition.X) {
						if (distance.X > 0)
							testPosition.X += Math.sign(testPosition.X) * DistancePerBlock / 2;
					} else {
						if (distance.X < 0)
							testPosition.X -= Math.sign(testPosition.X) * DistancePerBlock / 2;
					}
				}
				if (Util.FloatEqual(Math.abs(yFraction), 0.5)) {
					if (Math.trunc(testPosition.Y) === roundedTestPosition.Y) {
						if (distance.Y > 0)
							testPosition.Y += Math.sign(testPosition.Y) * DistancePerBlock / 2;
					} else {
						if (distance.Y < 0)
							testPosition.Y -= Math.sign(testPosition.Y) * DistancePerBlock / 2;
					}
				}

				roundedTestPosition = testPosition.Round(1.0 / DistancePerBlock);

				if (TestRoundedPosition(roundedTestPosition))
					return true;
			} else if (roundedTestPosition.X !== this.Position.X && roundedTestPosition.Y !== this.Position.Y) {
				// Don't allow looking through adjacent diagonal blocks.
				if (distance.X < 0) {
					// Looking left

					if (distance.Y < 0) {
						// Looking up left
						// Test position is in the upper left quadrant.
						//   \[ ]
						// [ ]\
						if (TestRoundedPosition(Position.op_Addition(roundedTestPosition, new Position(1, 0))) &&
							TestRoundedPosition(Position.op_Addition(roundedTestPosition, new Position(0, 1))))
							return true; // Block if both adjacent blocks are blocking.
					} else if (distance.Y > 0) {
						// Looking down left
						// Test position is in the lower left quadrant.
						// [ ]/
						//   /[ ]
						if (TestRoundedPosition(Position.op_Addition(roundedTestPosition, new Position(1, 0))) &&
							TestRoundedPosition(Position.op_Addition(roundedTestPosition, new Position(0, -1))))
							return true; // Block if both adjacent blocks are blocking.
					}
				} else if (distance.X > 0) {
					// Looking right

					if (distance.Y < 0) {
						// Looking up right
						// Test position is in the upper right quadrant.
						// [ ]/
						//   /[ ]
						if (TestRoundedPosition(Position.op_Addition(roundedTestPosition, new Position(-1, 0))) &&
							TestRoundedPosition(Position.op_Addition(roundedTestPosition, new Position(0, 1))))
							return true; // Block if both adjacent blocks are blocking.
					} else if (distance.Y > 0) {
						// Looking down right
						// Test position is in the lower right quadrant.
						//   \[ ]
						// [ ]\
						if (TestRoundedPosition(Position.op_Addition(roundedTestPosition, new Position(-1, 0))) &&
							TestRoundedPosition(Position.op_Addition(roundedTestPosition, new Position(0, -1))))
							return true; // Block if both adjacent blocks are blocking.
					}
				}
			}
		}
	}

	CanSee(position) {
		return !this.TestPathCollision(position, this.map.monsterBlockSightBlocks);
	}

	TestPossibleCharacterMovement(position) {
		const map = this.map;
		const roundedPosition = position.Round(1.0 / Global.DistancePerBlock);
		const blockIndex = toUInt(roundedPosition.X + roundedPosition.Y * map.Map.Width);

		if (map.characterBlockingBlocks[this.characterReference.CollisionClass].includes(blockIndex) ||
			map.EventBlocksCharacter(roundedPosition))
			return false;

		// Note: This is only used for monsters.
		const collisionInfo = map.GetCollisionDetectionInfoForMonsterFromPositions(
			this.characterReference.CollisionClass,
			this.Position,
			roundedPosition
		);

		const lastX = this.character3D.RealPosition.X;
		const lastY = map.Map.Height * Global.DistancePerBlock - this.character3D.RealPosition.Y;
		const newX = position.X;
		const newY = map.Map.Height * Global.DistancePerBlock - position.Y;

		return !collisionInfo.TestCollision(lastX, lastY, newX, newY, Player3D.CollisionRadius, false);
	}

	MoveRandom() {
		const map = this.map;
		let newPosition = null;

		for (let i = 0; i < 10; ++i) {
			newPosition = new Position(this.Position.X + this.game.RandomInt(-1, 1), this.Position.Y + this.game.RandomInt(-1, 1));

			if (Position.op_Equality(newPosition, this.Position))
				continue;

			const collisionPosition = new Position(newPosition.X, newPosition.Y);

			if (collisionPosition.X < 0 || collisionPosition.X >= map.Map.Width)
				continue;

			if (collisionPosition.Y < 0 || collisionPosition.Y >= map.Map.Height)
				continue;

			const blockIndex = toUInt(newPosition.X + newPosition.Y * map.Map.Width);

			if (!map.characterBlockingBlocks[this.characterReference.CollisionClass].includes(blockIndex) &&
				!map.EventBlocksCharacter(newPosition))
				break;

			newPosition = null;
		}

		if (newPosition != null)
			this.character3D.MoveToTile(toUInt(newPosition.X), toUInt(newPosition.Y));
	}

	Update(ticks, gameTime, playerPosition) {
		if (!this.Active || this.character3D.Paused || this.parent != null)
			return;

		const characterReference = this.characterReference;
		const character3D = this.character3D;
		const distance = MapCharacter.GetDistance(playerPosition.X, playerPosition.Y, character3D.RealPosition.X, character3D.RealPosition.Y) / Global.DistancePerBlock;
		const obj = this.map.labdata.Objects[characterReference.GraphicIndex - 1];
		const subObject = obj.SubObjects[0];
		const monsterRadius = 0.5 * subObject.Object.MappedTextureWidth / RenderMap3D.BlockSize;

		if (distance - monsterRadius < 0.5) {
			if (characterReference.Type === CharacterType.Monster) {
				// Monster has reached player -> interact/fight
				this.game.MonsterSeesPlayer = true;
				character3D.Stop(true);
			}

			if (!MapCharacter.interacting && this.Interact(EventTrigger.Move, false))
				return;
		}

		const randomMovement = hasFlag(characterReference.CharacterFlags, Flags().RandomMovement);

		if (!randomMovement && characterReference.Type !== CharacterType.Monster && !characterReference.Stationary) {
			// Walk a given path every day time slot
			const lastTimeSlot = gameTime.TimeSlot === 0 ? 287 : gameTime.TimeSlot - 1;
			let lastPosition = new Position(characterReference.Positions[lastTimeSlot % characterReference.Positions.length]);
			const newPosition = new Position(characterReference.Positions[gameTime.TimeSlot % characterReference.Positions.length]);
			if (newPosition.X !== 0 && newPosition.Y !== 0)
				newPosition.Offset(-1, -1); // positions are 1-based
			if (lastPosition.X === 0 && lastPosition.Y === 0) {
				if (newPosition.X === 0 && newPosition.Y === 0)
					return; // Stay hidden

				// Spawn at the new position
				lastPosition = newPosition;
			} else {
				if (newPosition.X === 0 && newPosition.Y === 0)
					lastPosition = newPosition;
				else
					lastPosition.Offset(-1, -1);
			}
			character3D.MoveToTile(toUInt(newPosition.X), toUInt(newPosition.Y), lastPosition);
		}

		const monster = characterReference.Type === CharacterType.Monster;
		const canSeePlayer = (monster || characterReference.OnlyMoveWhenSeePlayer) && this.CanSee(playerPosition);

		if (monster && canSeePlayer)
			this.game.MonsterSeesPlayer = true;

		character3D.Update(ticks, playerPosition, randomMovement, canSeePlayer,
			characterReference.OnlyMoveWhenSeePlayer, monster);

		this.UpdateCurrentMovement(ticks);
	}
}

/**
 * Scrollable texture sprite used for skies.
 */
class SkySprite {
	constructor(y, creator) {
		this.leftSprite = creator(Global.Map3DViewX, Global.Map3DViewY + y);
		this.rightSprite = creator(Global.Map3DViewX + this.leftSprite.Width, Global.Map3DViewY + y);
		this.leftSprite.Visible = true;
		this.rightSprite.Visible = true;
	}

	Destroy() {
		this.leftSprite?.Delete();
		this.rightSprite?.Delete();

		this.leftSprite = null;
		this.rightSprite = null;
	}

	ScrollTo(x) {
		if (this.leftSprite == null || this.rightSprite == null)
			return;

		while (x <= -Global.Map3DViewWidth)
			x += Global.Map3DViewWidth;
		while (x > 0)
			x -= Global.Map3DViewWidth;

		this.leftSprite.X = Global.Map3DViewX + x;
		this.rightSprite.X = this.leftSprite.X + this.leftSprite.Width;
	}
}

export class RenderMap3D {
	static FloorTextureWidth = 64;
	static FloorTextureHeight = 64;
	static TextureWidth = 128;
	static TextureHeight = 80;
	static BlockSize = 512.0;
	static ReferenceWallHeight = 341.0; // 2/3 of block size -> 512
	// Each of the 8 subobjects is sorted in Z (the first has an extrude of 5% of the block size, the rest is lower).
	static get ExtrudeStep() { return 0.05 * Global.DistancePerBlock * 0.125; }
	static labdataTextures = new Map(); // contains all textures for a labdata (floor, walls, objects and overlays)
	static labBackgroundGraphics = null;
	/**
	 * This contains all block indices that could be changed by map events for labdatas.
	 */
	static labdataChangeableBlocks = new Map();
	static MapObject = MapObject;
	static MapCharacter = MapCharacter;
	static SkySprite = SkySprite;

	constructor(game, map, mapManager, renderView, playerX, playerY, playerDirection) {
		this.camera = null;
		this.mapManager = null;
		this.renderView = null;
		this.textureAtlas = null;
		this.floorColor = null;
		this.ceilingColor = null;
		this.baseFloorColor = null;
		this.baseCeilingColor = null;
		this.skyColors = null;
		this.stars = [];
		this.horizonSprite = null;
		this.horizonFog = null;
		this.floor = null;
		this.ceiling = null;
		this.labdata = null;
		this.characterBlockingBlocks = new Array(15).fill(null); // 15 collision classes
		this.monsterBlockSightBlocks = [];
		this.blockCollisionBodies = new Map();
		this.walls = new Map();
		this.objects = new Map();
		this.mapCharacters = new Map();
		this.Map = null;
		this.MapChanged = new Event();

		this.game = game;
		this.camera = renderView.Camera3D;
		this.mapManager = mapManager;
		this.renderView = renderView;

		for (let i = 0; i < this.characterBlockingBlocks.length; ++i)
			this.characterBlockingBlocks[i] = [];

		this.EnsureLabBackgroundGraphics(renderView.GraphicInfoProvider);

		// Create stars
		const starLayer = renderView.GetLayer(Layer.Map3DBackground);
		let x = 0;
		const random = new Random();
		const starAreaWidth = 8 * Global.Map3DViewWidth;
		for (let y = 4; y < 36; ++y) {
			x %= starAreaWidth;

			while (x < starAreaWidth) {
				const star = renderView.ColoredRectFactory.Create(1, 1, Color.White, 2);
				star.X = Global.Map3DViewX + x;
				star.Y = Global.Map3DViewY + y;
				star.Layer = starLayer;
				star.ClipArea = GameCore.Map3DViewArea;
				star.Visible = false;
				this.stars.push({ Key: new Position(x, y), Value: star });
				x += Math.trunc(starAreaWidth * 2 / 3) + toUInt(random.Next() % Math.trunc(starAreaWidth / 3));
			}
		}

		if (map != null)
			this.SetMap(map, playerX, playerY, playerDirection, game.CurrentPartyMember?.Race ?? Race.Human);

		this.camera.Turned.add(angle => this.CameraTurned(angle));
	}

	get CombatBackgroundIndex() { return this.labdata?.CombatBackground ?? 0; }

	/**
	 * This is the height for the renderer. It is expressed in relation
	 * to the block size (e.g. wall is 2/3 as height as a block is wide).
	 */
	get WallHeight() { return this.labdata.WallHeight * Global.DistancePerBlock / RenderMap3D.BlockSize; }

	static Reset() { MapCharacter.Reset(); }

	/** C#: CharacterType? CharacterTypeFromBlock(uint x, uint y, out AutomapType automapType) -> [type, automapType] */
	CharacterTypeFromBlock(x, y) {
		let automapType = AutomapType.None;
		let character = null;
		for (const c of this.mapCharacters.values()) {
			if (c.Active && c.Position.X === x && c.Position.Y === y) {
				character = c;
				break;
			}
		}

		if (character?.Type === CharacterType.MapObject) {
			if (character.MapObjectIndex !== 0) {
				const mapObject = this.labdata.Objects[character.MapObjectIndex - 1];
				automapType = mapObject.AutomapType;
			}
		} else if (character != null) {
			automapType = character.Type === CharacterType.Monster ? AutomapType.Monster : AutomapType.Person;
		}

		return [character?.Type ?? null, automapType];
	}

	/** Overloads: IsBlockingPlayer(Position position) and IsBlockingPlayer(uint x, uint y) */
	IsBlockingPlayer(x, y) {
		if (arguments.length === 1) {
			const position = x;
			return this.IsBlockingPlayer(toUInt(position.X), toUInt(position.Y));
		}

		return this.characterBlockingBlocks[0].includes(toUInt(x + y * this.Map.Width));
	}

	CameraTurned(angle) {
		while (angle <= -360.0)
			angle += 360.0;
		while (angle >= 360.0)
			angle -= 360.0;

		const scrollX = Util.Round(8.0 * -144.0 * angle / 360.0);

		if (this.horizonSprite != null)
			this.horizonSprite.ScrollTo(scrollX);

		this.UpdateStars(scrollX);
	}

	SetupBackground() {
		const renderView = this.renderView;
		const Map = this.Map;
		const labdata = this.labdata;
		const game = this.game;

		const floorColor = this.floorColor = renderView.ColoredRectFactory.Create(Global.Map3DViewWidth + 1, Math.trunc(Global.Map3DViewHeight / 2),
			game.GetPaletteColor(toByte(Map.PaletteIndex), labdata.FloorColorIndex), 0);
		const ceilingColor = this.ceilingColor = renderView.ColoredRectFactory.Create(Global.Map3DViewWidth + 1, Math.trunc(Global.Map3DViewHeight / 2) + 1,
			game.GetPaletteColor(toByte(Map.PaletteIndex), labdata.CeilingColorIndex), 0);
		this.baseFloorColor = new Color(floorColor.Color);
		this.baseCeilingColor = new Color(ceilingColor.Color);

		floorColor.X = Global.Map3DViewX;
		floorColor.Y = Global.Map3DViewY + ceilingColor.Height;
		ceilingColor.X = Global.Map3DViewX;
		ceilingColor.Y = Global.Map3DViewY - 1;

		floorColor.Layer = ceilingColor.Layer = renderView.GetLayer(Layer.Map3DBackground);
		floorColor.Visible = ceilingColor.Visible = true;

		if (hasFlag(Map.Flags, MapFlags.Outdoor)) {
			const clipArea = GameCore.Map3DViewArea.CreateModified(0, 0, 1, 0);
			this.horizonSprite = new SkySprite(ceilingColor.Height - 20, (x, y) => {
				const sprite = renderView.SpriteFactory.Create(144, 20, true, 2);
				sprite.TextureAtlasOffset = this.HorizonTextureOffset;
				sprite.ClipArea = clipArea;
				sprite.PaletteIndex = toByte(Map.PaletteIndex - 1);
				sprite.Layer = ceilingColor.Layer;
				sprite.X = x;
				sprite.Y = y;
				return sprite;
			});
			this.horizonFog = renderView.ColoredRectFactory.Create(144, 21, Color.Transparent, 50);
			this.horizonFog.Layer = renderView.GetLayer(Layer.Map3DBackgroundFog);
			this.horizonFog.X = Global.Map3DViewX;
			this.horizonFog.Y = Global.Map3DViewY + ceilingColor.Height - 21;
			this.horizonFog.Visible = false;
		}
	}

	EnableFloorAndCeilingColors(enable) {
		this.floorColor.Visible = this.ceilingColor.Visible = enable && this.game.CanSee();
	}

	SetColors(paletteReplacement) {
		const floorColor = this.floorColor;
		const ceilingColor = this.ceilingColor;
		const labdata = this.labdata;

		floorColor.Visible = ceilingColor.Visible = this.game.CanSee();

		if (paletteReplacement != null) {
			const floorIndex = labdata.FloorColorIndex * 4;
			const fr = paletteReplacement.ColorData[floorIndex + 0];
			const fg = paletteReplacement.ColorData[floorIndex + 1];
			const fb = paletteReplacement.ColorData[floorIndex + 2];
			const ceilingIndex = labdata.CeilingColorIndex * 4;
			const cr = paletteReplacement.ColorData[ceilingIndex + 0];
			const cg = paletteReplacement.ColorData[ceilingIndex + 1];
			const cb = paletteReplacement.ColorData[ceilingIndex + 2];
			floorColor.Color = new Color(fr, fg, fb);
			ceilingColor.Color = new Color(cr, cg, cb);
			this.baseFloorColor = null;
			this.baseCeilingColor = null;
		} else {
			floorColor.Color = this.game.GetPaletteColor(toByte(this.Map.PaletteIndex), labdata.FloorColorIndex);
			ceilingColor.Color = this.game.GetPaletteColor(toByte(this.Map.PaletteIndex), labdata.CeilingColorIndex);
			this.baseFloorColor = new Color(floorColor.Color);
			this.baseCeilingColor = new Color(ceilingColor.Color);
		}
	}

	SetMap(map, playerX, playerY, playerDirection, race, forceReset = false) {
		if (map.Type !== MapType.Map3D)
			throw new AmbermoonException(ExceptionScope.Application, 'Tried to load a 2D map into a 3D render map.');

		if (forceReset || this.Map !== map) {
			this.Destroy();

			this.Map = map;
			this.labdata = this.mapManager.GetLabdataForMap(map);
			this.EnsureLabdataTextureAtlas();
			this.EnsureChangeableBlocks();
			this.UpdateSurfaces();
			this.SetupBackground();
			this.SetFog(map, this.labdata);
			this.AddCharacters();

			this.SetCameraHeight(race);

			this.renderView.AspectProcessor?.(RenderMap3D.ReferenceWallHeight / this.labdata.WallHeight);

			this.MapChanged.invoke(map);
		}

		this.camera.SetPosition(playerX * Global.DistancePerBlock, (map.Height - playerY) * Global.DistancePerBlock);
		this.camera.TurnTowards(playerDirection * 90.0);
	}

	SetFog(map, labdata, lightOff = false) {
		const game = this.game;
		let fogColor;
		let fogDistance;
		const lightActive = !lightOff && game.CurrentSavegame.IsSpellActive(ActiveSpellType.Light);

		if (game.CoreConfiguration.ShowFog && game.CanSee()) {
			if (hasFlag(map.Flags, MapFlags.Sky)) {
				let component;
				let alpha;
				const gameTime = game.GameTime;

				if (gameTime.Hour < 4) { // 0-3 (black fog)
					alpha = toByte(gameTime.Hour < 3 ? 192 : 192 - gameTime.Minute);
					component = 0;
					fogDistance = 6;
				} else if (gameTime.Hour < 9) { // 4-8 (black to white fog)
					alpha = 128;
					component = toByte(Math.min(255, (gameTime.Hour - 4) * 60 + gameTime.Minute));
					fogDistance = 7;
				} else if (gameTime.Hour < 12) { // 9-11 (white to no fog)
					alpha = toByte(Math.trunc((12 - gameTime.Hour) * 255 / 6));
					component = 255;
					fogDistance = gameTime.Hour - 1;
				} else if (gameTime.Hour < 17) { // 12-16 (no fog)
					alpha = 0;
					component = 0;
					fogDistance = 10;
				} else { // 17-23 (no to black fog)
					const factor = 11;
					alpha = toByte(Math.trunc((gameTime.Hour - 16) * 255 / factor));
					component = 0;
					fogDistance = 7;
				}
				const r = this.Map.World === World.Morag ? toByte(Math.min(Math.trunc(component * 3 / 2), 255)) : component;
				const g = this.Map.World !== World.Lyramion ? toByte(Math.min(Math.trunc(component * 3 / 2), 255)) : component;
				fogColor = new Color(r, g, component, alpha);
				if (lightActive && fogDistance < 7.5)
					fogDistance += game.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Light) * 2.0 - 1.0;
				fogDistance *= Global.DistancePerBlock;
			} else if (hasFlag(map.Flags, MapFlags.Indoor)) {
				fogColor = new Color(128, 128, 96, 112);
				fogDistance = Global.DistancePerBlock * 8.0;
			} else {
				fogColor = game.GetPaletteColor(toByte(map.PaletteIndex), labdata.CeilingColorIndex).WithFactor(0.25);
				fogDistance = Global.DistancePerBlock * (4.5 + game.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Light) * 2.0);
			}

			if (this.horizonFog != null) {
				this.horizonFog.Color = new Color(fogColor, toByte(Util.Min(Math.trunc(fogColor.A / 2), 32 + fogColor.R, 32 + fogColor.G, 32 + fogColor.B)));
				this.horizonFog.Visible = fogColor.A !== 0;
			}
		} else {
			fogColor = Color.Transparent;
			fogDistance = 100.0;
			if (this.horizonFog != null)
				this.horizonFog.Visible = false;
		}

		this.renderView.SetFog(fogColor, fogDistance);
	}

	static GetFloorY() { return -0.25 * RenderMap3D.ReferenceWallHeight / RenderMap3D.BlockSize; }

	static GetLevitatingY() { return -0.75 * RenderMap3D.ReferenceWallHeight / RenderMap3D.BlockSize; }

	static GetLevitatingStepSize() { return RenderMap3D.ReferenceWallHeight / (RenderMap3D.BlockSize * 40.0); }

	SetCameraHeight(race) {
		// Race-dependent additional height
		// in relation to a full wall height.
		let add;
		switch (race) {
			case Race.Human: add = -0.04; break; // Original: 180
			case Race.Elf: add = 0.0; break; // Original: 190
			case Race.Dwarf: add = -0.16; break; // Original: 150
			case Race.Gnome: add = -0.20; break; // Original: 120
			case Race.HalfElf: add = 0.02; break; // Original: 195
			case Race.Sylphe: add = -0.12; break; // Original: 160
			case Race.Felinic: add = 0.0; break; // Original: 190
			case Race.Moranian: add = -0.06; break; // Original: 175
			case Race.Thalionic: add = -0.04; break; // Original: 180
			case Race.Animal: add = -0.30; break; // AA: 100
			case Race.Monster: add = -0.04; break; // AA: 180
			default: add = 0.0; break;
		}

		this.camera.GroundY = (-0.5 - add) * RenderMap3D.ReferenceWallHeight / RenderMap3D.BlockSize;
		this.camera.UpdatePosition();
	}

	Destroy(reset = false) {
		this.floorColor?.Delete();
		this.ceilingColor?.Delete();
		this.floor?.Delete();
		this.ceiling?.Delete();
		this.horizonSprite?.Destroy();
		this.horizonFog?.Delete();
		this.skyColors?.forEach(c => c?.Delete());
		if (reset) {
			this.stars?.forEach(s => s.Value?.Delete());
			if (this.stars != null)
				this.stars.length = 0;
		}

		this.floorColor = null;
		this.ceilingColor = null;
		this.floor = null;
		this.ceiling = null;
		this.horizonSprite = null;
		this.horizonFog = null;
		this.skyColors = null;

		[...this.walls.values()].forEach(walls => walls.forEach(wall => wall?.Delete()));
		[...this.objects.values()].forEach(objects => objects.forEach(obj => obj?.Destroy()));
		[...this.mapCharacters.values()].forEach(mc => mc?.Destroy());

		this.walls.clear();
		this.objects.clear();
		this.mapCharacters.clear();

		this.blockCollisionBodies.clear();
		this.characterBlockingBlocks.forEach(b => { b.length = 0; });
		this.monsterBlockSightBlocks.length = 0;
	}

	EnsureLabBackgroundGraphics(graphicInfoProvider) {
		RenderMap3D.labBackgroundGraphics ??= [...graphicInfoProvider.GetLabBackgroundGraphics()];
	}

	EnsureChangeableBlocks() {
		const Map = this.Map;

		if (!RenderMap3D.labdataChangeableBlocks.has(Map.TilesetOrLabdataIndex)) {
			const blockIndices = [];

			for (const mapEvent of Map.Events) {
				if (mapEvent.Type === EventType.ChangeTile) {
					if (!(mapEvent instanceof ChangeTileEvent))
						throw new AmbermoonException(ExceptionScope.Data, 'Invalid map event.');

					const changeTileEvent = mapEvent;
					const index = MapExtensions.PositionToTileIndex(Map, changeTileEvent.X - 1, changeTileEvent.Y - 1);

					if (!blockIndices.includes(index))
						blockIndices.push(index);
				}
			}

			RenderMap3D.labdataChangeableBlocks.set(Map.TilesetOrLabdataIndex, blockIndices);
		}
	}

	EnsureLabdataTextureAtlas() {
		const Map = this.Map;
		const labdata = this.labdata;

		if (!RenderMap3D.labdataTextures.has(Map.TilesetOrLabdataIndex)) {
			const graphics = new globalThis.Map();
			const addGraphic = (key, graphic) => {
				if (graphics.has(key))
					throw new ArgumentException('An item with the same key has already been added.');
				graphics.set(key, graphic);
			};

			for (const obj of labdata.Objects) {
				for (const subObj of obj.SubObjects) {
					const graphic = labdata.ObjectGraphics[labdata.ObjectInfos.indexOf(subObj.Object)];

					// Note: If the same texture is used multiple times but with different amount of frames
					// we want to use the graphic with the most frames (highest width) to support all use cases.
					const [found, existingGraphic] = tryGetValue(graphics, subObj.Object.TextureIndex);
					if (!found || graphic.Width > existingGraphic.Width)
						graphics.set(subObj.Object.TextureIndex, graphic);
				}
			}
			for (let i = 0; i < labdata.WallGraphics.length; ++i)
				addGraphic(i + 1000, labdata.WallGraphics[i]);
			if (labdata.FloorGraphic != null)
				addGraphic(10000, labdata.FloorGraphic);
			if (labdata.CeilingGraphic != null)
				addGraphic(10001, labdata.CeilingGraphic);

			addGraphic(10002, RenderMap3D.labBackgroundGraphics[Map.LabyrinthBackgroundIndex > 0 && Map.LabyrinthBackgroundIndex <= RenderMap3D.labBackgroundGraphics.length ? Map.LabyrinthBackgroundIndex - 1 : Map.World]); // web port: per-map horizon (Amberstar)

			RenderMap3D.labdataTextures.set(Map.TilesetOrLabdataIndex, TextureAtlasManager.CreateFromGraphics(graphics, 1));
		}

		this.textureAtlas = getValue(RenderMap3D.labdataTextures, Map.TilesetOrLabdataIndex);
		const renderView = this.renderView;
		renderView.GetLayer(Layer.Map3DBackground).Texture = this.textureAtlas.Texture;
		renderView.GetLayer(Layer.Map3DCeiling).Texture = this.textureAtlas.Texture;
		renderView.GetLayer(Layer.Map3D).Texture = this.textureAtlas.Texture;
		renderView.GetLayer(Layer.Billboards3D).Texture = this.textureAtlas.Texture;
	}

	GetObjectTextureOffset(objectIndex) {
		return this.textureAtlas.GetOffset(objectIndex);
	}

	GetWallTextureOffset(wallIndex) {
		return this.textureAtlas.GetOffset(wallIndex + 1000);
	}

	get FloorTextureOffset() { return this.textureAtlas.GetOffset(10000); }
	get CeilingTextureOffset() { return this.textureAtlas.GetOffset(10001); }
	get HorizonTextureOffset() { return this.textureAtlas.GetOffset(10002); }

	AddCharacters() {
		const Map = this.Map;

		for (let characterIndex = 0; characterIndex < Map.CharacterReferences.length; ++characterIndex) {
			const characterReference = Map.CharacterReferences[characterIndex];

			if (characterReference == null)
				break;

			this.AddMapCharacter(this.renderView.Surface3DFactory, this.renderView.GetLayer(Layer.Billboards3D), characterIndex, characterReference);
		}
	}

	Pause() {
		for (const [, Value] of this.mapCharacters)
			Value.Pause();
	}

	Resume() {
		for (const [, Value] of this.mapCharacters)
			Value.Resume();
	}

	EventTypeFromBlock(x, y) {
		const Map = this.Map;
		const block = Map.Blocks[x][y];

		if (block.MapEventId !== 0 && this.game.CurrentSavegame.IsEventActive(Map.Index, block.MapEventId - 1))
			return Map.EventList[block.MapEventId - 1].Type;

		return EventType.Invalid;
	}

	FindEventTypesOnBlock(x, y, ...eventTypes) {
		if (eventTypes == null || eventTypes.length === 0)
			return EventType.Invalid;

		const Map = this.Map;
		const game = this.game;
		const block = Map.Blocks[x][y];

		if (block.MapEventId === 0 || !game.CurrentSavegame.IsEventActive(Map.Index, block.MapEventId - 1))
			return EventType.Invalid;

		const branches = new Queue();
		const checkedEvent = new Set();
		const firstEvent = Map.EventList[block.MapEventId - 1];

		const CheckEventBranch = event => {
			while (event != null) {
				if (checkedEvent.has(event))
					break;

				checkedEvent.add(event);

				if (eventTypes.includes(event.Type))
					return event.Type;

				if (event instanceof ConditionEvent) {
					const condition = event;
					switch (condition.TypeOfCondition) {
						case ConditionEvent.ConditionType.Hand:
						case ConditionEvent.ConditionType.Eye:
						case ConditionEvent.ConditionType.SayWord:
						case ConditionEvent.ConditionType.EnterNumber:
						case ConditionEvent.ConditionType.MultiCursor:
						case ConditionEvent.ConditionType.Levitating:
						case ConditionEvent.ConditionType.Mouth:
						case ConditionEvent.ConditionType.UseItem:
							// For non-move triggers we don't proceed.
							return EventType.Invalid;
						default:
						{
							const lastEventResult = true;
							const trigger = event === firstEvent ? EventTrigger.Move : EventTrigger.Always;
							let aborted;
							[event, , , aborted] = EventExtensions.ExecuteEvent(event, Map, game, trigger, x, y,
								lastEventResult);
							if (aborted)
								return EventType.Invalid;
							break;
						}
					}
				} else {
					const branch = EventExtensions.GetSecondaryBranchSuccessor(event, Map.Events);

					if (branch != null && !checkedEvent.has(branch))
						branches.Enqueue(branch);

					event = event.Next;
				}
			}

			if (branches.Count !== 0)
				return CheckEventBranch(branches.Dequeue());

			return EventType.Invalid;
		};

		return CheckEventBranch(firstEvent);
	}

	AutomapTypeFromBlock(x, y) {
		const Map = this.Map;
		const labdata = this.labdata;
		const game = this.game;
		let characterEventId = 0;
		for (const c of this.mapCharacters.values()) {
			if (c.Active && c.Position.X === x && c.Position.Y === y) {
				characterEventId = c.EventId ?? 0;
				break;
			}
		}

		if (characterEventId !== 0) {
			const type = Map.EventAutomapTypes[characterEventId - 1];

			if (type !== AutomapType.None)
				return type;
		}

		const block = Map.Blocks[x][y];

		if (block.MapEventId !== 0 && Map.EventAutomapTypes[block.MapEventId - 1] !== AutomapType.None) {
			if (game.CurrentSavegame.IsEventActive(Map.Index, block.MapEventId - 1)) {
				let automapType = Map.EventAutomapTypes[block.MapEventId - 1];
				const event = Map.EventList[block.MapEventId - 1];

				if (event instanceof ChestEvent) {
					if (automapType === AutomapType.Chest && !game.CurrentSavegame.IsChestLocked(event.RealChestIndex - 1))
						automapType = AutomapType.ChestOpened;
				} else if (event instanceof DoorEvent) {
					if (automapType === AutomapType.Door && !game.CurrentSavegame.IsDoorLocked(event.DoorIndex))
						automapType = AutomapType.DoorOpen;
				}

				return automapType;
			}
		}

		if (block.WallIndex !== 0)
			return labdata.Walls[(block.WallIndex - 1) % labdata.Walls.length].AutomapType;
		else if (block.ObjectIndex !== 0)
			return labdata.Objects[(block.ObjectIndex - 1) % labdata.Objects.length].AutomapType;

		return AutomapType.None;
	}

	/**
	 * C#: void GetObjectPosition(Labdata.ObjectPosition objectPosition, float baseX, float baseY, out float x, out float y, out float z,
	 *     bool floorObject, out Size size)
	 * @returns {[number, number, number, Size]} [x, y, z, size]
	 */
	GetObjectPosition(objectPosition, baseX, baseY, floorObject) {
		const DistancePerBlock = Global.DistancePerBlock;
		const BlockSize = RenderMap3D.BlockSize;
		const ReferenceWallHeight = RenderMap3D.ReferenceWallHeight;
		const size = new Size(Math.trunc(objectPosition.Object.MappedTextureWidth), Math.trunc(objectPosition.Object.MappedTextureHeight));
		baseY = -this.Map.Height * DistancePerBlock + baseY;
		const x = baseX + objectPosition.X * DistancePerBlock / BlockSize;
		const z = baseY + DistancePerBlock - DistancePerBlock * objectPosition.Y / BlockSize;
		let y;

		if (floorObject) {
			y = Util.Limit(1, objectPosition.Z, ReferenceWallHeight - 1) * this.labdata.WallHeight * DistancePerBlock / (ReferenceWallHeight * BlockSize);
		} else {
			y = objectPosition.Z + objectPosition.Object.TextureHeight;
			if (y + 0.0001 < ReferenceWallHeight)
				y = objectPosition.Z + objectPosition.Object.MappedTextureHeight;
			y *= this.labdata.WallHeight * DistancePerBlock / (ReferenceWallHeight * BlockSize);
		}

		return [x, y, z, size];
	}

	/**
	 * Overloads:
	 * - UpdateCharacterSurfaceCoordinates(FloatPosition position, ISurface3D surface, Labdata.ObjectPosition objectPosition)
	 * - UpdateCharacterSurfaceCoordinates(Position position, ISurface3D surface, Labdata.ObjectPosition objectPosition,
	 *     float xOffset = 0.0f, float yOffset = 0.0f)
	 */
	UpdateCharacterSurfaceCoordinates(position, surface, objectPosition, xOffset = 0.0, yOffset = 0.0) {
		if (position instanceof FloatPosition) {
			const [x, y, z] = this.GetObjectPosition(objectPosition, position.X, position.Y,
				surface.Type === SurfaceType.BillboardFloor);
			surface.X = x;
			surface.Y = y;
			surface.Z = z;
			return;
		}

		const [x, y, z] = this.GetObjectPosition(objectPosition, position.X * Global.DistancePerBlock, position.Y * Global.DistancePerBlock,
			surface.Type === SurfaceType.BillboardFloor);
		surface.X = x + xOffset;
		surface.Y = y;
		surface.Z = z + yOffset;
	}

	CreateMapCharacter(surfaceFactory, layer, characterIndex, objectPosition, characterReference, parent, extrude) {
		const DistancePerBlock = Global.DistancePerBlock;
		const BlockSize = RenderMap3D.BlockSize;
		const wallHeight = this.WallHeight;
		const objectInfo = objectPosition.Object;
		const floorObject = hasFlag(objectInfo.Flags, Tileset.TileFlags.Floor);
		const mapObject = floorObject
			? surfaceFactory.Create(SurfaceType.BillboardFloor,
				DistancePerBlock * objectInfo.MappedTextureWidth / BlockSize,
				DistancePerBlock * objectInfo.MappedTextureHeight / BlockSize,
				objectInfo.TextureWidth, objectInfo.TextureHeight, objectInfo.TextureWidth,
				objectInfo.TextureHeight, true, Math.max(1, Math.trunc(objectInfo.NumAnimationFrames)),
				0.7075 * DistancePerBlock) // This ensures drawing over the surrounding floor. It is a bit higher than half the diagonal -> sqrt(2) / 2.
			: surfaceFactory.Create(SurfaceType.Billboard,
				DistancePerBlock * objectInfo.MappedTextureWidth / BlockSize,
				wallHeight * objectInfo.MappedTextureHeight / RenderMap3D.ReferenceWallHeight,
				objectInfo.TextureWidth, objectInfo.TextureHeight, objectInfo.TextureWidth,
				objectInfo.TextureHeight, true, Math.max(1, Math.trunc(objectInfo.NumAnimationFrames)),
				extrude);
		mapObject.Layer = layer;
		mapObject.PaletteIndex = toByte(this.Map.PaletteIndex - 1);
		const initialPosition = new Position(characterReference.Positions[0]);
		initialPosition.Offset(-1, -1);
		this.UpdateCharacterSurfaceCoordinates(initialPosition, mapObject, objectPosition);
		mapObject.TextureAtlasOffset = this.GetObjectTextureOffset(objectInfo.TextureIndex);
		const mapCharacter = new MapCharacter(this.game, this, mapObject, characterIndex, characterReference,
			objectPosition, objectInfo.TextureIndex, parent, hasFlag(objectInfo.Flags, Tileset.TileFlags.WaveAnimation),
			hasFlag(objectInfo.Flags, Tileset.TileFlags.No3DAnimation), objectInfo.NumAnimationFrames, 8.0);
		mapCharacter.Active = !this.game.CurrentSavegame.GetCharacterBit(this.Map.Index, characterIndex);
		if (mapCharacter.Active)
			mapObject.Visible = mapCharacter.HasValidPosition;
		return mapCharacter;
	}

	AddMapCharacter(surfaceFactory, layer, characterIndex, characterReference) {
		const ExtrudeStep = RenderMap3D.ExtrudeStep;
		let extrude = 8.0 * ExtrudeStep;
		const obj = this.labdata.Objects[characterReference.GraphicIndex - 1];
		const subObject = obj.SubObjects[0];
		const mapCharacter = this.CreateMapCharacter(surfaceFactory, layer, characterIndex, subObject, characterReference, null, extrude);
		for (let i = 1; i < obj.SubObjects.length; ++i) {
			extrude -= ExtrudeStep;
			mapCharacter.AddChild(this.CreateMapCharacter(surfaceFactory, layer, characterIndex, obj.SubObjects[i], characterReference, mapCharacter, extrude));
		}
		if (this.mapCharacters.has(characterIndex))
			throw new ArgumentException('An item with the same key has already been added.');
		this.mapCharacters.set(characterIndex, mapCharacter);
	}

	AddObject(surfaceFactory, layer, mapX, mapY, obj) {
		const DistancePerBlock = Global.DistancePerBlock;
		const BlockSize = RenderMap3D.BlockSize;
		const ExtrudeStep = RenderMap3D.ExtrudeStep;
		const Map = this.Map;
		const blockIndex = toUInt(mapX + mapY * Map.Width);
		if (this.blockCollisionBodies.has(blockIndex))
			throw new ArgumentException('An item with the same key has already been added.');
		this.blockCollisionBodies.set(blockIndex, []);

		const wallHeight = this.WallHeight;
		let extrude = 8.0 * ExtrudeStep;

		for (const subObject of obj.SubObjects) {
			const objectInfo = subObject.Object;
			const floorObject = hasFlag(objectInfo.Flags, Tileset.TileFlags.Floor);
			const [x, y, z, size] = this.GetObjectPosition(subObject, mapX * DistancePerBlock, mapY * DistancePerBlock, floorObject);
			const mapObject = floorObject
				? surfaceFactory.Create(SurfaceType.BillboardFloor,
					DistancePerBlock * size.Width / BlockSize,
					DistancePerBlock * size.Height / BlockSize,
					objectInfo.TextureWidth, objectInfo.TextureHeight, objectInfo.TextureWidth,
					objectInfo.TextureHeight, true, Math.max(1, Math.trunc(objectInfo.NumAnimationFrames)),
					extrude)
				: surfaceFactory.Create(SurfaceType.Billboard,
					DistancePerBlock * size.Width / BlockSize,
					wallHeight * size.Height / RenderMap3D.ReferenceWallHeight,
					objectInfo.TextureWidth, objectInfo.TextureHeight, objectInfo.TextureWidth,
					objectInfo.TextureHeight, true, Math.max(1, Math.trunc(objectInfo.NumAnimationFrames)),
					extrude);
			extrude -= ExtrudeStep;
			mapObject.Layer = layer;
			mapObject.PaletteIndex = toByte(Map.PaletteIndex - 1);
			mapObject.X = x;
			mapObject.Y = y;
			mapObject.Z = z;
			mapObject.TextureAtlasOffset = this.GetObjectTextureOffset(objectInfo.TextureIndex);
			mapObject.Visible = true;
			CollectionExtensions.SafeAdd(this.objects, blockIndex, new MapObject(this, mapObject, objectInfo.TextureIndex,
				hasFlag(objectInfo.Flags, Tileset.TileFlags.WaveAnimation),
				hasFlag(objectInfo.Flags, Tileset.TileFlags.No3DAnimation),
				objectInfo.NumAnimationFrames, 8.0));

			// Small objects should not block
			if (objectInfo.MappedTextureWidth >= BlockSize / 5) {
				if (this.AddCollisionBlock(blockIndex, objectInfo.Flags)) {
					const sphere = new CollisionSphere3D();
					sphere.CenterX = mapObject.X;
					sphere.CenterZ = -mapObject.Z;
					sphere.Radius = 0.25 * DistancePerBlock * objectInfo.MappedTextureWidth / BlockSize;
					sphere.PlayerCanPass = !this.characterBlockingBlocks[0].includes(blockIndex);
					getValue(this.blockCollisionBodies, blockIndex).push(sphere);
				}
			}
		}
	}

	AddCollisionBlock(blockIndex, flags) {
		const blockAll = hasFlag(flags, Tileset.TileFlags.BlockAllMovement);
		let blockAny = blockAll;

		for (let i = 0; i < 15; ++i) { // 15 possible collision classes
			if (!this.characterBlockingBlocks[i].includes(blockIndex)) {
				if (blockAll || !hasFlag(flags, 1 << (8 + i))) {
					this.characterBlockingBlocks[i].push(blockIndex);
					blockAny = true;
				}
			}
		}

		return blockAny;
	}

	AddWall(surfaceFactory, layer, mapX, mapY, wallIndex) {
		const DistancePerBlock = Global.DistancePerBlock;
		const Map = this.Map;
		const labdata = this.labdata;

		wallIndex %= labdata.Walls.length;

		const blockIndex = toUInt(mapX + mapY * Map.Width);
		if (this.blockCollisionBodies.has(blockIndex))
			throw new ArgumentException('An item with the same key has already been added.');
		this.blockCollisionBodies.set(blockIndex, []);
		const wallHeight = this.WallHeight;
		const wallTextureOffset = this.GetWallTextureOffset(wallIndex);
		const wallFlags = labdata.Walls[wallIndex].Flags;
		const alpha = hasFlag(wallFlags, Tileset.TileFlags.Transparency);

		this.AddCollisionBlock(blockIndex, wallFlags);

		if (!this.monsterBlockSightBlocks.includes(blockIndex) && hasFlag(wallFlags, Tileset.TileFlags.BlockSight))
			this.monsterBlockSightBlocks.push(blockIndex);

		// This is used to determine if surrounded tiles should add a wall.
		// Free block means no wall, non-blocking wall or a transparent/removable wall.
		const IsFreeBlock = (mapX, mapY) => {
			const block = Map.Blocks[mapX][mapY];

			if (block.MapBorder)
				return false;

			if (block.WallIndex === 0)
				return true;

			const wall = labdata.Walls[(block.WallIndex - 1) % labdata.Walls.length];

			return wall.AutomapType !== AutomapType.Wall ||
				hasFlag(wall.Flags, Tileset.TileFlags.Transparency) ||
				!(hasFlag(wall.Flags, Tileset.TileFlags.BlockAllMovement) || !hasFlag(wall.Flags, Tileset.TileFlags.AllowMovementWalk)) ||
				getValue(RenderMap3D.labdataChangeableBlocks, Map.TilesetOrLabdataIndex).includes(MapExtensions.PositionToTileIndex(Map, mapX, mapY));
		};

		const AddSurface = (wallOrientation, x, z) => {
			const wall = surfaceFactory.Create(SurfaceType.Wall, DistancePerBlock, wallHeight,
				RenderMap3D.TextureWidth, RenderMap3D.TextureHeight, RenderMap3D.TextureWidth, RenderMap3D.TextureHeight, alpha, 1, 0.0, wallOrientation,
				hasFlag(Map.Flags, MapFlags.Outdoor) ? labdata.CeilingColorIndex : 0);
			wall.Layer = layer;
			wall.PaletteIndex = toByte(Map.PaletteIndex - 1);
			wall.X = x;
			wall.Y = wallHeight;
			wall.Z = z;
			wall.TextureAtlasOffset = wallTextureOffset;
			wall.Visible = true;
			CollectionExtensions.SafeAdd(this.walls, blockIndex, wall);

			const line = new CollisionLine3D();
			line.X = wallOrientation === WallOrientation.Rotated180 ? x - DistancePerBlock : x;
			line.Z = -(wallOrientation === WallOrientation.Rotated270 ? z - DistancePerBlock : z);
			line.Horizontal = wallOrientation === WallOrientation.Normal || wallOrientation === WallOrientation.Rotated180;
			line.Length = DistancePerBlock;
			line.PlayerCanPass = !this.characterBlockingBlocks[0].includes(blockIndex);
			getValue(this.blockCollisionBodies, blockIndex).push(line);
		};

		const baseX = mapX * DistancePerBlock;
		const baseY = (-Map.Height + mapY) * DistancePerBlock;

		// front face
		if (mapY > 0 && IsFreeBlock(mapX, mapY - 1))
			AddSurface(WallOrientation.Normal, baseX, baseY);

		// left face
		if (mapX < Map.Width - 1 && IsFreeBlock(mapX + 1, mapY))
			AddSurface(WallOrientation.Rotated90, baseX + DistancePerBlock, baseY);

		// back face
		if (mapY < Map.Height - 1 && IsFreeBlock(mapX, mapY + 1))
			AddSurface(WallOrientation.Rotated180, baseX + DistancePerBlock, baseY + DistancePerBlock);

		// right face
		if (mapX > 0 && IsFreeBlock(mapX - 1, mapY))
			AddSurface(WallOrientation.Rotated270, baseX, baseY + DistancePerBlock);
	}

	UpdateBlock(x, y) {
		const Map = this.Map;
		const labdata = this.labdata;
		const index = toUInt(x + y * Map.Width);
		let wallRemoved = false;

		const [hasWalls, value] = tryGetValue(this.walls, index);
		if (hasWalls) {
			value.forEach(wall => wall?.Delete());
			this.walls.delete(index);
			wallRemoved = true;
		}

		const [hasObjects, value1] = tryGetValue(this.objects, index);
		if (hasObjects) {
			value1.forEach(obj => obj?.Destroy());
			this.objects.delete(index);
		}

		this.blockCollisionBodies.delete(index);

		for (let i = 0; i < this.characterBlockingBlocks.length; ++i) {
			if (this.characterBlockingBlocks[i].includes(index))
				removeItem(this.characterBlockingBlocks[i], index);
		}

		removeItem(this.monsterBlockSightBlocks, index);

		const surfaceFactory = this.renderView.Surface3DFactory;
		const layer = this.renderView.GetLayer(Layer.Map3D);
		const billboardLayer = this.renderView.GetLayer(Layer.Billboards3D);
		const block = Map.Blocks[x][y];

		if (block.WallIndex !== 0)
			this.AddWall(surfaceFactory, layer, x, y, block.WallIndex - 1);
		else if (block.ObjectIndex !== 0)
			this.AddObject(surfaceFactory, billboardLayer, x, y, labdata.Objects[(block.ObjectIndex - 1) % labdata.Objects.length]);

		if (wallRemoved && (block.WallIndex === 0 || hasFlag(labdata.Walls[block.WallIndex - 1].Flags, Tileset.TileFlags.Transparency))) {
			// Totally removed a wall -> check if adjacent walls need some surfaces.
			for (let testY = -1; testY <= 1; ++testY) {
				const blockY = y + testY;

				if (blockY < 0 || blockY >= Map.Height)
					continue;

				for (let testX = -1; testX <= 1; ++testX) {
					const blockX = x + testX;

					if (blockX < 0 || blockX >= Map.Width)
						continue;

					const adjacentBlock = Map.Blocks[blockX][blockY];

					if (adjacentBlock.WallIndex !== 0) {
						// Recreate the adjacent wall
						const adjacentIndex = toUInt(blockX + blockY * Map.Width);

						const [hasAdjacentWalls, value2] = tryGetValue(this.walls, adjacentIndex);
						if (hasAdjacentWalls)
							value2?.forEach(wall => wall?.Delete());

						this.walls.delete(adjacentIndex);
						this.blockCollisionBodies.delete(adjacentIndex);

						for (let i = 0; i < this.characterBlockingBlocks.length; ++i) {
							if (this.characterBlockingBlocks[i].includes(adjacentIndex))
								removeItem(this.characterBlockingBlocks[i], adjacentIndex);
						}

						removeItem(this.monsterBlockSightBlocks, adjacentIndex);
						this.AddWall(surfaceFactory, layer, blockX, blockY, adjacentBlock.WallIndex - 1);
					}
				}
			}
		}
	}

	UpdateFloorAndCeilingVisibility(showFloor, showCeiling) {
		if (this.floor != null)
			this.floor.Visible = showFloor;
		if (this.ceiling != null)
			this.ceiling.Visible = showCeiling && !hasFlag(this.Map.Flags, MapFlags.Sky);
	}

	UpdateSurfaces() {
		// Delete all surfaces
		this.Destroy();

		const DistancePerBlock = Global.DistancePerBlock;
		const FloorTextureWidth = RenderMap3D.FloorTextureWidth;
		const FloorTextureHeight = RenderMap3D.FloorTextureHeight;
		const renderView = this.renderView;
		const surfaceFactory = renderView.Surface3DFactory;
		const layer = renderView.GetLayer(Layer.Map3D);
		const billboardLayer = renderView.GetLayer(Layer.Billboards3D);
		const Map = this.Map;
		const labdata = this.labdata;

		// Add floor and ceiling
		if (labdata?.FloorGraphic != null) {
			const floor = this.floor = surfaceFactory.Create(SurfaceType.Floor,
				(Map.Width + 16) * DistancePerBlock, (Map.Height + 16) * DistancePerBlock,
				FloorTextureWidth, FloorTextureHeight,
				toUInt(Map.Width + 16) * FloorTextureWidth, toUInt(Map.Height + 16) * FloorTextureHeight, false);
			floor.PaletteIndex = toByte(Map.PaletteIndex - 1);
			floor.Layer = renderView.GetLayer(Layer.Map3DCeiling);
			floor.X = -8 * DistancePerBlock;
			floor.Y = 0.0;
			floor.Z = -(Map.Height + 8) * DistancePerBlock;
			floor.TextureAtlasOffset = this.FloorTextureOffset;
			floor.Visible = this.game.CoreConfiguration.ShowFloor;
		}
		if (labdata.CeilingGraphic != null) {
			const ceiling = this.ceiling = surfaceFactory.Create(SurfaceType.Ceiling,
				(Map.Width + 16) * DistancePerBlock, (Map.Height + 16) * DistancePerBlock,
				FloorTextureWidth, FloorTextureHeight,
				toUInt(Map.Width + 16) * FloorTextureWidth, toUInt(Map.Height + 16) * FloorTextureHeight, false);
			ceiling.PaletteIndex = toByte(Map.PaletteIndex - 1);
			ceiling.Layer = renderView.GetLayer(Layer.Map3DCeiling);
			ceiling.X = -8 * DistancePerBlock;
			ceiling.Y = this.WallHeight;
			ceiling.Z = 8 * DistancePerBlock;
			ceiling.TextureAtlasOffset = this.CeilingTextureOffset;
			ceiling.Visible = this.game.CoreConfiguration.ShowCeiling && !hasFlag(Map.Flags, MapFlags.Sky);
		}

		// Add walls and objects
		for (let y = 0; y < Map.Height; ++y) {
			for (let x = 0; x < Map.Width; ++x) {
				const block = Map.Blocks[x][y];

				if (block.WallIndex !== 0)
					this.AddWall(surfaceFactory, layer, x, y, block.WallIndex - 1);
				else if (block.ObjectIndex !== 0)
					this.AddObject(surfaceFactory, billboardLayer, x, y, labdata.Objects[(block.ObjectIndex - 1) % labdata.Objects.length]);
			}
		}
	}

	HideSky() {
		const renderView = this.renderView;
		renderView.PaletteReplacement = null;
		renderView.HorizonPaletteReplacement = null;
		renderView.SetSkyColorReplacement(null, null);
		this.stars.forEach(s => { s.Value.Visible = false; });
		this.skyColors?.forEach(c => c?.Delete());

		this.SetColors(null);
	}

	SetColorLightFactor(lightFactor) {
		if (this.baseFloorColor != null)
			this.floorColor.Color = this.baseFloorColor.WithLight(lightFactor);
		if (this.baseCeilingColor != null)
			this.ceilingColor.Color = this.baseCeilingColor.WithLight(lightFactor);
	}

	UpdateSky(lightEffectProvider, time, buffLightIntensity) {
		const Map = this.Map;

		if (!(Map != null && hasFlag(Map.Flags, MapFlags.Outdoor))) {
			this.SetColors(null);
			return;
		}

		const renderView = this.renderView;
		const skyParts = lightEffectProvider.GetSkyParts(Map, time.Hour, time.Minute);
		const paletteReplacement = lightEffectProvider.GetLightPaletteReplacement(Map, time.Hour, time.Minute,
			buffLightIntensity, renderView.GraphicInfoProvider);
		const horizonPaletteReplacement = lightEffectProvider.GetLightPaletteReplacement(Map, time.Hour, time.Minute,
			0, renderView.GraphicInfoProvider);

		renderView.PaletteReplacement = paletteReplacement;
		renderView.HorizonPaletteReplacement = horizonPaletteReplacement;

		this.SetColors(paletteReplacement);

		if (skyParts == null) {
			renderView.SetSkyColorReplacement(null, null);
			return;
		}

		this.skyColors?.forEach(c => c?.Delete());

		const canSee = this.game.CanSee();

		if (canSee) {
			this.skyColors = [...skyParts].map(part => {
				const skyColor = renderView.ColoredRectFactory.Create(Global.Map3DViewWidth + 1, part.Height, new Color(part.Color), 1);
				skyColor.X = Global.Map3DViewX;
				skyColor.Y = Global.Map3DViewY - 1 + part.Y;
				skyColor.Layer = this.ceilingColor.Layer;
				skyColor.Visible = true;
				return skyColor;
			});
			this.UpdateStars(Util.Round(8.0 * -144.0 * this.camera.Angle / 360.0));
			renderView.SetSkyColorReplacement(this.labdata.CeilingColorIndex, last(this.skyColors).Color);
		}
		this.stars.forEach(s => { s.Value.Visible = canSee && (time.Hour >= 19 || time.Hour < 7); });
	}

	UpdateStars(scrollX) {
		const Map = this.Map;

		if (Map == null)
			return;

		const game = this.game;
		const starAreaWidth = 8 * Global.Map3DViewWidth;
		const showStars = game.GameTime.Hour >= 19 || game.GameTime.Hour < 7;
		const starColor = !showStars ? null
			: game.GameTime.Hour < 5 || game.GameTime.Hour >= 21 ? game.GetPaletteColor(Map.PaletteIndex, 31)
				: game.GameTime.Hour === 5 || game.GameTime.Hour === 20 ? game.GetPaletteColor(Map.PaletteIndex, 30)
					: game.GameTime.Hour === 6 || game.GameTime.Hour === 19 ? game.GetPaletteColor(Map.PaletteIndex, 29)
						: null;

		this.stars.forEach(s => {
			s.Value.X = s.Key.X + scrollX;

			if (s.Value.X < Global.Map3DViewX - (starAreaWidth - Global.Map3DViewWidth))
				s.Value.X += starAreaWidth;
			else if (s.Value.X >= Global.Map3DViewX + (starAreaWidth - Global.Map3DViewWidth))
				s.Value.X -= starAreaWidth;

			if (starColor != null)
				s.Value.Color = starColor;
		});
	}

	Update(ticks, gameTime) {
		for (const [, Value] of this.objects)
			Value.forEach(obj => obj.Update(ticks));

		if ([...this.mapCharacters.values()].some(c => c.Active)) {
			const camera = this.game.RenderPlayer.Camera;
			const [mapX, mapY] = Geometry.CameraToMapPosition(this.Map, camera.X, camera.Z);
			const playerPosition = new FloatPosition(mapX - 0.5 * Global.DistancePerBlock, mapY - 0.5 * Global.DistancePerBlock);

			for (const mapCharacter of this.mapCharacters.values())
				mapCharacter.Update(ticks, gameTime, playerPosition);
		}
	}

	UpdateCharacterVisibility(characterIndex) {
		const Map = this.Map;

		if (Map.CharacterReferences[characterIndex] == null)
			throw new AmbermoonException(ExceptionScope.Application, 'Null map character');

		const mapCharacter = getValue(this.mapCharacters, characterIndex);
		const wasActive = mapCharacter.Active;

		mapCharacter.Active = !this.game.CurrentSavegame.GetCharacterBit(Map.Index, characterIndex);

		if (!wasActive && mapCharacter.Active) // avoid instant movement when spawning characters
			mapCharacter.ResetMovementTimer();
	}

	GetCollisionDetectionInfoForPlayer(position) {
		const Map = this.Map;
		const info = new CollisionDetectionInfo3D();

		for (let y = Math.max(0, position.Y - 1); y <= Math.min(Map.Height - 1, position.Y + 1); ++y) {
			for (let x = Math.max(0, position.X - 1); x <= Math.min(Map.Width - 1, position.X + 1); ++x) {
				const blockIndex = toUInt(x + y * Map.Width);

				if (this.characterBlockingBlocks[0].includes(blockIndex) && this.blockCollisionBodies.has(blockIndex)) {
					for (const collisionBody of this.blockCollisionBodies.get(blockIndex))
						info.CollisionBodies.push(collisionBody);
				}
			}
		}

		return info;
	}

	EventBlocksCharacter(position) {
		const Map = this.Map;
		const eventId = Map.Blocks[position.X][position.Y].MapEventId;

		if (eventId !== 0 && this.game.CurrentSavegame.IsEventActive(Map.Index, eventId - 1)) {
			const event = Map.EventList[eventId - 1];

			switch (event.Type) {
				case EventType.Door:
				case EventType.EnterPlace:
				case EventType.Riddlemouth:
				case EventType.Teleport:
					return true;
			}
		}

		return false;
	}

	GetCollisionDetectionInfoForMonsterFromPositions(collisionClass, ...positions) {
		const info = new CollisionDetectionInfo3D();
		const BlockSize = RenderMap3D.BlockSize;

		for (const position of positions) {
			const blockIndex = toUInt(position.X + position.Y * this.Map.Width);

			if (this.characterBlockingBlocks[collisionClass].includes(blockIndex) && this.blockCollisionBodies.has(blockIndex)) {
				for (const collisionBody of this.blockCollisionBodies.get(blockIndex))
					info.CollisionBodies.push(collisionBody);

				if (this.EventBlocksCharacter(position)) {
					const x = position.X * Global.DistancePerBlock + 0.5 * BlockSize;
					const z = position.Y * Global.DistancePerBlock + Global.DistancePerBlock - 0.5 * BlockSize;
					const sphere = new CollisionSphere3D();
					sphere.CenterX = x;
					sphere.CenterZ = -z;
					sphere.Radius = 0.5 * BlockSize;
					sphere.PlayerCanPass = false;
					info.CollisionBodies.push(sphere);
					break;
				}
			}
			// TODO: characters on tiles
			/*else
			{
				foreach (var mapCharacter in mapCharacters.Where(c => c.Value?.Active == true && c.Value.Position == position))
				{
					var flags = mapCharacter.Value.TileFlags;

					if (!flags.HasFlag(Tileset.TileFlags.UseBackgroundTileFlags))
					{
						var tile = new Tileset.Tile { Flags = flags };

						if (tile.Flags.HasFlag(Tileset.TileFlags.BlockAllMovement))
							info.CollisionBodies.Add(mapCharacter.Value.GetCollisionBody());
					}
				}
			}*/
		}

		return info;
	}

	TriggerEvents(game, trigger, x, y, savegame) {
		// first check for NPC interaction
		if (trigger === EventTrigger.Eye || trigger === EventTrigger.Mouth ||
			trigger === EventTrigger.Hand || trigger >= EventTrigger.Item0) {
			for (const [, Value] of this.mapCharacters) {
				if (Value.Position.X === x && Value.Position.Y === y) {
					if (Value.Interact(trigger, false))
						return true;
				}
			}
		}

		// C#: Map.TriggerEvents(game, trigger, x, y, savegame, out _) - identical to the overload without out parameter
		return MapExtensions.TriggerEvents(this.Map, game, trigger, x, y, savegame);
	}
}
