// Port of Ambermoon.Core/Render/MapCharacter2D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { getValue, hasFlag, toUInt } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Map as DataMap } from '../../Ambermoon.Data.Common/Map.js';
import { Tileset } from '../../Ambermoon.Data.Common/Tileset.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { TravelType } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { EventType, ConditionEvent, PopupTextEvent } from '../../Ambermoon.Data.Common/Event.js';
import { Character2DAnimationInfo } from '../../Ambermoon.Data.Common/Render/Character2DAnimationInfo.js';
import { EventTrigger } from '../MapExtensions.js';
import { EventExtensions } from '../EventExtensions.js';
import { InteractionExtensions } from '../InteractionExtensions.js';
import { GameCore } from '../GameCore.js';
import { Window } from '../UI/Window.js';
import { Character2D } from './Character2D.js';
import { TextureAtlasManager } from './TextureAtlasManager.js';
import { Layer } from './Layer.js';
import { Graphics } from './Graphics.js';
import { RenderMap2D } from './RenderMap2D.js';
import { TextAlign } from './TextAlign.js';

// using Flags = Map.CharacterReference.Flags;
const Flags = () => DataMap.CharacterReference.Flags;

export class MapCharacter2D extends Character2D {
	static NullOffset = new Position(0, 0);
	// This is used to avoid multiple monster encounters in the same update frame (e.g. 2 monsters move onto the player at the same time).
	static interacting = false;

	// private constructor (use MapCharacter2D.Create)
	constructor(game, renderView, layer, mapManager, map, characterIndex, characterReference) {
		super(game, renderView.GetLayer(layer), TextureAtlasManager.Instance.GetOrCreate(layer),
			renderView.SpriteFactory, direction => MapCharacter2D.AnimationProvider(game, map.Map, mapManager,
				characterReference, renderView.GraphicInfoProvider, direction), map,
			MapCharacter2D.GetStartPosition(characterReference), () => Math.max(1, map.Map.PaletteIndex) - 1, _ => MapCharacter2D.NullOffset);
		this.lastTimeSlot = 0;
		this.disallowInstantMovementUntilTimeSlot = null;
		this.lastInteractionTicks = 0;
		this.CheckedIfSeesPlayer = false;
		this.SeesPlayer = false;
		this.Paused = false;

		this.game = game;
		this.map = map.Map;
		this.tileset = mapManager.GetTilesetForMap(this.map);
		this.characterIndex = characterIndex;
		this.characterReference = characterReference;
		this.lastTimeSlot = game.GameTime.TimeSlot;
	}

	/**
	 * This is used to determine if a character is 1 or 2 tiles height in non-worldmaps.
	 */
	get IsRealCharacter() { return !hasFlag(this.characterReference.CharacterFlags, Flags().UseTileset); }
	get IsMonster() { return this.characterReference.Type === CharacterType.Monster; }
	get IsConversationPartner() { return this.characterReference.Type === CharacterType.PartyMember || this.characterReference.Type === CharacterType.NPC; }
	get TileFlags() { return this.characterReference?.TileFlags ?? Tileset.TileFlags.None; }

	static Reset() { MapCharacter2D.interacting = false; }

	ResetLastInteractionTime() { this.lastInteractionTicks = this.game.CurrentTicks; }

	static GetStartPosition(characterReference) {
		const position = characterReference.Positions[0];

		// The positions are stored 1-based.
		return new Position(position.X - 1, position.Y - 1);
	}

	static AnimationProvider(game, map, mapManager, characterReference, graphicInfoProvider, direction) {
		const usesTileset = hasFlag(characterReference.CharacterFlags, Flags().UseTileset);

		if (usesTileset) {
			const tileset = mapManager.GetTilesetForMap(map);
			const tile = tileset.Tiles[characterReference.GraphicIndex - 1];

			const info = new Character2DAnimationInfo();
			info.FrameWidth = RenderMap2D.TILE_WIDTH;
			info.FrameHeight = RenderMap2D.TILE_HEIGHT;
			info.StandFrameIndex = tile.GraphicIndex - 1;
			info.SitFrameIndex = 0;
			info.SleepFrameIndex = 0;
			info.NumStandFrames = toUInt(tile.NumAnimationFrames);
			info.NumSitFrames = 0;
			info.NumSleepFrames = 0;
			info.TicksPerFrame = map.TicksPerAnimationFrame * 2;
			info.NoDirections = true;
			info.IgnoreTileType = true;
			info.UseTopSprite = false;
			return info;
		} else {
			const playerAnimationInfo = game.GetPlayerAnimationInfo(direction);

			const info = new Character2DAnimationInfo();
			info.FrameWidth = 16; // NPC width
			info.FrameHeight = 32; // NPC height
			info.StandFrameIndex = Graphics.GetNPCGraphicIndex(map.NPCGfxIndex, characterReference.GraphicIndex, graphicInfoProvider);
			info.SitFrameIndex = playerAnimationInfo.SitFrameIndex;
			info.SleepFrameIndex = playerAnimationInfo.SleepFrameIndex;
			info.NumStandFrames = toUInt(getValue(graphicInfoProvider.NPCGraphicFrameCounts, map.NPCGfxIndex)[characterReference.GraphicIndex]);
			info.NumSitFrames = playerAnimationInfo.NumSitFrames;
			info.NumSleepFrames = playerAnimationInfo.NumSleepFrames;
			info.TicksPerFrame = map.TicksPerAnimationFrame * 2;
			info.NoDirections = true;
			info.IgnoreTileType = false;
			info.UseTopSprite = true;
			return info;
		}
	}

	static Create(game, renderView, mapManager, map, characterIndex, characterReference) {
		const layer = hasFlag(characterReference.CharacterFlags, Flags().UseTileset)
			? (Layer.MapForeground1 + map.Map.TilesetOrLabdataIndex - 1) : Layer.Characters;
		return new MapCharacter2D(game, renderView, layer, mapManager, map, characterIndex, characterReference);
	}

	Update(ticks, gameTime, ...args) {
		if (args.length === 2) {
			// protected base overload Update(ticks, gameTime, mapAnimation, tileFlags)
			super.Update(ticks, gameTime, ...args);
			return;
		}

		const [allowInstantMovement, lastPlayerPosition, mapAnimation /* , tileFlags */] = args;

		if (!this.Active || this.Paused)
			return;

		const game = this.game;
		const map = this.map;
		const characterReference = this.characterReference;
		let newPosition = new Position(this.Position);

		const TestPosition = position => {
			if (Position.op_Equality(position, this.Position))
				return false;

			const collisionPosition = new Position(position.X, position.Y);

			if (collisionPosition.X < 0 || collisionPosition.X >= map.Width)
				return false;

			if (collisionPosition.Y < 0 || collisionPosition.Y >= map.Height)
				return false;

			const mapEventId = this.Map.get(collisionPosition).MapEventId;

			if (mapEventId !== 0) {
				// Note: Won't work for world maps but there are no characters.
				if (game.CurrentSavegame.IsEventActive(this.Map.Map.Index, mapEventId - 1)) {
					switch (this.Map.Map.EventList[mapEventId - 1].Type) {
						case EventType.Chest:
						case EventType.Door:
						case EventType.EnterPlace:
						case EventType.Riddlemouth:
						case EventType.Teleport:
							return false;
					}
				}
			}

			// Note: Monsters and NPCs in 2D also use TravelType.Walk for collision detection.
			return this.Map.get(collisionPosition).AllowMovement(this.tileset, TravelType.Walk, false);
		};

		const MoveRandom = () => {
			for (let i = 0; i < 10; ++i) { // limit to 10 tries to avoid infinite loops
				newPosition = new Position(this.Position.X + game.RandomInt(-1, 1), this.Position.Y + game.RandomInt(-1, 1));

				if (TestPosition(newPosition))
					break;

				newPosition = this.Position;
			}
		};

		const TestIfMonsterSeesPlayer = () => {
			this.CheckedIfSeesPlayer = true;
			return this.Map.MonsterSeesPlayer(newPosition);
		};

		// Web port: Amberstar has stationary monsters which never chase the party.
		if (characterReference.Type === CharacterType.Monster && characterReference.AmberstarStationary)
			return;

		if (characterReference.Type === CharacterType.Monster) {
			if ((this.CheckedIfSeesPlayer && this.SeesPlayer) ||
				(!this.CheckedIfSeesPlayer && TestIfMonsterSeesPlayer())) {
				game.MonsterSeesPlayer = true;
				this.SeesPlayer = true;
				this.CheckedIfSeesPlayer = true;

				if (this.lastTimeSlot !== gameTime.TimeSlot ||
					(allowInstantMovement && (this.disallowInstantMovementUntilTimeSlot == null
						|| this.disallowInstantMovementUntilTimeSlot === gameTime.TimeSlot))) {
					this.disallowInstantMovementUntilTimeSlot = null;
					const diff = Position.op_Subtraction(game.RenderPlayer.Position, newPosition);
					let dx = Math.sign(diff.X);
					const dy = Math.sign(diff.Y);
					if (Math.abs(diff.X) <= 1 && Math.abs(diff.Y) <= 1 && lastPlayerPosition != null) {
						const playerDiff = Position.op_Subtraction(game.RenderPlayer.Position, lastPlayerPosition);
						if ((playerDiff.X !== 0 && playerDiff.Y === 0 && Math.abs(diff.Y) !== 0) ||
							(playerDiff.X === 0 && playerDiff.Y !== 0 && Math.abs(diff.X) !== 0)) {
							dx = 0;
						}
					}
					this.lastTimeSlot = gameTime.TimeSlot;
					if (dx === 0) {
						newPosition.Y += dy;
						if (!TestPosition(newPosition))
							return; // Not moving
					} else if (dy === 0) {
						newPosition.X += dx;
						if (!TestPosition(newPosition))
							return; // Not moving
					} else {
						// Test with x and y change, then with only y change and then with only x change.
						const position = Position.op_Addition(newPosition, new Position(dx, dy));
						if (TestPosition(position))
							newPosition = position;
						else {
							position.X = newPosition.X;
							if (TestPosition(position))
								newPosition = position;
							else {
								newPosition.X += dx;
								if (!TestPosition(newPosition))
									return; // Not moving
							}
						}
					}
				}
			} else if (hasFlag(characterReference.CharacterFlags, Flags().RandomMovement) &&
				!characterReference.OnlyMoveWhenSeePlayer) {
				this.SeesPlayer = false;

				if (this.lastTimeSlot !== gameTime.TimeSlot) {
					MoveRandom();
					this.lastTimeSlot = gameTime.TimeSlot;
				}
			} else {
				// Just stay
				this.SeesPlayer = false;
			}
		} else {
			if (hasFlag(characterReference.CharacterFlags, Flags().RandomMovement)) {
				if (this.lastTimeSlot !== gameTime.TimeSlot) {
					MoveRandom();
					this.lastTimeSlot = gameTime.TimeSlot;
				}
			} else if (!characterReference.Stationary) {
				// Walk a given path every day time slot
				newPosition = new Position(characterReference.Positions[gameTime.TimeSlot % characterReference.Positions.length]);
				newPosition.Offset(-1, -1); // positions are 1-based
			}
		}

		super.MoveTo(map, toUInt(newPosition.X), toUInt(newPosition.Y), ticks, false, null);

		super.Update(ticks, gameTime, mapAnimation, characterReference.TileFlags);

		if (!MapCharacter2D.interacting && this.IsMonster && Position.op_Equality(newPosition, game.RenderPlayer.Position))
			this.Interact(EventTrigger.Move, false);
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
		this.game.CurrentSavegame.SetCharacterBit(this.map.Index, this.characterIndex, true);

		if (this.game.CurrentMapCharacter === this)
			this.game.CurrentMapCharacter = null;
	}

	Interact(trigger, bed) {
		const game = this.game;
		const characterReference = this.characterReference;

		game.CurrentMapCharacter = null;

		switch (trigger) {
			case EventTrigger.Eye:
			case EventTrigger.Mouth:
				if (characterReference.Type === CharacterType.Monster)
					return false;
				break;
			case EventTrigger.Move:
				if (characterReference.Type !== CharacterType.Monster &&
					characterReference.Type !== CharacterType.MapObject)
					return false;
				break;
			default:
				return false;
		}

		if (trigger === EventTrigger.Mouth && bed &&
			!hasFlag(characterReference.CharacterFlags, Flags().UseTileset)) {
			game.ShowMessagePopup(game.DataNameProvider.PersonAsleepMessage);
			return true;
		}

		const TriggerCharacterEvents = eventIndex => {
			if (game.CurrentTicks - this.lastInteractionTicks < GameCore.TicksPerSecond)
				return false;

			let event = this.map.EventList[eventIndex - 1];

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
			MapCharacter2D.interacting = true;
			game.CurrentMapCharacter = this;
			const position = game.RenderPlayer.Position;
			return EventExtensions.TriggerEventChain(this.map, game, trigger, toUInt(position.X), toUInt(position.Y), event, true);
		};

		if (hasFlag(characterReference.CharacterFlags, Flags().TextPopup)) {
			if (characterReference.EventIndex !== 0 && game.CurrentSavegame.IsEventActive(this.map.Index, characterReference.EventIndex - 1)) {
				return TriggerCharacterEvents(characterReference.EventIndex);
			} else if (trigger === EventTrigger.Eye) {
				// Popup NPCs can't be looked at but only talked to.
				return false;
			} else if (trigger === EventTrigger.Mouth) {
				this.ShowPopup(this.map.GetText(characterReference.Index, game.DataNameProvider.TextBlockMissing));
				return true;
			}
		}

		const HandleConversation = conversationPartner => {
			if (trigger === EventTrigger.Eye) {
				game.ShowMessagePopup(conversationPartner.Texts[0], null);
				return true;
			} else if (trigger === EventTrigger.Mouth) {
				if (conversationPartner == null)
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid NPC or party member index.');

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
			case CharacterType.Monster:
			{
				if (trigger === EventTrigger.Move) {
					if (game.CurrentTicks - this.lastInteractionTicks < GameCore.TicksPerSecond)
						return false;

					if (game.Teleporting || game.Map !== this.Map.Map)
						return false;

					if (game.Fading || game.PopupActive || game.CurrentWindow.Window !== Window.MapView)
						return false;

					// First set this to max so we won't trigger this again while we are interacting.
					this.lastInteractionTicks = 0xffffffff;
					MapCharacter2D.interacting = true;
					game.CurrentMapCharacter = this;
					const map = this.Map.GetMapFromTile(toUInt(this.Position.X), toUInt(this.Position.Y)); // eslint-disable-line no-unused-vars

					const StartBattle = failedEscape => {
						game.StartBattle(characterReference.Index, failedEscape, toUInt(game.PartyPosition.X), toUInt(game.PartyPosition.Y), battleEndInfo => {
							this.lastInteractionTicks = game.CurrentTicks;
							MapCharacter2D.interacting = false;
							game.CurrentMapCharacter = null;

							if (battleEndInfo.MonstersDefeated) {
								this.Deactivate();
							} else {
								this.Map.StopMonstersForOneTimeSlot();
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
								this.lastInteractionTicks = game.CurrentTicks;
								MapCharacter2D.interacting = false;
								game.CurrentMapCharacter = null;
								this.Map.StopMonstersForOneTimeSlot();
							}
						}
					}, 2, 0, TextAlign.Left, false);
				}
				break;
			}
			case CharacterType.MapObject:
				if (characterReference.EventIndex !== 0 && game.CurrentSavegame.IsEventActive(this.map.Index, characterReference.EventIndex - 1))
					return TriggerCharacterEvents(characterReference.EventIndex);
				break;
		}

		return true;
	}

	StopMonsterForOneTimeSlot() {
		this.lastInteractionTicks = this.game.CurrentTicks;
		this.lastTimeSlot = this.game.GameTime.TimeSlot;
		this.disallowInstantMovementUntilTimeSlot = (this.lastTimeSlot + 1) % 288;
	}

	ShowPopup(text) {
		this.game.ShowMessagePopup(text, null, TextAlign.Center);
	}
}
