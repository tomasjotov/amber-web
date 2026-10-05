// Port of Ambermoon.Core/Game/BattleHandling.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import {
	Event, hasFlag, newArray, getValue, tryGetValue, toDictionary, sum, count, range, repeat, format, toByte, toUInt,
	round, idiv, ArgumentException
} from '../../../runtime.js';
import { Battle, BattleActionExtensions, CharacterBattleExtensions } from '../Battle.js';
import { Chest, ChestType } from '../../Ambermoon.Data.Common/Chest.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { Monster } from '../../Ambermoon.Data.Common/Monster.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { ItemType } from '../../Ambermoon.Data.Common/Enumerations/ItemType.js';
import { EquipmentSlot } from '../../Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { Condition, ConditionExtensions } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { SpellTarget, SpellApplicationArea, SpellInfos } from '../../Ambermoon.Data.Common/SpellInfo.js';
import { World } from '../../Ambermoon.Data.Common/Enumerations/World.js';
import { Song } from '../../Ambermoon.Data.Common/Enumerations/Song.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Class } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { MonsterAnimationType } from '../../Ambermoon.Data.Common/Enumerations/MonsterAnimationType.js';
import { ActiveSpellType, ActiveSpellTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { Color } from '../Render/Color.js';
import { Layer } from '../Render/Layer.js';
import { Graphics } from '../Render/Graphics.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Layout, LayoutType, BattleFieldSlotColor } from '../UI/Layout.js';
import { Window, WindowInfo } from '../UI/Window.js';
import { Global } from '../UI/Global.js';
import { Button } from '../UI/Button.js';
import { MouseButtons } from '../MouseButtons.js';
import { EventExtensions } from '../EventExtensions.js';
import { EventTrigger } from '../MapExtensions.js';
import { TimeExtensions } from '../Time.js';

export const PlayerBattleAction = Object.freeze({
	/// <summary>
	/// This is the initial action in each round.
	/// The player can select the active party member.
	/// He also can select actions.
	/// </summary>
	PickPlayerAction: 0,
	PickEnemySpellTarget: 1,
	PickEnemySpellTargetRow: 2,
	PickEnemySpellTargetRowInRange: 3,
	PickFriendSpellTarget: 4,
	PickMoveSpot: 5,
	PickAttackSpot: 6,
	PickMemberToBlink: 7,
	PickBlinkTarget: 8
});

export class BattleEndInfo {
	constructor() {
		/// <summary>
		/// If true all monsters were defeated or did flee.
		/// If false all party members fled.
		/// If all party members died the game is just over
		/// and this event is not used anymore.
		/// </summary>
		this.MonstersDefeated = false;
		/// <summary>
		/// If all monsters were defeated this list contains
		/// the monsters who died.
		/// </summary>
		this.KilledMonsters = [];
		/// <summary>
		/// Total experience for the party.
		/// </summary>
		this.TotalExperience = 0;
		/// <summary>
		/// Partymembers who fled.
		/// </summary>
		this.FledPartyMembers = [];
		/// <summary>
		/// List of broken items (objects { Key: itemIndex, Value: ItemSlotFlags }).
		/// </summary>
		this.BrokenItems = [];
	}
}

export class BattleInfo {
	constructor() {
		this.MonsterGroupIndex = 0;
		this.BattleEnded = new Event();
	}

	EndBattle(battleEndInfo) { this.BattleEnded.invoke(battleEndInfo); }
}

/** GameCore static members (GameCore is not imported by part files) */
const GameCoreOf = game => game.constructor;

// partial class GameCore
export class GameCore_BattleHandling {
	static PlayerBattleAction = PlayerBattleAction;
	static BattleEndInfo = BattleEndInfo;
	static BattleInfo = BattleInfo;

	static initFields(self) {
		const maxPartyMembers = GameCoreOf(self).MaxPartyMembers;
		self.currentBattleInfo = null;
		self.currentBattle = null;
		self.battlePositionClickHandler = null;
		self.battlePositionDragHandler = null;
		self.battlePositionDragging = false;
		self.partyMemberBattleFieldSprites = newArray(maxPartyMembers);
		self.highlightBattleFieldSprites = [];
		self.partyMemberBattleFieldTooltips = newArray(maxPartyMembers);
		self.currentPlayerBattleAction = PlayerBattleAction.PickPlayerAction;
		self.roundPlayerBattleActions = new Map();
		// Note: battleRoundActiveSprite (sword and mace) is assigned in the GameCore constructor.
	}

	get BattleActive() { return this.currentBattle != null; }
	get BattleRoundActive() { return this.currentBattle?.RoundActive === true; }
	get PlayerIsPickingABattleAction() { return this.BattleActive && !this.BattleRoundActive && this.currentPlayerBattleAction !== PlayerBattleAction.PickPlayerAction; }
	get BattleTimeFactor() {
		return this.currentBattle != null && this.CoreConfiguration.BattleSpeed !== 0 && this.currentWindow.Window === Window.Battle
			? 1.0 + this.CoreConfiguration.BattleSpeed / 33.0 : 1.0;
	}

	/**
	 * Overloads:
	 * - StartBattle(battleEvent, nextEvent, x, y, combatBackgroundIndex = null) (internal)
	 * - StartBattle(monsterGroupIndex) -> bool (public, used by external triggers like a cheat engine)
	 * - StartBattle(monsterGroupIndex, failedEscape, x, y, battleEndHandler, combatBackgroundIndex = null) (internal)
	 */
	StartBattle(...args) {
		if (args.length === 1) {
			/// This is used by external triggers like a cheat engine.
			///
			/// Returns false if the current game state does not allow
			/// to start a fight.
			const [monsterGroupIndex] = args;

			if (this.WindowActive || this.BattleActive || this.layout.PopupActive ||
				this.allInputDisabled || !this.inputEnable || !this.Ingame)
				return false;

			let combatBackgroundIndex = null;

			if (!this.Is3D) {
				const tile = this.renderMap2D.get(this.player.Position);

				if (tile != null) {
					const tileset = this.MapManager.GetTilesetForMap(this.Map);

					if (tile.FrontTileIndex !== 0) {
						const frontTile = tileset.Tiles[tile.FrontTileIndex - 1];

						if (frontTile.UseBackgroundTileFlags)
							combatBackgroundIndex = tileset.Tiles[tile.BackTileIndex - 1].CombatBackgroundIndex;
						else
							combatBackgroundIndex = frontTile.CombatBackgroundIndex;
					} else if (tile.BackTileIndex !== 0)
						combatBackgroundIndex = tileset.Tiles[tile.BackTileIndex - 1].CombatBackgroundIndex;
				}
			}

			this.StartBattle(monsterGroupIndex, false, toUInt(this.player.Position.X), toUInt(this.player.Position.Y), null, combatBackgroundIndex);
			return true;
		}

		if (typeof args[0] === 'number') {
			/// Starts a battle with the given monster group index.
			/// It is used for monsters that are present on the map.
			const [monsterGroupIndex, failedEscape, x, y, battleEndHandler, combatBackgroundIndex = null] = args;

			if (this.BattleActive)
				return;

			this.currentBattleInfo = new BattleInfo();
			this.currentBattleInfo.MonsterGroupIndex = monsterGroupIndex;

			if (battleEndHandler != null)
				this.currentBattleInfo.BattleEnded.add(battleEndHandler);

			this.ShowBattleWindow(null, failedEscape, x, y, combatBackgroundIndex);
			return;
		}

		const [battleEvent, nextEvent, x, y, combatBackgroundIndex = null] = args;

		if (this.BattleActive)
			return;

		this.ResetMoveKeys();

		this.currentBattleInfo = new BattleInfo();
		this.currentBattleInfo.MonsterGroupIndex = battleEvent.MonsterGroupIndex;
		this.ShowBattleWindow(nextEvent, false, x, y, combatBackgroundIndex);
	}

	GetCombatBackgroundIndex(map, x, y) {
		return this.is3D
			? this.renderMap3D.CombatBackgroundIndex
			: this.renderMap2D.GetCombatBackgroundIndex(map, x, y);
	}

	UpdateBattle(blinkingTimeFactor) {
		if (this.partyAdvances) {
			for (const monster of this.currentBattle.Monsters)
				this.layout.GetMonsterBattleAnimation(monster).Update(this.CurrentBattleTicks);
		} else {
			this.currentBattle.Update(this.CurrentBattleTicks, this.CurrentNormalizedBattleTicks);
		}

		if (this.highlightBattleFieldSprites.length !== 0) {
			const TicksPerSecond = GameCoreOf(this).TicksPerSecond;
			const ticks = round(this.CurrentBattleTicks * blinkingTimeFactor);
			const showBlinkingSprites = !this.blinkingHighlight || (ticks % Math.trunc(2 * TicksPerSecond / 3)) < Math.trunc(TicksPerSecond / 3);

			for (const blinkingBattleFieldSprite of this.highlightBattleFieldSprites) {
				blinkingBattleFieldSprite.Visible = showBlinkingSprites;
			}
		}
	}

	/**
	 * Overloads:
	 * - ShowBattleLoot(battleEndInfo, closeAction) (internal)
	 * - ShowBattleLoot(storage, expReceivingPartyMembers, expPerPartyMember, fade = true) (private)
	 */
	ShowBattleLoot(...args) {
		if (args.length <= 2) {
			const [battleEndInfo, closeAction] = args;
			const gold = sum(battleEndInfo.KilledMonsters, m => m.Gold);
			const food = sum(battleEndInfo.KilledMonsters, m => m.Food);
			const loot = new Chest();
			loot.Type = ChestType.Junk;
			loot.Gold = gold;
			loot.Food = food;
			loot.AllowsItemDrop = false;
			loot.IsBattleLoot = true;
			for (let r = 0; r < 4; ++r) {
				for (let c = 0; c < 6; ++c) {
					const itemSlot = new ItemSlot();
					itemSlot.ItemIndex = 0;
					itemSlot.Amount = 0;
					loot.Slots[c][r] = itemSlot;
				}
			}
			const slots = loot.Slots.flat();
			for (const item of battleEndInfo.KilledMonsters
				.flatMap(m => [...m.Inventory.Slots, ...m.Equipment.Slots.values()]
					.filter(slot => slot != null && !slot.Empty))) {
				const stackable = hasFlag(this.ItemManager.GetItem(item.ItemIndex).Flags, ItemFlags.Stackable);

				while (item.Amount > 0) {
					let slot = null;

					if (stackable)
						slot = slots.find(s => s.ItemIndex === item.ItemIndex && s.Amount < 99) ?? null;

					slot ??= slots.find(s => s.Empty) ?? null;

					if (slot == null) // doesn't fit
						break;

					slot.Add(item);
				}
			}
			for (const brokenItem of battleEndInfo.BrokenItems) {
				const slot = slots.find(s => s.Empty) ?? null;

				if (slot == null) // doesn't fit
					break;

				slot.ItemIndex = brokenItem.Key;
				slot.Amount = 1;
				slot.Flags = brokenItem.Value | ItemSlotFlags.Broken;
			}
			const expReceivingPartyMembers = [...this.PartyMembers].filter(m => m.Alive && !battleEndInfo.FledPartyMembers.includes(m) && m.Race <= Race.Thalionic);
			const expPerPartyMember = expReceivingPartyMembers.length === 0 ? 0 : Math.trunc(battleEndInfo.TotalExperience / expReceivingPartyMembers.length);

			if (loot.Empty) {
				this.Pause();
				const Finish = () => {
					this.Resume();
					closeAction?.();
				};
				this.CloseWindow(() => {
					if (expReceivingPartyMembers.length === 0) {
						Finish();
					} else {
						this.ShowMessagePopup(format(this.DataNameProvider.ReceiveExp, expPerPartyMember), () => {
							this.Pause();
							this.AddExperience(expReceivingPartyMembers, toUInt(expPerPartyMember), Finish);
						});
					}
				});
			} else {
				this.Fade(() => {
					this.InputEnable = true;
					this.SetWindow(Window.BattleLoot, loot, closeAction);
					this.LastWindow = new WindowInfo(); // C# DefaultWindow (static, not an instance member)
					this.ShowBattleLoot(loot, expReceivingPartyMembers, expPerPartyMember, false);
				});
			}
			return;
		}

		const [storage, expReceivingPartyMembers, expPerPartyMember, fade = true] = args;

		const Show = () => {
			this.InputEnable = true;
			this.layout.Reset();
			this.ShowLoot(storage, expReceivingPartyMembers == null || expReceivingPartyMembers.length === 0 ? null : format(this.DataNameProvider.ReceiveExp, expPerPartyMember), () => {
				if (expReceivingPartyMembers != null) {
					if (expReceivingPartyMembers.length > 0) {
						this.AddExperience(expReceivingPartyMembers, toUInt(expPerPartyMember), () => {
							this.layout.ShowChestMessage(this.DataNameProvider.LootAfterBattle, TextAlign.Left);
						});
					} else {
						this.layout.ShowChestMessage(this.DataNameProvider.LootAfterBattle, TextAlign.Left);
					}
				}
			});
		};

		if (fade)
			this.Fade(Show);
		else
			Show();
	}

	static GetDisabledStatusGraphic(partyMember) {
		if (!partyMember.Alive)
			return UIGraphic.StatusDead;
		else if (hasFlag(partyMember.Conditions, Condition.Petrified))
			return UIGraphic.StatusPetrified;
		else if (hasFlag(partyMember.Conditions, Condition.Sleep))
			return UIGraphic.StatusSleep;
		else if (hasFlag(partyMember.Conditions, Condition.Panic))
			return UIGraphic.StatusPanic;
		else if (hasFlag(partyMember.Conditions, Condition.Crazy))
			return UIGraphic.StatusCrazy;
		else
			throw new AmbermoonException(ExceptionScope.Application, `Party member ${partyMember.Name} is not disabled.`);
	}

	/**
	 * Overloads:
	 * - UpdateBattleStatus(partyMember) (internal)
	 * - UpdateBattleStatus(slot)
	 * - UpdateBattleStatus(slot, partyMember)
	 * - UpdateBattleStatus()
	 */
	UpdateBattleStatus(slot, partyMember) {
		if (arguments.length === 0) {
			for (let i = 0; i < GameCoreOf(this).MaxPartyMembers; ++i) {
				this.UpdateBattleStatus(i);
			}

			this.layout.UpdateCharacterNameColors(this.CurrentSavegame.ActivePartyMemberSlot);
			return;
		}

		if (arguments.length === 1) {
			if (typeof slot === 'number')
				this.UpdateBattleStatus(slot, this.GetPartyMember(slot));
			else
				this.UpdateBattleStatus(this.SlotFromPartyMember(slot), slot);
			return;
		}

		if (partyMember == null) {
			this.layout.UpdateCharacterStatus(slot, null);
			this.roundPlayerBattleActions.delete(slot);
		} else if (!ConditionExtensions.CanSelect(partyMember.Conditions)) {
			// Note: Disabled players will show the status icon next to
			// their portraits instead of an action icon. For mad players
			// when the battle starts the action icon will be shown instead.
			this.layout.UpdateCharacterStatus(slot, GameCore_BattleHandling.GetDisabledStatusGraphic(partyMember));
			this.roundPlayerBattleActions.delete(slot);
			if (this.partyMemberBattleFieldTooltips[slot] != null)
				this.partyMemberBattleFieldTooltips[slot].TextColor = TextColor.DeadPartyMember;
		} else if (this.roundPlayerBattleActions.has(slot)) {
			const action = this.roundPlayerBattleActions.get(slot);
			this.layout.UpdateCharacterStatus(slot, BattleActionExtensions.ToStatusGraphic(action.BattleAction, action.Parameter, this.ItemManager));
			if (this.partyMemberBattleFieldTooltips[slot] != null)
				this.partyMemberBattleFieldTooltips[slot].TextColor = TextColor.White;
		} else {
			this.layout.UpdateCharacterStatus(slot, null);
			if (this.partyMemberBattleFieldTooltips[slot] != null)
				this.partyMemberBattleFieldTooltips[slot].TextColor = TextColor.White;
		}
	}

	BattlePositionWindowClick(position, mouseButtons) {
		return this.battlePositionClickHandler?.(position, mouseButtons) ?? false;
	}

	BattlePositionWindowDrag(position) {
		this.battlePositionDragHandler?.(position);
	}

	ShowBattlePositionWindow() {
		this.Fade(() => {
			this.SetWindow(Window.BattlePositions);
			this.layout.SetLayout(LayoutType.BattlePositions);
			this.ShowMap(false);
			this.layout.Reset();

			// Upper box
			const backgroundColor = this.GetUIColor(25);
			const upperBoxBounds = new Rect(14, 43, 290, 80);
			this.layout.FillArea(upperBoxBounds, this.GetUIColor(28), 0);
			const positionBoxes = newArray(12);
			const paletteIndex = this.UIPaletteIndex;
			const portraits = toDictionary(this.PartyMembers, p => this.SlotFromPartyMember(p),
				p => this.layout.AddSprite(new Rect(0, 0, 32, 34), Graphics.PortraitOffset + p.PortraitIndex - 1, paletteIndex, 5, p.Name, TextColor.White));
			const portraitBackgrounds = toDictionary(this.PartyMembers, p => this.SlotFromPartyMember(p), _ => null);
			const battlePositions = toDictionary([...this.CurrentSavegame.BattlePositions].map((p, i) => ({ p, i })).filter(p => this.GetPartyMember(p.i) != null), p => p.p, p => p.i);
			// Each box is 34x36 pixels in size (with border)
			// 43 pixels y-offset to second row
			// Between each box there is a x-offset of 48 pixels
			for (let r = 0; r < 2; ++r) {
				for (let c = 0; c < 6; ++c) {
					const index = c + r * 6;
					const area = positionBoxes[index] = new Rect(15 + c * 48, 44 + r * 43, 34, 36);
					this.layout.AddSunkenBox(area, 2);

					const [found, slot] = tryGetValue(battlePositions, index);
					if (found) {
						getValue(portraits, slot).X = area.Left + 1;
						getValue(portraits, slot).Y = area.Top + 1;
						getValue(portraitBackgrounds, slot)?.Destroy();
						portraitBackgrounds.set(slot, this.layout.FillArea(new Rect(area.Left + 1, area.Top + 1, 32, 34), backgroundColor, 4));
					}
				}
			}

			// Lower box
			const lowerBoxBounds = new Rect(16, 144, 176, 48);
			this.layout.FillArea(lowerBoxBounds, this.GetUIColor(28), 0);
			this.layout.AddText(lowerBoxBounds, this.DataNameProvider.ChooseBattlePositions);

			this.closeWindowHandler = _ => {
				this.battlePositionClickHandler = null;
				this.battlePositionDragHandler = null;
				this.battlePositionDragging = false;

				if (battlePositions.size !== count(this.PartyMembers))
					throw new AmbermoonException(ExceptionScope.Application, 'Invalid number of battle positions.');

				for (const [Key, Value] of battlePositions) {
					if (Value < 0 || Value >= GameCoreOf(this).MaxPartyMembers || this.GetPartyMember(Value) == null)
						throw new AmbermoonException(ExceptionScope.Application, `Invalid party member slot: ${Value}.`);
					if (Key < 0 || Key >= 12)
						throw new AmbermoonException(ExceptionScope.Application, `Invalid battle position for party member slot ${Value}: ${Key}`);
					this.CurrentSavegame.BattlePositions[Value] = toByte(Key);
				}
			};

			// Quick&dirty dragging logic
			let slotOfDraggedPartyMember = null;
			let dragSource = null;
			const Pickup = (position, trap = true, specificPartyMemberSlot = null) => {
				slotOfDraggedPartyMember = specificPartyMemberSlot ?? getValue(battlePositions, position);
				dragSource = position;
				this.battlePositionDragging = true;
				if (trap)
					this.TrapMouse(upperBoxBounds);
			};
			const Drop = (position, untrap = true) => {
				if (slotOfDraggedPartyMember != null) {
					const area = positionBoxes[position];
					const slot = slotOfDraggedPartyMember;
					const draggedPortrait = getValue(portraits, slot);
					draggedPortrait.DisplayLayer = 5;
					draggedPortrait.X = area.Left + 1;
					draggedPortrait.Y = area.Top + 1;
					getValue(portraitBackgrounds, slot)?.Destroy();
					portraitBackgrounds.set(slot, this.layout.FillArea(new Rect(area.Left + 1, area.Top + 1, 32, 34), backgroundColor, 4));
					slotOfDraggedPartyMember = null;
					dragSource = null;
					this.battlePositionDragging = false;
					if (untrap)
						this.UntrapMouse();
				}
			};
			const Drag = position => {
				if (slotOfDraggedPartyMember != null) {
					const slot = slotOfDraggedPartyMember;
					const draggedPortrait = getValue(portraits, slot);
					draggedPortrait.DisplayLayer = 7;
					draggedPortrait.X = position.X;
					draggedPortrait.Y = position.Y;
					getValue(portraitBackgrounds, slot)?.Destroy();
					portraitBackgrounds.set(slot, this.layout.FillArea(new Rect(position.X, position.Y, 32, 34), backgroundColor, 6));
				}
			};
			const Reset = position => {
				// Reset back to source
				// If there is already a party member, exchange instead
				if (getValue(battlePositions, dragSource) === slotOfDraggedPartyMember)
					Drop(dragSource);
				else {
					// Exchange portrait
					const index = dragSource;
					const temp = getValue(battlePositions, index);
					battlePositions.set(index, slotOfDraggedPartyMember);
					Drop(index, false);
					Pickup(index, false, temp);
					Drag(position);
				}
			};
			this.battlePositionClickHandler = (position, mouseButtons) => {
				if (mouseButtons === MouseButtons.Left) {
					for (let i = 0; i < positionBoxes.length; ++i) {
						if (positionBoxes[i].Contains(position)) {
							if (slotOfDraggedPartyMember == null) { // Not dragging
								if (battlePositions.has(i)) {
									// Drag portrait
									Pickup(i);
									Drag(position);
								}
							} else { // Dragging
								if (battlePositions.has(i)) {
									if (getValue(battlePositions, i) !== slotOfDraggedPartyMember) {
										// Exchange portrait
										const temp = getValue(battlePositions, i);
										battlePositions.set(i, slotOfDraggedPartyMember);
										if (dragSource !== i && getValue(battlePositions, dragSource) === slotOfDraggedPartyMember)
											battlePositions.delete(dragSource);
										Drop(i, false);
										Pickup(i, false, temp);
										Drag(position);
									} else {
										// Put back
										Drop(i);
									}
								} else {
									// Drop portrait
									battlePositions.set(i, slotOfDraggedPartyMember);
									if (getValue(battlePositions, dragSource) === slotOfDraggedPartyMember)
										battlePositions.delete(dragSource);
									Drop(i);
								}
							}

							return true;
						}
					}
				} else if (mouseButtons === MouseButtons.Right) {
					if (dragSource != null) {
						Reset(position);
						return true;
					}
				}

				return false;
			};
			this.battlePositionDragHandler = position => {
				Drag(position);
			};
		});
	}

	/**
	 * Overloads:
	 * - ShowBattleWindow(nextEvent, out paletteIndex, x, y, combatBackgroundIndex = null)
	 *   -> called as ShowBattleWindow(nextEvent, x, y, combatBackgroundIndex), returns [paletteIndex]
	 * - ShowBattleWindow(nextEvent, failedFlight, x, y, combatBackgroundIndex = null) (failedFlight is a boolean)
	 */
	ShowBattleWindow(nextEvent, ...args) {
		if (typeof args[0] === 'boolean') {
			const [failedFlight, x, y, combatBackgroundIndex = null] = args;
			this.allInputDisabled = true;

			this.Fade(() => {
				this.lastPlayedSong = this.PlayMusic(Song.SapphireFireballsOfPureLove);
				this.roundPlayerBattleActions.clear();
				const [paletteIndex] = this.ShowBattleWindow(nextEvent, x, y, combatBackgroundIndex);
				// Note: Create clones so we can change the values in battle for each monster.
				const monsterGroup = this.CloneMonsterGroup(this.CharacterManager.GetMonsterGroup(this.currentBattleInfo.MonsterGroupIndex));

				for (const monster of monsterGroup.Monsters.flat())
					GameCore_BattleHandling.InitializeMonster(this, monster);

				if (this.CharacterManager.MonsterGraphicAtlasProvider != null) {
					const atlas = this.CharacterManager.MonsterGraphicAtlasProvider(monsterGroup);
					TextureAtlasManager.Instance.SetAtlas(Layer.BattleMonsterRow, atlas);
					const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.BattleMonsterRow);
					this.renderView.GetLayer(Layer.BattleMonsterRow).Texture = textureAtlas.Texture;
				}

				const monsterBattleAnimations = new Map();
				// Add animated monster combat graphics and battle field sprites
				for (let row = 0; row < 3; ++row) {
					for (let column = 0; column < 6; ++column) {
						const monster = monsterGroup.Monsters[column][row];

						if (monster != null) {
							monsterBattleAnimations.set(column + row * 6,
								this.layout.AddMonsterCombatSprite(column, row, monster, 0, paletteIndex));
						}
					}
				}
				this.currentBattle = new Battle(this, this.layout, range(0, GameCoreOf(this).MaxPartyMembers).map(i => this.GetPartyMember(i)),
					monsterGroup, monsterBattleAnimations, this.CoreConfiguration.BattleSpeed === 0);

				for (const [Key, Value] of monsterBattleAnimations) {
					const monster = this.currentBattle.GetCharacterAt(Key);
					this.currentBattle.SetMonsterDisplayLayer(Value, monster instanceof Monster ? monster : null);
				}

				this.currentBattle.RoundFinished.add(() => {
					if (!this.allInputDisabled) // This is set in auto battle mode, otherwise a normal round was played, so re-show the text
						this.currentBattle.ShowAutoBattleRoundText(this.CoreConfiguration.AutoBattleRounds !== 0, this.CoreConfiguration.AutoBattleRounds);

					this.InputEnable = true;
					this.CursorType = CursorType.Sword;
					this.layout.ShowButtons(true);
					this.battleRoundActiveSprite.Visible = false;
					this.buttonGridBackground?.Destroy();
					this.buttonGridBackground = null;
					this.layout.EnableButton(4, this.currentBattle.CanPartyMoveForward);

					for (const [Key, Value] of this.roundPlayerBattleActions)
						this.CheckPlayerActionVisuals(this.GetPartyMember(Key), Value);
					this.layout.SetBattleFieldSlotColor(this.currentBattle.GetSlotFromCharacter(this.CurrentPartyMember), BattleFieldSlotColor.Yellow);
					this.layout.SetBattleMessage(null);
					const [recheck, gameOver] = this.RecheckActivePartyMember();
					if (recheck) {
						if (gameOver)
							return;
						this.BattlePlayerSwitched();
					} else
						this.AddCurrentPlayerActionVisuals();
					this.UpdateBattleStatus();
					if (this.currentBattle != null) {
						for (let i = 0; i < GameCoreOf(this).MaxPartyMembers; ++i) {
							if (this.partyMemberBattleFieldTooltips[i] != null) {
								const partyMember = this.GetPartyMember(i);
								const position = this.currentBattle.GetSlotFromCharacter(partyMember);
								this.partyMemberBattleFieldTooltips[i].Area = new Rect
								(
									Global.BattleFieldX + (position % 6) * Global.BattleFieldSlotWidth,
									Global.BattleFieldY + Math.trunc(position / 6) * Global.BattleFieldSlotHeight - 1,
									Global.BattleFieldSlotWidth,
									Global.BattleFieldSlotHeight + 1
								);
								this.partyMemberBattleFieldTooltips[i].Text =
									`${partyMember.HitPoints.CurrentValue}/${partyMember.HitPoints.TotalMaxValue}^${partyMember.Name}`;
							}
						}
						this.UpdateActiveBattleSpells();
					}
				});
				this.currentBattle.CharacterDied.add(character => {
					if (character instanceof PartyMember) {
						const partyMember = character;
						const slot = this.SlotFromPartyMember(partyMember);
						this.layout.SetCharacter(slot, partyMember);
						this.layout.UpdateCharacterStatus(slot, null);
						this.roundPlayerBattleActions.delete(slot);
					}
				});
				this.currentBattle.BattleEnded.add(battleEndInfo => {
					this.battleRoundActiveSprite.Visible = false;
					for (let i = 0; i < GameCoreOf(this).MaxPartyMembers; ++i) {
						if (this.GetPartyMember(i) != null)
							this.layout.UpdateCharacterStatus(i, null);
					}
					const EndBattle = () => {
						for (let i = 0; i < GameCoreOf(this).MaxPartyMembers; ++i) {
							const partyMember = this.GetPartyMember(i);

							if (partyMember != null)
								partyMember.Conditions = ConditionExtensions.WithoutBattleOnlyConditions(partyMember.Conditions);
						}
						this.roundPlayerBattleActions.clear();
						this.UpdateBattleStatus();
						if (this.lastPlayedSong != null) {
							const temp = this.lastPlayedSong; // preserve as window close will play the map song otherwise
							this.PlayMusic(this.lastPlayedSong);
							this.lastPlayedSong = temp;
						} else if (this.Map.UseTravelMusic)
							this.PlayMusic(TravelTypeExtensions.TravelSong(this.travelType));
						else
							this.PlayMusic(Song.Default);
						this.currentBattleInfo.EndBattle(battleEndInfo);
						this.currentBattleInfo = null;
					};
					if (battleEndInfo.MonstersDefeated) {
						this.currentBattle = null;
						EndBattle();
						this.ShowBattleLoot(battleEndInfo, () => {
							if (nextEvent != null) {
								EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Always,
									x, y, nextEvent, true);
							}
						});
					} else if ([...this.PartyMembers].some(p => p.Alive && ConditionExtensions.CanFight(p.Conditions))) {
						// There are fled survivors
						this.currentBattle = null;
						EndBattle();
						this.CloseWindow(() => {
							const Finish = () => {
								this.NewLeaderPicked.remove(NewLeaderPicked);
								this.InputEnable = true;
								this.allInputDisabled = false;
								if (nextEvent != null) {
									EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Always, x, y, nextEvent, false);
								}
							};

							const NewLeaderPicked = _ => {
								Finish();
							};

							this.NewLeaderPicked.add(NewLeaderPicked);
							this.allInputDisabled = false;
							this.RecheckActivePartyMember();

							if (!this.pickingNewLeader) {
								Finish();
							}
						});
					} else {
						this.currentBattleInfo = null;
						this.currentBattle = null;
						this.CloseWindow(() => {
							this.InputEnable = true;
							this.Hook_GameOver();
						});
					}
				});
				this.currentBattle.ActionCompleted.add(battleAction => {
					this.CursorType = CursorType.Click;

					if (battleAction.Character instanceof PartyMember &&
						(battleAction.Action === Battle.BattleActionType.Move ||
						battleAction.Action === Battle.BattleActionType.Flee ||
						battleAction.Action === Battle.BattleActionType.CastSpell))
						this.layout.UpdateCharacterStatus(this.SlotFromPartyMember(battleAction.Character), null);
				});
				this.currentBattle.PlayerWeaponBroke.add(partyMember => {
					// Note: no need to check action here as it only can break while attacking
					const slot = this.SlotFromPartyMember(partyMember);
					this.roundPlayerBattleActions.delete(slot);
					this.layout.UpdateCharacterStatus(slot, null);
				});
				this.currentBattle.PlayerLastAmmoUsed.add(partyMember => {
					// Note: no need to check action here as it only can happen while attacking
					const slot = this.SlotFromPartyMember(partyMember);
					this.roundPlayerBattleActions.delete(slot);
					this.layout.UpdateCharacterStatus(slot, null);
				});
				this.currentBattle.PlayerLostTarget.add(partyMember => {
					const slot = this.SlotFromPartyMember(partyMember);
					this.roundPlayerBattleActions.delete(slot);
					this.layout.UpdateCharacterStatus(slot, null);
				});
				this.BattlePlayerSwitched();
				this.currentBattle.ShowAutoBattleRoundText(this.CoreConfiguration.AutoBattleRounds !== 0, this.CoreConfiguration.AutoBattleRounds);

				if (failedFlight) {
					const ShowFailedFlightMessage = () => {
						this.currentBattle.StartAnimationFinished.remove(ShowFailedFlightMessage);
						this.SetBattleMessageWithClick(this.DataNameProvider.AttackEscapeFailedMessage, TextColor.BrightGray, () => this.StartBattleRound(true));
					};

					if (this.currentBattle.HasStartAnimation)
						this.currentBattle.StartAnimationFinished.add(ShowFailedFlightMessage);
					else
						ShowFailedFlightMessage();
				}
			}, false);
			return;
		}

		let [x, y, combatBackgroundIndex = null] = args;

		if (combatBackgroundIndex == null) {
			if (this.is3D)
				combatBackgroundIndex = this.renderMap3D.CombatBackgroundIndex;
			else {
				switch (this.Map.World) {
					case World.Lyramion: combatBackgroundIndex = 0; break;
					case World.ForestMoon: combatBackgroundIndex = 6; break;
					case World.Morag: combatBackgroundIndex = 4; break;
					default: combatBackgroundIndex = 0; break;
				}
			}
		}

		this.SetWindow(Window.Battle, nextEvent, x, y, combatBackgroundIndex);
		this.layout.SetLayout(LayoutType.Battle);
		this.ShowMap(false);
		this.layout.Reset();

		const advancedBackgrounds = hasFlag(this.Features, Features.AdvancedCombatBackgrounds);
		const combatBackground = this.is3D
			? this.renderView.GraphicInfoProvider.Get3DCombatBackground(combatBackgroundIndex, advancedBackgrounds)
			: this.renderView.GraphicInfoProvider.Get2DCombatBackground(combatBackgroundIndex, advancedBackgrounds);
		const paletteIndex = toByte(combatBackground.Palettes[TimeExtensions.CombatBackgroundPaletteIndex(this.GameTime)] - 1);
		this.layout.AddSprite(Global.CombatBackgroundArea, combatBackground.GraphicIndex - 1,
			paletteIndex, 1, null, null, Layer.CombatBackground);
		this.layout.FillArea(new Rect(0, 132, 320, 68), Color.Black, 0);
		this.layout.FillArea(new Rect(5, 139, 84, 56), this.GetUIColor(28), 1);

		if (this.currentBattle != null) {
			const monsterBattleAnimations = new Map();

			for (const monster of this.currentBattle.Monsters) {
				const slot = this.currentBattle.GetSlotFromCharacter(monster);
				if (monsterBattleAnimations.has(slot)) // Dictionary.Add
					throw new ArgumentException('An item with the same key has already been added.');
				monsterBattleAnimations.set(slot, this.layout.AddMonsterCombatSprite(slot % 6, Math.trunc(slot / 6), monster,
					this.currentBattle.GetMonsterDisplayLayer(monster, slot), paletteIndex));
			}

			this.currentBattle.SetMonsterAnimations(monsterBattleAnimations);
		}

		// Add battle field sprites for party members
		for (let i = 0; i < GameCoreOf(this).MaxPartyMembers; ++i) {
			const partyMember = this.GetPartyMember(i);

			if (partyMember == null || !partyMember.Alive || this.HasPartyMemberFled(partyMember)) {
				this.partyMemberBattleFieldSprites[i] = null;
				this.partyMemberBattleFieldTooltips[i] = null;
			} else {
				const battlePosition = this.currentBattle == null ? 18 + this.CurrentSavegame.BattlePositions[i] : this.currentBattle.GetSlotFromCharacter(partyMember);
				const battleColumn = battlePosition % 6;
				const battleRow = Math.trunc(battlePosition / 6);

				// C# AddSprite overload with out Tooltip (named AddSpriteWithTooltip in Layout.js)
				[this.partyMemberBattleFieldSprites[i], this.partyMemberBattleFieldTooltips[i]] = this.layout.AddSpriteWithTooltip(new Rect
				(
					Global.BattleFieldX + battleColumn * Global.BattleFieldSlotWidth,
					Global.BattleFieldY + battleRow * Global.BattleFieldSlotHeight - 1,
					Global.BattleFieldSlotWidth,
					Global.BattleFieldSlotHeight + 1
				), Graphics.BattleFieldIconOffset + partyMember.Class, this.PrimaryUIPaletteIndex, toByte(3 + battleRow),
				`${partyMember.HitPoints.CurrentValue}/${partyMember.HitPoints.TotalMaxValue}^${partyMember.Name}`,
				ConditionExtensions.CanSelect(partyMember.Conditions) ? TextColor.White : TextColor.DeadPartyMember, null);
			}
		}

		this.UpdateBattleStatus();
		this.UpdateActiveBattleSpells();

		this.SetupBattleButtons();

		this.currentBattle?.InitImitatingPlayers();

		return [paletteIndex];
	}

	ReplacePartyMemberBattleFieldSprite(partyMember, graphicIndex) {
		const index = [...this.PartyMembers].indexOf(partyMember);

		if (index !== -1) {
			const textureIndex = Graphics.BattleFieldIconOffset + Class.Monster + graphicIndex - 1;
			this.partyMemberBattleFieldSprites[index].TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(textureIndex);
		}
	}

	HideAutoBattleRounds() {
		this.currentBattle?.ShowAutoBattleRoundText(false, 0);
	}

	SetupBattleButtons() {
		// Flee button
		this.layout.AttachEventToButton(0, () => {
			this.SetCurrentPlayerBattleAction(Battle.BattleActionType.Flee);
		});
		// OK button
		this.layout.AttachEventToButton(2, () => {
			this.StartBattleRound(false);
		});
		// Move button
		this.layout.AttachEventToButton(3, () => {
			this.SetCurrentPlayerAction(PlayerBattleAction.PickMoveSpot);
		});
		// Move group forward button
		this.layout.AttachEventToButton(4, () => {
			this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessagePartyAdvances, TextColor.BrightGray, () => {
				this.InputEnable = false;
				this.currentBattle.WaitForClick = true;
				this.CursorType = CursorType.Click;
				this.allInputDisabled = true;
				this.AdvanceParty(() => {
					this.allInputDisabled = false;
					this.InputEnable = true;
					this.currentBattle.WaitForClick = false;
					this.CursorType = CursorType.Sword;
				});
			});
		});
		// Auto Battle button
		if (this.CoreConfiguration.AutoBattleRounds !== 0) {
			this.layout.AttachEventToButton(5, () => {
				this.AddAutoBattleActions(true);
			});
		}
		// Attack button
		this.layout.AttachEventToButton(6, () => {
			this.SetCurrentPlayerAction(PlayerBattleAction.PickAttackSpot);
		});
		// Parry button
		this.layout.AttachEventToButton(7, () => {
			this.SetCurrentPlayerBattleAction(Battle.BattleActionType.Parry);
		});
		// Use magic button
		this.layout.AttachEventToButton(8, () => {
			if (!this.CurrentPartyMember.HasAnySpell()) {
				this.ShowMessagePopup(this.DataNameProvider.YouDontKnowAnySpellsYet);
			} else {
				this.StartSequence();
				this.layout.HideTooltip();
				this.currentBattle.HideAllBattleFieldDamage();
				this.OpenSpellList(this.CurrentPartyMember,
					spell => {
						const spellInfo = this.SpellInfos.get(spell);

						if (!hasFlag(spellInfo.ApplicationArea, SpellApplicationArea.Battle))
							return this.DataNameProvider.WrongArea;

						const worldFlag = 1 << this.Map.World;

						if (!hasFlag(spellInfo.Worlds, worldFlag))
							return this.DataNameProvider.WrongWorld;

						if (SpellInfos.GetSPCost(this.SpellInfos, this.Features, spell, this.CurrentPartyMember) > this.CurrentPartyMember.SpellPoints.CurrentValue)
							return this.DataNameProvider.NotEnoughSP;

						// TODO: Is there more to check? Irritated?

						return null;
					},
					spell => this.PickBattleSpell(spell)
				);
				this.EndSequence();
			}
		});

		if (this.currentBattle != null)
			this.BattlePlayerSwitched();

		this.currentBattle?.ShowAutoBattleRoundText(this.CoreConfiguration.AutoBattleRounds !== 0, this.CoreConfiguration.AutoBattleRounds);
	}

	PickBattleSpell(spell, itemSlotIndex = null, itemIsEquipped = null, caster = null) {
		this.ExecuteNextUpdateCycle(() => {
			this.pickedSpell = spell;
			this.spellItemSlotIndex = itemSlotIndex;
			this.spellItemIsEquipped = itemIsEquipped;
			this.currentPickingActionMember = caster ?? this.CurrentPartyMember;
			this.SetPlayerBattleAction(Battle.BattleActionType.None);

			if (this.currentPickingActionMember === this.CurrentPartyMember) {
				this.highlightBattleFieldSprites.forEach(s => s?.Delete());
				this.highlightBattleFieldSprites.length = 0;
			}

			const spellInfo = this.SpellInfos.get(this.pickedSpell);

			switch (spellInfo.Target) {
				case SpellTarget.SingleEnemy:
					this.SetCurrentPlayerAction(PlayerBattleAction.PickEnemySpellTarget);
					break;
				case SpellTarget.SingleFriend:
					this.SetCurrentPlayerAction(PlayerBattleAction.PickFriendSpellTarget);
					break;
				case SpellTarget.EnemyRow:
					this.SetCurrentPlayerAction(PlayerBattleAction.PickEnemySpellTargetRow);
					break;
				case SpellTarget.EnemyRowInWeaponRange:
					this.SetCurrentPlayerAction(PlayerBattleAction.PickEnemySpellTargetRowInRange);
					break;
				case SpellTarget.BattleField:
					if (spell === Spell.Blink)
						this.SetCurrentPlayerAction(PlayerBattleAction.PickMemberToBlink);
					else
						throw new AmbermoonException(ExceptionScope.Data, 'Only the Blink spell should have target type BattleField.');
					break;
				default:
					this.SetPlayerBattleAction(Battle.BattleActionType.CastSpell,
						Battle.CreateCastSpellParameter(0, this.pickedSpell, this.spellItemSlotIndex, this.spellItemIsEquipped));
					break;
			}
		});
	}

	AdvanceParty(finishAction) {
		let advancedMonsters = 0;
		const monsters = this.currentBattle.Monsters.slice();
		const totalMonsters = monsters.length;
		const newPositions = new Map();
		const timePerMonster = Math.max(1, idiv(GameCoreOf(this).TicksPerSecond, 2 * totalMonsters));

		const MoveMonster = (monster, index) => {
			const position = this.currentBattle.GetSlotFromCharacter(monster);
			const currentColumn = position % 6;
			const currentRow = Math.trunc(position / 6);
			const newRow = currentRow + 1;
			const animation = this.layout.GetMonsterBattleAnimation(monster);

			const MoveAnimationFinished = () => {
				animation.AnimationFinished.remove(MoveAnimationFinished);
				this.currentBattle.SetMonsterDisplayLayer(animation, monster, position);
				newPositions.set(index, toUInt(position + 6));

				if (++advancedMonsters === totalMonsters) {
					this.partyAdvances = false;

					// Note: It is important to move closer rows first. Otherwise monsters
					// will move to occupied spots and replace the monsters there before they move.
					for (let i = monsters.length - 1; i >= 0; --i)
						this.currentBattle.MoveCharacterTo(getValue(newPositions, i), monsters[i]);

					this.layout.EnableButton(4, this.currentBattle.CanPartyMoveForward);
					finishAction?.();
				}
			};

			const newDisplayPosition = this.layout.GetMonsterCombatCenterPosition(currentColumn, newRow, monster);
			animation.AnimationFinished.add(MoveAnimationFinished);
			animation.Play([...monster.GetAnimationFrameIndices(MonsterAnimationType.Move)].slice(0, 1),
				timePerMonster, this.CurrentBattleTicks, newDisplayPosition,
				this.layout.RenderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(newRow));
		};

		for (let i = 0; i < monsters.length; ++i) {
			MoveMonster(monsters[i], i);
		}

		this.partyAdvances = true;
	}

	UpdateActiveBattleSpells() {
		for (const activeSpell of EnumHelper.GetValues(ActiveSpellType)) {
			if (ActiveSpellTypeExtensions.AvailableInBattle(activeSpell) && this.CurrentSavegame.ActiveSpells[activeSpell] != null)
				this.layout.AddActiveSpell(activeSpell, this.CurrentSavegame.ActiveSpells[activeSpell], true);
		}
	}

	HideActiveBattleSpells() {
		this.layout.RemoveAllActiveSpells();
	}

	EndBattle(flee) {
		if (this.currentBattle == null || this.currentBattle.RoundActive || this.pickingNewLeader || this.CurrentWindow.Window !== Window.Battle || this.PopupActive)
			return false;

		this.currentBattle.EndBattle(flee);
		return true;
	}

	/// <summary>
	/// Sets the speed of battles.
	///
	/// A value of 0 is the normal speed and will need a click to acknowledge battle actions.
	/// </summary>
	/// <param name="speed">Value from 0 to 100 where 0 is the normal speed.</param>
	SetBattleSpeed(speed) {
		if (this.currentBattle != null) {
			this.currentBattle.NeedsClickForNextAction = speed === 0;
			this.currentBattle.Speed = speed;
		}
	}

	StartBattleRound(withoutPlayerActions) {
		this.HideActiveBattleSpells();
		this.InputEnable = false;
		this.CursorType = CursorType.Click;
		this.layout.ResetMonsterCombatSprites();
		this.layout.ClearBattleFieldSlotColors();
		this.layout.ShowButtons(false);
		this.buttonGridBackground = this.layout.FillArea(new Rect(Global.ButtonGridX, Global.ButtonGridY, 3 * Button.Width, 3 * Button.Height),
			this.GetUIColor(28), 1);
		this.battleRoundActiveSprite.Visible = true;
		this.currentBattle.ShowAutoBattleRoundText(false, 0);
		this.currentBattle.StartRound
		(
			withoutPlayerActions ? repeat(new Battle.PlayerBattleAction(), 6) :
				range(0, GameCoreOf(this).MaxPartyMembers)
					.map(i => this.roundPlayerBattleActions.has(i) ? this.roundPlayerBattleActions.get(i) : new Battle.PlayerBattleAction()),
			this.CurrentBattleTicks
		);
	}

	CancelSpecificPlayerAction() {
		this.SetCurrentPlayerAction(PlayerBattleAction.PickPlayerAction);
		this.UntrapMouse();
		this.AddCurrentPlayerActionVisuals();
		this.layout.SetBattleMessage(null);
	}

	CheckBattleRightClick() {
		if (this.currentPlayerBattleAction === PlayerBattleAction.PickPlayerAction)
			return false; // This is handled by layout/game interaction.

		this.CancelSpecificPlayerAction();
		return true;
	}

	// Note: In original the max hitpoints are often much higher
	// than the current hitpoints. It seems like the max hitpoints
	// are often a multiple of 99 like 99, 198, 297, etc.
	static InitializeMonster(game, monster) {
		if (monster == null)
			return;

		const AdjustMonsterValue = (game, characterValue) => {
			characterValue.CurrentValue = Math.trunc(Math.min(100, game.RandomInt(95, 104)) * characterValue.TotalMaxValue / 100);
		};

		const FixValue = (game, characterValue) => {
			characterValue.MaxValue = characterValue.CurrentValue;
			AdjustMonsterValue(game, characterValue);
		};

		// Attributes, skills, LP and SP is special for monsters.
		for (const attribute of EnumHelper.GetValues(Attribute).slice(0, 8))
			FixValue(game, monster.Attributes[attribute]);
		for (const skill of EnumHelper.GetValues(Skill))
			FixValue(game, monster.Skills[skill]);

		monster.HitPoints.MaxValue = monster.HitPoints.CurrentValue;
		monster.SpellPoints.MaxValue = monster.SpellPoints.CurrentValue;

		AdjustMonsterValue(game, monster.HitPoints);
		AdjustMonsterValue(game, monster.SpellPoints);
	}

	MoveBattleActorTo(column, row, character) {
		if (character instanceof Monster)
			this.layout.MoveMonsterTo(column, row, character);
		else if (character instanceof PartyMember) {
			const index = this.SlotFromPartyMember(character);
			const sprite = this.partyMemberBattleFieldSprites[index];
			sprite.X = Global.BattleFieldX + column * Global.BattleFieldSlotWidth;
			sprite.Y = Global.BattleFieldY + row * Global.BattleFieldSlotHeight - 1;
			sprite.DisplayLayer = toByte(3 + row);
		}
	}

	RemoveBattleActor(character) {
		if (character instanceof Monster) {
			this.layout.RemoveMonsterCombatSprite(character);
		} else if (character instanceof PartyMember) {
			const slot = this.SlotFromPartyMember(character);
			this.roundPlayerBattleActions.delete(slot);
			this.partyMemberBattleFieldSprites[slot]?.Delete();
			this.partyMemberBattleFieldSprites[slot] = null;

			if (this.partyMemberBattleFieldTooltips[slot] != null) {
				this.layout.RemoveTooltip(this.partyMemberBattleFieldTooltips[slot]);
				this.partyMemberBattleFieldTooltips[slot] = null;
			}
		}
	}

	BattlePlayerSwitched() {
		const partyMemberSlot = this.SlotFromPartyMember(this.CurrentPartyMember);
		this.layout.ClearBattleFieldSlotColors();
		const battleFieldSlot = this.currentBattle.GetSlotFromCharacter(this.CurrentPartyMember);
		this.layout.SetBattleFieldSlotColor(battleFieldSlot, BattleFieldSlotColor.Yellow);
		this.AddCurrentPlayerActionVisuals();

		const [found, action] = tryGetValue(this.roundPlayerBattleActions, partyMemberSlot);
		if (found) {
			this.layout.UpdateCharacterStatus(partyMemberSlot, BattleActionExtensions.ToStatusGraphic(action.BattleAction, action.Parameter, this.ItemManager));
		} else {
			this.layout.UpdateCharacterStatus(partyMemberSlot, ConditionExtensions.CanSelect(this.CurrentPartyMember.Conditions) ? null : GameCore_BattleHandling.GetDisabledStatusGraphic(this.CurrentPartyMember));
		}

		this.layout.EnableButton(0, battleFieldSlot >= 24 && this.CurrentPartyMember.CanFlee()); // flee button, only enable in last row
		this.layout.EnableButton(3, this.CurrentPartyMember.CanMove()); // Note: If no slot is available the button still is enabled but after clicking you get "You can't move anywhere".
		this.layout.EnableButton(4, this.currentBattle.CanPartyMoveForward);
		this.layout.EnableButton(5, this.CoreConfiguration.AutoBattleRounds !== 0);
		this.layout.EnableButton(6, this.CurrentPartyMember.BaseAttackDamage + this.CurrentPartyMember.BonusAttackDamage > 0 && ConditionExtensions.CanAttack(this.CurrentPartyMember.Conditions));
		this.layout.EnableButton(7, ConditionExtensions.CanParry(this.CurrentPartyMember.Conditions));
		this.layout.EnableButton(8, ConditionExtensions.CanCastSpell(this.CurrentPartyMember.Conditions, this.Features) && this.CurrentPartyMember.HasAnySpell());
	}

	/// <summary>
	/// This adds the target slots' coloring.
	/// </summary>
	AddCurrentPlayerActionVisuals(action = null) {
		if (action == null) {
			const slot = this.SlotFromPartyMember(this.CurrentPartyMember);
			action = this.roundPlayerBattleActions.get(slot) ?? null;
		}

		if (action != null) {
			switch (action.BattleAction) {
				case Battle.BattleActionType.Attack:
				case Battle.BattleActionType.Move:
					this.layout.SetBattleFieldSlotColor(Battle.GetTargetTileOrRowFromParameter(action.Parameter), BattleFieldSlotColor.Orange);
					break;
				case Battle.BattleActionType.CastSpell: {
					const spell = Battle.GetCastSpell(action.Parameter);
					switch (this.SpellInfos.get(spell).Target) {
						case SpellTarget.SingleEnemy:
						case SpellTarget.SingleFriend:
							this.layout.SetBattleFieldSlotColor(Battle.GetTargetTileOrRowFromParameter(action.Parameter), BattleFieldSlotColor.Orange);
							break;
						case SpellTarget.FriendRow: {
							this.SetBattleRowSlotColors(Battle.GetTargetTileOrRowFromParameter(action.Parameter),
								(c, r) => this.currentBattle.GetCharacterAt(c, r)?.Type === CharacterType.PartyMember,
								BattleFieldSlotColor.Orange);
							break;
						}
						case SpellTarget.EnemyRow: {
							this.SetBattleRowSlotColors(Battle.GetTargetTileOrRowFromParameter(action.Parameter),
								(c, r) => this.currentBattle.GetCharacterAt(c, r)?.Type === CharacterType.Monster,
								BattleFieldSlotColor.Orange);
							break;
						}
						case SpellTarget.AllEnemies:
							for (let i = 0; i < 24; ++i)
								this.layout.SetBattleFieldSlotColor(i, BattleFieldSlotColor.Orange);
							break;
						case SpellTarget.AllFriends:
							for (let i = 0; i < 12; ++i)
								this.layout.SetBattleFieldSlotColor(18 + i, BattleFieldSlotColor.Orange);
							break;
						case SpellTarget.BattleField: {
							const blinkCharacterSlot = Battle.GetBlinkCharacterPosition(action.Parameter);
							const selfBlink = this.currentBattle.GetSlotFromCharacter(this.CurrentPartyMember) === blinkCharacterSlot;
							this.layout.SetBattleFieldSlotColor(blinkCharacterSlot, selfBlink ? BattleFieldSlotColor.Both : BattleFieldSlotColor.Orange, this.CurrentNormalizedBattleTicks);
							this.layout.SetBattleFieldSlotColor(Battle.GetTargetTileOrRowFromParameter(action.Parameter), BattleFieldSlotColor.Orange, this.CurrentNormalizedBattleTicks + Layout.TicksPerBlink);
							break;
						}
					}
					break;
				}
			}
		}
	}

	/// <summary>
	/// This removes the target slots' coloring.
	/// </summary>
	RemoveCurrentPlayerActionVisuals() {
		const action = this.GetOrCreateBattleAction();

		switch (action.BattleAction) {
			case Battle.BattleActionType.Attack:
			case Battle.BattleActionType.Move:
				this.layout.SetBattleFieldSlotColor(Battle.GetTargetTileOrRowFromParameter(action.Parameter), BattleFieldSlotColor.None);
				break;
			case Battle.BattleActionType.CastSpell:
				this.layout.ClearBattleFieldSlotColorsExcept(this.currentBattle.GetSlotFromCharacter(this.CurrentPartyMember));
				if (this.currentBattle.IsSelfSpell(this.CurrentPartyMember, action.Parameter))
					this.layout.SetBattleFieldSlotColor(this.currentBattle.GetSlotFromCharacter(this.CurrentPartyMember), BattleFieldSlotColor.Yellow);
				break;
		}
	}

	/// <summary>
	/// Checks if a player action should be still active after
	/// a battle round.
	/// </summary>
	/// <param name="action"></param>
	CheckPlayerActionVisuals(partyMember, action) {
		let remove = !ConditionExtensions.CanSelect(partyMember.Conditions);

		if (!remove) {
			switch (action.BattleAction) {
				case Battle.BattleActionType.Move:
				case Battle.BattleActionType.Flee:
				case Battle.BattleActionType.CastSpell:
					remove = true;
					break;
				case Battle.BattleActionType.Attack:
					if (partyMember.BaseAttackDamage + partyMember.BonusAttackDamage <= 0 || !ConditionExtensions.CanAttack(partyMember.Conditions))
						remove = true;
					break;
				case Battle.BattleActionType.Parry:
					if (!ConditionExtensions.CanParry(partyMember.Conditions))
						remove = true;
					break;
				default:
					remove = true;
					break;
			}
		}

		if (remove) // Note: Don't use 'else' here as remove could be set inside the if-block above as well.
			this.roundPlayerBattleActions.delete(this.SlotFromPartyMember(partyMember));
	}

	SetCurrentPlayerBattleAction(actionType, parameter = 0) {
		this.RemoveCurrentPlayerActionVisuals();
		const action = this.GetOrCreateBattleAction();
		action.BattleAction = actionType;
		action.Parameter = parameter;
		this.AddCurrentPlayerActionVisuals(action);

		const slot = this.SlotFromPartyMember(this.CurrentPartyMember);
		this.layout.UpdateCharacterStatus(slot, BattleActionExtensions.ToStatusGraphic(actionType, parameter, this.ItemManager));
	}

	SetPlayerBattleAction(actionType, parameter = 0) {
		if (this.currentPickingActionMember === this.CurrentPartyMember)
			this.SetCurrentPlayerBattleAction(actionType, parameter);
		else {
			const action = this.GetOrCreateBattleAction();
			action.BattleAction = actionType;
			action.Parameter = parameter;
			const slot = this.SlotFromPartyMember(this.currentPickingActionMember);
			this.layout.UpdateCharacterStatus(slot, BattleActionExtensions.ToStatusGraphic(actionType, parameter, this.ItemManager));
			this.AddCurrentPlayerActionVisuals(action);
		}
	}

	GetOrCreateBattleAction() {
		const slot = this.SlotFromPartyMember(this.currentPickingActionMember);

		if (!this.roundPlayerBattleActions.has(slot))
			this.roundPlayerBattleActions.set(slot, new Battle.PlayerBattleAction());

		return this.roundPlayerBattleActions.get(slot);
	}

	/** delay: milliseconds (TimeSpan?) or null */
	SetBattleMessageWithClick(message, textColor = TextColor.BattlePlayer, followAction = null, delay = null) {
		this.layout.HideTooltip();
		this.layout.SetBattleMessage(message, textColor);

		const Setup = () => {
			this.InputEnable = false;
			this.currentBattle.WaitForClick = true;
			this.CursorType = CursorType.Click;

			if (followAction != null) {
				const FollowUp = _ => {
					this.layout.SetBattleMessage(null);
					this.InputEnable = true;
					this.currentBattle.WaitForClick = false;
					this.CursorType = CursorType.Sword;
					followAction?.();
					return true;
				};

				this.nextClickHandler = FollowUp;
			}
		};

		if (delay == null)
			Setup();
		else
			this.AddTimedEvent(delay, Setup);
	}

	AnyPlayerMovesTo(slot) {
		const actions = [...this.roundPlayerBattleActions].filter(([Key]) => Key !== this.SlotFromPartyMember(this.currentPickingActionMember));
		const anyMovesTo = actions.some(([, Value]) => Value.BattleAction === Battle.BattleActionType.Move &&
			Battle.GetTargetTileOrRowFromParameter(Value.Parameter) === slot);

		if (anyMovesTo)
			return true;

		// Anyone blinks to? This is different to original where this isn't checked but I guess it's better this way.
		return actions.some(([, Value]) => {
			if (Value.BattleAction === Battle.BattleActionType.CastSpell &&
				Battle.GetCastSpell(Value.Parameter) === Spell.Blink) {
				if (Battle.GetTargetTileOrRowFromParameter(Value.Parameter) === slot)
					return true;
			}

			return false;
		});
	}

	BattleFieldSlotClicked(column, row, mouseButtons) {
		if (this.currentBattle.SkipNextBattleFieldClick)
			return;

		if (this.currentBattle.RoundActive)
			return;

		if (row < 0 || row > 4 ||
			column < 0 || column > 5)
			return;

		if (mouseButtons === MouseButtons.Right) {
			const character = this.currentBattle.GetCharacterAt(column, row);

			if (character instanceof PartyMember) {
				this.OpenPartyMember(this.SlotFromPartyMember(character), true);
			}

			return;
		} else if (mouseButtons !== MouseButtons.Left)
			return;

		switch (this.currentPlayerBattleAction) {
			case PlayerBattleAction.PickPlayerAction: {
				const character = this.currentBattle.GetCharacterAt(column, row);

				if (character?.Type === CharacterType.PartyMember) {
					const partyMember = character instanceof PartyMember ? character : null;

					if (this.currentPickingActionMember !== partyMember && ConditionExtensions.CanSelect(partyMember.Conditions)) {
						const partyMemberSlot = this.SlotFromPartyMember(partyMember);
						this.SetActivePartyMember(partyMemberSlot, false);
						this.BattlePlayerSwitched();
					}
				} else if (character?.Type === CharacterType.Monster) {
					const [canAttack, ranged] = this.CheckAbilityToAttack();
					if (!canAttack)
						return;

					if (!ranged) {
						const position = this.currentBattle.GetSlotFromCharacter(this.currentPickingActionMember);
						if (Math.abs(column - position % 6) > 1 || Math.abs(row - Math.trunc(position / 6)) > 1) {
							this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessageTooFarAway, TextColor.BrightGray);
							return;
						}
					}

					this.SetPlayerBattleAction(Battle.BattleActionType.Attack,
						Battle.CreateAttackParameter(toUInt(column + row * 6), this.currentPickingActionMember, this.ItemManager));
				} else { // empty field
					if (row < 3)
						return;
					const position = this.currentBattle.GetSlotFromCharacter(this.currentPickingActionMember);
					const maxDist = 1 + Math.trunc(this.currentPickingActionMember.Attributes[Attribute.Speed].TotalCurrentValue / 80);
					if (Math.abs(column - position % 6) > maxDist || Math.abs(row - Math.trunc(position / 6)) > maxDist) {
						this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessageTooFarAway, TextColor.BrightGray);
						return;
					}
					if (!this.currentPickingActionMember.CanMove()) {
						this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessageCannotMove, TextColor.BrightGray);
						return;
					}
					const newPosition = column + row * 6;
					const slot = this.SlotFromPartyMember(this.currentPickingActionMember);
					if ((!this.roundPlayerBattleActions.has(slot) ||
						this.roundPlayerBattleActions.get(slot).BattleAction !== Battle.BattleActionType.Move ||
						Battle.GetTargetTileOrRowFromParameter(this.roundPlayerBattleActions.get(slot).Parameter) !== newPosition) &&
						this.AnyPlayerMovesTo(newPosition)) {
						this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessageSomeoneAlreadyGoingThere, TextColor.BrightGray);
						return;
					}
					this.SetPlayerBattleAction(Battle.BattleActionType.Move, Battle.CreateMoveParameter(toUInt(column + row * 6)));
				}
				break;
			}
			case PlayerBattleAction.PickMemberToBlink: {
				const target = this.currentBattle.GetCharacterAt(column, row);
				if (target != null && target.Type === CharacterType.PartyMember) {
					if (!ConditionExtensions.CanBlink(target.Conditions)) {
						this.CancelSpecificPlayerAction();
						this.SetBattleMessageWithClick(target.Name + this.DataNameProvider.BattleMessageCannotBlink, TextColor.BrightGray);
						return;
					}

					this.blinkCharacterPosition = toUInt(column + row * 6);
					this.SetCurrentPlayerAction(PlayerBattleAction.PickBlinkTarget);
				}
				break;
			}
			case PlayerBattleAction.PickBlinkTarget: {
				// Note: If someone moves to the target spot, it can't be selected (red cross).
				// But someone can move to a spot where someone blinks to in Ambermoon.
				// Here we disallow moving to a spot where someone blinks to by considering
				// blink targets in AnyPlayerMovesTo. This will also disallow 2 characters to
				// blink to the same spot.
				const position = column + row * 6;
				if (row > 2 && this.currentBattle.IsBattleFieldEmpty(position) && !this.AnyPlayerMovesTo(position)) {
					this.SetPlayerBattleAction(Battle.BattleActionType.CastSpell, Battle.CreateCastSpellParameter(toUInt(column + row * 6),
						this.pickedSpell, this.spellItemSlotIndex, this.spellItemIsEquipped, this.blinkCharacterPosition));
					if (this.currentPickingActionMember === this.CurrentPartyMember) {
						const casterSlot = this.currentBattle.GetSlotFromCharacter(this.currentPickingActionMember);
						const selfBlink = casterSlot === this.blinkCharacterPosition;
						this.layout.SetBattleFieldSlotColor(this.blinkCharacterPosition, selfBlink ? BattleFieldSlotColor.Both : BattleFieldSlotColor.Orange, this.CurrentNormalizedBattleTicks);
						this.layout.SetBattleFieldSlotColor(column, row, BattleFieldSlotColor.Orange, this.CurrentNormalizedBattleTicks + Layout.TicksPerBlink);
						if (!selfBlink)
							this.layout.SetBattleFieldSlotColor(casterSlot, BattleFieldSlotColor.Yellow);
					}
					this.CancelSpecificPlayerAction();
				}
				break;
			}
			case PlayerBattleAction.PickEnemySpellTarget:
			case PlayerBattleAction.PickFriendSpellTarget: {
				const target = this.currentBattle.GetCharacterAt(column, row);
				if (target != null) {
					if (this.currentPlayerBattleAction === PlayerBattleAction.PickEnemySpellTarget) {
						if (target.Type !== CharacterType.Monster)
							return;
					} else {
						if (target.Type !== CharacterType.PartyMember)
							return;
					}

					this.SetPlayerBattleAction(Battle.BattleActionType.CastSpell, Battle.CreateCastSpellParameter(toUInt(column + row * 6),
						this.pickedSpell, this.spellItemSlotIndex, this.spellItemIsEquipped));
					if (this.currentPickingActionMember === this.CurrentPartyMember)
						this.layout.SetBattleFieldSlotColor(column, row, BattleFieldSlotColor.Orange);
					this.CancelSpecificPlayerAction();
				}
				break;
			}
			case PlayerBattleAction.PickEnemySpellTargetRow:
			case PlayerBattleAction.PickEnemySpellTargetRowInRange: {
				let minRow = 0;
				let maxRow = 3;

				if (this.currentPlayerBattleAction === PlayerBattleAction.PickEnemySpellTargetRowInRange) {
					const caster = this.currentPickingActionMember;

					if (!CharacterBattleExtensions.HasLongRangedWeapon(caster, this.ItemManager)) {
						const casterRow = Math.trunc(this.currentBattle.GetSlotFromCharacter(caster) / 6);

						minRow = Math.max(casterRow - 1, 0);
						maxRow = Math.min(casterRow + 1, 3);
					}
				}

				if (row < minRow || row > maxRow) {
					return;
				}

				this.SetPlayerBattleAction(Battle.BattleActionType.CastSpell, Battle.CreateCastSpellParameter(toUInt(row),
					this.pickedSpell, this.spellItemSlotIndex, this.spellItemIsEquipped));

				if (this.currentPickingActionMember === this.CurrentPartyMember) {
					this.layout.ClearBattleFieldSlotColorsExcept(this.currentBattle.GetSlotFromCharacter(this.currentPickingActionMember));
					this.SetBattleRowSlotColors(row, (c, r) => this.currentBattle.GetCharacterAt(c, r)?.Type !== CharacterType.PartyMember, BattleFieldSlotColor.Orange);
				}

				this.CancelSpecificPlayerAction();
				break;
			}
			case PlayerBattleAction.PickMoveSpot: {
				const position = column + row * 6;
				const maxDist = 1 + Math.trunc(this.currentPickingActionMember.Attributes[Attribute.Speed].TotalCurrentValue / 80);
				const currentPosition = this.currentBattle.GetSlotFromCharacter(this.currentPickingActionMember);
				const currentColumn = currentPosition % 6;
				const currentRow = Math.trunc(currentPosition / 6);
				if (row > 2 && Math.abs(column - currentColumn) <= maxDist &&
					Math.abs(row - currentRow) <= maxDist &&
					this.currentBattle.IsBattleFieldEmpty(position) && !this.AnyPlayerMovesTo(position)) {
					this.SetPlayerBattleAction(Battle.BattleActionType.Move, Battle.CreateMoveParameter(toUInt(position)));
					this.CancelSpecificPlayerAction();
				}
				break;
			}
			case PlayerBattleAction.PickAttackSpot: {
				const [canAttack, ranged] = this.CheckAbilityToAttack();
				if (!canAttack)
					return;

				if (!ranged) {
					const position = this.currentBattle.GetSlotFromCharacter(this.currentPickingActionMember);
					if (Math.abs(column - position % 6) > 1 || Math.abs(row - Math.trunc(position / 6)) > 1)
						return;
				}

				if (this.currentBattle.GetCharacterAt(column + row * 6)?.Type === CharacterType.Monster) {
					this.SetPlayerBattleAction(Battle.BattleActionType.Attack,
						Battle.CreateAttackParameter(toUInt(column + row * 6), this.currentPickingActionMember, this.ItemManager));
					this.CancelSpecificPlayerAction();
				}
				break;
			}
		}
	}

	SetBattleRowSlotColors(row, condition, color) {
		for (let column = 0; column < 6; ++column) {
			if (condition(column, row))
				this.layout.SetBattleFieldSlotColor(column, row, color);
		}
	}

	*GetValuableBattleFieldSlots(condition, range, minRow, maxRow) {
		const slot = this.currentBattle.GetSlotFromCharacter(this.currentPickingActionMember);
		const currentColumn = slot % 6;
		const currentRow = Math.trunc(slot / 6);
		for (let row = Math.max(minRow, currentRow - range); row <= Math.min(maxRow, currentRow + range); ++row) {
			for (let column = Math.max(0, currentColumn - range); column <= Math.min(5, currentColumn + range); ++column) {
				const index = column + row * 6;

				if (condition(index))
					yield index;
			}
		}
	}

	/** Returns [result, ranged] (out parameter ranged) */
	CheckAbilityToAttack(silent = false) {
		const [ranged, hasAmmo] = CharacterBattleExtensions.HasLongRangedAttack(this.currentPickingActionMember, this.ItemManager);

		if (ranged && !hasAmmo) {
			// No ammo for ranged weapon
			this.CancelSpecificPlayerAction();
			if (!silent)
				this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessageNoAmmunition, TextColor.BrightGray);
			return [false, ranged];
		}

		if (this.currentPickingActionMember.BaseAttackDamage + this.currentPickingActionMember.BonusAttackDamage <= 0 || !ConditionExtensions.CanAttack(this.currentPickingActionMember.Conditions)) {
			this.CancelSpecificPlayerAction();
			if (!silent)
				this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessageUnableToAttack, TextColor.BrightGray);
			return [false, ranged];
		}

		return [true, ranged];
	}

	SetCurrentPlayerAction(playerBattleAction) {
		this.currentPlayerBattleAction = playerBattleAction;
		this.highlightBattleFieldSprites.forEach(s => s?.Delete());
		this.highlightBattleFieldSprites.length = 0;
		this.blinkingHighlight = false;

		const AddHighlightSprite = (slot, customGraphic) => {
			this.highlightBattleFieldSprites.push
			(
				this.layout.AddSprite
				(
					Global.BattleFieldSlotArea(slot),
					Graphics.GetCustomUIGraphicIndex(customGraphic),
					this.UIPaletteIndex
				)
			);
		};

		switch (this.currentPlayerBattleAction) {
			case PlayerBattleAction.PickPlayerAction:
				this.currentPickingActionMember = this.CurrentPartyMember;
				break;
			case PlayerBattleAction.PickEnemySpellTarget: {
				const valuableSlots = this.GetValuableBattleFieldSlots(position => this.currentBattle.GetCharacterAt(position)?.Type === CharacterType.Monster,
					6, 0, 3);
				for (const slot of valuableSlots) {
					AddHighlightSprite(slot, UICustomGraphic.BattleFieldGreenHighlight);
				}
				this.RemoveCurrentPlayerActionVisuals();
				this.TrapMouse(Global.BattleFieldArea);
				this.blinkingHighlight = true;
				this.layout.SetBattleMessage(this.DataNameProvider.BattleMessageWhichMonsterAsTarget);
				break;
			}
			case PlayerBattleAction.PickEnemySpellTargetRow:
			case PlayerBattleAction.PickEnemySpellTargetRowInRange: {
				this.RemoveCurrentPlayerActionVisuals();
				this.TrapMouse(Global.BattleFieldArea);
				this.blinkingHighlight = false;
				this.layout.SetBattleMessage(this.DataNameProvider.BattleMessageWhichMonsterRowAsTarget);
				break;
			}
			case PlayerBattleAction.PickFriendSpellTarget:
			case PlayerBattleAction.PickMemberToBlink: {
				const valuableSlots = this.GetValuableBattleFieldSlots(position => this.currentBattle.GetCharacterAt(position)?.Type === CharacterType.PartyMember,
					6, 3, 4);
				for (const slot of valuableSlots) {
					AddHighlightSprite(slot, UICustomGraphic.BattleFieldGreenHighlight);
				}
				this.RemoveCurrentPlayerActionVisuals();
				this.TrapMouse(Global.BattleFieldArea);
				this.blinkingHighlight = true;
				this.layout.SetBattleMessage(playerBattleAction === PlayerBattleAction.PickMemberToBlink
					? this.DataNameProvider.BattleMessageWhoToBlink
					: this.DataNameProvider.BattleMessageWhichPartyMemberAsTarget);
				break;
			}
			case PlayerBattleAction.PickBlinkTarget: {
				const valuableSlots = this.GetValuableBattleFieldSlots(position => this.currentBattle.IsBattleFieldEmpty(position),
					6, 3, 4);
				for (const slot of valuableSlots) {
					AddHighlightSprite(slot,
						this.AnyPlayerMovesTo(slot) ? UICustomGraphic.BattleFieldBlockedMovementCursor : UICustomGraphic.BattleFieldGreenHighlight);
				}
				this.blinkingHighlight = true;
				this.layout.SetBattleMessage(this.DataNameProvider.BattleMessageWhereToBlinkTo);
				break;
			}
			case PlayerBattleAction.PickMoveSpot: {
				const maxDist = 1 + Math.trunc(this.currentPickingActionMember.Attributes[Attribute.Speed].TotalCurrentValue / 80);
				const valuableSlots = this.GetValuableBattleFieldSlots(position => this.currentBattle.IsBattleFieldEmpty(position),
					maxDist, 3, 4);
				for (const slot of valuableSlots) {
					AddHighlightSprite(slot,
						this.AnyPlayerMovesTo(slot) ? UICustomGraphic.BattleFieldBlockedMovementCursor : UICustomGraphic.BattleFieldGreenHighlight);
				}
				if (this.highlightBattleFieldSprites.length === 0) {
					// No movement possible
					this.CancelSpecificPlayerAction();
					this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessageNowhereToMoveTo, TextColor.BrightGray);
				} else {
					this.RemoveCurrentPlayerActionVisuals();
					this.TrapMouse(Global.BattleFieldArea);
					this.blinkingHighlight = true;
					this.layout.SetBattleMessage(this.DataNameProvider.BattleMessageWhereToMoveTo);
				}
				break;
			}
			case PlayerBattleAction.PickAttackSpot: {
				const [canAttack, ranged] = this.CheckAbilityToAttack();
				if (!canAttack)
					return;

				const valuableSlots = this.GetValuableBattleFieldSlots(index => this.currentBattle.GetCharacterAt(index)?.Type === CharacterType.Monster,
					ranged ? 6 : 1, 0, 3);
				for (const slot of valuableSlots) {
					AddHighlightSprite(slot, UICustomGraphic.BattleFieldGreenHighlight);
				}
				if (this.highlightBattleFieldSprites.length === 0) {
					// No attack possible
					this.CancelSpecificPlayerAction();
					this.SetBattleMessageWithClick(this.DataNameProvider.BattleMessageCannotReachAnyone, TextColor.BrightGray);
				} else {
					this.RemoveCurrentPlayerActionVisuals();
					this.TrapMouse(Global.BattleFieldArea);
					this.blinkingHighlight = true;
					this.layout.SetBattleMessage(this.DataNameProvider.BattleMessageWhatToAttack);
				}
				break;
			}
		}
	}

	HasPartyMemberFled(partyMember) {
		return this.currentBattle?.HasPartyMemberFled(partyMember) ?? false;
	}

	RecheckUsedBattleItem(partyMemberSlot, slotIndex, equipped) {
		if (this.currentBattle != null && this.roundPlayerBattleActions.has(partyMemberSlot)) {
			const action = this.roundPlayerBattleActions.get(partyMemberSlot);

			if (action.BattleAction === Battle.BattleActionType.CastSpell &&
				Battle.IsCastFromItem(action.Parameter)) {
				if (Battle.GetCastItemSlot(action.Parameter) === slotIndex) {
					this.roundPlayerBattleActions.delete(partyMemberSlot);
					this.UpdateBattleStatus(partyMemberSlot);
				}
			}
		}
	}

	RecheckBattleEquipment(partyMemberSlot, equipmentSlot, removedItem) {
		if (this.currentBattle != null) {
			if (removedItem != null && this.roundPlayerBattleActions.has(partyMemberSlot)) {
				const action = this.roundPlayerBattleActions.get(partyMemberSlot);

				if (action.BattleAction === Battle.BattleActionType.Attack) {
					const removedWeapon = equipmentSlot === EquipmentSlot.RightHand ||
						(equipmentSlot === EquipmentSlot.LeftHand && removedItem.Type === ItemType.Ammunition &&
						this.CurrentInventory.Equipment.Slots.get(EquipmentSlot.RightHand)?.ItemIndex != null &&
						this.ItemManager.GetItem(getValue(this.CurrentInventory.Equipment.Slots, EquipmentSlot.RightHand).ItemIndex).UsedAmmunitionType === removedItem.AmmunitionType);

					if (removedWeapon || !this.CheckAbilityToAttack(true)[0]) {
						this.roundPlayerBattleActions.delete(partyMemberSlot);
					}
				}
			}
		}
	}
}
