// Port of Ambermoon.Core/Game/Party.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import {
	Event, hasFlag, range, newArray, firstOrDefault, tryGetValue, getValue, format, idiv,
	isNullOrWhiteSpace, toByte, toShort
} from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { CharacterDirection } from '../../Ambermoon.Common/Direction.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { Map, MapFlags } from '../../Ambermoon.Data.Common/Map.js';
import { Automap } from '../../Ambermoon.Data.Common/Automap.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { ConditionEvent, DoorEvent, EventType } from '../../Ambermoon.Data.Common/Event.js';
import { SpellInfos } from '../../Ambermoon.Data.Common/SpellInfo.js';
import { TravelType, TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { Condition, ConditionExtensions } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { EquipmentSlot } from '../../Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { ItemType } from '../../Ambermoon.Data.Common/Enumerations/ItemType.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { ActiveSpellType } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { Song } from '../../Ambermoon.Data.Common/Enumerations/Song.js';
import { Picture80x80 } from '../../Ambermoon.Data.Common/Enumerations/Picture80x80.js';
import { Class, ClassExtensions } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
import { SpellSchoolExtensions } from '../../Ambermoon.Data.Common/Enumerations/SpellSchool.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { PlayerMovementAbility, PlayerMovementAbilityExtensions } from '../PlayerMovementAbility.js';
import { EventTrigger, MapExtensions } from '../MapExtensions.js';
import { EventExtensions } from '../EventExtensions.js';
import { MouseButtons } from '../MouseButtons.js';
import { Global } from '../UI/Global.js';
import { Window } from '../UI/Window.js';
import { LayoutType } from '../UI/Layout.js';
import { ItemGrid } from '../UI/ItemGrid.js';
import { ScrollbarType } from '../UI/ScrollbarType.js';
import { TextAlign } from '../Render/TextAlign.js';
import { SpellAnimation } from '../Render/SpellAnimation.js';
import { RenderMap3D } from '../Render/RenderMap3D.js';
import { Geometry } from '../Geometry/Geometry.js';
import { MobileAction } from './Input.js';
import { ConversationItems } from './Conversations.js';

// Static members of GameCore declared in other part files (e.g. MaxBaseLine, PartyMemberCharacterBits)
// are accessed through the instance's class to avoid importing GameCore.
const statics = self => self.constructor;

// Character.Died is a multicast delegate field in C# (Action<Character>).
// Support both an Event instance and a plain function field.
function addDelegate(obj, name, handler) {
	const current = obj[name];
	if (current != null && typeof current.add === 'function')
		current.add(handler);
	else if (current == null)
		obj[name] = handler;
	else
		obj[name] = (...args) => { current(...args); handler(...args); };
}

function removeDelegate(obj, name, handler) {
	const current = obj[name];
	if (current != null && typeof current.remove === 'function')
		current.remove(handler);
	else if (current === handler)
		obj[name] = null;
}

export class GameCore_Party {
	static MaxPartyMembers = 6;

	static initFields(self) {
		self.currentPickingActionMember = null;
		self.currentlyHealedMember = null;
		self.pickingNewLeader = false;
		self.pickingTargetPlayer = false;
		self.pickingTargetInventory = false;
		self.partyAdvances = false; // party or monsters are advancing
		self.travelType = TravelType.Walk;

		self.NewLeaderPicked = new Event();
		self.TargetPlayerPicked = new Event();
		self.TargetInventoryPicked = new Event();
		self.TargetItemPicked = new Event();
		self.ActivePlayerChanged = new Event();

		self.Godmode = false;
		self.NoClip = false;
		self.CurrentPartyMember = null;
		self.CurrentInventoryIndex = null;
		self.CurrentCaster = null;
		self.CurrentSpellTarget = null;

		// Stable bound handler so that Died += / -= PartyMemberDied works with the same reference.
		self.partyMemberDiedHandler = partyMember => self.PartyMemberDied(partyMember);
	}

	get CurrentInventory() {
		return this.CurrentInventoryIndex == null ? null : this.GetPartyMember(this.CurrentInventoryIndex);
	}

	get PartyPosition() {
		return !this.Ingame || this.Map == null || this.player == null ? new Position() : this.LimitPartyPosition(Position.op_Addition(this.Map.MapOffset, this.player.Position));
	}

	get TravelType() {
		return this.travelType;
	}

	set TravelType(value) {
		const superman = this.travelType === TravelType.Fly || value === TravelType.Fly;
		this.travelType = value;
		this.CurrentSavegame.TravelType = value;

		if (this.Map != null && this.Map.UseTravelMusic)
			this.PlayMusic(TravelTypeExtensions.TravelSong(this.travelType));

		this.player.MovementAbility = PlayerMovementAbilityExtensions.ToPlayerMovementAbility(this.travelType);

		if (this.Map?.UseTravelTypes === true) {
			this.player2D?.UpdateAppearance(this.CurrentTicks);
			const [, transportAtPlayerIndex] = this.GetTransportsInVisibleArea();

			if (this.player2D != null) {
				this.player2D.BaselineOffset = !this.CanSee() || transportAtPlayerIndex != null ? statics(this).MaxBaseLine :
					this.player.MovementAbility > PlayerMovementAbility.Swimming ? 32 : 0;
			}
		} else if (!this.Is3D && this.player2D != null) {
			this.player2D.BaselineOffset = this.CanSee() ? 0 : statics(this).MaxBaseLine;
		}

		if (this.Map != null && this.layout.ButtonGridPage === 1) {
			if (hasFlag(this.Map.Flags, MapFlags.CanRest) && TravelTypeExtensions.CanCampOn(this.travelType)) {
				this.layout.EnableButton(5, true);
			} else {
				this.layout.EnableButton(5, false);
			}
		}

		if (superman)
			this.UpdateLight();
	}

	SetPlayerDirection(direction) {
		if (direction === CharacterDirection.Random)
			direction = this.RandomInt(0, 3);

		this.CurrentSavegame.CharacterDirection = direction;

		if (this.Is3D)
			this.player3D.TurnTowards(direction * 90.0);
		else
			this.player2D.SetDirection(direction, this.CurrentTicks);
	}

	LimitPartyPosition(position) {
		if (this.Map == null)
			return position;

		const width = this.Map.IsWorldMap ? this.Map.WorldMapDimension * 50 : this.Map.Width;
		const height = this.Map.IsWorldMap ? this.Map.WorldMapDimension * 50 : this.Map.Height;

		while (position.X < 0)
			position.X += width;
		while (position.Y < 0)
			position.Y += height;

		position.X %= width;
		position.Y %= height;

		return position;
	}

	CanRevive() {
		return this.CurrentWindow.Window === Window.Camp;
	}

	// Note: Eagle and wasp allow movement even with overweight.
	CanPartyMove() {
		return this.TravelType === TravelType.Eagle || this.TravelType === TravelType.Wasp || !this.PartyMembers.some(p => !p.CanMove(false));
	}

	get PartyMembers() {
		return range(0, GameCore_Party.MaxPartyMembers)
			.map(i => this.GetPartyMember(i)).filter(p => p != null);
	}

	GetPartyMember(slot) {
		return this.CurrentSavegame?.GetPartyMember(slot) ?? null;
	}

	/**
	 * Runs an action for each party member. In contrast to a normal foreach loop
	 * the action can contain blocking calls for each party member like popups.
	 * The next party member is processed after an action is finished for the
	 * previous member.
	 * @param action Action to perform. Second parameter is the finish handler the action must call.
	 * @param condition Condition to filter affected party members.
	 * @param followUpAction Action to trigger after all party members were processed.
	 */
	ForeachPartyMember(action, condition = null, followUpAction = null) {
		const wasClickMoveActive = this.clickMoveActive;
		this.StartSequence();

		const Finish = () => {
			this.EndSequence();
			this.clickMoveActive = wasClickMoveActive;
			this.CurrentMobileAction = MobileAction.None;
			followUpAction?.();
		};

		const Run = index => {
			if (index === GameCore_Party.MaxPartyMembers) {
				Finish();
				return;
			}

			const partyMember = this.GetPartyMember(index);

			if (partyMember == null || condition?.(partyMember) === false) {
				Run(index + 1);
			} else {
				action(partyMember, () => Run(index + 1));
			}
		};

		Run(0);
	}

	/** returns [result, gameOver] */
	RecheckActivePartyMember() {
		let gameOver = false;

		if (!ConditionExtensions.CanSelect(this.CurrentPartyMember.Conditions) || this.currentBattle?.GetSlotFromCharacter(this.CurrentPartyMember) === -1) {
			this.layout.ClearBattleFieldSlotColors();

			if (!this.PartyMembers.some(p => ConditionExtensions.CanSelect(p.Conditions))) {
				if (this.battleRoundActiveSprite != null)
					this.battleRoundActiveSprite.Visible = false;
				this.currentBattleInfo = null;
				this.currentBattle = null;
				this.CloseWindow(() => {
					this.InputEnable = true;
					this.Hook_GameOver();
				});
				gameOver = true;
				return [true, gameOver];
			} else if (this.BattleActive && !this.PartyMembers.some(p => ConditionExtensions.CanSelect(p.Conditions) && !this.currentBattle.HasPartyMemberFled(p))) {
				// All dead or fled but at least one is still alive but fled.
				this.EndBattle(true);
				return [false, gameOver];
			}

			this.Pause();
			// Simple text popup
			const popup = this.layout.OpenTextPopup(this.ProcessText(this.DataNameProvider.SelectNewLeaderMessage), () => {
				this.UntrapMouse();
				if (this.currentBattle == null && !this.WindowActive)
					this.Resume();
				this.ResetCursor();
			}, true, false);
			popup.CanAbort = false;
			this.pickingNewLeader = true;
			this.CursorType = CursorType.Sword;
			this.TrapMouse(Global.PartyMemberPortraitArea);
			return [false, gameOver];
		} else {
			this.layout.UpdateCharacterNameColors(this.SlotFromPartyMember(this.CurrentPartyMember));
			return [true, gameOver];
		}
	}

	SetActivePartyMember(index, updateBattlePosition = true) {
		const partyMember = this.GetPartyMember(index);

		const TestConversationLanguage = windowInfo => {
			const conversationPartner = windowInfo.WindowParameters[0];

			if ((conversationPartner.SpokenLanguages & partyMember.SpokenLanguages) === 0 &&
				(conversationPartner.SpokenExtendedLanguages & partyMember.SpokenExtendedLanguages) === 0) {
				this.ShowMessagePopup(this.DataNameProvider.YouDontSpeakSameLanguage);
				return false;
			}

			return true;
		};

		// This avoids switching to a player that doesn't speak the same language.
		if (this.CurrentWindow.Window === Window.Conversation && !TestConversationLanguage(this.CurrentWindow))
			return;
		if (this.LastWindow.Window === Window.Conversation && !TestConversationLanguage(this.LastWindow))
			return;
		if (this.PlayerIsPickingABattleAction)
			return;

		if (partyMember != null && (ConditionExtensions.CanSelect(partyMember.Conditions) || this.currentWindow.Window === Window.Healer)) {
			const switched = this.CurrentPartyMember !== partyMember;

			if (this.currentWindow.Window === Window.Healer) {
				this.currentlyHealedMember = partyMember;
				this.layout.SetCharacterHealSymbol(index);
			} else {
				if (this.HasPartyMemberFled(partyMember))
					return;

				this.CurrentSavegame.ActivePartyMemberSlot = index;
				this.currentPickingActionMember = this.CurrentPartyMember = partyMember;
				this.layout.SetActiveCharacter(index, range(0, GameCore_Party.MaxPartyMembers).map(i => this.GetPartyMember(i)));
				this.layout.SetCharacterHealSymbol(null);

				if (this.currentBattle != null && updateBattlePosition && this.layout.Type === LayoutType.Battle)
					this.BattlePlayerSwitched();

				if (this.pickingNewLeader) {
					this.pickingNewLeader = false;
					this.layout.ClosePopup(true, true);
					this.ResetMoveKeys(true);
					this.NewLeaderPicked.invoke(index);
				}

				if (this.is3D)
					this.renderMap3D?.SetCameraHeight(partyMember.Race);
			}

			if (switched) {
				this.UpdateLight(false, false, true);

				if (!this.WindowActive)
					this.layout.UpdateLayoutButtons();
			}

			this.ActivePlayerChanged.invoke();
		}
	}

	CanUseSpells() {
		if (this.Map?.CanUseSpells !== true)
			return false;

		if (!(this.CurrentPartyMember != null && ClassExtensions.IsMagic(this.CurrentPartyMember.Class) === true))
			return false;

		if (!(this.CurrentPartyMember != null && ConditionExtensions.CanCastSpell(this.CurrentPartyMember.Conditions, this.Features) === true))
			return false;

		return true;
	}

	CanSee() {
		return !hasFlag(this.CurrentPartyMember.Conditions, Condition.Blind) &&
			(!hasFlag(this.Map.Flags, MapFlags.Dungeon) || this.lightIntensity > 0);
	}

	AddAttributeDamageBonus(character, attackDamage) {
		if (!hasFlag(this.Features, Features.AdjustedWeaponDamage)) {
			return attackDamage + Math.trunc(Math.trunc(character.Attributes[Attribute.Strength].TotalCurrentValue) / 25);
		} else {
			const rightHandItemSlot = character.Equipment.Slots.get(EquipmentSlot.RightHand);

			if (rightHandItemSlot != null && rightHandItemSlot.ItemIndex !== 0 && rightHandItemSlot.Amount !== 0) {
				const rightHandItem = this.ItemManager.GetItem(rightHandItemSlot.ItemIndex);

				if (rightHandItem.Type === ItemType.LongRangeWeapon) {
					return attackDamage +
						Math.trunc(Math.trunc(character.Attributes[Attribute.Dexterity].TotalCurrentValue) / 25) +
						Math.trunc(Math.trunc(character.Attributes[Attribute.Strength].TotalCurrentValue) / 50);
				}
			}

			return attackDamage +
				Math.trunc(Math.trunc(character.Attributes[Attribute.Strength].TotalCurrentValue) / 25) +
				Math.trunc(Math.trunc(character.Attributes[Attribute.Dexterity].TotalCurrentValue) / 50);
		}
	}

	AdjustAttackDamageForNotUsedAmmunition(character, attackDamage) {
		const leftHandItemSlot = character.Equipment.Slots.get(EquipmentSlot.LeftHand);

		if (leftHandItemSlot != null && leftHandItemSlot.ItemIndex !== 0 && leftHandItemSlot.Amount !== 0) {
			const leftHandItem = this.ItemManager.GetItem(leftHandItemSlot.ItemIndex);

			if (leftHandItem.Type === ItemType.Ammunition && leftHandItem.Damage !== 0) {
				const rightHandItemSlot = character.Equipment.Slots.get(EquipmentSlot.RightHand);

				if (rightHandItemSlot == null || rightHandItemSlot.ItemIndex === 0 || rightHandItemSlot.Amount === 0)
					return attackDamage - leftHandItem.Damage;

				const rightHandItem = this.ItemManager.GetItem(rightHandItemSlot.ItemIndex);

				if (rightHandItem.UsedAmmunitionType !== leftHandItem.AmmunitionType)
					return attackDamage - leftHandItem.Damage;
			}
		}

		return attackDamage;
	}

	/**
	 * Overloads:
	 * DamageAllPartyMembers(Func<PartyMember, uint> damageProvider, affectChecker = null, notAffectedHandler = null,
	 *     followAction = null, inflictCondition = Condition.None, showDamageSplash = true)
	 * DamageAllPartyMembers(uint damage, affectChecker = null, notAffectedHandler = null, followAction = null)
	 */
	DamageAllPartyMembers(damageProvider, affectChecker = null, notAffectedHandler = null, followAction = null,
		inflictCondition = Condition.None, showDamageSplash = true) {
		if (typeof damageProvider === 'number') {
			const damage = damageProvider;
			this.DamageAllPartyMembers(_ => damage, affectChecker, notAffectedHandler, followAction);
			return;
		}

		// In original all players are damaged one after the other
		// without showing the damage splash immediately. If a character
		// dies the skull is shown. If this was the active character
		// the "new leader" logic kicks in. Only after that the next
		// party member is checked.
		// At the end all affected living characters will show the damage splash.
		const damagedPlayers = [];

		const Damage = (partyMember, finished) => {
			if (affectChecker?.(partyMember) === false) {
				if (notAffectedHandler == null)
					finished?.();
				else
					notAffectedHandler?.(partyMember, finished);
				return;
			}

			const damage = this.Godmode ? 0 : damageProvider?.(partyMember) ?? 0;

			if (damage > 0 || inflictCondition !== Condition.None) {
				partyMember.Damage(damage, _ => this.KillPartyMember(partyMember, Condition.DeadCorpse));

				if (!this.Godmode && partyMember.Alive && inflictCondition >= Condition.DeadCorpse) {
					this.KillPartyMember(partyMember, inflictCondition);
				}

				if (partyMember.Alive) { // update HP etc if not died already
					damagedPlayers.push(partyMember);

					if (!this.Godmode && inflictCondition !== Condition.None && inflictCondition < Condition.DeadCorpse) {
						partyMember.Conditions |= inflictCondition;

						if (inflictCondition === Condition.Blind && partyMember === this.CurrentPartyMember)
							this.UpdateLight();
					}
				}

				if (partyMember.Alive && ConditionExtensions.CanSelect(partyMember.Conditions)) {
					finished?.();
				} else {
					if (this.CurrentPartyMember === partyMember && this.currentBattle == null) {
						if (!this.PartyMembers.some(p => p.Alive && ConditionExtensions.CanSelect(p.Conditions))) {
							this.Hook_GameOver();
							return;
						}

						const inputWasEnabled = this.InputEnable;
						const allInputWasDisabled = this.allInputDisabled;

						const NewLeaderPicked = index => {
							this.NewLeaderPicked.remove(NewLeaderPicked);
							this.allInputDisabled = allInputWasDisabled;
							finished?.();
							this.InputEnable = inputWasEnabled;
						};

						this.NewLeaderPicked.add(NewLeaderPicked);
						this.allInputDisabled = false;
						const [, gameOver] = this.RecheckActivePartyMember();

						if (gameOver || !this.pickingNewLeader)
							this.NewLeaderPicked.remove(NewLeaderPicked);

						if (gameOver)
							this.allInputDisabled = false;
						else if (!this.pickingNewLeader)
							this.allInputDisabled = allInputWasDisabled;
					} else {
						this.layout.AttachToPortraitAnimationEvent(finished);
					}
				}
			} else {
				finished?.();
			}
		};

		const ShowDamageSplash = (partyMember, finished) => this.ShowDamageSplash(partyMember, damageProvider, finished);

		this.ForeachPartyMember(Damage, p => p.Alive && !hasFlag(p.Conditions, Condition.Petrified), () => {
			if (showDamageSplash) {
				this.ForeachPartyMember(ShowDamageSplash, p => damagedPlayers.includes(p), () => {
					this.layout.UpdateCharacterNameColors(this.CurrentSavegame.ActivePartyMemberSlot);
					followAction?.(damagedPlayers.some(player => !player.Alive));
				});
			} else {
				this.layout.UpdateCharacterNameColors(this.CurrentSavegame.ActivePartyMemberSlot);
				followAction?.(damagedPlayers.some(player => !player.Alive));
			}
		});
	}

	/**
	 * Overloads:
	 * Levitate(Action failAction, bool climbIfNoEvent = true)
	 * Levitate()
	 */
	Levitate(failAction, climbIfNoEvent = true) {
		if (arguments.length === 0) {
			this.Levitate(() => {
				this.ShowMessagePopup(this.DataNameProvider.YouLevitate, () => {
					this.MoveVertically(false, true, () => this.Resume());
				});
			});
			return;
		}

		let climbEvent = null;
		let levitatePosition = new Position(this.player.Position);

		const HasClimbEvent = (x, y) => {
			const mapEventId = this.Map.Blocks[x][y].MapEventId;

			if (mapEventId === 0 || !this.CurrentSavegame.IsEventActive(this.Map.Index, mapEventId - 1))
				return false;

			const event = this.Map.EventList[mapEventId - 1];

			if (!(event instanceof ConditionEvent))
				return false;

			const conditionEvent = event;
			climbEvent = conditionEvent;

			return conditionEvent.TypeOfCondition === ConditionEvent.ConditionType.Levitating;
		};

		if (!HasClimbEvent(this.player.Position.X, this.player.Position.Y)) {
			// Also try forward position
			const [x, z] = this.camera3D.GetForwardPosition(Global.DistancePerBlock, false, false);
			const position = Geometry.CameraToBlockPosition(this.Map, x, z);

			if (Position.op_Equality(position, this.player.Position) ||
				position.X < 0 || position.X >= this.Map.Width ||
				position.Y < 0 || position.Y >= this.Map.Height ||
				!HasClimbEvent(position.X, position.Y)) {
				climbEvent = null;
			} else {
				levitatePosition = position;
			}
		}

		if (climbEvent != null) {
			// Attach player to ladder or hole
			const angle = this.camera3D.Angle;
			let [x, z] = Geometry.BlockToCameraPosition(this.Map, levitatePosition);
			this.camera3D.SetPosition(-x, z);
			this.camera3D.TurnTowards(angle);
			[x, z] = this.camera3D.GetBackwardPosition(0.5 * Global.DistancePerBlock, false, false);
			this.camera3D.SetPosition(-x, z);
			this.camera3D.TurnTowards(angle);
		}

		if (climbIfNoEvent || climbEvent != null) {
			const StartClimbing = () => {
				this.Pause();
				this.Climb(() => {
					if (climbEvent == null)
						failAction?.();
					else {
						this.levitating = true;
						EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Levitating, levitatePosition.X,
							levitatePosition.Y, climbEvent, true);
					}
				});
			};
			if (this.WindowActive)
				this.CloseWindow(StartClimbing);
			else
				StartClimbing();
		} else {
			failAction?.();
		}
	}

	Climb(finishAction = null) {
		this.MoveVertically(true, false, finishAction);
	}

	Fall(tileX, tileY, finishAction = null) {
		// Attach player to ladder or hole
		const angle = this.camera3D.Angle;
		let [x, z] = Geometry.BlockToCameraPosition(this.Map, new Position(tileX, tileY));
		this.camera3D.SetPosition(-x, z);
		this.camera3D.TurnTowards(angle);
		[x, z] = this.camera3D.GetBackwardPosition(0.45 * Global.DistancePerBlock, false, false);
		this.camera3D.SetPosition(-x, z);
		this.camera3D.TurnTowards(angle);

		this.MoveVertically(false, false, finishAction);
	}

	MoveVertically(up, mapChange, finishAction = null) {
		if (!this.Is3D || this.WindowActive) {
			finishAction?.();
			return;
		}

		const sourceY = !mapChange ? this.camera3D.Y : (up ? RenderMap3D.GetFloorY() : RenderMap3D.GetLevitatingY());
		this.player3D.SetY(sourceY);
		const targetY = mapChange ? this.camera3D.GroundY : (up ? RenderMap3D.GetLevitatingY() : RenderMap3D.GetFloorY());
		const stepSize = RenderMap3D.GetLevitatingStepSize();
		const dist = Math.abs(targetY - this.camera3D.Y);
		const steps = Math.max(1, Util.Round(dist / stepSize));

		this.PlayTimedSequence(steps, () => {
			if (up)
				this.camera3D.LevitateUp(stepSize);
			else
				this.camera3D.LevitateDown(stepSize);
		}, 75, finishAction);
	}

	/**
	 * Immediately moves 2 blocks forward.
	 * Can not pass walls.
	 */
	Jump() {
		if (!this.is3D)
			return; // Should not happen

		if (this.WindowActive) {
			if (this.currentWindow.Window === Window.Inventory)
				this.CloseWindow(() => this.AddTimedEvent(250, () => this.Jump()));
			return;
		}

		// Note: Even if the player looks diagonal (e.g. south west)
		// the jump is always performed into one of the 4 main directions.
		const targetPosition = new Position(this.player3D.Position);

		switch (this.player3D.Direction) {
			default:
			case CharacterDirection.Up:
				targetPosition.Y -= 2;
				break;
			case CharacterDirection.Right:
				targetPosition.X += 2;
				break;
			case CharacterDirection.Down:
				targetPosition.Y += 2;
				break;
			case CharacterDirection.Left:
				targetPosition.X -= 2;
				break;
		}

		const labdata = this.MapManager.GetLabdataForMap(this.Map);
		const checkPosition = new Position(this.player3D.Position);

		for (let i = 0; i < 2; ++i) {
			checkPosition.X += Math.sign(targetPosition.X - checkPosition.X);
			checkPosition.Y += Math.sign(targetPosition.Y - checkPosition.Y);

			if (this.Map.Blocks[checkPosition.X][checkPosition.Y].BlocksPlayer(labdata, true)) {
				this.ShowMessagePopup(this.DataNameProvider.CannotJumpThroughWalls);
				return;
			}

			let event = MapExtensions.GetEvent(this.Map, checkPosition.X, checkPosition.Y, this.CurrentSavegame);

			// Avoid jumping through closed doors, riddlemouths and place entrances.
			if (event != null) {
				let trigger = EventTrigger.Move;
				let lastEventStatus = true;
				let aborted = false;

				while (event instanceof ConditionEvent) {
					[event, trigger, lastEventStatus, aborted] = EventExtensions.ExecuteEvent(event, this.Map, this, trigger,
						checkPosition.X, checkPosition.Y, lastEventStatus);

					if (aborted)
						break;
				}

				if (!aborted &&
					((event instanceof DoorEvent && this.CurrentSavegame.IsDoorLocked(event.DoorIndex)) ||
					event.Type === EventType.Riddlemouth ||
					event.Type === EventType.EnterPlace)) {
					this.ShowMessagePopup(this.DataNameProvider.CannotJumpThroughWalls);
					return;
				}
			}
		}

		this.player3D.SetPosition(targetPosition.X, targetPosition.Y, this.CurrentTicks, true);
		this.player3D.TurnTowards(this.player3D.Direction * 90.0);
		this.camera3D.MoveBackward(0.35 * Global.DistancePerBlock, false, false);
	}

	PlayerMoved(mapChange, lastPlayerPosition = null, updateSavegame = true, lastMap = null) {
		if (mapChange)
			this.lastMapTicksReset = this.CurrentTicks;

		if (updateSavegame) {
			const map = this.Is3D ? this.Map : this.renderMap2D.GetMapFromTile(this.player.Position.X, this.player.Position.Y);
			this.CurrentSavegame.CurrentMapIndex = map.Index;
			this.CurrentSavegame.CurrentMapX = 1 + (this.player.Position.X % this.Map.Width);
			this.CurrentSavegame.CurrentMapY = 1 + (this.player.Position.Y % this.Map.Height);
			this.CurrentSavegame.CharacterDirection = this.player.Direction;
		}

		// Enable/disable transport button and show transports
		if (!this.WindowActive) {
			if (this.layout.ButtonGridPage === 1)
				this.layout.EnableButton(3, false);

			if (mapChange && this.Map.Type === MapType.Map2D) {
				this.renderMap2D.ClearTransports();

				if (this.player.MovementAbility <= PlayerMovementAbility.Swimming)
					this.player2D.BaselineOffset = this.CanSee() ? 0 : statics(this).MaxBaseLine;
			}

			const EnableTransport = (enable = true) => {
				this.layout.TransportEnabled = enable;
				if (this.layout.ButtonGridPage === 1)
					this.layout.EnableButton(3, enable);
			};

			if (this.Map.UseTravelTypes) {
				const [transports, transportAtPlayerIndex] = this.GetTransportsInVisibleArea();
				const tile = this.renderMap2D.get(this.player.Position);
				let tileType = tile.Type;

				if (tileType === Map.TileType.Water && transportAtPlayerIndex != null &&
					TravelTypeExtensions.CanStandOn(transportAtPlayerIndex.TravelType))
					tileType = Map.TileType.Normal;

				if (tileType === Map.TileType.Water) {
					if (this.TravelType === TravelType.Walk)
						this.StartSwimming();
					else if (this.TravelType === TravelType.Swim)
						this.DoSwimDamage();
				} else if (tileType !== Map.TileType.Water && this.TravelType === TravelType.Swim)
					this.TravelType = TravelType.Walk;

				const transportLocations = Array.from(this.CurrentSavegame.TransportLocations);
				for (const transport of transports) {
					this.renderMap2D.PlaceTransport(transport.MapIndex,
						transport.Position.X - 1, transport.Position.Y - 1, transport.TravelType, transportLocations.indexOf(transport));
				}

				if (transportAtPlayerIndex != null && this.TravelType === TravelType.Walk) {
					EnableTransport();
					this.player2D.BaselineOffset = statics(this).MaxBaseLine;
				} else if (TravelTypeExtensions.IsStoppable(this.TravelType) && transportAtPlayerIndex == null) {
					// Only allow if we could stand or swim there.
					const tileset = this.MapManager.GetTilesetForMap(this.renderMap2D.GetMapFromTile(this.player.Position.X, this.player.Position.Y));

					if (tile.AllowMovement(tileset, TravelType.Walk) ||
						tile.AllowMovement(tileset, TravelType.Swim))
						EnableTransport();
					else
						EnableTransport(false);
				} else {
					EnableTransport(false);
				}
			} else {
				EnableTransport(false);
			}

			// Check auto poison
			if (!this.is3D && this.renderMap2D != null && !TravelTypeExtensions.IgnoreAutoPoison(this.TravelType)) {
				const playerPosition = this.player.Position;

				if (this.renderMap2D.IsTilePoisoning(playerPosition.X, playerPosition.Y)) {
					this.ForeachPartyMember((p, f) => {
						if (this.RollDice100() >= p.Attributes[Attribute.Luck].TotalCurrentValue) {
							this.AddCondition(Condition.Poisoned, p);
							this.ShowDamageSplash(p, _ => 0, f);
						} else {
							f?.();
						}
					}, p => p.Alive && !hasFlag(p.Conditions, Condition.Petrified), () => this.ResetMoveKeys());
				}
			}

			this.UpdateMobileActionIndicatorPosition();
		}

		if (mapChange) {
			this.monstersCanMoveImmediately = false;
			if (lastMap == null || !lastMap.IsWorldMap ||
				!this.Map.IsWorldMap || this.Map.World !== lastMap.World)
				this.ResetMoveKeys(lastMap == null || lastMap.Type !== this.Map.Type);
			if (!this.WindowActive)
				this.layout.UpdateLayoutButtons(this.movement.MovementTicks(this.Map.Type === MapType.Map3D, this.Map.UseTravelTypes, TravelType.Walk));

			// Update UI palette
			this.UpdateUIPalette(true);

			if (!this.Map.IsWorldMap || this.TravelType === TravelType.Walk)
				this.PlayMapMusic();
		} else {
			this.lastPlayerPosition = lastPlayerPosition;
			this.monstersCanMoveImmediately = this.Map.Type === MapType.Map2D && !this.Map.IsWorldMap;
		}

		const Map_ = this.Map;

		if (Map_.Type === MapType.Map3D) {
			// Explore
			let [found, automap] = tryGetValue(this.CurrentSavegame.Automaps, Map_.Index);
			if (!found) {
				automap = new Automap();
				automap.ExplorationBits = new Uint8Array(Math.trunc((Map_.Width * Map_.Height + 7) / 8));
				this.CurrentSavegame.Automaps.set(Map_.Index, automap);
			}

			if (this.CanSee()) {
				const labdata = this.MapManager.GetLabdataForMap(Map_);

				for (let y = -1; y <= 1; ++y) {
					for (let x = -1; x <= 1; ++x) {
						const totalX = this.player3D.Position.X + x;
						const totalY = this.player3D.Position.Y + y;

						if (totalX < 0 || totalX >= Map_.Width ||
							totalY < 0 || totalY >= Map_.Height)
							continue;

						automap.ExploreBlock(Map_, totalX, totalY);

						if (Map_.Blocks[totalX][totalY].BlocksPlayerSight(labdata))
							continue;

						if (x !== 0) { // left or right column
							const adjacentX = totalX + x;

							if (adjacentX >= 0 && adjacentX < Map_.Width) {
								for (let i = -1; i <= 1; ++i) {
									const adjacentY = totalY + i;

									if (adjacentY >= 0 && adjacentY < Map_.Height)
										automap.ExploreBlock(Map_, adjacentX, adjacentY);
								}
							}
						}
						if (y !== 0) { // upper or lower row
							const adjacentY = totalY + y;

							if (adjacentY >= 0 && adjacentY < Map_.Height) {
								for (let i = -1; i <= 1; ++i) {
									const adjacentX = totalX + i;

									if (adjacentX >= 0 && adjacentX < Map_.Width)
										automap.ExploreBlock(Map_, adjacentX, adjacentY);
								}
							}
						}
						if (x !== 0 && y !== 0) { // corners
							const adjacentX = totalX + x;
							const adjacentY = totalY + y;

							if (adjacentX >= 0 && adjacentX < Map_.Width &&
								adjacentY >= 0 && adjacentY < Map_.Height)
								automap.ExploreBlock(Map_, adjacentX, adjacentY);
						}
					}
				}
			}

			// Save goto points
			const testX = 1 + this.player.Position.X;
			const testY = 1 + this.player.Position.Y;
			const gotoPoint = firstOrDefault(Map_.GotoPoints, p => p.X === testX && p.Y === testY);
			if (gotoPoint != null) {
				if (!this.CurrentSavegame.IsGotoPointActive(gotoPoint.Index)) {
					this.CurrentSavegame.ActivateGotoPoint(gotoPoint.Index);
					this.ShowMessagePopup(this.DataNameProvider.GotoPointSaved, () => {
						// If a goto point save message appears after map change,
						// it will avoid triggering of map events so we have to call
						// it on closing the popup.
						if (mapChange) {
							this.TriggerMapEvents(EventTrigger.Move, this.player.Position.X,
								this.player.Position.Y);
						}

					}, TextAlign.Left);
					return;
				}
			}

			// Clairvoyance
			if (this.CurrentSavegame.IsSpellActive(ActiveSpellType.Clairvoyance)) {
				let trapFound = false;
				let spinnerFound = false;
				const [x, z] = this.player3D.Camera.GetForwardPosition(1.05 * Global.DistancePerBlock, false, false);

				const checkPositions = [
					this.player3D.Position,
					Geometry.CameraToBlockPosition(Map_, x, z)
				];

				for (const checkPosition of checkPositions) {
					if (Position.op_Equality(checkPosition, lastPlayerPosition))
						continue;

					const type = this.renderMap3D.FindEventTypesOnBlock(checkPosition.X, checkPosition.Y, EventType.Trap, EventType.Spinner);

					if (type === EventType.Trap) {
						trapFound = true;
						break;
					} else if (type === EventType.Spinner)
						spinnerFound = true;
				}

				if (trapFound)
					this.ShowMessagePopup(this.DataNameProvider.YouNoticeATrap);
				else if (spinnerFound)
					this.ShowMessagePopup(this.DataNameProvider.SeeRoundDiskInFloor);
			}
		}
	}

	AddCondition(condition, target = null) {
		if (this.Godmode)
			return;

		target ??= this.CurrentPartyMember;

		if (condition >= Condition.DeadCorpse && target.Alive) {
			this.KillPartyMember(target, condition);
			return;
		}

		target.Conditions |= condition;

		if (this.CurrentPartyMember === target) {
			const [result, gameOver] = this.RecheckActivePartyMember();
			if (result) {
				if (gameOver)
					return;

				if (condition === Condition.Blind)
					this.UpdateLight();
			}
		}

		this.layout.UpdateCharacterNameColors(this.CurrentSavegame.ActivePartyMemberSlot);
		this.layout.UpdateCharacter(target);
	}

	RemoveCondition(condition, target) {
		const removeExhaustion = condition === Condition.Exhausted && hasFlag(target.Conditions, Condition.Exhausted);

		// Healing spells or potions.
		// Sleep can be removed by attacking as well.
		target.Conditions &= ~condition;

		if (target instanceof PartyMember) {
			const partyMember = target;

			if (this.BattleActive) {
				this.UpdateBattleStatus(partyMember);
				this.currentBattle.RemoveCondition(condition, target);
			}
			this.layout.UpdateCharacterNameColors(this.CurrentSavegame.ActivePartyMemberSlot);
			this.layout.UpdateCharacter(partyMember);

			if (removeExhaustion)
				this.RemoveExhaustion(partyMember);
			else if (condition === Condition.Blind && partyMember === this.CurrentPartyMember)
				this.UpdateLight();
		}
	}

	AddExhaustion(partyMember, hours, crippleAttributes) {
		let totalDamage = 0;
		let hitPoints = partyMember.HitPoints.CurrentValue;

		for (let i = 0; i < hours; ++i) {
			// Do at least 1 damage per hour
			const damage = Math.max(1, Math.trunc((hitPoints >>> 0) / 10));
			totalDamage += damage;
			hitPoints -= damage;

			if (hitPoints <= 0)
				break;
		}

		if (crippleAttributes && hitPoints > 0) {
			for (const attribute of EnumHelper.GetValues(Attribute)) {
				partyMember.Attributes[attribute].StoredValue = partyMember.Attributes[attribute].CurrentValue;
				partyMember.Attributes[attribute].CurrentValue >>>= 1;
			}

			for (const skill of EnumHelper.GetValues(Skill)) {
				partyMember.Skills[skill].StoredValue = partyMember.Skills[skill].CurrentValue;
				partyMember.Skills[skill].CurrentValue >>>= 1;
			}
		}

		return Math.min(totalDamage, partyMember.HitPoints.CurrentValue);
	}

	RemoveExhaustion(partyMember) {
		for (const attribute of EnumHelper.GetValues(Attribute)) {
			partyMember.Attributes[attribute].CurrentValue = partyMember.Attributes[attribute].StoredValue;
			partyMember.Attributes[attribute].StoredValue = 0;
		}

		for (const skill of EnumHelper.GetValues(Skill)) {
			partyMember.Skills[skill].CurrentValue = partyMember.Skills[skill].StoredValue;
			partyMember.Skills[skill].StoredValue = 0;
		}
	}

	/**
	 * Overloads:
	 * public ActivateLight(uint level) -> ActivateLight(180, level)
	 * ActivateLight(uint duration, uint level)
	 */
	ActivateLight(duration, level) {
		if (arguments.length === 1) {
			this.ActivateLight(180, duration);
			return;
		}

		this.CurrentSavegame.ActivateSpell(ActiveSpellType.Light, duration, level);
		this.UpdateLight(false, true);
	}

	ActivateBuff(buff, value, duration) {
		if (buff === ActiveSpellType.Light)
			this.ActivateLight(duration, value);
		else
			this.CurrentSavegame.ActivateSpell(buff, duration, value);
	}

	Revive(caster, affectedMembers, finishAction = null) {
		const reviveMember = (target, finishAction) =>
			this.ApplySpellEffect(Spell.Resurrection, caster, target, finishAction, false);

		this.ForeachPartyMember(reviveMember, p => affectedMembers.includes(p) && hasFlag(p.Conditions, Condition.DeadCorpse), () => {
			this.currentAnimation?.Destroy();
			this.currentAnimation = new SpellAnimation(this, this.layout);

			this.currentAnimation.CastHealingOnPartyMembers(() => {
				this.currentAnimation.Destroy();
				this.currentAnimation = null;
				finishAction?.();
			}, affectedMembers);
		});
	}

	PartyMemberDied(partyMember) {
		if (!(partyMember instanceof PartyMember))
			throw new AmbermoonException(ExceptionScope.Application, 'PartyMemberDied with a character which is not a party member.');

		const member = partyMember;
		member.HitPoints.CurrentValue = 0;

		const slot = this.SlotFromPartyMember(member);

		if (slot != null)
			this.layout.SetCharacter(slot, member, false, () => this.ResetMoveKeys(true));
	}

	PartyMemberRevived(partyMember, finishAction = null, showHealAnimation = true, selfRevive = false) {
		const reviveMessage = selfRevive && partyMember.Race === Race.Animal && !isNullOrWhiteSpace(this.DataNameProvider.ReviveCatMessage) ? this.DataNameProvider.ReviveCatMessage : this.DataNameProvider.ReviveMessage;

		if (this.CurrentWindow.Window === Window.Healer) {
			this.layout.UpdateCharacter(partyMember, () => this.layout.ShowClickChestMessage(reviveMessage, finishAction));
		} else {
			const allInputWasDisabled = this.allInputDisabled;
			this.allInputDisabled = false;

			this.ShowMessagePopup(reviveMessage, () => {
				this.allInputDisabled = allInputWasDisabled;

				const Finish = () => {
					if (showHealAnimation) {
						this.currentAnimation?.Destroy();
						this.currentAnimation = new SpellAnimation(this, this.layout);
						// This will just show the heal animation
						this.currentAnimation.CastOn(Spell.SelfHealing, partyMember, () => {
							this.currentAnimation.Destroy();
							this.currentAnimation = null;
							finishAction?.();
						});
					} else {
						finishAction?.();
					}
				};

				this.layout.SetCharacter(this.SlotFromPartyMember(partyMember), partyMember, false, Finish);

				if (this.currentWindow.Window === Window.Inventory && partyMember === this.CurrentInventory)
					this.UpdateCharacterInfo();

				this.layout.FillCharacterBars(partyMember);
			});
		}
	}

	FixPartyMember(partyMember) {
		// Don't do it for animals though!
		if (partyMember.Race > Race.Thalionic)
			return;

		// The original has some bugs where bonus values are not right.
		// We set the bonus values here dependent on equipment.
		partyMember.HitPoints.BonusValue = 0;
		partyMember.SpellPoints.BonusValue = 0;
		partyMember.BonusDefense = 0;
		partyMember.BonusAttackDamage = 0;

		for (const attribute of EnumHelper.GetValues(Attribute)) {
			partyMember.Attributes[attribute].BonusValue = 0;
		}

		for (const skill of EnumHelper.GetValues(Skill)) {
			partyMember.Skills[skill].BonusValue = 0;
		}

		for (const [, itemSlotValue] of partyMember.Equipment.Slots) {
			if (itemSlotValue.ItemIndex !== 0) {
				const item = this.ItemManager.GetItem(itemSlotValue.ItemIndex);
				const factor = hasFlag(itemSlotValue.Flags, ItemSlotFlags.Cursed) ? -1 : 1;

				partyMember.HitPoints.BonusValue += factor * item.HitPoints;
				partyMember.SpellPoints.BonusValue += factor * item.SpellPoints;
				partyMember.BonusDefense = toShort(partyMember.BonusDefense + factor * item.Defense);
				partyMember.BonusAttackDamage = toShort(partyMember.BonusAttackDamage + factor * item.Damage);

				if (item.Attribute != null)
					partyMember.Attributes[item.Attribute].BonusValue += factor * item.AttributeValue;
				if (item.Skill != null)
					partyMember.Skills[item.Skill].BonusValue += factor * item.SkillValue;
			}
		}

		if (!hasFlag(this.Features, Features.AdvancedAPRCalculation))
			partyMember.AttacksPerRound = toByte(partyMember.AttacksPerRoundIncreaseLevels === 0 ? 1 : Util.Limit(partyMember.AttacksPerRound, Math.trunc(partyMember.Level / partyMember.AttacksPerRoundIncreaseLevels), 255));
		else
			partyMember.AttacksPerRound = toByte(partyMember.AttacksPerRoundIncreaseLevels === 0 ? 1 : Util.Limit(partyMember.AttacksPerRound, 1 + Math.trunc(partyMember.Level / partyMember.AttacksPerRoundIncreaseLevels), 255));
	}

	/**
	 * Overloads:
	 * public int AddPartyMember(PartyMember partyMember)
	 *   Is used for external cheats.
	 *   Returns 0: Success, -1: Wrong window, -2: No free slot
	 * void AddPartyMember(int slot, PartyMember partyMember, Action? followAction = null, bool forceAnimation = false)
	 */
	AddPartyMember(slot, partyMember, followAction = null, forceAnimation = false) {
		if (typeof slot !== 'number')
			return addPartyMemberExternal(this, slot);

		this.FixPartyMember(partyMember);
		addDelegate(partyMember, 'Died', this.partyMemberDiedHandler);
		this.layout.SetCharacter(slot, partyMember, false, followAction, forceAnimation);
		this.spellListScrollOffsets[slot] = 0;
	}

	RemovePartyMember(slot, initialize, followAction = null) {
		const partyMember = this.GetPartyMember(slot);

		if (partyMember != null)
			removeDelegate(partyMember, 'Died', this.partyMemberDiedHandler);

		this.layout.SetCharacter(slot, null, initialize, followAction);
		this.spellListScrollOffsets[slot] = 0;
	}

	ClearPartyMembers() {
		for (let i = 0; i < GameCore_Party.MaxPartyMembers; ++i)
			this.RemovePartyMember(i, true);
	}

	SlotFromPartyMember(partyMember) {
		for (let i = 0; i < GameCore_Party.MaxPartyMembers; ++i) {
			if (this.GetPartyMember(i) === partyMember)
				return i;
		}

		return null;
	}

	ProcessPoisonDamage(times, followAction = null) {
		const GetDamage = () => {
			let damage = 0;

			for (let i = 0; i < times; ++i)
				damage += this.RandomInt(1, 5);

			return damage;
		};

		this.DamageAllPartyMembers(_ => GetDamage(),
			p => p.Alive && hasFlag(p.Conditions, Condition.Poisoned), null, followAction);
	}

	Sleep(inn, healing) {
		healing = Util.Limit(0, healing, 100);

		for (let i = 0; i < GameCore_Party.MaxPartyMembers; ++i) {
			const partyMember = this.GetPartyMember(i);

			if (partyMember != null && partyMember.Alive) {
				if (hasFlag(partyMember.Conditions, Condition.Exhausted)) {
					partyMember.Conditions &= ~Condition.Exhausted;
					this.RemoveExhaustion(partyMember);
					this.layout.UpdateCharacterStatus(partyMember);
				}
			}
		}

		const Start = toDawn => {
			// Set this first to avoid tired/exhausted warning when increasing the game time.
			this.GameTime.HoursWithoutSleep = 0;
			let hoursToAdd = 8;
			let minutesToAdd = 0;

			if (toDawn) {
				if (this.GameTime.Hour >= 20) { // move to next day
					hoursToAdd = 7 + 24 - this.GameTime.Hour - 1;
					minutesToAdd = 60 - this.GameTime.Minute % 60;
				} else {
					hoursToAdd = 7 - this.GameTime.Hour - 1;
					minutesToAdd = 60 - this.GameTime.Minute % 60;
				}
			}

			this.GameTime.Wait(hoursToAdd);

			while (minutesToAdd > 0) {
				minutesToAdd -= 5;
				this.GameTime.Tick();
			}

			// Set this again to reset it after game time was increased.
			this.GameTime.HoursWithoutSleep = 0; // This also resets it inside the savegame.

			// Recovery and food consumption
			const Recover = slot => {
				const Next = () => Recover(slot + 1);

				if (slot < GameCore_Party.MaxPartyMembers) {
					const partyMember = this.GetPartyMember(slot);

					if (partyMember != null && partyMember.Alive) {
						if (!inn && partyMember.Food === 0 && partyMember.Race < Race.Animal) {
							this.layout.ShowClickChestMessage(partyMember.Name + this.DataNameProvider.HasNoMoreFood, Next);
						} else {
							const lpRecovered = Util.Limit(0, Math.trunc(healing * partyMember.HitPoints.TotalMaxValue / 100),
								partyMember.HitPoints.TotalMaxValue - partyMember.HitPoints.CurrentValue);
							partyMember.HitPoints.CurrentValue += lpRecovered;
							const spRecovered = Util.Limit(0, Math.trunc(healing * partyMember.SpellPoints.TotalMaxValue / 100),
								partyMember.SpellPoints.TotalMaxValue - partyMember.SpellPoints.CurrentValue);
							partyMember.SpellPoints.CurrentValue += spRecovered;
							this.layout.FillCharacterBars(partyMember);

							if (!inn && partyMember.Race < Race.Animal)
								--partyMember.Food;

							if (ClassExtensions.IsMagic(partyMember.Class) && spRecovered !== 0) { // Has SP and was recovered
								this.layout.ShowClickChestMessage(partyMember.Name + format(this.DataNameProvider.RecoveredLPAndSP, lpRecovered, spRecovered), Next);
							} else {
								this.layout.ShowClickChestMessage(partyMember.Name + format(this.DataNameProvider.RecoveredLP, lpRecovered), Next);
							}
						}
					} else {
						Next();
					}
				}
			};
			Recover(0);
		};

		if (!inn && !hasFlag(this.Map.Flags, MapFlags.NoSleepUntilDawn) &&
			(this.GameTime.Hour >= 20 || this.GameTime.Hour < 4)) { // Sleep until dawn
			this.layout.ShowClickChestMessage(this.DataNameProvider.SleepUntilDawn, () => Start(true));
		} else { // sleep 8 hours
			this.layout.ShowClickChestMessage(this.DataNameProvider.Sleep8Hours, () => Start(false));
		}
	}

	AgePlayer(partyMember, finishAction, ageIncrease) {
		partyMember.Attributes[Attribute.Age].CurrentValue += ageIncrease;

		const allInputWasDisabled = this.allInputDisabled;
		this.allInputDisabled = false;

		const Finish = () => {
			this.allInputDisabled = allInputWasDisabled;
			finishAction?.();
		};

		if (partyMember.Attributes[Attribute.Age].CurrentValue >= partyMember.Attributes[Attribute.Age].MaxValue) {
			partyMember.Attributes[Attribute.Age].CurrentValue = partyMember.Attributes[Attribute.Age].MaxValue;
			this.ShowMessagePopup(partyMember.Name + this.DataNameProvider.HasDiedOfAge, () => {
				this.KillPartyMember(partyMember);
				Finish();
			});
		} else {
			this.ShowMessagePopup(partyMember.Name + this.DataNameProvider.HasAged, Finish);
		}
	}

	KillPartyMember(partyMember, deathCondition = Condition.DeadCorpse) {
		this.RemoveCondition(Condition.Exhausted, partyMember);
		partyMember.Die(deathCondition);
	}

	// Note: Only used external for cheats
	RecheckActivePlayer() {
		const [result, gameOver] = this.RecheckActivePartyMember();
		if (result) {
			if (gameOver || !this.BattleActive)
				return;
			this.BattlePlayerSwitched();
		} else if (this.BattleActive) {
			this.AddCurrentPlayerActionVisuals();
		}
	}

	DistributeGold(gold, force) {
		const partyMembers = this.PartyMembers.filter(p => p.Race !== Race.Animal);

		while (gold !== 0) {
			let numTargetPlayers = partyMembers.length;
			let goldPerPlayer = idiv(gold, numTargetPlayers);
			let anyCouldTake = false;

			if (goldPerPlayer === 0) {
				numTargetPlayers = gold;
				goldPerPlayer = 1;
			}

			for (const partyMember of partyMembers) {
				const goldToTake = force ? goldPerPlayer : Math.min(partyMember.MaxGoldToTake, goldPerPlayer);
				gold -= goldToTake;
				partyMember.AddGold(goldToTake);

				if (goldToTake !== 0) {
					anyCouldTake = true;

					if (--numTargetPlayers === 0)
						break;
				}
			}

			if (!anyCouldTake)
				return gold;
		}

		return gold;
	}

	DistributeFood(food, force) {
		const partyMembers = this.PartyMembers.filter(p => p.Race !== Race.Animal);

		while (food !== 0) {
			let numTargetPlayers = partyMembers.length;
			let foodPerPlayer = idiv(food, numTargetPlayers);
			let anyCouldTake = false;

			if (foodPerPlayer === 0) {
				numTargetPlayers = food;
				foodPerPlayer = 1;
			}

			for (const partyMember of partyMembers) {
				const foodToTake = force ? foodPerPlayer : Math.min(partyMember.MaxFoodToTake, foodPerPlayer);
				food -= foodToTake;
				partyMember.AddFood(foodToTake);

				if (foodToTake !== 0) {
					anyCouldTake = true;

					if (--numTargetPlayers === 0)
						break;
				}
			}

			if (!anyCouldTake)
				return food;
		}

		return food;
	}

	SpeakToParty() {
		const hero = this.GetPartyMember(0);

		if (!hero.Alive || !ConditionExtensions.CanTalk(hero.Conditions)) {
			this.ShowMessagePopup(this.DataNameProvider.UnableToTalk);
			return;
		}
		if (this.CurrentSavegame.ActivePartyMemberSlot !== 0)
			this.SetActivePartyMember(0);

		this.Pause();
		this.layout.OpenTextPopup(this.ProcessText(this.DataNameProvider.WhoToTalkTo),
			null, true, false, false, TextAlign.Center);
		this.PickTargetPlayer();

		const TargetPlayerPicked = characterSlot => {
			this.ResetMoveKeys(true);

			if (characterSlot !== -1) {
				const partyMember = this.GetPartyMember(characterSlot);

				if (!partyMember.Alive || hasFlag(partyMember.Conditions, Condition.Petrified)) {
					this.ExecuteNextUpdateCycle(() => this.PickTargetPlayer());
					return;
				}
			}

			this.TargetPlayerPicked.remove(TargetPlayerPicked);
			this.ClosePopup();
			this.UntrapMouse();
			this.InputEnable = true;

			if (!this.WindowActive)
				this.Resume();

			if (characterSlot !== -1) {
				if (characterSlot === 0)
					this.ExecuteNextUpdateCycle(() => this.ShowMessagePopup(this.DataNameProvider.SelfTalkingIsMad));
				else {
					const partyMember = this.GetPartyMember(characterSlot);

					this.ExecuteNextUpdateCycle(() => this.ShowConversation(partyMember, null, null, new ConversationItems()));
				}
			}
		};
		this.TargetPlayerPicked.add(TargetPlayerPicked);
	}

	PickTargetPlayer() {
		this.pickingTargetPlayer = true;
		this.CursorType = CursorType.Sword;
		this.TrapMouse(Global.PartyMemberPortraitArea);
	}

	PickTargetInventory() {
		this.pickingTargetInventory = true;
		this.CursorType = CursorType.Sword;
		this.TrapMouse(Global.PartyMemberPortraitArea);
	}

	FinishPickingTargetPlayer(characterSlot) {
		this.TargetPlayerPicked.invoke(characterSlot);
		this.pickingTargetPlayer = false;
		this.UntrapMouse();
	}

	AbortPickingTargetPlayer() {
		this.pickingTargetPlayer = false;
		this.TargetPlayerPicked.invoke(-1);
		this.ClosePopup();
	}

	/**
	 * Overloads:
	 * bool FinishPickingTargetInventory(int characterSlot)
	 * void FinishPickingTargetInventory(ItemGrid itemGrid, int slotIndex, ItemSlot itemSlot)
	 */
	FinishPickingTargetInventory(characterSlotOrItemGrid, slotIndex, itemSlot) {
		if (arguments.length === 1) {
			const characterSlot = characterSlotOrItemGrid;
			const result = this.TargetInventoryPicked.invoke(characterSlot) ?? true;

			if (!result) {
				this.pickingTargetInventory = false;

				if (this.currentWindow.Window === Window.Inventory)
					this.CloseWindow();

				this.layout.ShowChestMessage(null);
				this.UntrapMouse();
			}

			return result;
		}

		const itemGrid = characterSlotOrItemGrid;
		this.pickingTargetInventory = false;

		if (this.TargetItemPicked.invoke(itemGrid, slotIndex, itemSlot) !== false) {
			if (this.currentWindow.Window === Window.Inventory)
				this.CloseWindow();

			this.layout.ShowChestMessage(null);
			this.ClosePopup();
			this.UntrapMouse();
		}
	}

	AbortPickingTargetInventory() {
		this.pickingTargetInventory = false;

		if (this.TargetInventoryPicked.invoke(-1) !== false) {
			if (this.TargetItemPicked.invoke(null, 0, null) !== false) {
				if (this.currentWindow.Window === Window.Inventory)
					this.CloseWindow();

				this.layout.ShowChestMessage(null);
				this.ClosePopup();
				this.EndSequence();
				this.UntrapMouse();
			}
		}
	}

	OpenCamp(inn, healing = 50) { // 50 when camping outside of inns
		if (!inn && this.MonsterSeesPlayer) {
			this.ShowMessagePopup(this.DataNameProvider.RestingTooDangerous);
			return;
		}

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Camp, inn, healing);
			this.lastPlayedSong = this.PlayMusic(Song.BarBrawlin);
			this.layout.SetLayout(LayoutType.Items);
			this.layout.Set80x80Picture(inn ? Picture80x80.RestInn : hasFlag(this.Map.Flags, MapFlags.Outdoor) ? Picture80x80.RestOutdoor : Picture80x80.RestDungeon);
			this.layout.FillArea(new Rect(110, 43, 194, 80), this.GetUIColor(28), false);
			const itemSlotPositions = range(1, 6).map(index => new Position(index * 22, 139));
			itemSlotPositions.push(...range(1, 6).map(index => new Position(index * 22, 168)));
			const itemGrid = ItemGrid.Create(this, this.layout, this.renderView, this.ItemManager, itemSlotPositions, newArray(24, null),
				false, 12, 6, 24, new Rect(7 * 22, 139, 6, 53), new Size(6, 27), ScrollbarType.SmallVertical);
			itemGrid.Disabled = true;
			this.layout.AddItemGrid(itemGrid);
			const itemArea = new Rect(16, 139, 151, 53);

			const PlayerSwitched = () => {
				itemGrid.HideTooltip();
				itemGrid.Disabled = true;
				this.layout.ShowChestMessage(null);
				this.UntrapMouse();
				this.CursorType = CursorType.Sword;
				this.inputEnable = true;
				const magicClass = ClassExtensions.IsMagic(this.CurrentPartyMember.Class);
				this.layout.EnableButton(0, magicClass);
				this.layout.EnableButton(3, magicClass);
			};

			this.ActivePlayerChanged.add(PlayerSwitched);
			this.closeWindowHandler = _ => this.ActivePlayerChanged.remove(PlayerSwitched);

			const Exit = () => {
				this.CloseWindow();
			};

			// exit button
			this.layout.AttachEventToButton(2, Exit);

			// use magic button
			this.layout.AttachEventToButton(0, () => this.CastSpell(true, itemGrid));

			const SetupRightClickAbort = () => {
				this.nextClickHandler = buttons => {
					if (buttons === MouseButtons.Right) {
						itemGrid.HideTooltip();
						itemGrid.Disabled = true;
						this.layout.ShowChestMessage(null);
						this.UntrapMouse();
						this.layout.ButtonsDisabled = false;
						this.CursorType = CursorType.Sword;
						this.inputEnable = true;
						return true;
					}

					return false;
				};
			};

			// read magic button
			this.layout.AttachEventToButton(3, () => {
				this.layout.ShowChestMessage(this.DataNameProvider.WhichScrollToRead, TextAlign.Left);
				itemGrid.Disabled = false;
				itemGrid.DisableDrag = true;
				this.CursorType = CursorType.Sword;
				this.TrapMouse(itemArea);
				this.layout.ButtonsDisabled = true;
				itemGrid.Initialize(Array.from(this.CurrentPartyMember.Inventory.Slots), false);
				SetupRightClickAbort();
			});

			// sleep button
			this.layout.AttachEventToButton(6, () => {
				if (!inn && this.CurrentSavegame.HoursWithoutSleep < 8) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.RestingWouldHaveNoEffect);
				} else {
					this.Sleep(inn, healing);
				}
			});

			itemGrid.ItemClicked.add((_, slotIndex, itemSlot) => {
				itemGrid.HideTooltip();

				const ShowMessage = (message, additionalAction = null) => {
					this.nextClickHandler = null;
					this.layout.ShowClickChestMessage(message, () => {
						this.layout.ShowChestMessage(this.DataNameProvider.WhichScrollToRead);
						additionalAction?.();
						this.TrapMouse(itemArea);
						SetupRightClickAbort();
					});
				};

				// This is only used in "read magic".
				const item = this.ItemManager.GetItem(itemSlot.ItemIndex);

				if (item.Type !== ItemType.SpellScroll || item.Spell === Spell.None) {
					ShowMessage(this.DataNameProvider.ThatsNotASpellScroll);
				} else if (item.SpellSchool !== SpellSchoolExtensions.ToSpellSchool(this.CurrentPartyMember.Class)) {
					ShowMessage(this.DataNameProvider.CantLearnSpellsOfType);
				} else if (this.CurrentPartyMember.HasSpell(item.Spell)) {
					ShowMessage(this.DataNameProvider.AlreadyKnowsSpell);
				} else {
					const slpCost = SpellInfos.GetSLPCost(this.SpellInfos, this.Features, item.Spell);

					if (this.CurrentPartyMember.SpellLearningPoints < slpCost) {
						ShowMessage(this.DataNameProvider.NotEnoughSpellLearningPoints);
					} else {
						this.CurrentPartyMember.SpellLearningPoints -= slpCost;

						if (this.RollDice100() < this.CurrentPartyMember.Skills[Skill.ReadMagic].TotalCurrentValue) {
							// Learned spell
							ShowMessage(this.DataNameProvider.ManagedToLearnSpell, () => {
								this.CurrentPartyMember.AddSpell(item.Spell);
								this.layout.DestroyItem(itemSlot, 50, true);
							});
						} else {
							// Failed to learn the spell
							ShowMessage(this.DataNameProvider.FailedToLearnSpell, () => {
								this.layout.DestroyItem(itemSlot, 50);
							});
						}
					}
				}
			});

			PlayerSwitched();
		});
	}

	/**
	 * Overloads:
	 * void AddExperience(List<PartyMember> partyMembers, uint amount, Action? finishedEvent = null)
	 * public void AddExperience(PartyMember partyMember, uint amount, Action finishedEvent)
	 */
	AddExperience(partyMemberOrList, amount, finishedEvent = null) {
		if (Array.isArray(partyMemberOrList)) {
			const partyMembers = partyMemberOrList;

			const Add = index => {
				if (index === partyMembers.length) {
					finishedEvent?.();
					return;
				}

				this.AddExperience(partyMembers[index], amount, () => Add(index + 1));
			};

			Add(0);
			return;
		}

		const partyMember = partyMemberOrList;

		if (partyMember.AddExperiencePoints(amount, (a, b) => this.RandomInt(a, b), this.Features)) {
			// Level-up
			this.ShowLevelUpWindow(partyMember, finishedEvent);
		} else {
			finishedEvent?.();
		}
	}

	ShowLevelUpWindow(partyMember, finishedEvent) {
		const allInputWasDisabled = this.allInputDisabled;
		const inputWasEnabled = this.InputEnable;
		this.InputEnable = false;
		this.allInputDisabled = false;
		this.CursorType = CursorType.Click;
		const lastPlayedSong = this.lastPlayedSong;
		const previousSong = this.PlayMusic(Song.StairwayToLevel50);
		const popup = this.layout.OpenPopup(new Position(16, 62), 18, 6);
		const magicClass = ClassExtensions.IsMagic(partyMember.Class);

		const AddValueText = (y, text, value, maxValue = null, unit = '') => {
			popup.AddText(new Position(32, y), text, TextColor.BrightGray);
			popup.AddText(new Position(212, y), maxValue == null ? `${value}${unit}` : `${value}/${maxValue}${unit}`, TextColor.BrightGray);
		};

		popup.AddText(new Rect(32, 78, 256, Global.GlyphLineHeight), partyMember.Name + format(this.DataNameProvider.HasReachedLevel, partyMember.Level),
			TextColor.BrightGray, TextAlign.Center);

		AddValueText(92, this.DataNameProvider.LPAreNow, partyMember.HitPoints.CurrentValue, partyMember.HitPoints.MaxValue);
		if (magicClass) {
			AddValueText(99, this.DataNameProvider.SPAreNow, partyMember.SpellPoints.CurrentValue, partyMember.SpellPoints.MaxValue);
			AddValueText(106, this.DataNameProvider.SLPAreNow, partyMember.SpellLearningPoints);
		}
		AddValueText(113, this.DataNameProvider.TPAreNow, partyMember.TrainingPoints);
		AddValueText(120, this.DataNameProvider.APRAreNow, partyMember.AttacksPerRound);

		if (partyMember.Class < Class.Animal) {
			if (partyMember.Level >= 50)
				popup.AddText(new Position(32, 134), this.DataNameProvider.MaxLevelReached, TextColor.BrightGray);
			else
				AddValueText(134, this.DataNameProvider.NextLevelAt, partyMember.GetNextLevelExperiencePoints(this.Features), null, ' ' + this.DataNameProvider.EP);
		}

		popup.Closed.add(() => {
			this.InputEnable = inputWasEnabled;
			this.allInputDisabled = allInputWasDisabled;
			this.PlayMusic(previousSong);
			this.lastPlayedSong = lastPlayedSong;
			finishedEvent?.();
		});
	}
}

// Implementation of the public overload GameCore.AddPartyMember(PartyMember partyMember) (used for external cheats).
// Returns 0: Success, -1: Wrong window, -2: No free slot
function addPartyMemberExternal(self, partyMember) {
	if (self.CurrentWindow.Window !== Window.MapView || self.WindowActive) {
		return -1; // Wrong window
	}

	for (let i = 0; i < GameCore_Party.MaxPartyMembers; ++i) {
		if (self.GetPartyMember(i) == null) {
			self.CurrentSavegame.CurrentPartyMemberIndices[i] =
				firstOrDefault(self.CurrentSavegame.PartyMembers, p => p[1] === partyMember)?.[0] ?? 0;
			self.AddPartyMember(i, partyMember, null, true);
			// Set battle position
			self.CurrentSavegame.BattlePositions[i] = 0xff;
			const usePositions = Array.from(self.CurrentSavegame.BattlePositions);
			for (let p = 11; p >= 0; --p) {
				if (!usePositions.includes(toByte(p))) {
					self.CurrentSavegame.BattlePositions[i] = toByte(p);
					break;
				}
			}
			let characterBit;
			if (self.IsMapCharacterActive(getValue(statics(self).PartyMemberInitialCharacterBits, partyMember.Index)))
				characterBit = getValue(statics(self).PartyMemberInitialCharacterBits, partyMember.Index);
			else
				characterBit = getValue(statics(self).PartyMemberCharacterBits, partyMember.Index);
			self.SetMapCharacterBit(characterBit, true);
			if (partyMember.CharacterBitIndex === 0xffff || partyMember.CharacterBitIndex === 0x0000)
				partyMember.CharacterBitIndex = characterBit;
			return 0;
		}
	}

	return -2; // No free slot
}
