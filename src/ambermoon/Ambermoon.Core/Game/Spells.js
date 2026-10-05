// Port of Ambermoon.Core/Game/Spells.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { SpellInfos, SpellTarget, SpellApplicationArea } from '../../Ambermoon.Data.Common/SpellInfo.js';
import { Character } from '../../Ambermoon.Data.Common/Character.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { ActiveSpellType } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { TravelType } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { MapFlags } from '../../Ambermoon.Data.Common/Map.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { CharacterDirection } from '../../Ambermoon.Common/Direction.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Graphics } from '../Render/Graphics.js';
import { Layer } from '../Render/Layer.js';
import { TextAlign } from '../Render/TextAlign.js';
import { ItemAnimation } from '../Render/ItemAnimation.js';
import { SpellAnimation } from '../Render/SpellAnimation.js';
import { Global } from '../UI/Global.js';
import { Window } from '../UI/Window.js';
import { AutomapOptions } from './MapHandling.js';
import { newArray, hasFlag, enumName, firstOrDefault, getValue, toUShort } from '../../../runtime.js';

function createAutomapOptions(secretDoorsVisible, monstersVisible, personsVisible, trapsVisible, showGotoPoints) {
	const options = new AutomapOptions();
	options.SecretDoorsVisible = secretDoorsVisible;
	options.MonstersVisible = monstersVisible;
	options.PersonsVisible = personsVisible;
	options.TrapsVisible = trapsVisible;
	options.ShowGotoPoints = showGotoPoints;
	return options;
}

export class GameCore_Spells {
	static initFields(self) {
		self.pickedSpell = Spell.None;
		self.spellItemSlotIndex = null;
		self.spellItemIsEquipped = null;
		self.blinkCharacterPosition = null;
		self.currentAnimation = null;
		// private protected readonly Dictionary<Spell, SpellInfo> spellInfos; (assigned in GameCore constructor)
		self.spellListScrollOffsets = newArray(self.constructor.MaxPartyMembers, 0);
	}

	get SpellInfos() { return this.spellInfos; }

	/**
	 * Adds a spell effect.
	 *
	 * Overloads (one JS function):
	 * - ApplySpellEffect(spell, caster, target: object, finishAction = null, checkFail = true)
	 *   where target is null, a Character or an ItemSlot.
	 * - ApplySpellEffect(spell, caster, finishAction, checkFail) (no target)
	 * - ApplySpellEffect(spell, caster, itemSlot, finishAction, checkFail)
	 * - ApplySpellEffect(spell, caster, character, finishAction, checkFail)
	 *
	 * @param spell Spell
	 * @param caster Casting party member or monster.
	 * @param target Party member or item or null.
	 * @param finishAction Action to call after effect was applied.
	 * @param checkFail If true check if the spell cast fails.
	 */
	ApplySpellEffect(spell, caster, target = null, finishAction = null, checkFail = true) {
		if (typeof target === 'function') {
			// ApplySpellEffect(spell, caster, finishAction, checkFail)
			return applySpellEffectNoTarget.call(this, spell, caster, target, finishAction ?? true);
		}

		if (target == null) {
			if (typeof finishAction === 'boolean') {
				// ApplySpellEffect(spell, caster, null, checkFail)
				return applySpellEffectNoTarget.call(this, spell, caster, null, finishAction);
			}
			return applySpellEffectNoTarget.call(this, spell, caster, finishAction ?? null, checkFail);
		} else if (target instanceof Character)
			return applySpellEffectCharacter.call(this, spell, caster, target, finishAction ?? null, checkFail);
		else if (target instanceof ItemSlot)
			return applySpellEffectItem.call(this, spell, caster, target, finishAction ?? null, checkFail);
		else
			throw new AmbermoonException(ExceptionScope.Application, `Invalid spell target type: ${target?.constructor?.name}`);
	}

	Cast(action, finishAction = null, failAction = null, checkFail = true) {
		failAction ??= () => this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed);

		if (finishAction == null) {
			if (checkFail)
				this.TrySpell(action, failAction);
			else
				action?.();
		} else {
			if (checkFail) {
				this.TrySpell(() => {
					action?.();
					finishAction();
				}, () => {
					failAction?.();
					finishAction();
				});
			} else {
				action?.();
				finishAction();
			}
		}
	}

	/**
	 * Overloads: TrySpell(successAction, failAction) and TrySpell(successAction).
	 */
	TrySpell(successAction, failAction) {
		if (arguments.length < 2) {
			this.TrySpell(successAction, () => this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed));
			return;
		}

		let chance = this.CurrentPartyMember.Skills[Skill.UseMagic].TotalCurrentValue;

		if (hasFlag(this.Features, Features.ExtendedCurseEffects) &&
			hasFlag(this.CurrentPartyMember.Conditions, Condition.Drugged))
			chance -= 25;

		if (this.RollDice100() < chance)
			successAction?.();
		else
			failAction?.();
	}

	ExchangeExp(caster, target, finishAction) {
		const casterExp = caster.ExperiencePoints;
		const targetExp = target.ExperiencePoints;

		if (casterExp === targetExp)
			return;

		if (caster.MaxReachedLevel === 0)
			caster.MaxReachedLevel = caster.Level;
		if (target.MaxReachedLevel === 0)
			target.MaxReachedLevel = target.Level;

		const initialSavegame = this.SavegameManager.LoadInitial(this.renderView.GameData, this.savegameSerializer);
		const initialCaster = getValue(initialSavegame.PartyMembers, caster.Index);
		const initialTarget = getValue(initialSavegame.PartyMembers, target.Index);

		const Init = (character, initialCharacter) => {
			character.Level = initialCharacter.Level;
			character.HitPoints.CurrentValue = initialCharacter.HitPoints.CurrentValue;
			character.HitPoints.MaxValue = initialCharacter.HitPoints.MaxValue;
			character.SpellPoints.CurrentValue = initialCharacter.SpellPoints.CurrentValue;
			character.SpellPoints.MaxValue = initialCharacter.SpellPoints.MaxValue;
			character.ExperiencePoints = 0;
			character.AttacksPerRound = 1;

			while (character.Level > 1) {
				--character.Level;
				character.HitPoints.CurrentValue -= character.HitPointsPerLevel;
				character.HitPoints.MaxValue -= character.HitPointsPerLevel;
				character.SpellPoints.CurrentValue -= character.SpellPointsPerLevel;
				character.SpellPoints.MaxValue -= character.SpellPointsPerLevel;
			}
		};

		Init(caster, initialCaster);
		Init(target, initialTarget);

		this.AddExperience(caster, targetExp, () => {
			this.AddExperience(target, casterExp, () => {
				this.UpdateCharacterInfo();
				this.layout.FillCharacterBars(caster);
				this.layout.FillCharacterBars(target);
				finishAction?.();
			});
		});
	}

	UseSpell(caster, spell, itemGrid, fromItem, consumeHandler = null) {
		this.CurrentCaster = caster;
		this.CurrentSpellTarget = null;

		// Some special care for the mystic map spells
		if (!this.is3D && spell >= Spell.FindTraps && spell <= Spell.MysticalMapping) {
			this.ShowMessagePopup(this.DataNameProvider.UseSpellOnlyInCitiesOrDungeons);
			return;
		}

		if (hasFlag(this.Map.Flags, MapFlags.NoMarkOrReturn) && (spell === Spell.WordOfMarking || spell === Spell.WordOfReturning)) {
			this.ShowMessagePopup(this.DataNameProvider.CannotUseItHere);
			return;
		}

		if (!hasFlag(this.Map.Flags, MapFlags.Automapper)) {
			if (spell === Spell.MapView) {
				this.ShowMessagePopup(this.DataNameProvider.MapViewNotWorkingHere);
				return;
			}

			if (spell === Spell.FindMonsters ||
				spell === Spell.FindPersons ||
				spell === Spell.FindSecretDoors ||
				spell === Spell.FindTraps ||
				spell === Spell.MysticalMapping) {
				this.ShowMessagePopup(this.DataNameProvider.AutomapperNotWorkingHere);
				return;
			}
		}

		const spellInfo = getValue(this.SpellInfos, spell);

		const ConsumeSP = () => {
			if (!fromItem) { // Item spells won't consume SP
				caster.SpellPoints.CurrentValue -= SpellInfos.GetSPCost(this.SpellInfos, this.Features, spell, caster);
				this.layout.FillCharacterBars(caster);
			}
		};

		const SpellFinished = () => { this.CurrentSpellTarget = null; };

		const checkFail = !fromItem; // Item spells can't fail

		switch (spellInfo.Target) {
			case SpellTarget.SingleFriend: {
				this.Pause();
				this.layout.OpenTextPopup(this.ProcessText(this.DataNameProvider.BattleMessageWhichPartyMemberAsTarget), null, true, false, false, TextAlign.Center);
				this.PickTargetPlayer();
				const TargetPlayerPicked = (characterSlot) => {
					this.TargetPlayerPicked.remove(TargetPlayerPicked);
					this.ClosePopup();
					this.UntrapMouse();
					this.InputEnable = true;
					if (!this.WindowActive)
						this.Resume();

					if (characterSlot !== -1) {
						const reviveSpell = spell >= Spell.WakeTheDead && spell <= Spell.ChangeDust;
						const target = this.GetPartyMember(characterSlot);

						const Consume = () => {
							ConsumeSP();

							if (spell === Spell.ExpExchange) {
								const target = this.GetPartyMember(characterSlot);

								if (caster.Race === Race.Animal || target.Race === Race.Animal) {
									this.ShowMessagePopup(this.DataNameProvider.CannotExchangeExpWithAnimals);
									return;
								}

								if (caster.Index === target.Index) {
									// Changing exp with self doesn't change anything but also will
									// not require a message.
									return;
								}

								if (!caster.Alive || !target.Alive) {
									this.ShowMessagePopup(this.DataNameProvider.CannotExchangeExpWithDead);
									return;
								}
							}

							const Cast = () => {
								if (target != null && (reviveSpell || spell === Spell.AllHealing || target.Alive)) {
									if (reviveSpell) {
										this.ApplySpellEffect(spell, caster, target, SpellFinished, checkFail);
									} else {
										this.currentAnimation?.Destroy();
										this.currentAnimation = new SpellAnimation(this, this.layout);
										this.currentAnimation.CastOn(spell, target, () => {
											this.currentAnimation.Destroy();
											this.currentAnimation = null;
											this.ApplySpellEffect(spell, caster, target, SpellFinished, false);
										});
									}
								}
							};

							if (!reviveSpell && checkFail)
								this.TrySpell(Cast, SpellFinished);
							else
								Cast();
						};

						if (consumeHandler != null) {
							// Don't waste items on dead players
							if (fromItem && !reviveSpell && spell !== Spell.AllHealing && target?.Alive !== true)
								return;
							consumeHandler(Consume);
						} else
							Consume();
					}
				};
				this.TargetPlayerPicked.add(TargetPlayerPicked);
				break;
			}
			case SpellTarget.FriendRow:
				throw new AmbermoonException(ExceptionScope.Application, `Friend row spells are not implemented as there are none in Ambermoon.`);
			case SpellTarget.AllFriends: {
				const Consume = () => {
					ConsumeSP();
					const Cast = () => {
						if (spell === Spell.Resurrection) {
							const affectedMembers = [...this.PartyMembers].filter(p => hasFlag(p.Conditions, Condition.DeadCorpse));
							this.Revive(caster, affectedMembers, SpellFinished);
						} else {
							this.currentAnimation?.Destroy();
							this.currentAnimation = new SpellAnimation(this, this.layout);

							this.currentAnimation.CastHealingOnPartyMembers(() => {
								this.currentAnimation.Destroy();
								this.currentAnimation = null;

								for (const partyMember of [...this.PartyMembers].filter(p => p.Alive))
									this.ApplySpellEffect(spell, caster, partyMember, null, false);

								SpellFinished();
							});
						}
					};
					if (checkFail)
						this.TrySpell(Cast, spell === Spell.CreateFood ? () => this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, SpellFinished) : SpellFinished);
					else
						Cast();
				};
				if (consumeHandler != null)
					consumeHandler(Consume);
				else
					Consume();
				break;
			}
			case SpellTarget.Item: {
				const Consume = () => {
					if (consumeHandler != null)
						consumeHandler(ConsumeSP);
					else
						ConsumeSP();
				};

				const message = spell === Spell.RemoveCurses ? this.DataNameProvider.BattleMessageWhichPartyMemberAsTarget
					: this.DataNameProvider.WhichInventoryAsTarget;
				this.layout.OpenTextPopup(this.ProcessText(message), null, true, false, false, TextAlign.Center);
				if (this.CurrentWindow.Window === Window.Inventory)
					this.InputEnable = true;
				else
					this.Pause();
				this.PickTargetInventory();
				let TargetItemPicked = null;
				const TargetInventoryPicked = (characterSlot) => {
					this.TargetInventoryPicked.remove(TargetInventoryPicked);

					if (characterSlot === -1)
						return true; // abort, TargetItemPicked is called and will cleanup

					if (spell === Spell.RemoveCurses) {
						const target = this.GetPartyMember(characterSlot);
						const firstCursedItem = firstOrDefault(target.Equipment.Slots.values(), s => hasFlag(s.Flags, ItemSlotFlags.Cursed));

						if (firstCursedItem == null) {
							const CleanUp = () => {
								itemGrid?.HideTooltip();
								this.UntrapMouse();
								this.EndSequence();
								this.layout.ShowChestMessage(null);
								this.layout.SetInventoryMessage(null);
								this.ClosePopup();
							};

							this.TargetItemPicked.remove(TargetItemPicked);
							Consume();
							this.EndSequence();
							this.ShowMessagePopup(this.DataNameProvider.NoCursedItemFound, CleanUp);
							return false; // no item selection
						}
					}

					return true; // move forward to item selection
				};
				TargetItemPicked = (itemGrid, slotIndex, itemSlot) => {
					this.TargetItemPicked.remove(TargetItemPicked);
					itemGrid?.HideTooltip();
					this.layout.SetInventoryMessage(null);
					this.ClosePopup();
					if (itemSlot != null) {
						Consume();
						this.StartSequence();
						this.ApplySpellEffect(spell, caster, itemSlot, () => {
							if (!fromItem)
								this.CloseWindow();
							this.UntrapMouse();
							this.EndSequence();
							if (!this.WindowActive)
								this.Resume();
							this.layout.SetInventoryMessage(null);
							this.layout.ShowChestMessage(null);
						}, checkFail);
						return false; // manual window closing etc
					} else {
						this.layout.SetInventoryMessage(null);
						this.layout.ShowChestMessage(null);
						if (!this.WindowActive)
							this.Resume();
						if (fromItem) {
							this.EndSequence();
							this.UntrapMouse();
							return false;
						} else {
							return true; // auto-close window and cleanup
						}
					}
				};
				this.TargetInventoryPicked.add(TargetInventoryPicked);
				this.TargetItemPicked.add(TargetItemPicked);
				break;
			}
			case SpellTarget.None: {
				const Consume = () => {
					ConsumeSP();

					if (spell === Spell.SelfHealing || spell === Spell.SelfReviving) {
						const Cast = () => {
							this.currentAnimation?.Destroy();
							this.currentAnimation = new SpellAnimation(this, this.layout);
							this.currentAnimation.CastOn(spell, caster, () => {
								this.currentAnimation.Destroy();
								this.currentAnimation = null;
								this.ApplySpellEffect(spell, caster, null, false);
							});
						};
						if (checkFail)
							this.TrySpell(Cast);
						else
							Cast();
					} else {
						this.ApplySpellEffect(spell, caster, null, checkFail);
					}
				};
				if (consumeHandler != null)
					consumeHandler(Consume);
				else
					Consume();
				break;
			}
			default:
				throw new AmbermoonException(ExceptionScope.Application, `Spells with target ${enumName(SpellTarget, spellInfo.Target)} should not be usable in camps.`);
		}
	}

	/**
	 * Cast a spell on the map or in a camp.
	 */
	CastSpell(camp, itemGrid = null) {
		if (!this.CurrentPartyMember.HasAnySpell()) {
			this.ShowMessagePopup(this.DataNameProvider.YouDontKnowAnySpellsYet);
		} else {
			this.OpenSpellList(this.CurrentPartyMember,
				spell => {
					const spellInfo = getValue(this.SpellInfos, spell);

					if (camp && !hasFlag(spellInfo.ApplicationArea, SpellApplicationArea.Camp))
						return this.DataNameProvider.WrongArea;

					if (!camp) {
						if (!hasFlag(spellInfo.ApplicationArea, SpellApplicationArea.AnyMap)) {
							if (hasFlag(spellInfo.ApplicationArea, SpellApplicationArea.WorldMapOnly)) {
								if (!this.Map.IsWorldMap)
									return this.DataNameProvider.WrongArea;
							} else if (hasFlag(spellInfo.ApplicationArea, SpellApplicationArea.DungeonOnly)) {
								if (this.Map.Type !== MapType.Map3D || hasFlag(this.Map.Flags, MapFlags.Outdoor))
									return this.DataNameProvider.WrongArea;
							} else {
								return this.DataNameProvider.WrongArea;
							}
						}
					}

					const worldFlag = 1 << this.Map.World;

					if (!hasFlag(spellInfo.Worlds, worldFlag))
						return this.DataNameProvider.WrongWorld;

					if (SpellInfos.GetSPCost(this.SpellInfos, this.Features, spell, this.CurrentPartyMember) > this.CurrentPartyMember.SpellPoints.CurrentValue)
						return this.DataNameProvider.NotEnoughSP;

					return null;
				},
				spell => this.UseSpell(this.CurrentPartyMember, spell, itemGrid, false)
			);
		}
	}
}


// ---- private overload implementations of ApplySpellEffect (called with this = game) ----

function applySpellEffectNoTarget(spell, caster, finishAction, checkFail) {
	this.CurrentSpellTarget = null;

	const Cast = (action, finishAction = null, failAction = null) => {
		this.Cast(action, finishAction, failAction, checkFail);
	};

	switch (spell) {
		case Spell.Light:
			// Duration: 30 (150 minutes = 2h30m)
			// Level: 1 (Light radius 1)
			Cast(() => this.ActivateLight(30, 1), finishAction);
			break;
		case Spell.MagicalTorch:
			// Duration: 60 (300 minutes = 5h)
			// Level: 1 (Light radius 1)
			Cast(() => this.ActivateLight(60, 1), finishAction);
			break;
		case Spell.MagicalLantern:
			// Duration: 120 (600 minutes = 10h)
			// Level: 2 (Light radius 2)
			Cast(() => this.ActivateLight(120, 2), finishAction);
			break;
		case Spell.MagicalSun:
			// Duration: 180 (900 minutes = 15h)
			// Level: 3 (Light radius 3)
			Cast(() => this.ActivateLight(180, 3), finishAction);
			break;
		case Spell.Jump:
			Cast(() => this.Jump(), finishAction);
			break;
		case Spell.WordOfMarking: {
			Cast(() => {
				if (caster instanceof PartyMember) {
					const partyMember = caster;
					partyMember.MarkOfReturnMapIndex = toUShort(this.Map.IsWorldMap ?
						this.renderMap2D.GetMapFromTile(this.player.Position.X, this.player.Position.Y).Index : this.Map.Index);
					partyMember.MarkOfReturnX = toUShort(this.player.Position.X + 1); // stored 1-based
					partyMember.MarkOfReturnY = toUShort(this.player.Position.Y + 1); // stored 1-based
					this.ShowMessagePopup(this.DataNameProvider.MarksPosition, finishAction);
				} else {
					finishAction?.();
				}
			}, null, finishAction);
			break;
		}
		case Spell.WordOfReturning: {
			Cast(() => {
				if (caster instanceof PartyMember) {
					const partyMember = caster;
					if (partyMember.MarkOfReturnMapIndex === 0) {
						this.ShowMessagePopup(this.DataNameProvider.HasntMarkedAPosition, finishAction);
					} else {
						const Return = () => {
							// Teleport(mapIndex, x, y, direction, out blocked, force) -> out param omitted, returns [result, blocked]
							this.Teleport(partyMember.MarkOfReturnMapIndex, partyMember.MarkOfReturnX, partyMember.MarkOfReturnY, this.player.Direction, true);
							finishAction?.();
						};
						this.ShowMessagePopup(this.DataNameProvider.ReturnToMarkedPosition, () => {
							const targetMap = this.MapManager.GetMap(partyMember.MarkOfReturnMapIndex);
							// Note: The original fades always if the map index does not match.
							// But we improve it here a bit so that moving inside the same world map won't fade.
							if (targetMap.Index === this.Map.Index || (targetMap.IsWorldMap && this.Map.IsWorldMap && targetMap.World === this.Map.World))
								Return();
							else
								this.Fade(Return);
						});
					}
				} else {
					finishAction?.();
				}
			}, null, finishAction);
			break;
		}
		case Spell.MagicalShield:
			// Duration: 30 (150 minutes = 2h30m)
			// Level: 10 (10% defense increase)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Protection, 30, 10), finishAction);
			break;
		case Spell.MagicalWall:
			// Duration: 90 (450 minutes = 7h30m)
			// Level: 20 (20% defense increase)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Protection, 90, 20), finishAction);
			break;
		case Spell.MagicalBarrier:
			// Duration: 180 (900 minutes = 15h)
			// Level: 30 (30% defense increase)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Protection, 180, 30), finishAction);
			break;
		case Spell.MagicalWeapon:
			// Duration: 30 (150 minutes = 2h30m)
			// Level: 10 (10% damage increase)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Attack, 30, 10), finishAction);
			break;
		case Spell.MagicalAssault:
			// Duration: 90 (450 minutes = 7h30m)
			// Level: 20 (20% damage increase)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Attack, 90, 20), finishAction);
			break;
		case Spell.MagicalAttack:
			// Duration: 180 (900 minutes = 15h)
			// Level: 30 (30% damage increase)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Attack, 180, 30), finishAction);
			break;
		case Spell.Levitation:
			Cast(() => this.Levitate(), finishAction);
			break;
		case Spell.Rope: {
			if (!this.is3D) {
				this.ShowMessagePopup(this.DataNameProvider.CannotClimbHere, finishAction);
			} else {
				this.Levitate(() => this.ShowMessagePopup(this.DataNameProvider.CannotClimbHere, finishAction), false);
			}
			break;
		}
		case Spell.AntiMagicWall:
			// Duration: 30 (150 minutes = 2h30m)
			// Level: 15 (15% anti-magic protection)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.AntiMagic, 30, 15), finishAction);
			break;
		case Spell.AntiMagicSphere:
			// Duration: 180 (900 minutes = 15h)
			// Level: 25 (25% anti-magic protection)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.AntiMagic, 180, 25), finishAction);
			break;
		case Spell.AlchemisticGlobe:
			// Duration: 180 (900 minutes = 15h)
			Cast(() => {
				this.ActivateLight(180, 3);
				this.CurrentSavegame.ActivateSpell(ActiveSpellType.Protection, 180, 30);
				this.CurrentSavegame.ActivateSpell(ActiveSpellType.Attack, 180, 30);
				this.CurrentSavegame.ActivateSpell(ActiveSpellType.AntiMagic, 180, 25);
			}, finishAction);
			break;
		case Spell.Knowledge:
			// Duration: 30 (150 minutes = 2h30m)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Clairvoyance, 30, 20), finishAction);
			break;
		case Spell.Clairvoyance:
			// Duration: 90 (450 minutes = 7h30m)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Clairvoyance, 90, 40), finishAction);
			break;
		case Spell.SeeTheTruth:
			// Duration: 180 (900 minutes = 15h)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.Clairvoyance, 180, 60), finishAction);
			break;
		case Spell.MapView:
			Cast(() => this.OpenMiniMap(finishAction), null, finishAction);
			break;
		case Spell.MagicalCompass: {
			Cast(() => {
				this.Pause();
				const popup = this.layout.OpenPopup(new Position(48, 64), 4, 4);
				this.TrapMouse(popup.ContentArea);
				popup.AddImage(new Rect(64, 80, 32, 32), Graphics.GetUIGraphicIndex(UIGraphic.Compass), Layer.UI, 1, this.UIPaletteIndex);
				const text = popup.AddText(new Rect(59, 93, 42, 7), this.layout.GetCompassString(), TextColor.BrightGray);
				text.Clip(new Rect(64, 93, 32, 7));
				popup.Closed.add(() => {
					this.UntrapMouse();
					this.Resume();
					finishAction?.();
				});
			}, null, finishAction);
			break;
		}
		case Spell.FindTraps:
			Cast(() => this.ShowAutomap(createAutomapOptions(false, false, false, true, true), finishAction), null, finishAction);
			break;
		case Spell.FindMonsters:
			Cast(() => this.ShowAutomap(createAutomapOptions(false, true, false, false, true), finishAction), null, finishAction);
			break;
		case Spell.FindPersons:
			Cast(() => this.ShowAutomap(createAutomapOptions(false, false, true, false, true), finishAction), null, finishAction);
			break;
		case Spell.FindSecretDoors:
			Cast(() => this.ShowAutomap(createAutomapOptions(true, false, false, false, true), finishAction), null, finishAction);
			break;
		case Spell.MysticalMapping:
			Cast(() => this.ShowAutomap(createAutomapOptions(true, true, true, true, true), finishAction), null, finishAction);
			break;
		case Spell.MysticalMapI:
			// Duration: 32 (160 minutes = 2h40m)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.MysticMap, 32, 1), finishAction);
			break;
		case Spell.MysticalMapII:
			// Duration: 60 (300 minutes = 5h)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.MysticMap, 60, 1), finishAction);
			break;
		case Spell.MysticalMapIII:
			// Duration: 90 (450 minutes = 7h30m)
			Cast(() => this.CurrentSavegame.ActivateSpell(ActiveSpellType.MysticMap, 90, 1), finishAction);
			break;
		case Spell.MysticalGlobe:
			// Duration: 180 (900 minutes = 15h)
			Cast(() => {
				this.CurrentSavegame.ActivateSpell(ActiveSpellType.Clairvoyance, 180, 60);
				this.CurrentSavegame.ActivateSpell(ActiveSpellType.MysticMap, 180, 1);
			}, finishAction);
			break;
		case Spell.Lockpicking:
			// Do nothing. Can be used by Thief/Ranger but has no effect in Ambermoon.
			finishAction?.();
			break;
		case Spell.MountWasp:
			this.ShowMessagePopup(this.DataNameProvider.MountTheWasp, () => this.CloseWindow(() => this.ActivateTransport(TravelType.Wasp)), TextAlign.Left);
			break;
		case Spell.CallEagle:
			this.ShowMessagePopup(this.DataNameProvider.BlowsTheFlute, () => {
				this.CloseWindow(() => {
					this.StartSequence();
					const travelInfoEagle = this.renderView.GameData.GetTravelGraphicInfo(TravelType.Eagle, CharacterDirection.Right);
					const currentTravelInfo = this.renderView.GameData.GetTravelGraphicInfo(this.TravelType, this.player.Direction);
					const diffX = travelInfoEagle.OffsetX - currentTravelInfo.OffsetX;
					const diffY = travelInfoEagle.OffsetY - currentTravelInfo.OffsetY;
					const targetPosition = Position.op_Addition(this.player2D.DisplayArea.Position, new Position(diffX, diffY));
					const position = new Position(Global.Map2DViewX - travelInfoEagle.Width, targetPosition.Y - travelInfoEagle.Height);
					const eagle = this.layout.AddMapCharacterSprite(new Rect(position, new Size(travelInfoEagle.Width, travelInfoEagle.Height)),
						Graphics.TravelGraphicOffset + TravelType.Eagle * 4 + 1, 0xffff);
					eagle.ClipArea = this.constructor.Map2DViewArea;
					const AnimateEagle = () => {
						if (position.X < targetPosition.X)
							position.X = Math.min(targetPosition.X, position.X + 12);
						if (position.Y < targetPosition.Y)
							position.Y = Math.min(targetPosition.Y, position.Y + 5);

						eagle.X = position.X;
						eagle.Y = position.Y;

						if (Position.op_Equality(position, targetPosition)) {
							this.EndSequence();
							eagle.Delete();
							this.ActivateTransport(TravelType.Eagle);
							// Update direction to right
							this.player.Direction = CharacterDirection.Right; // Set this before player2D.MoveTo!
							this.player2D.MoveTo(this.Map, this.player2D.Position.X, this.player2D.Position.Y, this.CurrentTicks, true, CharacterDirection.Right);
							finishAction?.();
						} else {
							this.AddTimedEvent(40, AnimateEagle);
						}
					};
					this.AddTimedEvent(200, AnimateEagle);
				});
			}, TextAlign.Left);
			break;
		case Spell.PlayElfHarp:
			this.OpenMusicList(finishAction);
			break;
		case Spell.MagicalMap:
			// TODO: In original this has no effect. Maybe it was planned to show
			// the real map that was inside the original package.
			// For now we show the minimap instead.
			this.OpenMiniMap(finishAction);
			break;
		case Spell.SelfHealing:
		case Spell.SelfReviving:
			this.ApplySpellEffect(spell, caster, caster, finishAction, checkFail);
			break;
		default:
			throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, spell)} is no spell without target.`);
	}
}

function applySpellEffectItem(spell, caster, itemSlot, finishAction, checkFail) {
	this.CurrentSpellTarget = null;

	const Cast = (action, finishAction = null, failAction = null) => {
		this.Cast(action, finishAction, failAction, checkFail);
	};

	const PlayItemMagicAnimation = (animationFinishAction = null) => {
		ItemAnimation.Play(this, this.renderView, ItemAnimation.Type.Enchant, this.layout.GetItemSlotPosition(itemSlot, true),
			animationFinishAction ?? finishAction, 50);
	};

	const Error = (message) => {
		this.EndSequence();
		this.ShowMessagePopup(message, finishAction, TextAlign.Left);
	};

	switch (spell) {
		case Spell.Identification: {
			Cast(() => {
				itemSlot.Flags |= ItemSlotFlags.Identified;
				PlayItemMagicAnimation(() => {
					this.EndSequence();
					this.UntrapMouse();
					this.ShowItemPopup(itemSlot, finishAction);
				});
			}, null, () => {
				this.EndSequence();
				this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, finishAction);
			});
			break;
		}
		case Spell.ChargeItem: {
			// Note: Even broken items can be charged.
			const item = this.ItemManager.GetItem(itemSlot.ItemIndex);
			if (item.Spell === Spell.None || item.MaxCharges === 0) {
				Error(this.DataNameProvider.ThisIsNotAMagicalItem);
				return;
			}
			if (itemSlot.NumRemainingCharges >= item.MaxCharges) {
				Error(this.DataNameProvider.ItemAlreadyFullyCharged);
				return;
			}
			if (item.MaxRecharges !== 0 && item.MaxRecharges !== 255 && itemSlot.RechargeTimes >= item.MaxRecharges) {
				Error(this.DataNameProvider.CannotRechargeAnymore);
				return;
			}
			Cast(() => {
				itemSlot.NumRemainingCharges += this.RandomInt(1, Math.min(item.MaxCharges - itemSlot.NumRemainingCharges, caster.Level));
				PlayItemMagicAnimation(finishAction);
			}, null, () => {
				this.EndSequence();
				this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, () => {
					if (!hasFlag(itemSlot.Flags, ItemSlotFlags.Cursed)) // Don't destroy cursed items via failed charging
						this.layout.DestroyItem(itemSlot, 50, false, finishAction);
					else
						finishAction?.();
				});
			});
			break;
		}
		case Spell.RepairItem: {
			if (!hasFlag(itemSlot.Flags, ItemSlotFlags.Broken)) {
				Error(this.DataNameProvider.ItemIsNotBroken);
				return;
			}
			Cast(() => {
				itemSlot.Flags &= ~ItemSlotFlags.Broken;
				this.layout.UpdateItemSlot(itemSlot);
				PlayItemMagicAnimation(finishAction);
			}, null, () => {
				this.EndSequence();
				this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, () => {
					this.layout.DestroyItem(itemSlot, 50, false, finishAction);
				});
			});
			break;
		}
		case Spell.DuplicateItem: {
			// Note: Even broken items can be duplicated. The broken state is also duplicated.
			const item = this.ItemManager.GetItem(itemSlot.ItemIndex);
			if (!hasFlag(item.Flags, ItemFlags.Cloneable)) {
				Error(this.DataNameProvider.CannotBeDuplicated);
				return;
			}
			Cast(() => {
				PlayItemMagicAnimation(() => {
					let couldDuplicate = false;
					const inventorySlots = this.CurrentInventory.Inventory.Slots;

					if (hasFlag(item.Flags, ItemFlags.Stackable)) {
						// Look for slots with free stacks
						const freeSlot = firstOrDefault(inventorySlots, s => s.ItemIndex === item.Index && s.Amount < 99);

						if (freeSlot != null) {
							++freeSlot.Amount;
							this.layout.UpdateItemSlot(freeSlot);
							couldDuplicate = true;
						}
					}

					if (!couldDuplicate) {
						// Look for empty slots
						const freeSlot = firstOrDefault(inventorySlots, s => s.Empty);

						if (freeSlot != null) {
							const copy = itemSlot.Copy();
							copy.Amount = 1;
							freeSlot.Replace(copy);
							this.layout.UpdateItemSlot(freeSlot);
							couldDuplicate = true;
						}
					}

					if (!couldDuplicate) {
						this.EndSequence();
						this.ShowMessagePopup(this.DataNameProvider.NoRoomForItem, finishAction);
					} else {
						finishAction?.();
					}
				});
			}, null, () => {
				this.EndSequence();
				this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, () => {
					if (!hasFlag(itemSlot.Flags, ItemSlotFlags.Cursed)) // Don't destroy cursed items via failed duplicating
						this.layout.DestroyItem(itemSlot, 50, false, finishAction);
					else
						finishAction?.();
				});
			});
			break;
		}
		case Spell.RemoveCurses: {
			const Fail = () => {
				this.EndSequence();
				this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, finishAction);
			};

			Cast(() => {
				if (!hasFlag(itemSlot.Flags, ItemSlotFlags.Cursed)) {
					Fail();
				} else {
					PlayItemMagicAnimation(() => {
						this.layout.DestroyItem(itemSlot, 10, false, () => {
							this.EndSequence();
							finishAction?.();
						});
					});
				}
			}, null, Fail);
			break;
		}
		default:
			throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, spell)} is no item-targeted spell.`);
	}
}

function applySpellEffectCharacter(spell, caster, target, finishAction, checkFail) {
	this.CurrentSpellTarget = target;

	const Cast = (action, finishAction = null, failAction = null) => {
		this.Cast(action, finishAction, failAction, checkFail);
	};

	const IncreaseAttribute = (attribute) => {
		if (target.Alive) {
			const value = target.Attributes[attribute];
			value.CurrentValue = Math.min(value.CurrentValue + this.RandomInt(1, 5), value.MaxValue);
			this.UpdateCharacterInfo();
		}
	};

	const Heal = (amount) => {
		target.Heal(amount);

		if (target instanceof PartyMember) {
			const partyMember = target;
			this.layout.FillCharacterBars(partyMember);

			if (this.CurrentInventory === partyMember)
				this.UpdateCharacterInfo();
		}
	};

	const FillSP = (amount) => {
		target.SpellPoints.CurrentValue = Math.min(target.SpellPoints.TotalMaxValue, target.SpellPoints.CurrentValue + amount);
		this.layout.FillCharacterBars(target);

		if (this.CurrentInventory === target)
			this.UpdateCharacterInfo();
	};

	switch (spell) {
		case Spell.Hurry:
		case Spell.MassHurry:
			// Note: This is handled by battle code
			finishAction?.();
			break;
		case Spell.RemoveFear:
		case Spell.RemovePanic:
			Cast(() => this.RemoveCondition(Condition.Panic, target), finishAction);
			break;
		case Spell.RemoveShadows:
		case Spell.RemoveBlindness:
			Cast(() => this.RemoveCondition(Condition.Blind, target), finishAction);
			break;
		case Spell.RemovePain:
		case Spell.RemoveDisease:
			Cast(() => this.RemoveCondition(Condition.Diseased, target), finishAction);
			break;
		case Spell.RemovePoison:
		case Spell.NeutralizePoison:
			Cast(() => this.RemoveCondition(Condition.Poisoned, target), finishAction);
			break;
		case Spell.HealingHand:
			Cast(() => Heal(Math.trunc(target.HitPoints.TotalMaxValue / 10)), finishAction); // 10%
			break;
		case Spell.SmallHealing:
		case Spell.MassHealing:
			Cast(() => Heal(Math.trunc(target.HitPoints.TotalMaxValue / 4)), finishAction); // 25%
			break;
		case Spell.MediumHealing:
			Cast(() => Heal(Math.trunc(target.HitPoints.TotalMaxValue / 2)), finishAction); // 50%
			break;
		case Spell.GreatHealing:
			Cast(() => Heal(Math.trunc(target.HitPoints.TotalMaxValue * 3 / 4)), finishAction); // 75%
			break;
		case Spell.RemoveRigidness:
		case Spell.RemoveLamedness:
			Cast(() => this.RemoveCondition(Condition.Lamed, target), finishAction);
			break;
		case Spell.HealAging:
		case Spell.StopAging:
			Cast(() => this.RemoveCondition(Condition.Aging, target), finishAction);
			break;
		case Spell.StoneToFlesh:
			Cast(() => this.RemoveCondition(Condition.Petrified, target), finishAction);
			break;
		case Spell.WakeUp:
			Cast(() => this.RemoveCondition(Condition.Sleep, target), finishAction);
			break;
		case Spell.RemoveIrritation:
			Cast(() => this.RemoveCondition(Condition.Irritated, target), finishAction);
			break;
		case Spell.RemoveDrugged:
			Cast(() => this.RemoveCondition(Condition.Drugged, target), finishAction);
			break;
		case Spell.RemoveMadness:
			Cast(() => this.RemoveCondition(Condition.Crazy, target), finishAction);
			break;
		case Spell.RestoreStamina:
			Cast(() => this.RemoveCondition(Condition.Exhausted, target), finishAction);
			break;
		case Spell.CreateFood:
			Cast(() => ++target.Food, finishAction);
			break;
		case Spell.ExpExchange:
			Cast(() => this.ExchangeExp(caster instanceof PartyMember ? caster : null, target instanceof PartyMember ? target : null, finishAction), null, finishAction);
			break;
		case Spell.SelfHealing:
			Cast(() => {
				if (target.Alive)
					Heal(5 + Math.trunc(target.HitPoints.TotalMaxValue / 4)); // 5 HP + 25% of MaxHP
			}, finishAction);
			break;
		case Spell.Resurrection: {
			Cast(() => {
				target.Conditions &= ~Condition.DeadCorpse;
				target.HitPoints.CurrentValue = target.HitPoints.TotalMaxValue;
				this.PartyMemberRevived(target instanceof PartyMember ? target : null, finishAction, false);
			}, null, finishAction);
			break;
		}
		case Spell.SelfReviving:
		case Spell.WakeTheDead: {
			if (!(target instanceof PartyMember)) {
				// Should not happen
				finishAction?.();
				return;
			}
			const targetPlayer = target;
			const Revive = () => {
				if (!hasFlag(target.Conditions, Condition.DeadCorpse) ||
					hasFlag(target.Conditions, Condition.DeadAshes) ||
					hasFlag(target.Conditions, Condition.DeadDust)) {
					if (target.Alive)
						this.ShowMessagePopup(this.DataNameProvider.IsNotDead, finishAction);
					else
						this.ShowMessagePopup(this.DataNameProvider.CannotBeResurrected, finishAction);
					return;
				}
				target.Conditions &= ~Condition.DeadCorpse;
				target.HitPoints.CurrentValue = 1;
				this.PartyMemberRevived(targetPlayer, finishAction, true, spell === Spell.SelfReviving);
			};
			if (checkFail) {
				this.TrySpell(Revive, () => {
					this.EndSequence();
					this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, () => {
						if (spell !== Spell.SelfReviving && hasFlag(target.Conditions, Condition.DeadCorpse)) {
							target.Conditions &= ~Condition.DeadCorpse;
							target.Conditions |= Condition.DeadAshes;
							this.ShowMessagePopup(this.DataNameProvider.BodyBurnsUp, finishAction);
						} else {
							finishAction?.();
						}
					});
				});
			} else {
				Revive();
			}
			break;
		}
		case Spell.ChangeAshes: {
			if (!(target instanceof PartyMember)) {
				// Should not happen
				finishAction?.();
				return;
			}
			const TransformToBody = () => {
				if (!hasFlag(target.Conditions, Condition.DeadAshes) ||
					hasFlag(target.Conditions, Condition.DeadDust)) {
					this.ShowMessagePopup(this.DataNameProvider.IsNotAsh, finishAction);
					return;
				}
				target.Conditions &= ~Condition.DeadAshes;
				target.Conditions |= Condition.DeadCorpse;
				this.ShowMessagePopup(this.DataNameProvider.AshesChangedToBody, finishAction);
			};
			if (checkFail) {
				this.TrySpell(TransformToBody, () => {
					this.EndSequence();
					this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, () => {
						if (hasFlag(target.Conditions, Condition.DeadAshes)) {
							target.Conditions &= ~Condition.DeadAshes;
							target.Conditions |= Condition.DeadDust;
							this.ShowMessagePopup(this.DataNameProvider.AshesFallToDust, finishAction);
						} else {
							finishAction?.();
						}
					});
				});
			} else {
				TransformToBody();
			}
			break;
		}
		case Spell.ChangeDust: {
			if (!(target instanceof PartyMember)) {
				// Should not happen
				finishAction?.();
				return;
			}
			const TransformToAshes = () => {
				if (!hasFlag(target.Conditions, Condition.DeadDust)) {
					this.ShowMessagePopup(this.DataNameProvider.IsNotDust, finishAction);
					return;
				}
				target.Conditions &= ~Condition.DeadDust;
				target.Conditions |= Condition.DeadAshes;
				this.ShowMessagePopup(this.DataNameProvider.DustChangedToAshes, finishAction);
			};
			if (checkFail) {
				this.TrySpell(TransformToAshes, () => {
					this.EndSequence();
					this.ShowMessagePopup(this.DataNameProvider.TheSpellFailed, finishAction);
				});
			} else {
				TransformToAshes();
			}
			break;
		}
		case Spell.SpellPointsI:
			FillSP(Math.trunc(target.SpellPoints.TotalMaxValue / 10)); // 10%
			finishAction?.();
			break;
		case Spell.SpellPointsII:
			FillSP(Math.trunc(target.SpellPoints.TotalMaxValue / 4)); // 25%
			finishAction?.();
			break;
		case Spell.SpellPointsIII:
			FillSP(Math.trunc(target.SpellPoints.TotalMaxValue / 2)); // 50%
			finishAction?.();
			break;
		case Spell.SpellPointsIV:
			FillSP(Math.trunc(target.SpellPoints.TotalMaxValue * 3 / 4)); // 75%
			finishAction?.();
			break;
		case Spell.SpellPointsV:
			FillSP(target.SpellPoints.TotalMaxValue); // 100%
			finishAction?.();
			break;
		case Spell.AllHealing: {
			const HealAll = () => {
				// Removes all curses and heals full LP
				Heal(target.HitPoints.TotalMaxValue);
				for (const condition of EnumHelper.GetValues(Condition)) {
					if (condition !== Condition.None && hasFlag(target.Conditions, condition))
						this.RemoveCondition(condition, target);
				}
				finishAction?.();
			};
			if (!target.Alive) {
				target.Conditions &= ~Condition.DeadCorpse;
				target.Conditions &= ~Condition.DeadAshes;
				target.Conditions &= ~Condition.DeadDust;
				target.HitPoints.CurrentValue = 1;
				this.PartyMemberRevived(target instanceof PartyMember ? target : null, HealAll);
			} else {
				HealAll();
			}
			break;
		}
		case Spell.AddStrength:
			IncreaseAttribute(Attribute.Strength);
			finishAction?.();
			break;
		case Spell.AddIntelligence:
			IncreaseAttribute(Attribute.Intelligence);
			finishAction?.();
			break;
		case Spell.AddDexterity:
			IncreaseAttribute(Attribute.Dexterity);
			finishAction?.();
			break;
		case Spell.AddSpeed:
			IncreaseAttribute(Attribute.Speed);
			finishAction?.();
			break;
		case Spell.AddStamina:
			IncreaseAttribute(Attribute.Stamina);
			finishAction?.();
			break;
		case Spell.AddCharisma:
			IncreaseAttribute(Attribute.Charisma);
			finishAction?.();
			break;
		case Spell.AddLuck:
			IncreaseAttribute(Attribute.Luck);
			finishAction?.();
			break;
		case Spell.AddAntiMagic:
			IncreaseAttribute(Attribute.AntiMagic);
			finishAction?.();
			break;
		case Spell.DecreaseAge:
			if (target.Alive && !hasFlag(target.Conditions, Condition.Petrified) && target.Attributes[Attribute.Age].CurrentValue > 18) {
				target.Attributes[Attribute.Age].CurrentValue = Math.max(18, target.Attributes[Attribute.Age].CurrentValue - this.RandomInt(1, 10));

				if (this.CurrentWindow.Window === Window.Inventory && this.CurrentInventory === target)
					this.UpdateCharacterInfo();
			}
			finishAction?.();
			break;
		case Spell.Drugs:
			if (target instanceof PartyMember)
				this.AddCondition(Condition.Drugged, target);
			finishAction?.();
			break;
		default:
			throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, spell)} is no character-targeted spell.`);
	}
}
