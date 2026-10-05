// Port of Ambermoon.Core/Game/Lifecycle.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Event, hasFlag, toUInt, toUShort } from '../../runtime.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { CharacterDirection } from '../../Ambermoon.Common/Direction.js';
import { Character } from '../../Ambermoon.Data.Common/Character.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { ActiveSpellType } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { Song } from '../../Ambermoon.Data.Common/Enumerations/Song.js';
import { TravelType, TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { MapFlags } from '../../Ambermoon.Data.Common/Map.js';
import { PopupTextEvent } from '../../Ambermoon.Data.Common/Event.js';
import { CharacterBattleExtensions } from '../Battle.js';
import { EventTrigger, MapExtensions } from '../MapExtensions.js';
import { MouseButtons } from '../MouseButtons.js';
import { Player } from '../Player.js';
import { PlayerMovementAbility } from '../PlayerMovementAbility.js';
import { SavegameTime } from '../Time.js';
import { Color as RenderColor } from '../Render/Color.js';
import { Graphics } from '../Render/Graphics.js';
import { Layer } from '../Render/Layer.js';
import { MapCharacter2D } from '../Render/MapCharacter2D.js';
import { Player2D } from '../Render/Player2D.js';
import { Player3D } from '../Render/Player3D.js';
import { RenderMap2D } from '../Render/RenderMap2D.js';
import { RenderMap3D } from '../Render/RenderMap3D.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Global } from '../UI/Global.js';
import { FadeEffectType, LayoutType } from '../UI/Layout.js';
import { TextInput } from '../UI/TextInput.js';
import { Window } from '../UI/Window.js';
import { CustomTexts } from './CustomTexts.js';
import { MobileAction } from './Input.js';

const UIntMaxValue = 0xffffffff;

export class TimedGameEvent {
	constructor() {
		/** DateTime as ms number */
		this.ExecutionTime = 0;
		this.Action = null;
	}
}

export class GameCore_Lifecycle {
	static TicksPerSecond = 60;

	static initFields(self) {
		self.paused = false;
		self.disableTimeEvents = false;
		// Technical game pause settings
		self.audioWasEnabled = false;
		self.musicWasPlaying = false;
		self.gameWasPaused = false;
		self.gamePaused = false;
		self.lastMapTicksReset = 0;
		// Note: These are not meant for ingame stuff but for fade effects etc that use real time.
		self.timedEvents = [];
		self.nextClickHandler = null;

		self.QuitRequested = new Event();

		self.Ingame = false;
		self.CurrentTicks = 0;
		self.CurrentMapTicks = 0;
		self.CurrentBattleTicks = 0;
		self.CurrentNormalizedBattleTicks = 0;
		self.CurrentPopupTicks = 0;
		self.CurrentAnimationTicks = 0;
	}

	//#region Hooks

	Hook_NewGameCleanup() { }
	Hook_NewGame() { throw new Error('abstract'); }
	Hook_GameLoaded(savegame, slot, updateSlot) { return savegame; }
	Hook_GameSaved(slot, name) { }
	Hook_Paused() { }
	Hook_Resumed() { }
	/** out proceedWithUpdate -> returns [proceedWithUpdate] */
	Hook_PreUpdate(deltaTime) { return [true]; }
	/** out proceedWithUpdate -> returns [proceedWithUpdate] */
	Hook_AfterTimedEventUpdate(deltaTime) { return [true]; }
	Hook_PostUpdate(deltaTime) { }
	Hook_DestroyCleanup() { }
	Hook_Outro() { }
	Hook_GameOver() { throw new Error('abstract'); }

	//#endregion

	//#region Providers

	Provider_ContinueSavegameSlot() { throw new Error('abstract'); }
	Provider_NumSavegameSlots() { throw new Error('abstract'); }
	Provider_HasSavegames() { throw new Error('abstract'); }
	Provider_AdditionalSavegameNames() { throw new Error('abstract'); }
	Provider_ContinueGameSlotUpdater() { throw new Error('abstract'); }

	//#endregion

	static UpdateTicks(ticks, deltaTime) {
		const add = toUInt(Util.Round(GameCore_Lifecycle.TicksPerSecond * deltaTime));

		if (ticks <= UIntMaxValue - add)
			ticks += add;
		else
			ticks = (ticks + add) % UIntMaxValue;

		return ticks;
	}

	Update(deltaTime) {
		const UpdateTicks = GameCore_Lifecycle.UpdateTicks;
		let [proceed] = this.Hook_PreUpdate(deltaTime);

		if (!proceed)
			return;

		for (let i = this.timedEvents.length - 1; i >= 0; --i) {
			if (Date.now() >= this.timedEvents[i].ExecutionTime) {
				const timedEvent = this.timedEvents[i];
				this.timedEvents.splice(i, 1);
				timedEvent.Action?.();
			}
		}

		[proceed] = this.Hook_AfterTimedEventUpdate(deltaTime);

		if (!proceed)
			return;

		if (this.Ingame) {
			this.CurrentAnimationTicks = UpdateTicks(this.CurrentAnimationTicks, deltaTime);

			if (this.currentAnimation != null)
				this.currentAnimation.Update(this.CurrentAnimationTicks);

			if (!this.paused) {
				this.GameTime?.Update();
				this.swamLastTick = false;
				this.MonsterSeesPlayer = false; // Will be set by the monsters Update methods eventually

				this.CurrentTicks = UpdateTicks(this.CurrentTicks, deltaTime);

				this.CurrentMapTicks = this.CurrentTicks >= this.lastMapTicksReset ? this.CurrentTicks - this.lastMapTicksReset : toUInt(this.CurrentTicks + UIntMaxValue - this.lastMapTicksReset);

				if (this.is3D) {
					this.renderMap3D.Update(this.CurrentMapTicks, this.GameTime);
				} else { // 2D
					this.renderMap2D.Update(this.CurrentMapTicks, this.GameTime, this.monstersCanMoveImmediately, this.lastPlayerPosition);
				}

				this.monstersCanMoveImmediately = false;

				const moveTicks = this.CurrentTicks >= this.lastMoveTicksReset ? this.CurrentTicks - this.lastMoveTicksReset : toUInt(this.CurrentTicks + UIntMaxValue - this.lastMoveTicksReset);

				if (moveTicks >= this.movement.MovementTicks(this.is3D, this.Map?.UseTravelTypes ?? false, this.TravelType)) {
					this.lastMoveTicksReset = this.CurrentTicks;

					if (this.clickMoveActive)
						this.HandleClickMovement();
					else
						this.Move();
				}
			}

			if ((!this.WindowActive ||
				this.currentWindow.Window === Window.Inventory ||
				this.currentWindow.Window === Window.Stats ||
				this.currentWindow.Window === Window.Chest) &&
				!this.layout.IsDragging) {
				for (let i = 0; i < this.constructor.MaxPartyMembers; ++i) {
					const partyMember = this.GetPartyMember(i);

					if (partyMember != null)
						this.layout.UpdateCharacterStatus(partyMember);
				}
			}

			if (this.layout.PopupActive)
				this.CurrentPopupTicks = UpdateTicks(this.CurrentPopupTicks, deltaTime);
			else
				this.CurrentPopupTicks = this.CurrentTicks;

			if (this.currentBattle != null) {
				if (!this.layout.OptionMenuOpen) {
					const timeFactor = this.BattleTimeFactor;
					this.CurrentBattleTicks = UpdateTicks(this.CurrentBattleTicks, deltaTime * timeFactor);
					this.CurrentNormalizedBattleTicks = UpdateTicks(this.CurrentNormalizedBattleTicks, deltaTime);
					this.UpdateBattle(1.0 / timeFactor);

					const PlayerBattleAction = this.constructor.PlayerBattleAction;

					// Note: The null check for currentBattle is important here even if checking above.
					if (this.currentBattle != null && !this.currentBattle.RoundActive &&
						(this.currentPlayerBattleAction === PlayerBattleAction.PickEnemySpellTargetRow ||
						this.currentPlayerBattleAction === PlayerBattleAction.PickEnemySpellTargetRowInRange)) {
						const y = this.renderView.ScreenToGame(this.GetMousePosition(this.lastMousePosition)).Y - Global.BattleFieldArea.Top;
						const hoveredRow = Math.trunc(y / Global.BattleFieldSlotHeight);
						this.highlightBattleFieldSprites.forEach(s => s?.Delete());
						this.highlightBattleFieldSprites.length = 0;

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

						for (let row = minRow; row <= maxRow; ++row) {
							for (let column = 0; column < 6; ++column) {
								if (hoveredRow === row && this.currentBattle.GetCharacterAt(column, row)?.Type !== CharacterType.PartyMember) {
									this.highlightBattleFieldSprites.push(
										this.layout.AddSprite(
											Global.BattleFieldSlotArea(column + row * 6),
											Graphics.GetCustomUIGraphicIndex(UICustomGraphic.BattleFieldGreenHighlight),
											this.UIPaletteIndex
										)
									);
								}
							}
						}
					}
				}
			} else {
				this.CurrentBattleTicks = 0;
				this.CurrentNormalizedBattleTicks = 0;
			}

			if (!this.WindowActive && this.layout.ButtonGridPage === 0) {
				const canMove = this.CanPartyMove();
				this.layout.EnableButton(0, this.is3D || canMove);
				this.layout.EnableButton(1, canMove);
				this.layout.EnableButton(2, this.is3D || canMove);
				this.layout.EnableButton(3, canMove);
				this.layout.EnableButton(5, canMove);
				this.layout.EnableButton(6, this.is3D || canMove);
				this.layout.EnableButton(7, canMove);
				this.layout.EnableButton(8, this.is3D || canMove);
			}

			if (this.CurrentWindow.Window === Window.Inventory &&
				this.CurrentInventory != null &&
				this.weightDisplayBlinking !== this.CurrentInventory.Overweight) {
				this.SetInventoryWeightDisplay(this.CurrentInventory);
			}

			if (!this.WindowActive && this.player2D != null)
				this.fow2D.Center = this.player2D.DisplayArea.Center;
		}

		this.layout.Update(this.CurrentTicks);

		if (this.CurrentPartyMember != null && hasFlag(this.CurrentPartyMember.Conditions, Condition.Drugged) &&
			!this.layout.OptionMenuOpen) {
			if (toUInt(this.CurrentAnimationTicks - this.lastDrugColorChangeTicks) >= 16) {
				const colorComponent = this.RandomInt(0, 1) * 2;
				this.renderView.DrugColorComponent = colorComponent;
				let colorMod = toUShort(this.RandomInt(-9, 6));
				if (colorComponent === 0) // red
					colorMod = toUShort(colorMod << 8);
				let r = (colorMod & 0x0f00) >>> 8;
				let b = (colorMod & 0x00f);
				r = toUInt((r << 16) | (r << 20));
				b |= (b << 4);
				this.drugOverlay.Color = new RenderColor(toUInt(r | b));
				this.lastDrugColorChangeTicks = this.CurrentAnimationTicks;
			}

			if (toUInt(this.CurrentAnimationTicks - this.lastDrugMouseMoveTicks) >= 4) {
				this.DrugTicked.invoke();
				this.lastDrugMouseMoveTicks = this.CurrentAnimationTicks;
			}

			this.drugOverlay.Visible = true;
		} else {
			this.renderView.DrugColorComponent = null;
			this.drugOverlay.Visible = false;
		}
	}

	Start(savegame, postAction = null) {
		const FadeTime = this.constructor.FadeTime;
		this.lastPlayedSong = null;
		this.currentSong?.Stop();
		this.currentSong = null;
		this.Cleanup();
		MapExtensions.Reset();
		this.GameOverButtonsVisible = false;
		this.allInputDisabled = true;
		this.layout.AddFadeEffect(new Rect(0, 0, Global.VirtualScreenWidth, Global.VirtualScreenHeight), RenderColor.Black, FadeEffectType.FadeOut, Math.trunc(FadeTime / 2));
		this.AddTimedEvent(Math.trunc(FadeTime / 2), () => { this.allInputDisabled = false; postAction?.(); });

		// Reset all maps
		for (const changedMap of this.changedMaps) {
			this.MapManager.GetMap(changedMap).Reset();
		}
		this.changedMaps.length = 0;

		this.Ingame = true;
		this.CurrentSavegame = savegame;
		this.GameTime = new SavegameTime(savegame);
		this.lastSwimDamageHour = this.GameTime.Hour;
		this.lastSwimDamageMinute = this.GameTime.Minute;
		this.GameTime.GotTired.add((...args) => this.GameTime_GotTired(...args));
		this.GameTime.GotExhausted.add((...args) => this.GameTime_GotExhausted(...args));
		this.GameTime.NewDay.add((...args) => this.GameTime_NewDay(...args));
		this.GameTime.NewYear.add((...args) => this.GameTime_NewYear(...args));
		this.GameTime.MinuteChanged.add(amount => {
			if (this.disableTimeEvents)
				return;

			if (hasFlag(this.Map.Flags, MapFlags.Dungeon) &&
				!this.CurrentSavegame.IsSpellActive(ActiveSpellType.Light) &&
				this.lightIntensity > 0) {
				if (this.is3D)
					this.lightIntensity = toUInt(Math.max(0, this.lightIntensity - amount * 4));
				else
					this.lightIntensity = 0;
				this.UpdateLight();
			} else if (hasFlag(this.Map.Flags, MapFlags.Dungeon) &&
				this.CurrentSavegame.IsSpellActive(ActiveSpellType.Light) &&
				this.CurrentSavegame.GetActiveSpellDuration(ActiveSpellType.Light) * 5 < amount) {
				this.lightIntensity = 0;
				this.CurrentSavegame.ActiveSpells
					.filter(s => s?.Type === ActiveSpellType.Light)
					.forEach(s => s.Duration = 0);
				this.UpdateLight(true);
			} else if (hasFlag(this.Map.Flags, MapFlags.Outdoor)) {
				if (this.is3D) {
					const lightOff = this.CurrentSavegame.IsSpellActive(ActiveSpellType.Light) && this.CurrentSavegame.GetActiveSpellDuration(ActiveSpellType.Light) * 5 < amount;
					this.UpdateOutdoorLight(amount, lightOff);
				} else if (this.GameTime.Minute % 60 === 0 || amount > this.GameTime.Minute % 60) // hour changed
					this.UpdateLight();
			}

			if (!this.swamLastTick && this.Map.UseTravelTypes && this.TravelType === TravelType.Swim) {
				// Waiting or if a hour passes, it handles the swim damage instead.
				// This is important as hour changes might also trigger exhaustion or tired
				// messages and will also process poison damage.
				// As this event comes before the hour change event, we will check only next cycle.
				this.ExecuteNextUpdateCycle(() => {
					if (!this.swimDamageHandled)
						this.DoSwimDamage(Math.trunc(amount / 5));
					else
						this.swimDamageHandled = false;
				});
			} else {
				this.swimDamageHandled = false;
			}
		});
		this.GameTime.HourChanged.add(hours => this.GameTime_HoursPassed(hours, true));
		this.currentBattle = null;

		const CheckWeight = partyMember => {
			// Adjust weight in case it was set to a wrong value before.
			partyMember.TotalWeight = partyMember.Gold * Character.GoldWeight + partyMember.Food * Character.FoodWeight;

			for (const item of partyMember.Inventory.Slots) {
				if (item != null && item.Amount !== 0 && item.ItemIndex !== 0) {
					const itemInfo = this.ItemManager.GetItem(item.ItemIndex);
					partyMember.TotalWeight += item.Amount * itemInfo.Weight;
				}
			}

			for (const item of partyMember.Equipment.Slots.values()) {
				if (item != null && item.Amount !== 0 && item.ItemIndex !== 0) {
					const itemInfo = this.ItemManager.GetItem(item.ItemIndex);
					partyMember.TotalWeight += item.Amount * itemInfo.Weight;
				}
			}
		};

		this.ClearPartyMembers();

		for (let i = 0; i < this.constructor.MaxPartyMembers; ++i) {
			if (savegame.CurrentPartyMemberIndices[i] !== 0) {
				const partyMember = savegame.GetPartyMember(i);
				CheckWeight(partyMember);
				this.AddPartyMember(i, partyMember);
			}
		}
		this.CurrentPartyMember = this.GetPartyMember(this.CurrentSavegame.ActivePartyMemberSlot);

		if (this.CurrentPartyMember == null) {
			this.CurrentSavegame.ActivePartyMemberSlot = 0;
			this.CurrentPartyMember = this.GetPartyMember(0);

			if (this.CurrentPartyMember == null)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid party member data in savegame.');
		}

		this.SetActivePartyMember(this.CurrentSavegame.ActivePartyMemberSlot);

		this.player = new Player();
		const map = this.MapManager.GetMap(savegame.CurrentMapIndex);

		if (map == null)
			throw new AmbermoonException(ExceptionScope.Data, `Map with index ${savegame.CurrentMapIndex} does not exist.`);

		const is3D = map.Type === MapType.Map3D;
		this.renderMap2D = new RenderMap2D(this, null, this.MapManager, this.renderView);
		this.renderMap3D = new RenderMap3D(this, null, this.MapManager, this.renderView, 0, 0, CharacterDirection.Up);
		this.player3D = new Player3D(this, this.player, this.MapManager, this.camera3D, this.renderMap3D);
		this.player.MovementAbility = PlayerMovementAbility.Walking;
		this.renderMap2D.MapChanged.add((...args) => this.RenderMap2D_MapChanged(...args));
		this.renderMap3D.MapChanged.add((...args) => this.RenderMap3D_MapChanged(...args));
		this.TravelType = savegame.TravelType;

		if (is3D)
			this.Start3D(map, savegame.CurrentMapX - 1, savegame.CurrentMapY - 1, savegame.CharacterDirection, true);
		else
			this.Start2D(map, savegame.CurrentMapX - 1, savegame.CurrentMapY - 1, savegame.CharacterDirection, true);

		if (!map.IsWorldMap) {
			this.player.Position.X = savegame.CurrentMapX - 1;
			this.player.Position.Y = savegame.CurrentMapY - 1;
		}

		this.TravelType = savegame.TravelType; // Yes this is necessary twice.

		this.ShowMap(true);
		this.layout.ShowPortraitArea(true);
		this.UpdateLight(true);

		if (is3D)
			this.Fade3DMapIn(20, Math.trunc(this.constructor.FadeTime / 40));

		this.InputEnable = true;
		this.paused = false;

		if (this.layout.ButtonGridPage === 1)
			this.ToggleButtonGridPage();

		if (!is3D)
			this.player2D.Visible = true;

		if (!TravelTypeExtensions.IgnoreEvents(this.TravelType)) {
			// Trigger events after game load
			this.TriggerMapEvents(EventTrigger.Move, this.player.Position.X,
				this.player.Position.Y);
		}

		this.PlayerMoved(false, new Position(this.player.Position), false);
	}

	NewGame(cleanUp = true) {
		if (cleanUp) {
			this.ClosePopup();
			this.CloseWindow();
			this.Cleanup();
			this.layout.ShowPortraitArea(false);
			this.layout.SetLayout(LayoutType.None);
			this.HideWindowTitle();
			this.cursor.Type = CursorType.Sword;
			this.UpdateCursor(this.lastMousePosition, MouseButtons.None);
			this.currentUIPaletteIndex = 0;
			this.battleRoundActiveSprite.Visible = false;

			this.Hook_NewGameCleanup();
		}

		this.currentSong?.Stop();
		this.currentSong = null;

		this.PlayMusic(Song.HisMastersVoice);

		this.showMobileTouchPadHandler?.(false);

		this.Hook_NewGame();
	}

	ContinueGame() {
		const Continue = () => {
			const current = this.Provider_ContinueSavegameSlot();

			this.LoadGame(current, false, true);
		};

		if (this.SavegameManager.HasCrashSavegame()) {
			this.Ingame = true;
			this.ShowDecisionPopup(this.GetCustomText(CustomTexts.Index.LoadCrashedGame), response => {
				if (response === PopupTextEvent.Response.Yes) {
					this.LoadGame(99, false, true);
					if (!this.SavegameManager.RemoveCrashedSavegame())
						this.ShowMessagePopup(this.GetCustomText(CustomTexts.Index.FailedToRemoveCrashSavegame));
				} else {
					Continue();
				}
			}, 1, 0, TextAlign.Center, false);
			return;
		}

		Continue();
	}

	Exit() {
		this.QuitRequested.invoke();
	}

	/** Quit() and Quit(Action? abortAction) */
	Quit(abortAction = null) {
		const wasPaused = this.paused;
		const wasInputEnabled = this.InputEnable;
		this.ShowDecisionPopup(this.DataNameProvider.ReallyQuit, response => {
			if (response === PopupTextEvent.Response.Yes) {
				this.Exit();
			} else {
				if (wasPaused)
					this.Pause();
				this.InputEnable = wasInputEnabled;
				abortAction?.();
			}
		}, 1, 50, TextAlign.Center);
	}

	Start2D(map, playerX, playerY, direction, initial, mapInitAction = null) {
		if (map.Type !== MapType.Map2D)
			throw new AmbermoonException(ExceptionScope.Application, 'Given map is not 2D.');

		this.layout.SetLayout(LayoutType.Map2D, this.movement.MovementTicks(false, this.Map?.UseTravelTypes === true, TravelType.Walk));
		this.is3D = false;
		let xOffset = playerX - Math.trunc(RenderMap2D.NUM_VISIBLE_TILES_X / 2);
		let yOffset = playerY - Math.trunc(RenderMap2D.NUM_VISIBLE_TILES_Y / 2);

		if (map.IsWorldMap) {
			if (xOffset < 0) {
				map = this.MapManager.GetMap(map.LeftMapIndex);
				xOffset += map.Width;
				playerX += map.Width;
			}
			if (yOffset < 0) {
				map = this.MapManager.GetMap(map.UpMapIndex);
				yOffset += map.Height;
				playerY += map.Height;
			}
		} else {
			xOffset = Util.Limit(0, xOffset, map.Width - RenderMap2D.NUM_VISIBLE_TILES_X);
			yOffset = Util.Limit(0, yOffset, map.Height - RenderMap2D.NUM_VISIBLE_TILES_Y);
		}

		if (this.renderMap2D.Map !== map) {
			this.renderMap2D.SetMap(map, toUInt(xOffset), toUInt(yOffset));
			mapInitAction?.(map);
		} else {
			this.renderMap2D.ScrollTo(toUInt(xOffset), toUInt(yOffset), true);
			mapInitAction?.(map);
			this.renderMap2D.AddCharacters(map);
			this.renderMap2D.InvokeMapChange();
		}

		this.player2D ??= new Player2D(this, this.renderView.GetLayer(Layer.Characters), this.player, this.renderMap2D,
			this.renderView.SpriteFactory, new Position(0, 0), this.MapManager);

		this.player2D.Visible = true;
		this.player2D.RecheckTopSprite();
		this.player2D.MoveTo(map, playerX, playerY, this.CurrentTicks, true, direction);

		this.player.Position.X = playerX;
		this.player.Position.Y = playerY;
		this.player.Direction = direction;

		this.renderMap2D.CheckIfMonstersSeePlayer();

		this.renderView.GetLayer(Layer.Map3DBackground).Visible = false;
		this.renderView.GetLayer(Layer.Map3DBackgroundFog).Visible = false;
		this.renderView.GetLayer(Layer.Map3DCeiling).Visible = false;
		this.renderView.GetLayer(Layer.Map3D).Visible = false;
		this.renderView.GetLayer(Layer.Billboards3D).Visible = false;
		for (let i = Global.First2DLayer; i <= Global.Last2DLayer; ++i)
			this.renderView.GetLayer(i).Visible = true;

		this.mapViewArea = this.constructor.Map2DViewArea;

		this.PlayerMoved(true, null, true);
	}

	Start3D(map, playerX, playerY, direction, initial, mapInitAction = null) {
		if (map.Type !== MapType.Map3D)
			throw new AmbermoonException(ExceptionScope.Application, 'Given map is not 3D.');

		this.layout.SetLayout(LayoutType.Map3D, this.movement.MovementTicks(true, false, TravelType.Walk));

		this.is3D = true;
		this.TravelType = TravelType.Walk;
		this.renderMap2D?.Destroy();
		this.renderMap3D.SetMap(map, playerX, playerY, direction, this.CurrentPartyMember?.Race ?? Race.Human, true);
		this.UpdateUIPalette(true);
		mapInitAction?.(map);
		this.player3D.SetPosition(playerX, playerY, this.CurrentTicks, !initial);
		this.player3D.TurnTowards(direction * 90.0);

		if (this.player2D != null)
			this.player2D.Visible = false;

		this.player.Position.X = playerX;
		this.player.Position.Y = playerY;
		this.player.Direction = direction;

		this.renderView.GetLayer(Layer.Map3DBackground).Visible = true;
		this.renderView.GetLayer(Layer.Map3DBackgroundFog).Visible = true;
		this.renderView.GetLayer(Layer.Map3DCeiling).Visible = true;
		this.renderView.GetLayer(Layer.Map3D).Visible = true;
		this.renderView.GetLayer(Layer.Billboards3D).Visible = true;

		for (let i = Global.First2DLayer; i <= Global.Last2DLayer; ++i)
			this.renderView.GetLayer(i).Visible = false;

		this.mapViewArea = this.constructor.Map3DViewArea;

		this.PlayerMoved(true, null, true);
	}

	Cleanup() {
		this.highlightBattleFieldSprites.forEach(s => s?.Delete());
		this.highlightBattleFieldSprites.length = 0;
		this.currentBattle?.EndBattleCleanup();
		this.battleRoundActiveSprite.Visible = false;
		this.layout.Reset();
		this.renderMap2D?.Destroy();
		this.renderMap2D = null;
		this.renderMap3D?.Destroy(true);
		this.renderMap3D = null;
		this.CurrentMapCharacter = null;
		this.player2D?.Destroy();
		this.player2D = null;
		this.player3D = null;

		this.player = null;
		this.CurrentPartyMember = null;
		this.CurrentInventoryIndex = null;
		this.CurrentCaster = null;
		this.OpenStorage = null;
		this.weightDisplayBlinking = false;
		this.levitating = false;

		RenderMap3D.Reset();
		MapCharacter2D.Reset();

		for (let i = 0; i < this.keys.length; ++i)
			this.keys[i] = false;

		this.clickMoveActive = false;
		this.CurrentMobileAction = MobileAction.None;
		this.trappedAfterClickMoveActivation = false;
		this.UntrapMouse();
		this.InputEnable = false;
		this.paused = false;

		for (let i = 0; i < this.spellListScrollOffsets.length; ++i)
			this.spellListScrollOffsets[i] = 0;

		this.battleRoundActiveSprite.Visible = false;

		this.Hook_DestroyCleanup();
	}

	Destroy() {
		this.drugOverlay?.Delete();
		this.ouchSprite?.Delete();
		this.mobileClickIndicator?.Delete();

		Util.SafeCall(() => this.UntrapMouse());
		this.allInputDisabled = true;
		this.Ingame = false;
		Util.SafeCall(() => this.AudioOutput?.Stop());
		Util.SafeCall(() => this.AudioOutput?.Reset());
		Util.SafeCall(() => this.Cleanup());
		Util.SafeCall(() => this.layout.Destroy());
		Util.SafeCall(() => this.CursorType = CursorType.None);
		Util.SafeCall(() => this.windowTitle?.Delete());
		// Note: GameCore's constructor binds InputFocusChanged as an own property so add/remove use the same function.
		TextInput.FocusChanged.remove(this.InputFocusChanged);
	}

	Fade(midFadeAction, changeInputEnableState = true) {
		const FadeTime = this.constructor.FadeTime;
		this.Fading = true;
		if (changeInputEnableState)
			this.allInputDisabled = true;
		this.layout.AddFadeEffect(new Rect(0, 36, Global.VirtualScreenWidth, Global.VirtualScreenHeight - 36), RenderColor.Black, FadeEffectType.FadeInAndOut, FadeTime);
		this.AddTimedEvent(Math.trunc(FadeTime / 2), () => {
			midFadeAction?.();

			if (this.currentWindow.Window === Window.MapView && this.is3D)
				this.Fade3DMapIn(20, Math.trunc(FadeTime / 40));
		});
		if (changeInputEnableState)
			this.AddTimedEvent(FadeTime, () => this.allInputDisabled = false);
		this.AddTimedEvent(FadeTime + 1, () => this.Fading = false);

		if (this.currentWindow.Window === Window.MapView && this.is3D)
			this.Fade3DMapOut(10, Math.trunc(FadeTime / 40));
	}

	/** delay: TimeSpan in milliseconds */
	RenewTimedEvent(timedGameEvent, delay) {
		timedGameEvent.ExecutionTime = Date.now() + delay;

		if (!this.timedEvents.includes(timedGameEvent))
			this.timedEvents.push(timedGameEvent);
	}

	/** AddTimedEvent(TimeSpan delay, Action? action[, bool ignoreFastBattleMode]); delay in milliseconds */
	AddTimedEvent(delay, action, ignoreFastBattleMode = false) {
		if (!ignoreFastBattleMode && this.currentBattle != null && this.CoreConfiguration.BattleSpeed !== 0 && this.currentWindow.Window === Window.Battle)
			delay = Math.max(1.0, delay / this.BattleTimeFactor);

		const timedEvent = new TimedGameEvent();
		timedEvent.ExecutionTime = Date.now() + delay;
		timedEvent.Action = action;
		this.timedEvents.push(timedEvent);
	}

	ExecuteNextUpdateCycle(action) {
		this.AddTimedEvent(0, action);
	}
}
