// Registers the screens and UI classes beyond the core map/text screens.
import { ScreenType } from './screen.js';
import { ItemScreen, ItemDetailsScreen } from './itemScreens.js';
import { DoorScreen, ChestScreen, LockedUseItemScreen, ChestGiveItemScreen, ChestExamineItemScreen, ChestGiveGoldScreen } from './lockedScreens.js';
import { ConversationScreen, ConversationPickupItemScreen, ConversationDropItemScreen, ConversationShowItemScreen, ConversationGiveItemScreen, ConversationGiveGoldScreen, ConversationGiveFoodScreen, SelectWordScreen, InputWordScreen } from './conversationScreens.js';
import { PlaceScreen, PlaceBuyScreen, PlaceSellScreen, PlaceAmountScreen } from './placeScreen.js';
import { RiddlemouthScreen, OptionsScreen, openCamp } from './extraScreens.js';
import { BattleScreen } from './battleScreen.js';
import { MainMenuScreen, LoadSlotsScreen, SaveSlotsScreen, NameInputScreen, CharacterCreationScreen } from './menuScreens.js';
import { ItemContainer } from '../ui/itemContainer.js';
import { List, Input } from '../ui/listInput.js';
import { InventoryScreen, CharacterStatsScreen, InventoryDropItemScreen, InventoryUseItemScreen, InventoryExamineItemScreen, InventoryGiveItemScreen, InventoryGiveGoldScreen, InventoryGiveFoodScreen } from './characterScreens.js';

export function registerExtraScreens(screenFactories, uiClasses) {
	Object.assign(screenFactories, {
		[ScreenType.Door]: () => new DoorScreen(),
		[ScreenType.Chest]: () => new ChestScreen(),
		[ScreenType.LockedUseItem]: () => new LockedUseItemScreen(),
		[ScreenType.ChestGiveItem]: () => new ChestGiveItemScreen(),
		[ScreenType.ChestExamineItem]: () => new ChestExamineItemScreen(),
		[ScreenType.ChestGiveGold]: () => new ChestGiveGoldScreen(),
		[ScreenType.ItemView]: () => new ItemScreen(),
		[ScreenType.ItemDetails]: () => new ItemDetailsScreen(),
		[ScreenType.Inventory]: () => new InventoryScreen(),
		[ScreenType.CharacterStats]: () => new CharacterStatsScreen(),
		[ScreenType.InventoryDropItem]: () => new InventoryDropItemScreen(),
		[ScreenType.InventoryUseItem]: () => new InventoryUseItemScreen(),
		[ScreenType.InventoryExamineItem]: () => new InventoryExamineItemScreen(),
		[ScreenType.InventoryGiveItem]: () => new InventoryGiveItemScreen(),
		[ScreenType.InventoryGiveGold]: () => new InventoryGiveGoldScreen(),
		[ScreenType.InventoryGiveFood]: () => new InventoryGiveFoodScreen(),
		[ScreenType.Conversation]: () => new ConversationScreen(),
		[ScreenType.ConversationPickupItem]: () => new ConversationPickupItemScreen(),
		[ScreenType.ConversationDropItem]: () => new ConversationDropItemScreen(),
		[ScreenType.ConversationShowItem]: () => new ConversationShowItemScreen(),
		[ScreenType.ConversationGiveItem]: () => new ConversationGiveItemScreen(),
		[ScreenType.ConversationGiveGold]: () => new ConversationGiveGoldScreen(),
		[ScreenType.ConversationGiveFood]: () => new ConversationGiveFoodScreen(),
		[ScreenType.SelectWord]: () => new SelectWordScreen(),
		[ScreenType.InputWord]: () => new InputWordScreen(),
		[ScreenType.Place]: () => new PlaceScreen(),
		[ScreenType.PlaceBuy]: () => new PlaceBuyScreen(),
		[ScreenType.PlaceSell]: () => new PlaceSellScreen(),
		[ScreenType.PlaceAmount]: () => new PlaceAmountScreen(),
		[ScreenType.Riddlemouth]: () => new RiddlemouthScreen(),
		[ScreenType.Options]: () => new OptionsScreen(),
		[ScreenType.Battle]: () => new BattleScreen(),
		[ScreenType.MainMenu]: () => new MainMenuScreen(),
		[ScreenType.LoadSlots]: () => new LoadSlotsScreen(),
		[ScreenType.SaveSlots]: () => new SaveSlotsScreen(),
		[ScreenType.NameInput]: () => new NameInputScreen(),
		[ScreenType.CharacterCreation]: () => new CharacterCreationScreen(),
	});
	uiClasses.campHandler = openCamp;
	Object.assign(uiClasses, { ItemContainer, List, Input });
}
