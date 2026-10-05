// Port of Ambermoon.Core/Game/AutoBattle.cs from Ambermoon.net (GPL-3.0, Copyright (C) Marcel Hesselbarth)
// AutoBattle.cs - Automatic Battle Planing

// battle rules - see feature request #417
// - attack strongest enemy in range
//   - prefer damaged enemies
//   - prefer nearby enemies
// - use healing if required
//   - prefer healer over paladin
// - use black magic only to disable enemy
//   - other spells can be used/planed by player before activating AutoBattle
// - don't use items
//   - use spellpoint items if healer runs out of spellpoints
//   - use healing items if group has no operating healer
// - don't use imitate
//   - can be used/planed by player before activating AutoBattle
//   - use spells of imitated monster
// - don't use MagicAttack, MagicProtection, RecognizeWeakPoint, SeeWeaknesses, KnowledgeOfTheWeakness
//   - can be used/planed by player before activating AutoBattle
// - abort auto-battle if party member died
//
// assumptions for planing actions
// - enemy abilities are known (real players learn)
//   - assign threading
// - enemies don't move
// - cast magic is sucessfull
// - attacks damage enemies
//
// algorithm, uses a lot of internal data unknown to the player just to calculate what the player knows: the most dangerous enemy
// - analyze enemies threading level
//   - enemies use 50% magic
//   - group spells are more dangerous
// - give orders in turn order
//   - delay paladin magic after healer magic

import {
	toByte, toUInt, hasFlag, count, orderBy, firstOrDefault, newArray, removeItem, tryGetValue, idiv
} from '../../../runtime.js';
import { Graphic } from '../../Ambermoon.Data.Common/Graphic.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { SpellTarget, SpellApplicationArea } from '../../Ambermoon.Data.Common/SpellInfo.js';
import { Condition, ConditionExtensions } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { Class } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Monster } from '../../Ambermoon.Data.Common/Monster.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Layer } from '../Render/Layer.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Global } from '../UI/Global.js';
import { Button } from '../UI/Button.js';

// Note: This file must not import Battle.js (Battle.js imports this file and applies
// Battle_AutoBattle at module evaluation time). Battle statics are accessed through
// the battle instance's constructor instead.

/** uint.MaxValue */
const UIntMaxValue = 0xffffffff;

// partial class Battle
export class Battle_AutoBattle {
	static initFields(self) {
		self.autoBattleRoundText = null;
		self.lastRoundSpells = new Map(); // Value = Action Parameter
	}

	GetLastRoundSpell(partyMemberIndex) {
		return this.lastRoundSpells.has(partyMemberIndex) ? this.lastRoundSpells.get(partyMemberIndex) : UIntMaxValue;
	}

	SetLastRoundSpell(partyMemberIndex, actionParameter) {
		this.lastRoundSpells.set(partyMemberIndex, actionParameter);
	}

	RemoveLastRoundSpell(partyMemberIndex) {
		this.lastRoundSpells.delete(partyMemberIndex);
	}

	ClearLastRoundSpells() {
		this.lastRoundSpells.clear();
	}

	ShowAutoBattleRoundText(show, rounds) {
		this.autoBattleRoundText?.Delete();

		if (show) {
			const layout = this.layout;
			this.autoBattleRoundText = layout.RenderView.RenderTextFactory.Create(toByte(layout.RenderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1));
			this.autoBattleRoundText.Layer = layout.RenderView.GetLayer(Layer.Text);
			this.autoBattleRoundText.DisplayLayer = 201;
			this.autoBattleRoundText.Shadow = true;
			this.autoBattleRoundText.TextColor = TextColor.BrightGray;
			this.autoBattleRoundText.Text = layout.RenderView.TextProcessor.CreateText(String(rounds));
			this.autoBattleRoundText.Place(new Rect(Global.ButtonGridX + Button.Width * 2 + 17, Global.ButtonGridY + Button.Height + 5, 12, 7), TextAlign.Center);
			this.autoBattleRoundText.Visible = true;
		}
	}

	/** Returns [physicalThreat, magicThreat] */
	CalculateAutoBattleInfo(monster, ignoreSleep = false) {
		const game = this.game;
		let physicalThreat = (monster.BaseAttackDamage + monster.BonusAttackDamage) * monster.AttacksPerRound;
		let magicThreat = 0;

		for (const spell of this.GetAvailableMonsterSpells(monster)) {
			const spellInfo = game.SpellInfos.get(spell);
			let spellThread; // uint

			if (spell >= Spell.Mudsling && spell <= Spell.Iceshower) {
				const damage = hasFlag(game.Features, Features.AdjustedSpellDamage)
					? this.constructor.AdjustedDestructionSpellDamageValues
					: this.constructor.DestructionSpellDamageValues;
				spellThread = Math.trunc((damage[spell - Spell.Mudsling].Key + damage[spell - Spell.Mudsling].Value) / 2);
			} else {
				switch (spell) {
					case Spell.LPStealer:
					case Spell.SPStealer:
						spellThread = Math.trunc(monster.Level * 3 / 2);
						break;
					case Spell.GhostWeapon:
					case Spell.GhostInferno:
					case Spell.MagicSwordAttack:
						spellThread = toUInt(monster.BaseAttackDamage + monster.BonusAttackDamage);
						break;
					case Spell.MagicalProjectile:
					case Spell.MagicalArrows:
						spellThread = monster.Level;
						break;
					case Spell.Petrify:
					case Spell.DissolveVictim:
						spellThread = 200;
						break;
					case Spell.CauseMadness:
						spellThread = 100;
						break;
					case Spell.Lame:
						spellThread = 50;
						break;
					case Spell.CauseAging:
					case Spell.CauseDisease:
						spellThread = 20;
						break;
					case Spell.Irritate:
						spellThread = 10;
						break;
					case Spell.Poison:
					case Spell.Sleep:
					case Spell.Drug:
						spellThread = 5;
						break;
					default:
						spellThread = 0;
						break;
				}
			}

			if (spellInfo.Target === SpellTarget.AllEnemies)
				spellThread = toUInt(spellThread * 3);
			else if (spellInfo.Target === SpellTarget.EnemyRow)
				spellThread = toUInt(spellThread * 2);
			else if (spellInfo.Target === SpellTarget.EnemyRowInWeaponRange)
				spellThread = Math.trunc(toUInt(spellThread * 3) / 2);

			magicThreat = Math.max(magicThreat, spellThread | 0);
		}

		if (hasFlag(monster.Conditions, Condition.Panic)
			|| hasFlag(monster.Conditions, Condition.Petrified))
			physicalThreat = magicThreat = 0;
		if (hasFlag(monster.Conditions, Condition.Irritated))
			magicThreat = 0;
		if (hasFlag(monster.Conditions, Condition.Lamed))
			physicalThreat = 0;
		if (hasFlag(monster.Conditions, Condition.Crazy)) {
			physicalThreat = Math.trunc(physicalThreat / 2);
			magicThreat = 0;
		}
		if (hasFlag(game.Features, Features.ExtendedCurseEffects)) {
			if (hasFlag(monster.Conditions, Condition.Blind))
				physicalThreat = Math.trunc(physicalThreat / 2);
			if (hasFlag(monster.Conditions, Condition.Diseased))
				physicalThreat = Math.trunc(physicalThreat / 2);
			if (hasFlag(monster.Conditions, Condition.Aging)) {
				const [, agingValue] = tryGetValue(this.agingValues, monster);
				const aging = agingValue ?? 0;
				physicalThreat = Math.trunc(physicalThreat * (100 - aging) / 100);
			}
		}
		if (!ignoreSleep && hasFlag(monster.Conditions, Condition.Sleep)) {
			physicalThreat = 1;
			magicThreat = 1;
		}

		return [physicalThreat, magicThreat];
	}
}

export class AutoBattleInfo {
	constructor() {
		this.Monster = null; // required
		this.Position = 0;
		this.PhysicalThreat = 0;
		this.MagicThreat = 0;
		this.Health = 0;
	}

	get Sleeping() { return this.PhysicalThreat === 1 && this.MagicThreat === 1; }
}

const AutoBattleButtonData = [
	0,0,30,28,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,28,27,27,27,27,27,27,28,28,29,30,0,0,
	0,0,28,27,26,28,28,28,28,28,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,27,28,26,26,28,28,28,28,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,27,28,26,27,26,28,28,28,26,27,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,27,28,26,27,27,26,28,28,26,27,27,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,27,28,26,27,27,27,26,28,26,27,27,27,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,27,28,26,27,27,27,27,26,26,27,27,27,27,26,28,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,27,28,26,27,27,27,27,27,27,27,27,27,27,27,29,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,27,28,26,27,27,27,27,28,26,27,27,27,27,30,28,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,27,28,26,27,27,27,30,28,26,27,27,27,30,28,28,28,28,28,28,28,28,28,28,28,28,28,28,27,0,0,
	0,0,27,28,26,27,27,30,28,28,26,27,27,30,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,0,0,
	0,0,28,28,26,27,30,28,28,28,26,27,30,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,0,0,
	0,0,29,28,27,29,29,29,29,29,27,29,29,29,29,29,29,29,29,29,28,29,29,29,28,29,29,29,28,27,0,0,
];

// partial class GameCore
export class GameCore_AutoBattle {
	static AutoBattleInfo = AutoBattleInfo;

	static get AutoBattleButton() {
		const graphic = new Graphic(32, 13, 0);
		graphic.Data = Uint8Array.from(AutoBattleButtonData);
		return graphic;
	}

	AddAutoBattleActions(firstRound) {
		// Battle class (see note at the top of this file)
		const Battle = this.currentBattle.constructor;
		const BattleActionType = Battle.BattleActionType;

		if (firstRound) {
			const battle = this.currentBattle;
			let remainingRounds = this.CoreConfiguration.AutoBattleRounds;
			const orgBattleSpeed = this.currentBattle.Speed;
			const orgPartyCount = count(this.PartyMembers, a => ConditionExtensions.CanFight(a.Conditions));
			let roundFinish = null;
			this.SetBattleSpeed(400);
			this.StartSequence();
			battle.ShowAutoBattleRoundText(false, 0);

			let BattleEnded = null;

			const EndAutoBattle = (ended = false) => {
				battle.BattleEnded.remove(BattleEnded);
				battle.RoundFinished.remove(roundFinish);
				this.EndSequence();
				this.SetBattleSpeed(orgBattleSpeed);

				if (!ended)
					battle.ShowAutoBattleRoundText(true, this.CoreConfiguration.AutoBattleRounds);
			};

			BattleEnded = _ => EndAutoBattle(true);
			battle.BattleEnded.add(BattleEnded);
			battle.RoundFinished.add(roundFinish = () => {
				if (orgPartyCount === count(this.PartyMembers, a => ConditionExtensions.CanFight(a.Conditions))) {
					if (this.currentBattle != null && remainingRounds-- > 0)
						this.AddAutoBattleActions(false);
					else
						EndAutoBattle();
				} else {
					EndAutoBattle();
				}
			});
		}

		if (this.currentBattle.CanPartyMoveForward) {
			this.AdvanceParty(() => this.AddAutoBattleActions(false));
			return;
		}

		// PartyMembers sorted by moving order
		const partyOrder = orderBy([...this.PartyMembers].filter(a => ConditionExtensions.CanSelect(a.Conditions)),
			[c => c.Attributes[Attribute.Speed].TotalCurrentValue, true], c => c.Type);
		let partyHasHealer = false;
		let partyEmptyHealer = false;

		// command paladin after healer
		for (let i = 0, paladinIndex = -1; i < partyOrder.length; i++) {
			if (partyOrder[i].Class === Class.Paladin || partyOrder[i].Class === Class.Healer) {
				partyHasHealer = true;
				partyEmptyHealer = partyOrder[i].SpellPoints.CurrentValue < this.SpellInfos.get(Spell.SmallHealing).SP;

				if (partyOrder[i].Class === Class.Paladin) {
					paladinIndex = i;
				} else { // Healer
					if (paladinIndex >= 0) {
						const paladin = partyOrder[paladinIndex];

						for (; paladinIndex < i; paladinIndex++)
							partyOrder[paladinIndex] = partyOrder[paladinIndex + 1];

						partyOrder[i] = paladin;
					}

					break;
				}
			}
		}

		// collect party healing data
		const partyToHeal = orderBy([...this.PartyMembers].filter(a => a.Alive && a.HitPoints.CurrentValue <= Math.trunc(a.HitPoints.TotalMaxValue / 2)), a => a.HitPoints.CurrentValue);
		let partyConditions = Condition.None;
		let partyDefense = 0, partyMaxHealth = 0;

		for (const partyMember of partyOrder) {
			partyConditions |= partyMember.Conditions;
			partyDefense += partyMember.BaseDefense + partyMember.BonusDefense + Math.trunc(partyMember.Attributes[Attribute.Stamina].TotalCurrentValue / 25);
			partyMaxHealth += partyMember.HitPoints.TotalMaxValue;
		}

		partyDefense = idiv(partyDefense, partyOrder.length);
		partyMaxHealth = idiv(partyMaxHealth, partyOrder.length);

		// list of monsters for attack prio
		const threats = [];

		for (const monster of this.currentBattle.Monsters) {
			if (monster.Alive) {
				const [physicalThreat, magicThreat] = this.currentBattle.CalculateAutoBattleInfo(monster);

				const info = new AutoBattleInfo();
				info.Monster = monster;
				info.PhysicalThreat = physicalThreat > 1 ? Math.max(0, physicalThreat - partyDefense * monster.AttacksPerRound) : physicalThreat;
				info.MagicThreat = magicThreat;
				info.Position = this.currentBattle.GetSlotFromCharacter(monster);
				info.Health = monster.HitPoints.CurrentValue;
				threats.push(info);
			}
		}

		// command party members
		const dontMove = [];
		const hasMoved = [];

		for (const partyMember of partyOrder) {
			this.currentPickingActionMember = partyMember;

			// check stored action and override if outdated
			const slot = this.SlotFromPartyMember(partyMember);

			const [hasStoredAction, action] = tryGetValue(this.roundPlayerBattleActions, slot);
			if (hasStoredAction) {
				let keepAction = false; // C#: "continue" inside the switch

				switch (action.BattleAction) {
					case BattleActionType.Attack:
						if (this.currentBattle.GetCharacterAt(Battle.GetTargetTileOrRowFromParameter(action.Parameter)) instanceof Monster
							&& ((partyToHeal.length === 0 && partyConditions === Condition.None) || (partyMember.Class !== Class.Healer && partyMember.Class !== Class.Paladin && partyHasHealer && !partyEmptyHealer)))
							keepAction = true;
						break;
					case BattleActionType.Move:
						if (this.currentBattle.GetCharacterAt(Battle.GetTargetTileOrRowFromParameter(action.Parameter)) == null) {
							hasMoved.push(partyMember);
							keepAction = true;
						}
						break;
					case BattleActionType.CastSpell: {
						if (firstRound)
							this.currentBattle.SetLastRoundSpell(slot, action.Parameter);

						const spell = Battle.GetCastSpell(action.Parameter);

						switch (this.SpellInfos.get(spell).Target) {
							case SpellTarget.SingleEnemy:
								if (this.currentBattle.GetCharacterAt(Battle.GetTargetTileOrRowFromParameter(action.Parameter)) instanceof Monster)
									keepAction = true;
								break;
							case SpellTarget.SingleFriend:
								if (this.currentBattle.GetCharacterAt(Battle.GetTargetTileOrRowFromParameter(action.Parameter)) instanceof PartyMember)
									keepAction = true;
								break;
							default:
								keepAction = true;
								break;
						}

						if (!keepAction)
							this.currentBattle.RemoveLastRoundSpell(slot);
						break;
					}
					case BattleActionType.Parry:
						break;
					default:
						keepAction = true;
						break;
				}

				if (keepAction)
					continue;

				this.roundPlayerBattleActions.delete(slot);
			}

			//#region Check inventory for spell point items

			if (partyEmptyHealer && partyToHeal.length > 0 && !partyMember.InventoryInaccessible) {
				let itemSpell = Spell.SpellPointsV + 1;
				let itemSlotIndex = -1;
				let itemIsEquipped = false;
				const CheckItemSlot = (slot, slotIndex, isEquipped) => {
					if (slot.ItemIndex > 0) {
						const item = this.ItemManager.GetItem(slot.ItemIndex);
						if (item.Spell >= Spell.SpellPointsI && item.Spell < itemSpell && slot.NumRemainingCharges > 0) {
							itemSpell = item.Spell;
							itemSlotIndex = slotIndex;
							itemIsEquipped = isEquipped;
						}
					}
				};
				let i = 0;
				for (const [, equipmentSlot] of partyMember.Equipment.Slots)
					CheckItemSlot(equipmentSlot, i++, true);
				i = 0;
				for (const itemSlot of partyMember.Inventory.Slots)
					CheckItemSlot(itemSlot, i++, false);
				if (itemSpell !== Spell.SpellPointsV + 1) {
					const toHealMember = firstOrDefault(orderBy(partyOrder.filter(a => a.Class === Class.Healer || a.Class === Class.Paladin), a => a.SpellPoints.CurrentValue));
					if (toHealMember != null) {
						partyEmptyHealer = false;
						dontMove.push(toHealMember);
						this.SetPlayerBattleAction(BattleActionType.CastSpell,
							Battle.CreateCastSpellParameter(toUInt(this.currentBattle.GetSlotFromCharacter(toHealMember)), itemSpell, toUInt(itemSlotIndex), itemIsEquipped));
						continue;
					}
				}
			}

			//#endregion

			//#region Check inventory for healing items

			if ((!partyHasHealer || partyEmptyHealer) && partyToHeal.length > 0 && !partyMember.InventoryInaccessible) {
				const toHealMember = partyToHeal[0];
				const toHealPercent = Math.trunc(toHealMember.HitPoints.CurrentValue * 100 / toHealMember.HitPoints.TotalMaxValue);
				let itemSpell = Spell.None;
				let itemSlotIndex = -1;
				let itemIsEquipped = false;
				const CheckItemSlot = (slot, slotIndex, isEquipped) => {
					if (slot.ItemIndex > 0) {
						const item = this.ItemManager.GetItem(slot.ItemIndex);
						if (item.Spell > itemSpell && item.Spell <= Spell.MassHealing && slot.NumRemainingCharges > 0)
							if ((partyToHeal.length >= 3 && item.Spell === Spell.MassHealing)
								|| (toHealPercent <= 15 && item.Spell === Spell.GreatHealing)
								|| (toHealPercent <= 20 && item.Spell === Spell.MediumHealing)
								|| (toHealPercent <= 30 && item.Spell === Spell.SmallHealing)
								|| (toHealPercent <= 40 && item.Spell === Spell.HealingHand)) {
								itemSpell = item.Spell;
								itemSlotIndex = slotIndex;
								itemIsEquipped = isEquipped;
							}
					}
				};
				let i = 0;
				for (const [, equipmentSlot] of partyMember.Equipment.Slots)
					CheckItemSlot(equipmentSlot, i++, true);
				i = 0;
				for (const itemSlot of partyMember.Inventory.Slots)
					CheckItemSlot(itemSlot, i++, false);
				if (itemSpell !== Spell.None) {
					let characterSlot = 0;
					if (itemSpell === Spell.MassHealing)
						partyToHeal.length = 0;
					else {
						dontMove.push(toHealMember);
						characterSlot = toUInt(this.currentBattle.GetSlotFromCharacter(toHealMember));
						removeItem(partyToHeal, toHealMember);
					}
					this.SetPlayerBattleAction(BattleActionType.CastSpell,
						Battle.CreateCastSpellParameter(characterSlot, itemSpell, toUInt(itemSlotIndex), itemIsEquipped));
					continue;
				}
			}

			//#endregion

			let hasAction = false;

			//#region Check magic

			if (ConditionExtensions.CanCastSpell(partyMember.Conditions, this.Features)) {
				let spell = Spell.None;
				let spellTarget = null;

				const CanCast = spell => partyMember.HasSpell(spell) && partyMember.SpellPoints.CurrentValue >= this.spellInfos.get(spell).SP;
				const IsImmuneTo = (monster, spell) =>
					(monster.SpellTypeImmunity & this.spellInfos.get(spell).SpellType) !== 0
					|| monster.IsImmuneToSpell(spell, hasFlag(this.Features, Features.Elements))[0];

				//#region Mystic / Ranger

				if (partyMember.Class === Class.Mystic || partyMember.Class === Class.Ranger) {
					if (partyMember.InventoryInaccessible) {
						// imitated monster -> use all we have starting with most powerful
						for (const myspell of orderBy(partyMember.LearnedSpells, [a => this.SpellInfos.get(a).SP, true])) {
							const spellInfo = this.SpellInfos.get(myspell);
							if (!hasFlag(spellInfo.ApplicationArea, SpellApplicationArea.Battle)
								|| partyMember.SpellPoints.CurrentValue < spellInfo.SP)
								continue;

							if (spellInfo.Target === SpellTarget.AllEnemies && threats.length > 1) {
								spell = myspell;
								break;
							} else if (spellInfo.Target === SpellTarget.EnemyRow && threats.length > 1) {
								const rows = newArray(4, 0); // count enemies in rows
								for (const threat of threats.filter(a => !IsImmuneTo(a.Monster, myspell)))
									rows[Math.trunc(threat.Position / 6)]++;
								let best = 0;
								for (let i = 1; i < 4; i++)
									if (rows[i] > rows[best])
										best = i;
								if (rows[best] > 1) {
									spell = myspell;
									this.SetPlayerBattleAction(BattleActionType.CastSpell,
										Battle.CreateCastSpellParameter(best, spell));
									hasAction = true;
									break;
								}
							} else if (spellInfo.Target === SpellTarget.SingleEnemy) {
								const target = firstOrDefault(orderBy(threats, [a => a.PhysicalThreat + a.MagicThreat, true], a => a.Health).filter(a => !IsImmuneTo(a.Monster, myspell)));
								if (target != null) {
									spell = myspell;
									spellTarget = target.Monster;
									break;
								}
							}
						}
					}
				}

				//#endregion

				const CheckLastRoundSpell = () => {
					const lastRoundSpell = this.currentBattle.GetLastRoundSpell(slot);

					if (lastRoundSpell !== UIntMaxValue) {
						const lastSpell = Battle.GetCastSpell(lastRoundSpell);

						if (lastSpell === Spell.None) {
							this.currentBattle.RemoveLastRoundSpell(slot);
							return false;
						}

						const lastSpellInfo = this.spellInfos.get(lastSpell);

						if (lastSpellInfo.SP <= partyMember.SpellPoints.CurrentValue) {
							if (lastSpellInfo.Target === SpellTarget.SingleEnemy) {
								const lastSpellTargetTile = Battle.GetTargetTileOrRowFromParameter(lastRoundSpell);
								const monster = this.currentBattle.GetCharacterAt(lastSpellTargetTile);

								if (monster instanceof Monster && !IsImmuneTo(monster, lastSpell)) {
									spell = lastSpell;
									spellTarget = monster;
									return true;
								}
							} else if (lastSpellInfo.Target === SpellTarget.EnemyRow) {
								const lastSpellTargetRow = Battle.GetTargetTileOrRowFromParameter(lastRoundSpell);
								const hasThreatsInRow = threats.some(threat => Math.trunc(threat.Position / 6) === lastSpellTargetRow && !IsImmuneTo(threat.Monster, lastSpell));

								if (hasThreatsInRow) {
									this.SetPlayerBattleAction(BattleActionType.CastSpell,
										Battle.CreateCastSpellParameter(lastSpellTargetRow, lastSpell));
									hasAction = true;
									return true;
								}
							} else if (lastSpellInfo.Target === SpellTarget.AllEnemies) {
								spell = lastSpell;
								return true;
							}
						}

						this.currentBattle.RemoveLastRoundSpell(slot);
					}

					return false;
				};

				//#region Alchemist

				if (partyMember.Class === Class.Alchemist)
					CheckLastRoundSpell();

				//#endregion

				//#region Mage

				if (partyMember.Class === Class.Mage) {
					if (!CheckLastRoundSpell()) {
						const CanCause = (target, spell, effect) =>
							CanCast(spell) && !IsImmuneTo(target.Monster, spell) && !hasFlag(target.Monster.Conditions, effect);
						const ece = hasFlag(this.Features, Features.ExtendedCurseEffects);
						for (const threat of orderBy(threats, [a => a.PhysicalThreat + a.MagicThreat, true], [a => a.Health, true], a => a.Position)) {
							if (threat.Health < Math.trunc(threat.Monster.HitPoints.TotalMaxValue / 2)
								|| threat.Monster.Attributes[Attribute.AntiMagic].TotalCurrentValue >= 75)
								continue;
							const isPhysicalThread = threat.PhysicalThreat >= Math.trunc(partyMaxHealth / 12);
							const isMagicThread = threat.MagicThreat >= Math.trunc(partyMaxHealth / 12);
							if (!isPhysicalThread && !isMagicThread)
								continue; // do not waste magic on too weak enemies

							if (threats.length > 1 && threat.Position < 12 // cast sleep only at back rows as front is attacked
								&& isPhysicalThread && (isMagicThread || threat.Monster.Skills[Skill.CriticalHit].TotalCurrentValue > 0)
								&& CanCause(threat, Spell.Sleep, Condition.Sleep)) { // no action
								spell = Spell.Sleep;
								threat.MagicThreat = threat.PhysicalThreat = 1;
								spellTarget = threat.Monster;
								break;
							} else if (threat.MagicThreat >= threat.PhysicalThreat
								&& CanCause(threat, Spell.Irritate, Condition.Irritated)) { // no magic
								spell = Spell.Irritate;
								threat.MagicThreat = 0;
								spellTarget = threat.Monster;
								break;
							} else if (threat.MagicThreat >= threat.PhysicalThreat
								&& CanCause(threat, Spell.CauseMadness, Condition.Crazy)) { // no magic, random move/attack
								spell = Spell.CauseMadness;
								threat.MagicThreat = 0;
								threat.PhysicalThreat = Math.trunc(threat.PhysicalThreat / 2);
								break;
							} else if (isPhysicalThread && CanCause(threat, Spell.Lame, Condition.Lamed)) { // no attack
								spell = Spell.Lame;
								threat.PhysicalThreat = 0;
								spellTarget = threat.Monster;
								break;
							} else if (isPhysicalThread && ece && CanCause(threat, Spell.Blind, Condition.Blind)) { // attack fails
								spell = Spell.Blind;
								threat.PhysicalThreat = Math.trunc(threat.PhysicalThreat / 2);
								spellTarget = threat.Monster;
								break;
							} else if (isPhysicalThread && ece && CanCause(threat, Spell.CauseAging, Condition.Aging) // -10..-50% attacks & damage
								&& !hasFlag(threat.Monster.Conditions, Condition.Blind) && threat.Monster.HitPoints.CurrentValue > Math.trunc(threat.Monster.HitPoints.MaxValue * 9 / 10)) {
								spell = Spell.CauseAging;
								threat.PhysicalThreat = Math.trunc(threat.PhysicalThreat * 9 / 10);
								spellTarget = threat.Monster;
								break;
							} else if (isPhysicalThread && ece && CanCause(threat, Spell.CauseDisease, Condition.Diseased) // -50% damage
								&& !hasFlag(threat.Monster.Conditions, Condition.Aging)) {
								spell = Spell.CauseDisease;
								threat.PhysicalThreat = Math.trunc(threat.PhysicalThreat / 2);
								spellTarget = threat.Monster;
								break;
							}
							// retry sleep if no irritate, mad, lame, blind, disease or aging and threat is healthy
							else if (threats.length > 1 && (threat.Position < 12 || (threat.Position < 18 && threat.Monster.HitPoints.CurrentValue > Math.trunc(threat.Monster.HitPoints.MaxValue * 9 / 10)))
								&& CanCause(threat, Spell.Sleep, Condition.Sleep) && threats.length > 1) {
								spell = Spell.Sleep;
								threat.MagicThreat = threat.PhysicalThreat = 1;
								spellTarget = threat.Monster;
								break;
							}
						}
					}
				}

				//#endregion

				//#region Healer / Paladin

				if ((partyMember.Class === Class.Healer || partyMember.Class === Class.Paladin)) {
					if (partyToHeal.length > 0) {
						// check healing first
						const lowFrac = Math.trunc(partyToHeal[0].HitPoints.CurrentValue * 100 / partyToHeal[0].HitPoints.TotalMaxValue);
						if (lowFrac <= 30 && CanCast(Spell.MassHealing) && [...this.PartyMembers].every(a => a.HitPoints.CurrentValue < Math.trunc(a.HitPoints.TotalMaxValue * 3 / 4))) {
							spell = Spell.MassHealing;
							partyToHeal.length = 0;
						} else {
							const greatHeal = CanCast(Spell.GreatHealing);
							const mediumHeal = CanCast(Spell.MediumHealing);
							const smallHeal = CanCast(Spell.SmallHealing);
							const handHeal = CanCast(Spell.HealingHand);
							if (lowFrac <= 15 && greatHeal)
								spell = Spell.GreatHealing;
							else if (lowFrac <= 25 && (mediumHeal || greatHeal))
								spell = mediumHeal ? Spell.MediumHealing : Spell.GreatHealing;
							else if (lowFrac <= 35 && (smallHeal || mediumHeal))
								spell = smallHeal ? Spell.SmallHealing : Spell.MediumHealing;
							else if (lowFrac <= 50 && (handHeal || smallHeal))
								spell = handHeal ? Spell.HealingHand : Spell.SmallHealing;
							if (spell !== Spell.None) {
								spellTarget = partyToHeal[0];
								dontMove.push(partyToHeal[0]);
								partyToHeal.splice(0, 1);
							}
						}
					}

					if (spell === Spell.None && partyConditions !== Condition.None) {
						const Cure = (cond, spellOne, spellAll) => {
							if (!hasFlag(partyConditions, cond))
								return false;

							const canOne = CanCast(spellOne);
							const canAll = CanCast(spellAll);

							if (!canOne && !canAll)
								return false;

							const toCure = [...this.PartyMembers].filter(a => hasFlag(a.Conditions, cond));

							if (toCure.length === 1 || !canAll) {
								for (const target of toCure) {
									if (!hasMoved.includes(target)) {
										spell = spellOne;
										spellTarget = target;
										dontMove.push(target);
										break;
									}
								}
							} else {
								spell = spellAll;
							}

							partyConditions &= ~cond;

							return true;
						};

						if (!Cure(Condition.Panic, Spell.RemoveFear, Spell.RemovePanic))
							if (!Cure(Condition.Lamed, Spell.RemoveRigidness, Spell.RemoveLamedness))
								if (!Cure(Condition.Blind, Spell.RemoveShadows, Spell.RemoveBlindness))
									if (partyMember.Class !== Class.Paladin) // prefer paladin to attack
										if (!Cure(Condition.Sleep, Spell.WakeUp, Spell.None))
											if (!Cure(Condition.Irritated, Spell.RemoveIrritation, Spell.None))
												if (!Cure(Condition.Poisoned, Spell.RemovePoison, Spell.NeutralizePoison))
													Cure(Condition.Diseased, Spell.RemovePain, Spell.RemoveDisease);
					}

					if (spell !== Spell.None)
						partyEmptyHealer = partyEmptyHealer || (toUInt(partyMember.SpellPoints.CurrentValue - this.SpellInfos.get(spell).SP) < this.SpellInfos.get(Spell.SmallHealing).SP);
				}

				//#endregion

				if (spell !== Spell.None) {
					if (!hasAction) {
						this.SetPlayerBattleAction(BattleActionType.CastSpell,
							Battle.CreateCastSpellParameter(spellTarget != null ? toUInt(this.currentBattle.GetSlotFromCharacter(spellTarget)) : 0, spell));
					}

					continue;
				}
			} else {
				this.currentBattle.RemoveLastRoundSpell(slot);
			}

			//#endregion

			//#region Attack

			const position = this.currentBattle.GetSlotFromCharacter(partyMember);
			const [canAttack, ranged] = this.CheckAbilityToAttack(true);

			if (canAttack) {
				for (const threat of orderBy(threats, [a => a.PhysicalThreat + a.MagicThreat, true], a => a.Health, [a => a.Position, true])) {
					if ((ranged || (Math.abs(threat.Position % 6 - position % 6) <= 1 && Math.abs(Math.trunc(threat.Position / 6) - Math.trunc(position / 6)) <= 1))
						&& !this.currentBattle.ImmuneToAttack(threat.Monster, partyMember)) {
						hasAction = true;
						this.SetPlayerBattleAction(BattleActionType.Attack, Battle.CreateAttackParameter(toUInt(threat.Position)));
						if (threat.Sleeping) // wake up
							[threat.PhysicalThreat, threat.MagicThreat] = this.currentBattle.CalculateAutoBattleInfo(threat.Monster, true);
						threat.Health = toUInt(threat.Health - Math.max(0, partyMember.BaseAttackDamage + partyMember.BonusAttackDamage - threat.Monster.BaseDefense - threat.Monster.BonusDefense));
						break;
					}
				}
			}

			this.currentPickingActionMember = partyMember; // set again as may changed by CheckAbilityToAttack

			//#endregion

			//#region Move to next enemy

			if (!hasAction && !ranged && ConditionExtensions.CanMove(partyMember.Conditions) && !dontMove.includes(partyMember)) {
				for (const threat of orderBy(threats, [a => a.PhysicalThreat + a.MagicThreat, true], a => Math.abs(a.Position % 6 - position % 6), [a => a.Health, true])) {
					if (threat.Position < 12)
						continue;

					const IsFree = pos => this.currentBattle.IsBattleFieldEmpty(pos) && !this.AnyPlayerMovesTo(pos);
					const threatCol = threat.Position % 6;
					const threatRow = Math.trunc(threat.Position / 6);
					const fromCol = position % 6;
					const maxDist = 1 + Math.trunc(partyMember.Attributes[Attribute.Speed].TotalCurrentValue / 80);
					const step = threatCol < fromCol ? -1 : 1;
					let newPosition = -1;
					if (fromCol === threatCol) {
						if (IsFree(18 + threatCol))
							newPosition = 18 + threatCol;
						else if (threatCol > 0 && threatCol <= 2 && IsFree(18 + threatCol - 1))
							newPosition = 18 + threatCol - 1;
						else if (threatCol < 5 && IsFree(18 + threatCol + 1))
							newPosition = 18 + threatCol + 1;
						else if (threatCol > 2 && IsFree(18 + threatCol - 1))
							newPosition = 18 + threatCol - 1;
					} else if (fromCol + step === threatCol && IsFree(18 + fromCol))
						newPosition = 18 + fromCol;
					else if (threatRow === 3 || IsFree(18 + threatCol)
						|| (threatCol !== 0 && IsFree(18 + threatCol - 1))
						|| (threatCol !== 5 && IsFree(18 + threatCol + 1))) {
						for (let toCol = step < 0 ? Math.max(Math.max(0, threatCol - 1), fromCol - maxDist) : Math.min(Math.min(5, threatCol + 1), fromCol + maxDist); toCol !== fromCol; toCol -= step) {
							if (IsFree(18 + toCol)) {
								newPosition = 18 + toCol;
								break;
							} else if (IsFree(24 + toCol) && (threatRow === 3 || (!(toCol === threatCol && IsFree(18 + toCol - step)) && !(toCol - step === threatCol)))) {
								newPosition = 24 + toCol;
								break;
							}
						}
					}
					if (newPosition !== -1) {
						hasAction = true;
						this.SetPlayerBattleAction(BattleActionType.Move, Battle.CreateMoveParameter(toUInt(newPosition)));
						hasMoved.push(partyMember);
						removeItem(partyToHeal, partyMember); // can not heal moved party member
						break;
					}
				}
			}

			//#endregion

			//#region Nothing to do -> parry

			if (!hasAction && ConditionExtensions.CanParry(partyMember.Conditions)) {
				this.SetPlayerBattleAction(BattleActionType.Parry);
			}

			//#endregion
		}

		this.ExecuteNextUpdateCycle(() => this.StartBattleRound(false));
	}
}
