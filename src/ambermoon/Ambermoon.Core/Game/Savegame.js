// Port of Ambermoon.Core/Game/Savegame.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Character } from '../../Ambermoon.Data.Common/Character.js';
import { Position, FloatPosition } from '../../Ambermoon.Common/Position.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Global } from '../UI/Global.js';
import { CustomTexts } from './CustomTexts.js';
import { first, orderBy } from '../../../runtime.js';

export class GameCore_Savegame {
	static NumBaseSavegameSlots = 10;

	static initFields(self) {
		// internal Savegame? CurrentSavegame { get; private set; }
		self.CurrentSavegame = null;
		// internal ISavegameManager SavegameManager { get; } (assigned in GameCore constructor)
		// private protected readonly ISavegameSerializer savegameSerializer; (assigned in GameCore constructor)
	}

	get AdditionalSavegameNames() { return this.Provider_AdditionalSavegameNames(); }

	GetCurrentSavegame() {
		return this.CurrentSavegame;
	}

	SetAdditionalSavegamesContinueSlot(slot) {
		this.Provider_ContinueGameSlotUpdater()?.(slot);
	}

	FixSavegameValues(savegame) {
		for (const member of savegame.PartyMembers.values()) {
			let weight = 0;

			// Add gold and food
			weight += member.Gold * Character.GoldWeight;
			weight += member.Food * Character.FoodWeight;

			// Add items
			for (const itemSlot of member.Inventory.Slots) {
				if (itemSlot == null || itemSlot.ItemIndex === 0)
					continue;

				const item = this.ItemManager.GetItem(itemSlot.ItemIndex);

				weight += itemSlot.Amount * item.Weight;
			}

			for (const itemSlot of member.Equipment.Slots.values()) {
				if (itemSlot == null || itemSlot.ItemIndex === 0)
					continue;

				const item = this.ItemManager.GetItem(itemSlot.ItemIndex);

				weight += itemSlot.Amount * item.Weight;
			}

			member.TotalWeight = weight;
		}
	}

	RunSavegameTileChangeEvents(mapIndex) {
		if (this.CurrentSavegame.TileChangeEvents.has(mapIndex)) {
			const tileChangeEvents = this.CurrentSavegame.TileChangeEvents.get(mapIndex);

			for (const tileChangeEvent of tileChangeEvents)
				this.UpdateMapTile(tileChangeEvent, null, null, false);
		}
	}

	LoadGame(slot, showError = false, loadInitialOnError = false,
		preLoadAction = null, exitWhenFailing = true, postAction = null,
		updateSlot = false) {
		const Failed = () => {
			if (exitWhenFailing)
				this.Exit();
			else
				this.ClosePopup();
		};

		const totalSavegames = this.Provider_NumSavegameSlots();

		let savegame = this.SavegameManager.Load(this.renderView.GameData, this.savegameSerializer, slot, totalSavegames);

		if (savegame == null) {
			if (showError) {
				if (loadInitialOnError && slot !== 0) {
					savegame = this.SavegameManager.Load(this.renderView.GameData, this.savegameSerializer, 0, totalSavegames);

					if (savegame == null) {
						this.ShowMessagePopup(this.GetCustomText(CustomTexts.Index.FailedToLoadSavegame),
							Failed, TextAlign.Center, 200);
					} else {
						const ProceedWithInitial = () => {
							this.ShowMessagePopup(this.GetCustomText(CustomTexts.Index.FailedToLoadSavegameUseInitial),
								() => this.Start(savegame), TextAlign.Center, 200);
						};
						if (preLoadAction != null)
							preLoadAction?.(ProceedWithInitial);
						else
							ProceedWithInitial();
					}
				} else {
					if (slot === 0) {
						this.ShowMessagePopup(this.GetCustomText(CustomTexts.Index.FailedToLoadInitialSavegame),
							Failed, TextAlign.Center, 200);
					} else {
						this.ShowMessagePopup(this.GetCustomText(CustomTexts.Index.FailedToLoadSavegame),
							Failed, TextAlign.Center, 200);
					}
				}
				return;
			} else if (loadInitialOnError && slot !== 0) {
				this.LoadGame(0, true, false, preLoadAction, exitWhenFailing);
				return;
			}
			Failed();
			return;
		}

		savegame = this.Hook_GameLoaded(savegame, slot, updateSlot);

		const Start = () => this.Start(savegame, () => postAction?.(slot));

		if (preLoadAction != null)
			preLoadAction?.(Start);
		else
			Start();
	}

	PrepareSaving(saveAction) {
		// Note: In 3D it is possible to walk partly on tiles that block the player. For example
		// small objects. But when you save and load you will get stuck with that position.
		// We could avoid this partial movement but this feels bad ingame as you have to move around
		// small objects in a larger way. So we will adjust the position only on saving. It won't
		// have the same position after reload but you won't get stuck.
		let restorePosition = null;

		try {
			if (this.Is3D && this.renderMap3D.IsBlockingPlayer(this.CurrentSavegame.CurrentMapX - 1, this.CurrentSavegame.CurrentMapY - 1)) {
				const touchedPositions = this.player3D.GetTouchedPositions(Global.DistancePerBlock);
				const availablePositions = touchedPositions.slice(1).filter(position => !this.renderMap3D.IsBlockingPlayer(position));

				if (availablePositions.length !== 0) {
					const tileX = (-this.camera3D.X - 0.5 * Global.DistancePerBlock) / Global.DistancePerBlock;
					const tileY = this.Map.Height - (this.camera3D.Z + 0.5 * Global.DistancePerBlock) / Global.DistancePerBlock;
					const basePosition = new FloatPosition(tileX, tileY);
					const savegamePosition = availablePositions.length === 1 ? availablePositions[0] :
						first(orderBy(availablePositions, position => basePosition.Distance(position)));
					restorePosition = new Position(this.CurrentSavegame.CurrentMapX, this.CurrentSavegame.CurrentMapY);
					this.CurrentSavegame.CurrentMapX = 1 + savegamePosition.X;
					this.CurrentSavegame.CurrentMapY = 1 + savegamePosition.Y;
				}
			}
		} catch {
			// ignore
		}

		// If a crash save is stored and the game crashes inside a place (like merchants),
		// all the gold is at the place and none at the party.
		if (this.currentPlace != null && this.currentPlace.AvailableGold !== 0) {
			this.DistributeGold(this.currentPlace.AvailableGold, true);
		}

		saveAction?.();

		try {
			if (restorePosition != null) {
				this.CurrentSavegame.CurrentMapX = restorePosition.X;
				this.CurrentSavegame.CurrentMapY = restorePosition.Y;
			}
		} catch {
			// ignore
		}
	}

	SaveCrashedGame() {
		this.PrepareSaving(() => this.SavegameManager.SaveCrashedGame(this.savegameSerializer, this.CurrentSavegame));
	}

	SaveGame(slot, name) {
		this.PrepareSaving(() => {
			this.SavegameManager.Save(this.renderView.GameData, this.savegameSerializer, slot, name, this.CurrentSavegame);
			this.Hook_GameSaved(slot, name);
		});
	}
}
