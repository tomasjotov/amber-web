// Port of Ambermoon.Core/UI/Layout.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import {
	Event, removeItem, toByte, newArray, last, firstOrDefault, format, formatNumber, isNullOrEmpty,
	getValue, tryGetValue, hasFlag, enumName, count, range, ArgumentException
} from '../../../runtime.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { CollectionExtensions } from '../../Ambermoon.Common/CollectionExtensions.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { ButtonType } from '../../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { SpecialItemPurpose } from '../../Ambermoon.Data.Common/Enumerations/SpecialItemPurpose.js';
import { PlaceType } from '../../Ambermoon.Data.Common/Enumerations/PlaceType.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { Condition, ConditionExtensions } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { TravelType, TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { ItemType } from '../../Ambermoon.Data.Common/Enumerations/ItemType.js';
import { Transportation } from '../../Ambermoon.Data.Common/Enumerations/Transportation.js';
import { Picture80x80 } from '../../Ambermoon.Data.Common/Enumerations/Picture80x80.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { EquipmentSlot } from '../../Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { MonsterAnimationType } from '../../Ambermoon.Data.Common/Enumerations/MonsterAnimationType.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { Class, ClassExtensions } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
import { ActiveSpellType } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { GameLanguage } from '../../Ambermoon.Data.Common/IGameData.js';
import { Chest } from '../../Ambermoon.Data.Common/Chest.js';
import { Merchant } from '../../Ambermoon.Data.Common/Merchant.js';
import { NonItemPlace } from '../../Ambermoon.Data.Common/Places.js';
import { Inventory } from '../../Ambermoon.Data.Common/Inventory.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { SpellApplicationArea } from '../../Ambermoon.Data.Common/SpellInfo.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { MapFlags } from '../../Ambermoon.Data.Common/Map.js';
import { EventType } from '../../Ambermoon.Data.Common/Event.js';
import { ItemStorageExtensions } from '../../Ambermoon.Data.Common/IItemStorage.js';
import { Color } from '../Render/Color.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Layer } from '../Render/Layer.js';
import { ItemAnimation } from '../Render/ItemAnimation.js';
import { WindowMode } from '../Render/IRenderView.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';
import { NamedPaletteColors } from '../Render/NamedPaletteColors.js';
import { BattleEffects } from '../Render/BattleEffects.js';
import { BattleAnimation } from '../Render/BattleAnimation.js';
import { Graphics } from '../Render/Graphics.js';
import { GameCore } from '../GameCore.js';
import { MouseButtons } from '../MouseButtons.js';
import { Key } from '../Key.js';
import { KeyModifiers } from '../KeyModifiers.js';
import { EventTrigger } from '../MapExtensions.js';
import { TimeExtensions } from '../Time.js';
import { GraphicFilter, GraphicFilterOverlay, Effects, ConfigurationExtensions } from '../ICoreConfiguration.js';
import { CustomTexts } from '../Game/CustomTexts.js';
import { Global } from './Global.js';
import { Button } from './Button.js';
import { ButtonGrid } from './ButtonGrid.js';
import { Window } from './Window.js';
import { TextInput } from './TextInput.js';
import { Popup } from './Popup.js';
import { ItemGrid } from './ItemGrid.js';
import { UIText } from './UIText.js';
import { Panel } from './Panel.js';

/** Dictionary.Add (throws if the key already exists) */
function dictionaryAdd(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

/** `x is IPlace` (IPlace is implemented by Merchant and NonItemPlace) */
function isPlace(storage) {
	return storage instanceof Merchant || storage instanceof NonItemPlace;
}

let moveButtonCursorMapping2D = null;
let moveButtonCursorMapping3D = null;

export const LayoutType = Object.freeze({
	None: 0,
	Map2D: 1,
	Inventory: 2,
	Items: 3, // Chest, merchant, battle loot and other places like trainers etc
	Battle: 4,
	Map3D: 5,
	Stats: 6,
	Event: 7, // Game over, airship travel, grandfather intro, valdyn sequence
	Conversation: 8,
	Riddlemouth: 9,
	BattlePositions: 10,
	Automap: 11
});

export const FadeEffectType = Object.freeze({
	FadeIn: 0,
	FadeOut: 1,
	FadeInAndOut: 2
});

export const FilledAreaType = Object.freeze({
	CharacterBar: 0,
	FadeEffect: 1,
	Custom: 2,
	CustomEffect: 3
});

export class FilledArea {
	constructor(filledAreas, area) {
		this.Destroyed = false;
		this.filledAreas = filledAreas;
		this.area = area;
	}

	get Color() {
		return this.Destroyed ? null : this.area.Color;
	}

	set Color(value) {
		if (!this.Destroyed && value != null)
			this.area.Color = value;
	}

	get DisplayLayer() {
		return this.Destroyed ? 0 : this.area.DisplayLayer;
	}

	set DisplayLayer(value) {
		if (!this.Destroyed)
			this.area.DisplayLayer = value;
	}

	get Visible() {
		return !this.Destroyed && this.area.Visible;
	}

	set Visible(value) {
		if (!this.Destroyed)
			this.area.Visible = value;
	}

	get Position() {
		return this.Destroyed ? null : new Position(this.area.X, this.area.Y);
	}

	set Position(value) {
		if (!this.Destroyed) {
			this.area.X = value?.X ?? 0;
			this.area.Y = value?.Y ?? 0;
		}
	}

	Destroy() {
		if (this.Destroyed)
			return;

		this.area.Delete();
		removeItem(this.filledAreas, this.area);
		this.Destroyed = true;
	}
}

export class Bar extends FilledArea {
	constructor(filledAreas, area, size, horizontal) {
		super(filledAreas, area);
		this.barArea = new Rect(area.X, area.Y, area.Width, area.Height);
		this.size = size;
		this.horizontal = horizontal;
	}

	/**
	 * Fills the bar dependent on the given value.
	 * @param percentage Value in the range 0 to 1 (0 to 100%).
	 * @param forceNotEmpty If true at least 1 pixel remaings.
	 */
	Fill(percentage, forceNotEmpty = false) {
		let pixels = Util.Round(this.size * percentage);

		if (forceNotEmpty && pixels === 0)
			pixels = 1;

		if (pixels === 0) {
			this.area.X = 32767; // short.MaxValue
			this.area.Y = 32767;
			this.area.Visible = false;
		} else if (this.horizontal) {
			this.area.X = this.barArea.Left;
			this.area.Y = this.barArea.Top;
			this.area.Resize(pixels, this.barArea.Height);
			this.area.Visible = true;
		} else {
			this.area.X = this.barArea.Left;
			this.area.Y = this.barArea.Bottom - pixels;
			this.area.Resize(this.barArea.Width, pixels);
			this.area.Visible = true;
		}
	}
}

export class FadeEffect extends FilledArea {
	/**
	 * @param startTime DateTime as milliseconds (Date.now() based)
	 */
	constructor(filledAreas, area, startColor, endColor, durationInMilliseconds, startTime, removeWhenFinished) {
		super(filledAreas, area);
		this.startColor = startColor;
		this.endColor = endColor;
		this.duration = durationInMilliseconds;
		this.startTime = startTime;
		this.removeWhenFinished = removeWhenFinished;
	}

	Update() {
		const Finished = () => {
			if (this.removeWhenFinished) {
				this.Destroy();
				return true;
			}

			return false;
		};

		let percentage;

		if (this.duration === 0) {
			percentage = 1.0;

			if (Finished())
				return;
		} else {
			const now = Date.now();

			if (now <= this.startTime) {
				// Don't draw anything before started.
				this.Color = Color.Transparent;
				return;
			} else {
				const elapsed = Math.trunc(now - this.startTime);

				if (elapsed >= this.duration && Finished())
					return;

				percentage = Math.min(1.0, elapsed / this.duration);
			}
		}

		const CalculateColorComponent = (start, end) => {
			if (start < end)
				return toByte(start + Util.Round((end - start) * percentage));
			else
				return toByte(start - Util.Round((start - end) * percentage));
		};

		this.Color = new Color
		(
			CalculateColorComponent(this.startColor.R, this.endColor.R),
			CalculateColorComponent(this.startColor.G, this.endColor.G),
			CalculateColorComponent(this.startColor.B, this.endColor.B),
			CalculateColorComponent(this.startColor.A, this.endColor.A)
		);
	}
}

export class Tooltip {
	constructor() {
		this.Area = null;
		this.Text = null;
		this.TextColor = TextColor.White;
		this.TextAlign = TextAlign.Center;
		this.BackgroundColor = null;
		this.CenterOnScreen = false;
	}
}

export const BattleFieldSlotColor = Object.freeze({
	None: 0,
	Yellow: 1,
	Orange: 2,
	Both: 5 // Only used by blink
});

// There are a few possibilities:
// 1. Move item from a player inventory directly to another player via his portrait.
// 2. Move item from a player inventory, opening a second players inventory with
//    right mouse and drop it there.
// 3. Move item from a chest (etc) directly to another player via his portrait.
class DraggedItem {
	constructor() {
		this.Item = null;
		this.SourceGrid = null;
		this.SourcePlayer = null;
		this.Equipped = null;
		this.SourceSlot = 0;
	}

	/**
	 * Drop back to source.
	 *
	 * This returns true if dragging should continue.
	 * This is the case when there was an item at the drop location.
	 */
	Reset(game, layout, scrollToItem = false) {
		// Reset in case 1: Is only possible while in first player inventory.
		// Reset in case 2: Is also possible while in second player inventory.
		//                  First players inventory is opened in addition on reset.
		// Reset in case 3: Is only possible while in chest screen.
		let updateGrid = true;
		let updateSlot = this.Item.Item;
		let previousSlot = new ItemSlot();

		if (this.SourcePlayer != null) {
			if (game.CurrentInventoryIndex !== this.SourcePlayer) {
				if (game.OpenPartyMember(this.SourcePlayer, true)) {
					return layout.draggedItem.Reset(game, layout, true);
				}
			}

			const partyMember = game.GetPartyMember(this.SourcePlayer);

			if (this.Equipped === true) {
				previousSlot.Replace(partyMember.Equipment.Slots.get(this.SourceSlot + 1));
				if (previousSlot.Empty) { // Otherwise DropItem below will handle this
					game.EquipmentAdded(this.Item.Item.ItemIndex, this.Item.Item.Amount, partyMember);
					game.UpdateCharacterInfo();
					layout.FillCharacterBars(partyMember);
					partyMember.Equipment.Slots.get(this.SourceSlot + 1).Add(this.Item.Item);
					updateSlot = partyMember.Equipment.Slots.get(this.SourceSlot + 1);
				}
			} else {
				previousSlot.Replace(partyMember.Inventory.Slots[this.SourceSlot]);
				if (previousSlot.Empty) { // Otherwise DropItem below will handle this
					game.InventoryItemAdded(this.Item.Item.ItemIndex, this.Item.Item.Amount, partyMember);
					game.UpdateCharacterInfo();
					layout.FillCharacterBars(partyMember);
					partyMember.Inventory.Slots[this.SourceSlot].Add(this.Item.Item);
					updateSlot = partyMember.Inventory.Slots[this.SourceSlot];
				}
			}

			if (game.CurrentInventoryIndex !== this.SourcePlayer) {
				updateGrid = false;
			} else {
				// Note: When switching to another inventory and back to the
				// source inventory the current ItemGrid and the SourceGrid
				// are two different instances even if they represent the
				// same inventory. Therefore we have to update the SourceGrid.
				if (this.SourceGrid != null)
					this.SourceGrid = layout.itemGrids[this.Equipped === true ? 1 : 0];
			}
		} else if (game.OpenStorage != null) {
			previousSlot.Replace(game.OpenStorage.Slots[this.SourceSlot % 6][Math.trunc(this.SourceSlot / 6)]);

			if (this.SourceGrid.DropItem(this.SourceSlot, this) === 0) {
				if (!previousSlot.Empty)
					updateGrid = false;

				previousSlot = new ItemSlot();
			}
		}

		if (scrollToItem && this.Equipped !== true) {
			// Note: The grid may haved changed through OpenPartyMember!
			layout.itemGrids[0].ScrollTo(Math.max(0, this.SourceSlot - Inventory.VisibleWidth));
		}

		if (!previousSlot.Empty) { // There is an item at the target slot (dragged item was exchanged before)
			if (this.SourcePlayer != null && this.SourceGrid.DropItem(this.SourceSlot, this) === 0)
				layout.DropItem();

			return true;
		}

		if (updateGrid && this.SourceGrid != null)
			this.SourceGrid.SetItem(this.SourceSlot, updateSlot);

		this.Item.Destroy();

		return false;
	}

	static FromInventory(itemGrid, partyMemberIndex, slotIndex, item, equipped) {
		const clone = item.Clone();
		clone.Dragged = true;
		clone.Visible = true;

		const draggedItem = new DraggedItem();
		draggedItem.SourceGrid = itemGrid;
		draggedItem.SourcePlayer = partyMemberIndex;
		draggedItem.Equipped = equipped;
		draggedItem.SourceSlot = slotIndex;
		draggedItem.Item = clone;
		return draggedItem;
	}

	/**
	 * Chests, merchants, etc.
	 */
	static FromExternal(itemGrid, slotIndex, item) {
		const clone = item.Clone();
		clone.Dragged = true;
		clone.Visible = true;

		const draggedItem = new DraggedItem();
		draggedItem.SourceGrid = itemGrid;
		draggedItem.SourceSlot = slotIndex;
		draggedItem.Item = clone;
		return draggedItem;
	}
}

class MonsterCombatGraphic {
	constructor() {
		this.Monster = null;
		this.Row = 0;
		this.Column = 0;
		this.Animation = null;
		this.BattleFieldSprite = null;
		this.Tooltip = null;
	}
}

class PortraitAnimation {
	static MoveType = Object.freeze({
		MoveBoth: 0,
		MovePrimary: 1,
		MoveSecondary: 2
	});

	constructor() {
		this.StartTicks = 0;
		this.Offset = 0;
		this.InitialOffset = 0;
		this.PrimarySprite = null;
		this.SecondarySprite = null;
		this.Movement = PortraitAnimation.MoveType.MoveBoth;
		this.InitialDisplayLayer = 0;
		this.Finished = new Event();
	}

	OnFinished() { this.Finished.invoke(); }
}

const PartyMemberPortaitState = Object.freeze({
	None: 0,
	Empty: 1,
	Normal: 2,
	Dead: 3
});

class BattleFieldSlotMarker {
	constructor() {
		this.Sprite = null;
		this.BlinkStartTicks = null;
		this.ToggleColors = false;
	}
}

// TODO: add more languages later and/or add these texts to the new game data format
const OptionCount = 24;
const OptionsPerPage = 7;

// The static language dictionaries are created lazily (GameLanguage lives in another module).
let optionNames = null;
let floorAndCeilingValues = null;
let defaultBattleSpeedName = null;
let fullsizedWindowName = null;
let movement3DValues = null;
let autoBattleOptions = null;

function GetOptionNames() {
	return optionNames ??= new Map([
		[
			GameLanguage.German,
			[
				// Page 1
				'Musik',
				'Lautstärke',
				'Auflösung',
				'Vollbild',
				'Grafikfilter',
				'Grafikoverlay',
				'Effekt',
				// Page 2
				'Kampfgeschwindigkeit',
				'3D-Bewegung',
				'Drehen mit Pfeiltasten',
				'Button Tooltips anzeigen',
				'Stats Tooltips anzeigen',
				'3D Boden und Decke',
				'3D Distanz-Nebel',
				// Page 3
				'Runen als Text anzeigen',
				'Zusätzliche Spielstände',
				'Externe Musik',
				'Pyrdacor Logo zeigen',
				'Fantasy Intro zeigen',
				'Intro anzeigen',
				'Advanced Logo zeigen',
				// Page 4
				'Info beim Speichern/Laden',
				'Cheats aktivieren',
				'Auto-Kampf',
				'3D-Grafik verbessert' // web port
			]
		],
		[
			GameLanguage.English,
			[
				// Page 1
				'Music',
				'Volume',
				'Resolution',
				'Fullscreen',
				'Graphic filter',
				'Graphic overlay',
				'Effect',
				// Page 2
				'Battle speed',
				'3D Movement',
				'Turn with arrow keys',
				'Show button tooltips',
				'Show stats tooltips',
				'3D floor and ceiling',
				'3D distance fog',
				// Page 3
				'Show runes as text',
				'Additional saveslots',
				'External music',
				'Show Pyrdacor logo',
				'Show fantasy intro',
				'Show intro',
				'Show advanced logo',
				// Page 4
				'Show save/load info',
				'Enable cheats',
				'Auto-Battle',
				'Enhanced 3D graphics' // web port
			]
		],
		[
			GameLanguage.French,
			[
				// Page 1
				'Musique',
				'Volume',
				'Résolution',
				'Plein écran',
				'Filtre graphique',
				'Incrustation graphique',
				'Effet',
				// Page 2
				'Vitesse de combat',
				'Mouvement 3D',
				'Tourner avec flèches',
				'Infobulles des boutons',
				'Infobulles des statistiques',
				'Sol et plafond en 3D',
				'Brouillard de distance 3D',
				// Page 3
				'Afficher les runes en texte',
				'Sauvegardes additionnelles',
				'Musique externe',
				'Afficher Pyrdacor logo',
				'Afficher fantasy intro',
				'Afficher intro',
				'Afficher advanced logo',
				// Page 4
				'Messages de sauvegarde',
				'Activer les cheats',
				'Combat automatique',
				'Graphismes 3D HD' // web port
			]
		],
		[
			GameLanguage.Polish,
			[
				// Page 1
				'Muzyka',
				'Głośność',
				'Rozdzielczość',
				'Pełny ekran',
				'Filtr graficzny',
				'Nakładka graficzna',
				'Efekt',
				// Page 2
				'Szybkość walki',
				'Ruch 3D',
				'Obrót strzałkami',
				'Pokaż opisy przycisków',
				'Pokaż opisy statystyk',
				'Podłoga i sufit 3D',
				'Mgła dystansowa 3D',
				// Page 3
				'Pokaż runy jako tekst',
				'Dodatkowe miejsca zapisu',
				'Zewnętrzna muzyka',
				'Pokaż logo Pyrdacora',
				'Pokaż fantasy intro',
				'Pokaż intro',
				'Pokaż advanced logo',
				// Page 4
				'Pokaż inf. zapis/odczyt',
				'Włącz cheaty',
				'Automatyczna walka',
				'Ulepszona grafika 3D' // web port
			]
		],
		[
			GameLanguage.Czech,
			[
				// Page 1
				'Hudba',
				'Hlasitost',
				'Rozlišení',
				'Celá obrazovka',
				'Grafický filtr',
				'Grafické překrytí',
				'Efekty',
				// Page 2
				'Rychlost boje',
				'3D pohyb',
				'Otáčení pomocí šipek',
				'Zobrazit popisky tlačítek',
				'Zobrazit popisky statistik',
				'3D podlaha a strop',
				'Vzdálenost 3D mlhy',
				// Page 3
				'Zobrazit runy jako text',
				'Další pozice pro uložení',
				'Externí hudba',
				'Zobrazit logo Pyrdacor',
				'Zobrazit fantasy intro',
				'Zobrazit intro',
				'Zobrazit advanced logo',
				// Page 4
				'Info o uložení/nahrání',
				'Povolit cheaty',
				'Automatický boj',
				'Vylepšená 3D grafika' // web port
			]
		]
	]);
}

function GetFloorAndCeilingValues() {
	return floorAndCeilingValues ??= new Map([
		[GameLanguage.German, ['Aus', 'Boden', 'Decke', 'Beide']],
		[GameLanguage.English, ['None', 'Floor', 'Ceiling', 'Both']],
		[GameLanguage.French, ['Aucun', 'Sol', 'Plafond', 'Les deux']],
		[GameLanguage.Polish, ['Żadna', 'Podłoga', 'Sufit', 'Obie']],
		[GameLanguage.Czech, ['Žádné', 'Podlaha', 'Strop', 'Obojí']]
	]);
}

function GetDefaultBattleSpeedName() {
	return defaultBattleSpeedName ??= new Map([
		[GameLanguage.German, 'Standard'],
		[GameLanguage.English, 'Default'],
		[GameLanguage.French, 'Défaut'],
		[GameLanguage.Polish, 'Domyślna'],
		[GameLanguage.Czech, 'Výchozí']
	]);
}

function GetFullsizedWindowName() {
	return fullsizedWindowName ??= new Map([
		[GameLanguage.German, 'Fenster'],
		[GameLanguage.English, 'Window'],
		[GameLanguage.French, 'Fenêtre'],
		[GameLanguage.Polish, 'Okno'],
		[GameLanguage.Czech, 'Okno']
	]);
}

function GetMovement3DValues() {
	return movement3DValues ??= new Map([
		[GameLanguage.German, ['WASD', 'QWEASD']],
		[GameLanguage.English, ['WASD', 'QWEASD']],
		[GameLanguage.French, ['WASD', 'QWEASD']],
		[GameLanguage.Polish, ['WASD', 'QWEASD']],
		[GameLanguage.Czech, ['WASD', 'QWEASD']]
	]);
}

function GetAutoBattleOptions() {
	return autoBattleOptions ??= new Map([
		[GameLanguage.German, ['Aus', '5 Runden', '10 Runden', '15 Runden']],
		[GameLanguage.English, ['Off', '5 rounds', '10 rounds', '15 rounds']],
		[GameLanguage.French, ['Désactivé', '5 tours', '10 tours', '15 tours']],
		[GameLanguage.Polish, ['Wyłączone', '5 rund', '10 rund', '15 rund']],
		[GameLanguage.Czech, ['Vypnuto', '5 kol', '10 kol', '15 kol']]
	]);
}

export class Layout {
	static DraggedItem = DraggedItem;
	static MonsterCombatGraphic = MonsterCombatGraphic;
	static PortraitAnimation = PortraitAnimation;
	static PartyMemberPortaitState = PartyMemberPortaitState;
	static BattleFieldSlotMarker = BattleFieldSlotMarker;

	static get AutoBattleButtonType() { return ButtonType.Female + 1; }
	static get TicksPerBlink() { return Math.trunc(GameCore.TicksPerSecond / 4); }

	static get OptionNames() { return GetOptionNames(); }
	static get FloorAndCeilingValues() { return GetFloorAndCeilingValues(); }
	static get DefaultBattleSpeedName() { return GetDefaultBattleSpeedName(); }
	static get FullsizedWindowName() { return GetFullsizedWindowName(); }
	static get Movement3DValues() { return GetMovement3DValues(); }
	static get AutoBattleOptions() { return GetAutoBattleOptions(); }

	constructor(game, renderView, itemManager) {
		// field initializers
		this.Type = LayoutType.None;
		this.portraitBorders = [];
		this.portraitBackgrounds = newArray(GameCore.MaxPartyMembers, null);
		this.portraitBarBackgrounds = newArray(GameCore.MaxPartyMembers, null);
		this.portraits = newArray(GameCore.MaxPartyMembers, null);
		this.healerSymbol = null;
		this.portraitNames = newArray(GameCore.MaxPartyMembers, null);
		this.portraitStates = newArray(GameCore.MaxPartyMembers, PartyMemberPortaitState.None);
		this.characterStatusIcons = newArray(GameCore.MaxPartyMembers, null);
		this.characterBars = newArray(GameCore.MaxPartyMembers * 4, null); // 2 bars and each has fill and shadow color
		this.sprite80x80Picture = null;
		this.eventPicture = null;
		this.specialItemSprites = new Map();
		this.specialItemTexts = new Map();
		this.activeSpellSprites = new Map();
		this.activeSpellDurationBackgrounds = new Map();
		this.activeSpellDurationBars = new Map();
		this.monsterCombatGraphics = [];
		this.portraitAnimation = null;
		this.itemGrids = [];
		this.freeScrolledText = null;
		this.ChestText = null;
		this.questionYesButton = null;
		this.questionNoButton = null;
		this.draggedItem = null;
		this.draggedGold = 0;
		this.draggedFood = 0;
		this.OptionMenuOpen = false;
		this.FullscreenOptionUpdateRequested = new Event();
		this.draggedGoldOrFoodRemover = null;
		this.barAreas = [];
		this.filledAreas = [];
		this.fadeEffectAreas = [];
		this.fadeEffects = [];
		this.additionalSprites = [];
		this.texts = [];
		this.tooltips = [];
		this.battleFieldSlotMarkers = new Map();
		this.activeTooltipBackground = null;
		this.activeTooltipBorders = newArray(4, null);
		this.activeTooltipText = null;
		this.activeTooltip = null;
		this.inventoryMessage = null;
		this.battleMessage = null;
		this.battleEffectAnimations = [];
		this.activePopup = null;
		this.ignoreNextMouseUp = false;
		this.ButtonGridPage = 0;
		this.ticksPerMovement = null;
		this.TransportEnabled = false;
		this.BattleFieldSlotClicked = new Event();
		this.DraggedItemDropped = new Event();
		this.ExternalGraphicFilterChanged = new Event();
		this.ExternalGraphicFilterOverlayChanged = new Event();
		this.ExternalEffectsChanged = new Event();
		this.BattleSpeedChanged = new Event();
		this.MusicChanged = new Event();
		this.VolumeChanged = new Event();
		// Field initializers declared further down in the C# class
		this.initLaterFields();

		this.game = game;
		this.RenderView = renderView;
		this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.UI);
		this.renderLayer = renderView.GetLayer(Layer.UI);
		this.textLayer = renderView.GetLayer(Layer.Text);
		this.itemManager = itemManager;
		const paletteIndex = toByte(renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1);

		this.GlyphHeight = renderView.FontProvider.GetFont().GlyphHeight;

		this.sprite = this.RenderView.SpriteFactory.Create(320, 163, true);
		this.sprite.Layer = this.renderLayer;
		this.sprite.X = Global.LayoutX;
		this.sprite.Y = Global.LayoutY;
		this.sprite.DisplayLayer = 1;
		this.sprite.PaletteIndex = paletteIndex;

		this.AddStaticSprites();

		this.buttonGrid = new ButtonGrid(renderView);
		this.buttonGrid.RightMouseClicked.add(() => this.ButtonGrid_RightMouseClicked());

		this.healerSymbol = this.RenderView.SpriteFactory.Create(32, 29, true);
		this.healerSymbol.Layer = this.renderLayer;
		this.healerSymbol.X = 0;
		this.healerSymbol.Y = 0;
		this.healerSymbol.DisplayLayer = 10;
		this.healerSymbol.PaletteIndex = paletteIndex;
		this.healerSymbol.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.Talisman));
		this.healerSymbol.Visible = false;

		this.SetLayout(LayoutType.None);
	}

	get FreeTextScrollingActive() { return this.freeScrolledText != null; }
	get TextWaitsForClick() { return this.ChestText?.WithScrolling === true || this.InventoryMessageWaitsForClick || this.FreeTextScrollingActive; }
	get IsDragging() { return this.draggedItem != null || this.draggedGold !== 0 || this.draggedFood !== 0; }
	GetDraggedItem() { return this.draggedItem; }
	get Tooltips() { return this.tooltips; }
	get PopupActive() { return this.activePopup != null; }
	get PopupDisableButtons() { return this.activePopup?.DisableButtons === true; }
	get PopupClickCursor() { return this.activePopup?.ClickCursor === true; }

	/**
	 * GetTextRect(Rect rect), GetTextRect(Position position, Size size) or GetTextRect(int x, int y, int width, int height)
	 */
	GetTextRect(...args) {
		if (args.length === 4)
			return this.GetTextRect(new Rect(args[0], args[1], args[2], args[3]));
		if (args.length === 2)
			return this.GetTextRect(new Rect(args[0], args[1]));
		return Global.GetTextRect(this.GlyphHeight, args[0]);
	}

	ShowPortraitArea(show) {
		this.portraitBorders.forEach(b => b.Visible = show);
		this.portraitBarBackgrounds.slice().forEach(b => b.Visible = show);

		for (let i = 0; i < GameCore.MaxPartyMembers; ++i) {
			if (!show) {
				if (this.portraitBackgrounds[i] != null)
					this.portraitBackgrounds[i].Visible = false;
				if (this.portraits[i] != null)
					this.portraits[i].Visible = false;
				if (this.portraitNames[i] != null)
					this.portraitNames[i].Visible = false;
				if (this.characterStatusIcons[i] != null)
					this.characterStatusIcons[i].Visible = false;
			}

			let showBar = show;

			if (this.game.CurrentSavegame == null)
				showBar = false;
			else if (showBar)
				showBar = this.game.GetPartyMember(i)?.Alive === true;

			for (let n = 0; n < 2; ++n)
				this.characterBars[i * 4 + n].Visible = showBar;

			if (showBar) {
				const partyMember = this.game.GetPartyMember(i);
				showBar = partyMember != null ? ClassExtensions.IsMagic(partyMember.Class) : false;
			}

			for (let n = 0; n < 2; ++n)
				this.characterBars[i * 4 + 2 + n].Visible = showBar;
		}
	}

	ToggleButtonGridPage() {
		if (this.Type === LayoutType.Map2D ||
			this.Type === LayoutType.Map3D) {
			if (this.game.InputEnable) {
				this.ButtonGridPage = 1 - this.ButtonGridPage;
				this.SetLayout(this.Type, this.ticksPerMovement);
				this.buttonGrid?.HideTooltips();
			}
		}
	}

	ButtonGrid_RightMouseClicked() {
		if (this.game.CursorType === CursorType.Sword)
			this.ToggleButtonGridPage();
	}

	AddStaticSprites() {
		const barBackgroundTexCoords = this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.CharacterValueBarFrames));
		for (let i = 0; i < GameCore.MaxPartyMembers; ++i) {
			const barBackgroundSprite = this.portraitBarBackgrounds[i] = this.RenderView.SpriteFactory.Create(16, 36, true);
			barBackgroundSprite.Layer = this.renderLayer;
			barBackgroundSprite.PaletteIndex = this.game.PrimaryUIPaletteIndex;
			barBackgroundSprite.TextureAtlasOffset = barBackgroundTexCoords;
			barBackgroundSprite.X = Global.PartyMemberPortraitAreas[i].Left + 33;
			barBackgroundSprite.Y = Global.PartyMemberPortraitAreas[i].Top;
			barBackgroundSprite.Visible = true;
		}

		// Left portrait border
		let sprite = this.RenderView.SpriteFactory.Create(16, 36, true);
		sprite.Layer = this.renderLayer;
		sprite.PaletteIndex = this.game.PrimaryUIPaletteIndex;
		sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.LeftPortraitBorder));
		sprite.X = 0;
		sprite.Y = 0;
		sprite.Visible = true;
		this.portraitBorders.push(sprite);

		// Right portrait border
		sprite = this.RenderView.SpriteFactory.Create(16, 36, true);
		sprite.Layer = this.renderLayer;
		sprite.PaletteIndex = this.game.PrimaryUIPaletteIndex;
		sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.RightPortraitBorder));
		sprite.X = Global.VirtualScreenWidth - 16;
		sprite.Y = 0;
		sprite.Visible = true;
		this.portraitBorders.push(sprite);

		// Thin portrait borders
		for (let i = 0; i < GameCore.MaxPartyMembers; ++i) {
			sprite = this.RenderView.SpriteFactory.Create(32, 1, true);
			sprite.Layer = this.renderLayer;
			sprite.PaletteIndex = this.game.PrimaryUIPaletteIndex;
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetCustomUIGraphicIndex(UICustomGraphic.PortraitBorder));
			sprite.X = 16 + i * 48;
			sprite.Y = 0;
			sprite.Visible = true;
			this.portraitBorders.push(sprite);

			sprite = this.RenderView.SpriteFactory.Create(32, 1, true);
			sprite.Layer = this.renderLayer;
			sprite.PaletteIndex = this.game.PrimaryUIPaletteIndex;
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetCustomUIGraphicIndex(UICustomGraphic.PortraitBorder));
			sprite.X = 16 + i * 48;
			sprite.Y = 35;
			sprite.Visible = true;
			this.portraitBorders.push(sprite);

			// LP shadow
			this.characterBars[i * 4 + 0] = new Bar(this.barAreas, this.CreateArea(new Rect((i + 1) * 48 + 2, 19, 1, 16),
				this.game.GetNamedPaletteColor(NamedPaletteColors.LPBarShadow), 1, FilledAreaType.CharacterBar), 16, false);
			// LP fill
			this.characterBars[i * 4 + 1] = new Bar(this.barAreas, this.CreateArea(new Rect((i + 1) * 48 + 3, 19, 3, 16),
				this.game.GetNamedPaletteColor(NamedPaletteColors.LPBar), 1, FilledAreaType.CharacterBar), 16, false);
			// SP shadow
			this.characterBars[i * 4 + 2] = new Bar(this.barAreas, this.CreateArea(new Rect((i + 1) * 48 + 10, 19, 1, 16),
				this.game.GetNamedPaletteColor(NamedPaletteColors.SPBarShadow), 1, FilledAreaType.CharacterBar), 16, false);
			// SP fill
			this.characterBars[i * 4 + 3] = new Bar(this.barAreas, this.CreateArea(new Rect((i + 1) * 48 + 11, 19, 3, 16),
				this.game.GetNamedPaletteColor(NamedPaletteColors.SPBar), 1, FilledAreaType.CharacterBar), 16, false);
		}
	}

	SetLayout(layoutType, ticksPerMovement = null) {
		this.ticksPerMovement = ticksPerMovement;
		this.Type = layoutType;

		if (layoutType === LayoutType.None) {
			this.sprite.Visible = false;
		} else {
			this.sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.LayoutOffset + (layoutType - 1));
			this.sprite.DisplayLayer = layoutType === LayoutType.Automap ? 10 : 1;
			this.sprite.Visible = true;
		}

		this.buttonGrid.Visible = layoutType !== LayoutType.None && layoutType !== LayoutType.Event && layoutType !== LayoutType.Automap;

		this.UpdateLayoutButtons(ticksPerMovement);
	}

	OpenOptionMenu() {
		this.OptionMenuOpen = true;
		this.game.InputEnable = false;
		this.game.Pause();
		let area;
		switch (this.Type) {
			case LayoutType.Map2D: area = GameCore.Map2DViewArea; break;
			case LayoutType.Map3D: area = GameCore.Map3DViewArea; break;
			case LayoutType.Battle: area = Global.CombatBackgroundArea; break;
			default: throw new AmbermoonException(ExceptionScope.Application, 'Open option menu from the current window is not supported.');
		}
		this.AddSprite(area, Graphics.GetCustomUIGraphicIndex(UICustomGraphic.MapDisableOverlay), this.game.UIPaletteIndex, 1);
		const versionString = this.game.GetFullVersion();
		let boxArea;
		let textArea;
		if (this.Type === LayoutType.Battle) {
			boxArea = new Rect(88, 64, 144, 40);
			textArea = new Rect(88, 67, 144, 40);
		} else {
			boxArea = new Rect(32, 90, 144, 40);
			textArea = new Rect(32, 93, 144, 40);
		}
		this.AddSprite(boxArea, Graphics.GetCustomUIGraphicIndex(UICustomGraphic.BiggerInfoBox), this.game.UIPaletteIndex, 2);
		this.AddText(textArea, versionString, TextColor.BrightGray, TextAlign.Center, 3);
		// Web port: thanks to the author of Ambermoon.net (clickable, opens his page)
		this.pyrdacorLinkArea = new Rect(boxArea.X, boxArea.Y + boxArea.Height + 3, boxArea.Width, 8);
		this.AddText(this.pyrdacorLinkArea, 'THANKS TO PYRDACOR', TextColor.LightYellow, TextAlign.Center, 3);

		this.buttonGrid.SetButton(0, ButtonType.Quit, false, () => this.game.Quit(), false, Button.GetTooltip(this.game.GameLanguage, Button.TooltipType.Quit));
		this.buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
		this.buttonGrid.SetButton(2, ButtonType.Exit, false, () => this.CloseOptionMenu(), false, Button.GetTooltip(this.game.GameLanguage, Button.TooltipType.Exit));
		this.buttonGrid.SetButton(3, ButtonType.Opt, false, () => this.OpenOptions(), false, Button.GetTooltip(this.game.GameLanguage, Button.TooltipType.Options));
		this.buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
		this.buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
		this.buttonGrid.SetButton(6, ButtonType.Save, this.game.BattleActive, () => this.OpenSaveMenu(), false, Button.GetTooltip(this.game.GameLanguage, Button.TooltipType.Save));
		this.buttonGrid.SetButton(7, ButtonType.Load, false, () => this.OpenLoadMenu(), false, Button.GetTooltip(this.game.GameLanguage, Button.TooltipType.Load));
		this.buttonGrid.SetButton(8, ButtonType.Stats, false, () => this.NewGame(), false, Button.GetTooltip(this.game.GameLanguage, Button.TooltipType.New));

		if (this.game.BattleActive)
			this.game.HideAutoBattleRounds();
	}

	CloseOptionMenu() {
		this.OptionMenuOpen = false;
		last(this.additionalSprites)?.Delete(); // info box
		removeItem(this.additionalSprites, last(this.additionalSprites));
		last(this.additionalSprites)?.Delete(); // map disable overlay
		removeItem(this.additionalSprites, last(this.additionalSprites));
		last(this.texts)?.Destroy(); // thanks text (web port)
		removeItem(this.texts, last(this.texts));
		this.pyrdacorLinkArea = null;
		last(this.texts)?.Destroy(); // version string
		removeItem(this.texts, last(this.texts));
		this.UpdateLayoutButtons(this.ticksPerMovement);
		if (this.game.BattleActive)
			this.game.SetupBattleButtons();
		this.game.Resume();
		this.game.InputEnable = true;

		if (!this.game.BattleActive)
			this.game.ShowMobileTouchPadHandler();
	}

	ShowButtons(show) {
		this.buttonGrid.Visible = show;
	}

	EnableButton(index, enable) {
		this.buttonGrid.EnableButton(index, enable);
	}

	GetButton(index) { return this.buttonGrid.GetButton(index); }

	get ButtonsDisabled() { return this.buttonGrid.Disabled; }
	set ButtonsDisabled(value) { this.buttonGrid.Disabled = value; }

	OpenPopup(position, columns, rows,
		disableButtons = true, closeOnClick = true, displayLayerOffset = 0) {
		this.buttonGrid?.HideTooltips();
		this.activePopup = new Popup(this.game, this.RenderView, position, columns, rows, false, displayLayerOffset);
		this.activePopup.DisableButtons = disableButtons;
		this.activePopup.CloseOnClick = closeOnClick;
		return this.activePopup;
	}

	/**
	 * Overload 1: OpenTextPopup(IText text, Position position, int maxWidth, int maxTextHeight, bool disableButtons = true,
	 *   bool closeOnClick = true, bool transparent = false, TextColor textColor = BrightGray, Action? closeAction = null,
	 *   TextAlign textAlign = Left, byte displayLayerOffset = 0, byte? paletteOverride = null)
	 * Overload 2: OpenTextPopup(IText text, Action? closeAction, bool disableButtons = false, bool closeOnClick = true,
	 *   bool transparent = false, TextAlign textAlign = Left, byte displayLayerOffset = 0, byte? paletteOverride = null,
	 *   Position? offset = null)
	 */
	OpenTextPopup(text, ...args) {
		if (args[0] instanceof Position) {
			let [position, maxWidth, maxTextHeight, disableButtons = true, closeOnClick = true, transparent = false,
				textColor = TextColor.BrightGray, closeAction = null, textAlign = TextAlign.Left,
				displayLayerOffset = 0, paletteOverride = null] = args;
			this.buttonGrid?.HideTooltips();
			this.ClosePopup(false);
			const processedText = this.RenderView.TextProcessor.WrapText(text,
				new Rect(0, 0, maxWidth, 2147483647),
				new Size(Global.GlyphWidth, Global.GlyphLineHeight));
			const textBounds = new Rect(position.X + (transparent ? 0 : 16), position.Y + (transparent ? 0 : 16),
				maxWidth, Math.min(processedText.LineCount * Global.GlyphLineHeight, maxTextHeight));
			const popupRows = Math.max(4, transparent ? Math.trunc(maxTextHeight / Global.GlyphLineHeight) : 2 + Math.trunc((textBounds.Height + 15) / 16));

			if (!transparent)
				textBounds.Position.Y += Math.trunc(((popupRows - 2) * 16 - textBounds.Height) / 2);

			const scrolling = Math.trunc(textBounds.Height / Global.GlyphLineHeight) < processedText.LineCount;
			this.activePopup = new Popup(this.game, this.RenderView, position, transparent ? Math.trunc(maxWidth / Global.GlyphWidth) : 18, popupRows, transparent, displayLayerOffset);
			this.activePopup.DisableButtons = disableButtons;
			this.activePopup.CloseOnClick = closeOnClick;
			const uiText = this.activePopup.AddText(textBounds, processedText, textColor, textAlign, true, 1, scrolling, this);

			if (this.activePopup.CloseOnClick && scrolling)
				this.activePopup.CloseOnClick = false;

			if (paletteOverride != null)
				uiText.PaletteIndex = paletteOverride;

			if (closeAction != null)
				this.activePopup.Closed.add(closeAction);

			if (scrolling && this.game.CoreConfiguration.IsMobile)
				this.activePopup.CanAbort = false;

			return this.activePopup;
		}

		let [closeAction, disableButtons = false, closeOnClick = true, transparent = false, textAlign = TextAlign.Left,
			displayLayerOffset = 0, paletteOverride = null, offset = null] = args;
		const maxTextWidth = 256;
		const maxTextHeight = 112;

		offset ??= new Position();

		const popup = this.OpenTextPopup(text, new Position(16 + offset.X, 53 + offset.Y), maxTextWidth, maxTextHeight, disableButtons,
			closeOnClick, transparent, TextColor.BrightGray, closeAction, textAlign, displayLayerOffset, paletteOverride);
		return popup;
	}

	OpenWaitPopup() {
		if (this.game.MonsterSeesPlayer) {
			this.game.ShowTextPopup(this.game.ProcessText(this.game.DataNameProvider.CannotWaitBecauseOfNearbyMonsters), null);
			return;
		}

		this.buttonGrid?.HideTooltips();
		this.ClosePopup(false);
		this.activePopup = new Popup(this.game, this.RenderView, new Position(64, 64), 11, 6, false);
		this.activePopup.DisableButtons = true;
		this.activePopup.CloseOnClick = false;
		// Message display
		const messageArea = new Rect(79, 98, 145, 10);
		this.activePopup.AddSunkenBox(messageArea);
		this.activePopup.AddText(messageArea.CreateModified(1, 2, -1, -3), this.game.DataNameProvider.WaitHowManyHours,
			TextColor.LightOrange, TextAlign.Center);
		// Amount input
		const input = this.activePopup.AddTextInput(new Position(128, 119), 7, TextAlign.Center,
			TextInput.ClickAction.FocusOrSubmit, TextInput.ClickAction.LoseFocus);
		input.DigitsOnly = true;
		input.MaxIntegerValue = 24;
		input.ReactToGlobalClicks = true;
		input.ClearOnNewInput = true;
		input.Text = '0';
		input.Aborted.add(() => this.game.CursorType = CursorType.Sword);
		input.InputSubmitted.add(_ => this.game.CursorType = CursorType.Sword);

		const Wait = () => {
			this.ClosePopup(true, true);
			this.game.Wait(input.Value);
		};

		const ChangeInputValueTo = amount => {
			input.Text = String(Util.Limit(0, amount, 24));
		};

		const ChangeInputValue = changeAmount => {
			ChangeInputValueTo(input.Value + changeAmount);
		};

		// Increase and decrease buttons
		const increaseButton = this.activePopup.AddButton(new Position(80, 110));
		const decreaseButton = this.activePopup.AddButton(new Position(80, 127));
		increaseButton.ButtonType = ButtonType.MoveUp;
		decreaseButton.ButtonType = ButtonType.MoveDown;
		increaseButton.DisplayLayer = 200;
		decreaseButton.DisplayLayer = 200;
		increaseButton.LeftClickAction = () => ChangeInputValue(1);
		decreaseButton.LeftClickAction = () => ChangeInputValue(-1);
		increaseButton.RightClickAction = () => ChangeInputValueTo(24);
		decreaseButton.RightClickAction = () => ChangeInputValueTo(0);
		increaseButton.InstantAction = true;
		decreaseButton.InstantAction = true;
		increaseButton.ContinuousActionDelayInTicks = Math.trunc(GameCore.TicksPerSecond / 5);
		decreaseButton.ContinuousActionDelayInTicks = Math.trunc(GameCore.TicksPerSecond / 5);
		increaseButton.ContinuousActionDelayReductionInTicks = 1;
		decreaseButton.ContinuousActionDelayReductionInTicks = 1;
		// OK button
		const okButton = this.activePopup.AddButton(new Position(192, 127));
		okButton.ButtonType = ButtonType.Ok;
		okButton.DisplayLayer = 200;
		okButton.LeftClickAction = Wait;
		this.activePopup.ReturnAction = Wait;
		this.activePopup.Closed.add(() => {
			this.game.Resume();
			this.game.InputEnable = true;
			this.game.CursorType = CursorType.Sword;
			this.game.UpdateCursor();
		});
		this.game.Pause();
		this.game.InputEnable = false;
		this.game.CursorType = CursorType.Sword;
	}

	OpenInputPopup(position, inputLength, inputHandler) {
		const openPopup = this.activePopup;
		const popup = this.OpenPopup(position, 2 + Math.trunc(((inputLength + 1) * Global.GlyphWidth + 14) / 16), 3, true, false, 21);
		const input = popup.AddTextInput(Position.op_Addition(position, new Position(16, 18)), inputLength, TextAlign.Left,
			TextInput.ClickAction.Submit, TextInput.ClickAction.Abort);
		input.SetFocus();
		input.ReactToGlobalClicks = true;
		const Close = () => {
			input?.LoseFocus();
			this.game.CursorType = CursorType.Sword;
			this.ClosePopup();
			this.activePopup = openPopup;
		};
		input.InputSubmitted.add(inputText => {
			Close();
			inputHandler?.(inputText);
		});
		input.Aborted.add(Close);
		return popup;
	}

	OpenYesNoPopup(text, yesAction, noAction,
		closeAction, minLines = 1, displayLayerOffset = 0,
		textAlign = TextAlign.Left) {
		this.buttonGrid?.HideTooltips();
		this.ClosePopup(false);
		const maxTextWidth = 192;
		const processedText = this.RenderView.TextProcessor.WrapText(text,
			new Rect(48, 0, maxTextWidth, 2147483647),
			new Size(Global.GlyphWidth, Global.GlyphLineHeight));
		const textBounds = new Rect(48, 95, maxTextWidth, Math.max(minLines + 1, processedText.LineCount) * Global.GlyphLineHeight);
		const renderText = this.RenderView.RenderTextFactory.Create(
			toByte(this.RenderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1), this.textLayer,
			processedText, TextColor.BrightGray, true, this.GetTextRect(textBounds), textAlign);
		renderText.PaletteIndex = this.game.TextPaletteIndex;
		const popupRows = Math.max(minLines + 2, 2 + Math.trunc((textBounds.Height + 36) / 16));
		this.activePopup = new Popup(this.game, this.RenderView, new Position(32, 74), 14, popupRows, false, displayLayerOffset);
		this.activePopup.DisableButtons = true;
		this.activePopup.CloseOnClick = false;
		this.activePopup.AddText(renderText);
		this.activePopup.Closed.add(closeAction);

		const yesButton = this.activePopup.AddButton(new Position(111, 41 + popupRows * 16));
		const noButton = this.activePopup.AddButton(new Position(143, 41 + popupRows * 16));

		yesButton.DisplayLayer = toByte(Util.Limit(200, yesButton.DisplayLayer, 253));
		noButton.DisplayLayer = toByte(Math.min(254, Util.Max(noButton.DisplayLayer, 210, yesButton.DisplayLayer + 10)));

		yesButton.ButtonType = ButtonType.Yes;
		noButton.ButtonType = ButtonType.No;

		yesButton.LeftClickAction = yesAction;
		noButton.LeftClickAction = noAction;

		this.activePopup.ReturnAction = () => yesButton.PressImmediately(this.game, false, true);

		return this.activePopup;
	}

	/**
	 * Overload 1 (private): ClosePopup(Popup popup, bool raiseEvent = true)
	 * Overload 2: ClosePopup(bool raiseEvent = true, bool force = false)
	 */
	ClosePopup(...args) {
		if (args.length !== 0 && typeof args[0] !== 'boolean') {
			// ClosePopup(Popup popup, bool raiseEvent = true)
			const popup = args[0];
			const raiseEvent = args.length > 1 ? args[1] : true;
			if (raiseEvent) {
				// The close event may close the popup itself.
				// In that case we must not destroy it here as
				// it might be a completely new popup.
				const oldPopup = popup;
				popup?.OnClosed();

				if (oldPopup !== popup)
					return;
			}
			popup?.Destroy();
			return;
		}

		const raiseEvent = args.length > 0 ? args[0] : true;
		const force = args.length > 1 ? args[1] : false;

		// Note: As ClosePopup may trigger popup?.OnClosed
		// and this event might open a new popup we have
		// to set activePopup to null BEFORE we call it!
		const popup = this.activePopup;

		if (popup != null && !popup.CanAbort && !force)
			return;

		this.activePopup = null;
		if (popup == null)
			return; // ClosePopup(null, raiseEvent) does nothing
		this.ClosePopup(popup, raiseEvent);
	}

	GetPopupClickIndicatorPosition() {
		if (this.activePopup == null)
			return new Position();

		return new Position(this.activePopup.ContentArea.Center.X - 8, this.activePopup.ContentArea.Bottom);
	}

	ClearLeftUpIgnoring() { this.ignoreNextMouseUp = false; }

	NewGame() {
		const ClosePopup = () => this.ClosePopup(false, true);

		this.OpenYesNoPopup(this.game.ProcessText(this.game.GetCustomText(CustomTexts.Index.ReallyStartNewGame)),
			() => {
				ClosePopup();
				this.game.NewGame();
			}, ClosePopup, ClosePopup);
	}

	OpenLoadMenu(preLoadAction = null, abortAction = null,
		loadInitialSavegameOnFailure = false) {
		let [savegameNames] = this.game.SavegameManager.GetSavegameNames(this.RenderView.GameData, GameCore.NumBaseSavegameSlots);
		const extended = this.game.CoreConfiguration.ExtendedSavegameSlots;

		if (extended)
			savegameNames = [...savegameNames, ...this.game.AdditionalSavegameNames];

		const position = extended ? new Position(13, 38) : new Position(16, 62);
		const maxItems = extended ? 16 : 10;
		const savegamePopup = this.OpenPopup(position, extended ? 19 : 18, extended ? 10 : 7, true, false);
		this.activePopup.AddText(new Rect(24, extended ? 54 : 78, 272, 6), this.game.DataNameProvider.LoadWhichSavegame, TextColor.BrightGray, TextAlign.Center);

		const Close = () => {
			this.ClosePopup(false);
			abortAction?.();
		};

		const Load = (slot, name) => {
			if (!isNullOrEmpty(name)) {
				this.ClosePopup(false);
				this.OpenYesNoPopup(this.game.ProcessText(this.game.DataNameProvider.ReallyLoad), () => {
					this.ClosePopup();
					this.game.LoadGame(slot, true, loadInitialSavegameOnFailure, preLoadAction, false, s => {
						if (this.game.CoreConfiguration.ShowSaveLoadMessage) {
							this.game.ShowBriefMessagePopup(
								s === 0 ? CustomTexts.GetText(this.game.GameLanguage, CustomTexts.Index.InitialGameLoaded) :
									format(CustomTexts.GetText(this.game.GameLanguage, CustomTexts.Index.GameLoaded), s),
								1500);
						}
					}, true);
				}, Close, Close);
			}
		};

		const listBox = this.activePopup.AddSavegameListBox(savegameNames.map(name =>
			({ Key: name, Value: (slot, name) => Load(slot + 1, name) })
		), false, maxItems, extended ? -23 : 0);

		if (extended) {
			const scrollRange = Math.max(0, savegameNames.length - 16);
			const scrollbar = this.activePopup.AddScrollbar(this, scrollRange, 2, 9);
			scrollbar.Scrolled.add(offset => listBox.ScrollTo(offset));
		}

		savegamePopup.Closed.add(Close);
	}

	OpenSaveMenu() {
		let [savegameNames] = this.game.SavegameManager.GetSavegameNames(this.RenderView.GameData, GameCore.NumBaseSavegameSlots);
		const extended = this.game.CoreConfiguration.ExtendedSavegameSlots;

		if (extended)
			savegameNames = [...savegameNames, ...this.game.AdditionalSavegameNames];

		const position = extended ? new Position(13, 38) : new Position(16, 62);
		const maxItems = extended ? 16 : 10;

		this.OpenPopup(position, extended ? 19 : 18, extended ? 10 : 7, true, false);
		this.activePopup.AddText(new Rect(24, extended ? 54 : 78, 272, 6), this.game.DataNameProvider.SaveWhichSavegame, TextColor.BrightGray, TextAlign.Center);

		const Close = () => this.ClosePopup(false);

		const Save = (slot, name) => {
			const SaveInner = (slot, name) => {
				this.game.SaveGame(slot, name);
				this.game.SetAdditionalSavegamesContinueSlot(slot);

				if (this.game.CoreConfiguration.ShowSaveLoadMessage) {
					this.game.ShowBriefMessagePopup(
						format(CustomTexts.GetText(this.game.GameLanguage, CustomTexts.Index.GameSaved), name),
						1500);
				}
			};

			if (isNullOrEmpty(name)) {
				Close();
				return;
			}

			if (isNullOrEmpty(savegameNames[slot - 1])) {
				this.ClosePopup();
				SaveInner(slot, name);
			} else {
				this.OpenYesNoPopup(this.game.ProcessText(this.game.DataNameProvider.ReallyOverwriteSave), () => {
					this.ClosePopup();
					SaveInner(slot, name);
				}, Close, Close);
			}
		};

		const listBox = this.activePopup.AddSavegameListBox(savegameNames.map(name =>
			({ Key: name, Value: (slot, name) => Save(slot + 1, name) })
		), true, maxItems, extended ? -23 : 0);

		if (extended) {
			const scrollRange = Math.max(0, savegameNames.length - 16);
			const scrollbar = this.activePopup.AddScrollbar(this, scrollRange, 2, 9);
			scrollbar.Scrolled.add(offset => listBox.ScrollTo(offset));
		}
	}

	UpdateFullscreenOption() {
		this.FullscreenOptionUpdateRequested.invoke();
	}

	OpenOptions() {
		let page = 0;

		this.OpenPopup(new Position(48, 62), 14, 7, true, false);
		this.activePopup.AddText(new Rect(56, 78, 208, 6), this.game.DataNameProvider.OptionsHeader, TextColor.BrightGray, TextAlign.Center);

		const game = this.game;
		const optionNames = getValue(Layout.OptionNames, game.GameLanguage);
		let changedConfiguration = false;
		let windowChange = false; // an option was changed that affects the window (screen ratio, resolution, fullscreen)
		let listBox = null;
		const on = game.DataNameProvider.On;
		const off = game.DataNameProvider.Off;
		let width = game.CoreConfiguration.Width ?? 1280;
		let cheatsEnabled = game.CoreConfiguration.EnableCheats;
		const nullOptionAction = null;
		const options = [];

		const WindowModeNameProvider = windowMode => {
			switch (windowMode) {
				case WindowMode.Fullscreen: return on;
				case WindowMode.FullsizedWindow: return getValue(Layout.FullsizedWindowName, game.GameLanguage);
				default: return off;
			}
		};

		const ToggleResolutionAction = (index, _) => ToggleResolution();

		const AddOption = action => options.push({ Key: '', Value: action });

		const GetResolutionString = () => {
			const resolution = ConfigurationExtensions.GetScreenResolution(game.CoreConfiguration);
			return `${resolution.Width}x${resolution.Height}`;
		};
		const SetOptionString = (optionIndex, value) => {
			const index = optionIndex - page * OptionsPerPage;

			if (index < 0 || index >= OptionsPerPage)
				return;

			let optionString = optionNames[optionIndex];
			const remainingSpace = 31 - optionString.length - value.length;
			optionString += ' '.repeat(remainingSpace);
			optionString += value;
			listBox.SetItemText(index, optionString);
		};
		const SetOptionAction = (optionIndex, action) => {
			const index = optionIndex - page * OptionsPerPage;

			if (index < 0 || index >= OptionsPerPage)
				return;

			listBox.SetItemAction(index, action);
		};
		const GetFloorAndCeilingValueString = () => {
			let index = 0;

			if (game.CoreConfiguration.ShowFloor) {
				if (game.CoreConfiguration.ShowCeiling)
					index = 3;
				else
					index = 1;
			} else if (game.CoreConfiguration.ShowCeiling) {
				index = 2;
			}

			return getValue(Layout.FloorAndCeilingValues, game.GameLanguage)[index];
		};
		// Page 1
		const SetMusic = () => SetOptionString(0, game.CoreConfiguration.Music ? on : off);
		const SetVolume = () => SetOptionString(1, String(Util.Limit(0, game.CoreConfiguration.Volume, 100)));
		const SetResolution = () => SetOptionString(2, GetResolutionString());
		const SetFullscreen = () => SetOptionString(3, WindowModeNameProvider(game.CoreConfiguration.WindowMode));
		const SetGraphicFilter = () => SetOptionString(4, game.CoreConfiguration.GraphicFilter === GraphicFilter.None ? off
			: game.CoreConfiguration.GraphicFilter === GraphicFilter.PixelArt ? (game.GameLanguage === GameLanguage.German ? 'Pixelart' : 'Pixel art') // web port
			: enumName(GraphicFilter, game.CoreConfiguration.GraphicFilter));
		const SetGraphicFilterOverlay = () => SetOptionString(5, game.CoreConfiguration.GraphicFilterOverlay === GraphicFilterOverlay.None ? off : enumName(GraphicFilterOverlay, game.CoreConfiguration.GraphicFilterOverlay));
		const SetEffects = () => SetOptionString(6, game.CoreConfiguration.Effects === Effects.None ? off : enumName(Effects, game.CoreConfiguration.Effects));
		// Page 2
		const SetBattleSpeed = () => SetOptionString(7, game.CoreConfiguration.BattleSpeed === 0 ? getValue(Layout.DefaultBattleSpeedName, game.GameLanguage) : `+${game.CoreConfiguration.BattleSpeed}%`);
		const Set3DMovement = () => SetOptionString(8, getValue(Layout.Movement3DValues, game.GameLanguage)[Util.Limit(0, game.CoreConfiguration.Movement3D, 1)]);
		const SetTurnWithArrowKeys = () => SetOptionString(9, game.CoreConfiguration.TurnWithArrowKeys ? on : off);
		const SetTooltips = () => SetOptionString(10, game.CoreConfiguration.ShowButtonTooltips ? on : off);
		const SetPlayerStatsTooltips = () => SetOptionString(11, game.CoreConfiguration.ShowPlayerStatsTooltips ? on : off);
		const SetFloorAndCeiling = () => SetOptionString(12, GetFloorAndCeilingValueString());
		const SetFog = () => SetOptionString(13, game.CoreConfiguration.ShowFog ? on : off);
		// Page 3
		const SetAutoDerune = () => SetOptionString(14, game.CoreConfiguration.AutoDerune ? on : off);
		const SetExtendedSaves = () => SetOptionString(15, game.CoreConfiguration.ExtendedSavegameSlots ? on : off);
		const SetExternalMusic = () => SetOptionString(16, game.CoreConfiguration.ExternalMusic ? on : off);
		const SetPyrdacorLogo = () => SetOptionString(17, game.CoreConfiguration.ShowPyrdacorLogo ? on : off);
		const SetFantasyIntro = () => SetOptionString(18, game.CoreConfiguration.ShowFantasyIntro ? on : off);
		const SetIntro = () => SetOptionString(19, game.CoreConfiguration.ShowIntro ? on : off);
		const SetAdvancedLogo = () => SetOptionString(20, game.CoreConfiguration.ShowAdvancedLogo ? on : off);
		// Page 4
		const SetSaveLoadInfo = () => SetOptionString(21, game.CoreConfiguration.ShowSaveLoadMessage ? on : off);
		const SetCheats = () => SetOptionString(22, cheatsEnabled ? on : off);
		const SetEnhanced3D = () => SetOptionString(24, game.CoreConfiguration.Enhanced3D !== false ? on : off); // web port
		const SetAutoBattle = () => SetOptionString(23,getValue(Layout.AutoBattleOptions, game.GameLanguage)[Util.Limit(0, Math.trunc(game.CoreConfiguration.AutoBattleRounds / 5), 3)]);

		const UpdateShowFogOption = () => SetOptionAction(13, game.CoreConfiguration.ShowFloor && game.CoreConfiguration.ShowCeiling ? ((index, _) => ToggleFog()) : nullOptionAction);

		const ShowOptions = () => {
			switch (page) {
				default:
				case 0:
					SetMusic();
					SetVolume();
					SetResolution();
					SetFullscreen();
					SetGraphicFilter();
					SetGraphicFilterOverlay();
					SetEffects();
					break;
				case 1:
					SetBattleSpeed();
					Set3DMovement();
					SetTurnWithArrowKeys();
					SetTooltips();
					SetPlayerStatsTooltips();
					SetFloorAndCeiling();
					SetFog();
					break;
				case 2:
					SetAutoDerune();
					SetExtendedSaves();
					SetExternalMusic();
					SetPyrdacorLogo();
					SetFantasyIntro();
					SetIntro();
					SetAdvancedLogo();
					break;
				case 3:
					SetSaveLoadInfo();
					SetCheats();
					SetAutoBattle();
					SetEnhanced3D();
					break;
			}
		};

		const ToggleMusic = () => {
			game.CoreConfiguration.Music = !game.CoreConfiguration.Music;
			game.AudioOutput.Enabled = game.CoreConfiguration.Music;
			if (game.AudioOutput.Available && game.AudioOutput.Enabled)
				game.ContinueMusic();
			SetMusic();
			changedConfiguration = true;
		};
		const ToggleVolume = () => {
			game.CoreConfiguration.Volume = Math.trunc((game.CoreConfiguration.Volume + 10) / 10) * 10;
			while (game.CoreConfiguration.Volume > 100)
				game.CoreConfiguration.Volume -= 100;
			game.CoreConfiguration.Volume = Math.max(0, game.CoreConfiguration.Volume);
			game.AudioOutput.Volume = game.CoreConfiguration.Volume / 100.0;
			SetVolume();
			changedConfiguration = true;
		};
		const ToggleGraphicFilter = () => {
			game.CoreConfiguration.GraphicFilter = (game.CoreConfiguration.GraphicFilter + 1) % EnumHelper.GetValues(GraphicFilter).length;
			SetGraphicFilter();
			changedConfiguration = true;
			game.NotifyConfigurationChange(false);
		};
		const ToggleGraphicFilterAddition = () => {
			game.CoreConfiguration.GraphicFilterOverlay = (game.CoreConfiguration.GraphicFilterOverlay + 1) % EnumHelper.GetValues(GraphicFilterOverlay).length;
			SetGraphicFilterOverlay();
			changedConfiguration = true;
			game.NotifyConfigurationChange(false);
		};
		const ToggleResolution = () => {
			if (game.CoreConfiguration.WindowMode !== WindowMode.Normal)
				return;

			game.NotifyResolutionChange(width);
			width = game.CoreConfiguration.Width;
			SetResolution();
			changedConfiguration = true;
			windowChange = true;
		};
		const FullscreenUpdated = () => {
			listBox.SetItemAction(2, game.CoreConfiguration.WindowMode !== WindowMode.Normal ? null : ToggleResolutionAction);
			options[2] = { Key: options[2].Key, Value: game.CoreConfiguration.WindowMode !== WindowMode.Normal || game.CoreConfiguration.IsMobile ? null : ToggleResolutionAction };

			if (game.CoreConfiguration.WindowMode === WindowMode.Normal)
				SetResolution();

			SetFullscreen();
		};
		const ToggleFullscreen = () => {
			game.CoreConfiguration.WindowMode = (game.CoreConfiguration.WindowMode + 1) % 3;

			game.RequestFullscreenChange(game.CoreConfiguration.WindowMode);

			FullscreenUpdated();

			changedConfiguration = true;
			windowChange = true;
		};
		const ToggleBattleSpeed = () => {
			if (game.CoreConfiguration.BattleSpeed >= 100)
				game.CoreConfiguration.BattleSpeed = 0;
			else
				game.CoreConfiguration.BattleSpeed += 10;

			SetBattleSpeed();
			game.SetBattleSpeed(game.CoreConfiguration.BattleSpeed);

			changedConfiguration = true;
		};
		const Toggle3DMovement = () => {
			game.CoreConfiguration.Movement3D = (game.CoreConfiguration.Movement3D + 1) % 2;
			Set3DMovement();
			changedConfiguration = true;
		};
		const ToggleTurnWithArrowKeys = () => {
			game.CoreConfiguration.TurnWithArrowKeys = !game.CoreConfiguration.TurnWithArrowKeys;
			SetTurnWithArrowKeys();
			changedConfiguration = true;
		};
		const ToggleTooltips = () => {
			game.CoreConfiguration.ShowButtonTooltips = !game.CoreConfiguration.ShowButtonTooltips;
			SetTooltips();
			changedConfiguration = true;
		};
		const TogglePlayerStatsTooltips = () => {
			game.CoreConfiguration.ShowPlayerStatsTooltips = !game.CoreConfiguration.ShowPlayerStatsTooltips;
			SetPlayerStatsTooltips();
			changedConfiguration = true;
		};
		const ToggleFog = () => {
			game.CoreConfiguration.ShowFog = !game.CoreConfiguration.ShowFog;
			SetFog();
			changedConfiguration = true;
		};
		const ToggleFloorAndCeiling = () => {
			if (!game.CoreConfiguration.ShowFloor && !game.CoreConfiguration.ShowCeiling) {
				game.CoreConfiguration.ShowFloor = true;
			} else if (game.CoreConfiguration.ShowFloor && !game.CoreConfiguration.ShowCeiling) {
				game.CoreConfiguration.ShowFloor = false;
				game.CoreConfiguration.ShowCeiling = true;
			} else if (!game.CoreConfiguration.ShowFloor && game.CoreConfiguration.ShowCeiling) {
				game.CoreConfiguration.ShowFloor = true;
			} else {
				game.CoreConfiguration.ShowFloor = false;
				game.CoreConfiguration.ShowCeiling = false;
			}
			SetFloorAndCeiling();
			if ((!game.CoreConfiguration.ShowFloor || !game.CoreConfiguration.ShowCeiling) && game.CoreConfiguration.ShowFog)
				ToggleFog();
			UpdateShowFogOption();
			changedConfiguration = true;
		};
		const ToggleExtendedSaves = () => {
			game.CoreConfiguration.ExtendedSavegameSlots = !game.CoreConfiguration.ExtendedSavegameSlots;
			SetExtendedSaves();
			changedConfiguration = true;
		};
		const ToggleExternalMusic = () => {
			game.CoreConfiguration.ExternalMusic = !game.CoreConfiguration.ExternalMusic;
			SetExternalMusic();
			changedConfiguration = true;
		};
		const ToggleCheats = () => {
			cheatsEnabled = !cheatsEnabled;
			SetCheats();
			changedConfiguration = true;
		};
		const ToggleAutoBattle = () => {
			game.CoreConfiguration.AutoBattleRounds += 5;

			if (game.CoreConfiguration.AutoBattleRounds > 15 || game.CoreConfiguration.AutoBattleRounds < 0)
				game.CoreConfiguration.AutoBattleRounds = 0;

			SetAutoBattle();
			changedConfiguration = true;
		};
		const ToggleAutoDerune = () => {
			game.CoreConfiguration.AutoDerune = !game.CoreConfiguration.AutoDerune;
			SetAutoDerune();
			changedConfiguration = true;
		};
		const TogglePyrdacorLogo = () => {
			game.CoreConfiguration.ShowPyrdacorLogo = !game.CoreConfiguration.ShowPyrdacorLogo;
			SetPyrdacorLogo();
			changedConfiguration = true;
		};
		const ToggleAdvancedLogo = () => {
			game.CoreConfiguration.ShowAdvancedLogo = !game.CoreConfiguration.ShowAdvancedLogo;
			SetAdvancedLogo();
			changedConfiguration = true;
		};
		const ToggleFantasyIntro = () => {
			game.CoreConfiguration.ShowFantasyIntro = !game.CoreConfiguration.ShowFantasyIntro;
			SetFantasyIntro();
			changedConfiguration = true;
		};
		const ToggleIntro = () => {
			game.CoreConfiguration.ShowIntro = !game.CoreConfiguration.ShowIntro;
			SetIntro();
			changedConfiguration = true;
		};
		const ToggleEffects = () => {
			game.CoreConfiguration.Effects = (game.CoreConfiguration.Effects + 1) % EnumHelper.GetValues(Effects).length;
			SetEffects();
			changedConfiguration = true;
			game.NotifyConfigurationChange(false);
		};
		const ToggleSaveLoadInfo = () => {
			game.CoreConfiguration.ShowSaveLoadMessage = !game.CoreConfiguration.ShowSaveLoadMessage;
			SetSaveLoadInfo();
			changedConfiguration = true;
		};

		// Page 1
		AddOption((index, _) => ToggleMusic());
		AddOption((index, _) => ToggleVolume());
		AddOption(game.CoreConfiguration.WindowMode !== WindowMode.Normal || game.CoreConfiguration.IsMobile ? null : ToggleResolutionAction);
		AddOption(game.CoreConfiguration.IsMobile ? null : (index, _) => ToggleFullscreen());
		AddOption(this.RenderView.AllowFramebuffer ? ((index, _) => ToggleGraphicFilter()) : nullOptionAction);
		AddOption(this.RenderView.AllowFramebuffer ? ((index, _) => ToggleGraphicFilterAddition()) : nullOptionAction);
		AddOption(this.RenderView.AllowEffects ? ((index, _) => ToggleEffects()) : nullOptionAction);
		// Page 2
		AddOption((index, _) => ToggleBattleSpeed());
		AddOption(game.CoreConfiguration.IsMobile ? null : (index, _) => Toggle3DMovement());
		AddOption(game.CoreConfiguration.IsMobile ? null : (index, _) => ToggleTurnWithArrowKeys());
		AddOption((index, _) => ToggleTooltips());
		AddOption((index, _) => TogglePlayerStatsTooltips());
		AddOption((index, _) => ToggleFloorAndCeiling());
		AddOption(game.CoreConfiguration.ShowFloor && game.CoreConfiguration.ShowCeiling ? ((index, _) => ToggleFog()) : nullOptionAction);
		// Page 3
		AddOption((index, _) => ToggleAutoDerune());
		AddOption(game.CoreConfiguration.IsMobile ? null : (index, _) => ToggleExtendedSaves());
		AddOption(game.CoreConfiguration.IsMobile ? null : (index, _) => ToggleExternalMusic());
		AddOption((index, _) => TogglePyrdacorLogo());
		AddOption((index, _) => ToggleFantasyIntro());
		AddOption((index, _) => ToggleIntro());
		AddOption((index, _) => ToggleAdvancedLogo());
		// Page 4
		AddOption((index, _) => ToggleSaveLoadInfo());
		AddOption((index, _) => ToggleCheats());
		AddOption((index, _) => ToggleAutoBattle());
		// Web port: enhanced 3D graphics (renderer reads CoreConfiguration.Enhanced3D)
		AddOption((index, _) => {
			game.CoreConfiguration.Enhanced3D = game.CoreConfiguration.Enhanced3D === false;
			SetEnhanced3D();
			changedConfiguration = true;
		});

		const UpdateFullscreenOption = () => {
			if (page === 0)
				FullscreenUpdated();
		};

		this.FullscreenOptionUpdateRequested.add(UpdateFullscreenOption);

		listBox = this.activePopup.AddOptionsListBox(options.slice(0, OptionsPerPage));

		const PageChanged = () => {
			const visibleOptions = options.slice(page * OptionsPerPage, page * OptionsPerPage + OptionsPerPage);
			for (let i = 0; i < OptionsPerPage; ++i) {
				if (i >= visibleOptions.length) {
					listBox.SetItemText(i, '');
					listBox.SetItemAction(i, null);
				} else {
					listBox.SetItemAction(i, visibleOptions[i].Value);
				}
			}
			ShowOptions();
		};

		const contentArea = this.activePopup.ContentArea;
		const exitButton = this.activePopup.AddButton(new Position(contentArea.Right - 32, contentArea.Bottom - 17));
		exitButton.ButtonType = ButtonType.Exit;
		exitButton.Disabled = false;
		exitButton.InstantAction = false;
		exitButton.LeftClickAction = () => {
			this.FullscreenOptionUpdateRequested.remove(UpdateFullscreenOption);
			this.ClosePopup();
			this.CloseOptionMenu();
			if (changedConfiguration) {
				game.CoreConfiguration.EnableCheats = cheatsEnabled;
				game.NotifyConfigurationChange(windowChange);
			}
		};
		exitButton.Visible = true;

		ShowOptions();

		const changePageButton = this.activePopup.AddButton(new Position(contentArea.Left, contentArea.Bottom - 17));
		changePageButton.ButtonType = ButtonType.MoveRight;
		changePageButton.Disabled = false;
		changePageButton.InstantAction = false;
		changePageButton.LeftClickAction = () => {
			const numPages = Math.trunc((options.length + OptionsPerPage - 1) / OptionsPerPage);
			page = (page + 1) % numPages;
			PageChanged();
		};
		changePageButton.Visible = true;

		this.activePopup.Scrolled.add(down => {
			const numPages = Math.trunc((options.length + OptionsPerPage - 1) / OptionsPerPage);

			if (down)
				page = (page + 1) % numPages;
			else
				page = (page + numPages + 1) % numPages;

			PageChanged();
		});

		this.ExternalGraphicFilterChanged.add(SetGraphicFilter);
		this.ExternalGraphicFilterOverlayChanged.add(SetGraphicFilterOverlay);
		this.ExternalEffectsChanged.add(SetEffects);
		this.BattleSpeedChanged.add(SetBattleSpeed);
		this.MusicChanged.add(SetMusic);
		this.VolumeChanged.add(SetVolume);
		this.activePopup.Closed.add(() => {
			this.ExternalGraphicFilterChanged.remove(SetGraphicFilter);
			this.ExternalGraphicFilterOverlayChanged.remove(SetGraphicFilterOverlay);
			this.ExternalEffectsChanged.remove(SetEffects);
			this.BattleSpeedChanged.remove(SetBattleSpeed);
			this.MusicChanged.remove(SetMusic);
			this.VolumeChanged.remove(SetVolume);
		});
	}

	OnExternalGraphicFilterChanged() {
		this.ExternalGraphicFilterChanged.invoke();
	}

	OnExternalGraphicFilterOverlayChanged() {
		this.ExternalGraphicFilterOverlayChanged.invoke();
	}

	OnExternalEffectsChanged() {
		this.ExternalEffectsChanged.invoke();
	}

	OnExternalBattleSpeedChanged() {
		this.BattleSpeedChanged.invoke();
	}

	OnExternalMusicChanged() {
		this.MusicChanged.invoke();
	}

	OnExternalVolumeChanged() {
		this.VolumeChanged.invoke();
	}

	AttachEventToButton(index, action) {
		this.buttonGrid.SetButtonAction(index, action);
	}

	UpdateUIPalette(palette) {
		this.buttonGrid.PaletteIndex = palette;
		this.sprite.PaletteIndex = palette;

		for (const specialItemSprite of this.specialItemSprites.values())
			specialItemSprite.PaletteIndex = palette;
		for (const specialItemText of this.specialItemTexts.values())
			specialItemText.PaletteIndex = palette;
		for (const activeSpellSprite of this.activeSpellSprites.values())
			activeSpellSprite.PaletteIndex = palette;
		for (const activeSpellDurationBackground of this.activeSpellDurationBackgrounds.values())
			activeSpellDurationBackground.Color = this.game.GetUIColor(26);
		for (const activeSpellDurationBar of this.activeSpellDurationBars.values())
			activeSpellDurationBar.Color = this.game.GetUIColor(31);
	}

	static get MoveButtonCursorMapping2D() {
		return moveButtonCursorMapping2D ??= [
			CursorType.ArrowUpLeft,
			CursorType.ArrowUp,
			CursorType.ArrowUpRight,
			CursorType.ArrowLeft,
			CursorType.None,
			CursorType.ArrowRight,
			CursorType.ArrowDownLeft,
			CursorType.ArrowDown,
			CursorType.ArrowDownRight
		];
	}

	static get MoveButtonCursorMapping3D() {
		return moveButtonCursorMapping3D ??= [
			CursorType.ArrowTurnLeft,
			CursorType.ArrowForward,
			CursorType.ArrowTurnRight,
			CursorType.ArrowStrafeLeft,
			CursorType.None,
			CursorType.ArrowStrafeRight,
			CursorType.ArrowRotateLeft,
			CursorType.ArrowBackward,
			CursorType.ArrowRotateRight
		];
	}

	GetMoveButtonCursorMapping() { return this.Type === LayoutType.Map2D ? Layout.MoveButtonCursorMapping2D : Layout.MoveButtonCursorMapping3D; }

	static CombineMoveCursorTypes2D(cursorTypes) {
		let left = cursorTypes.includes(CursorType.ArrowUpLeft) ||
			cursorTypes.includes(CursorType.ArrowLeft) ||
			cursorTypes.includes(CursorType.ArrowDownLeft);
		let right = cursorTypes.includes(CursorType.ArrowUpRight) ||
			cursorTypes.includes(CursorType.ArrowRight) ||
			cursorTypes.includes(CursorType.ArrowDownRight);
		let up = cursorTypes.includes(CursorType.ArrowUpLeft) ||
			cursorTypes.includes(CursorType.ArrowUp) ||
			cursorTypes.includes(CursorType.ArrowUpRight);
		let down = cursorTypes.includes(CursorType.ArrowDownLeft) ||
			cursorTypes.includes(CursorType.ArrowDown) ||
			cursorTypes.includes(CursorType.ArrowDownRight);

		if (left && right)
			left = right = false;
		if (up && down)
			up = down = false;

		if (left) {
			if (up)
				return CursorType.ArrowUpLeft;
			else if (down)
				return CursorType.ArrowDownLeft;
			else
				return CursorType.ArrowLeft;
		} else if (right) {
			if (up)
				return CursorType.ArrowUpRight;
			else if (down)
				return CursorType.ArrowDownRight;
			else
				return CursorType.ArrowRight;
		} else {
			if (up)
				return CursorType.ArrowUp;
			else if (down)
				return CursorType.ArrowDown;
			else
				return CursorType.None;
		}
	}

	static CombineMoveCursorTypes3D(cursorTypes) {
		removeItem(cursorTypes, CursorType.Wait);

		if (cursorTypes.length <= 1)
			return cursorTypes.slice();

		if (cursorTypes.length !== 2)
			return [];

		// Only forward plus turn or strafe is allowed as a combination.
		if (cursorTypes.includes(CursorType.ArrowForward)) {
			if (cursorTypes.includes(CursorType.ArrowTurnLeft) ||
				cursorTypes.includes(CursorType.ArrowTurnRight) ||
				cursorTypes.includes(CursorType.ArrowStrafeLeft) ||
				cursorTypes.includes(CursorType.ArrowStrafeRight))
				return cursorTypes.slice();
		}
		// Or backward plus rotate  or strafe.
		else if (cursorTypes.includes(CursorType.ArrowBackward)) {
			if (cursorTypes.includes(CursorType.ArrowRotateLeft) ||
				cursorTypes.includes(CursorType.ArrowRotateRight) ||
				cursorTypes.includes(CursorType.ArrowStrafeLeft) ||
				cursorTypes.includes(CursorType.ArrowStrafeRight))
				return cursorTypes.slice();
		}

		// All other combinations won't work.
		return [];
	}

	GetTooltip(tooltipType) { return Button.GetTooltip(this.game.GameLanguage, tooltipType); }

	UpdateLayoutButtons(ticksPerMovement = null) {
		const game = this.game;
		const buttonGrid = this.buttonGrid;
		const moveDelay = (ticksPerMovement ?? this.ticksPerMovement) ?? 0;

		const HandleButtonMove = cursorType => {
			const pressedCursors = [];

			if (this.Type === LayoutType.Map2D) {
				if (game.CurrentTicks - this.lastButtonMoveTicks < moveDelay)
					return;

				for (let i = 0; i < 9; ++i) {
					if (buttonGrid.IsButtonPressed(i)) {
						pressedCursors.push(Layout.MoveButtonCursorMapping2D[i]);
					}
				}

				cursorType = Layout.CombineMoveCursorTypes2D(pressedCursors);

				if (cursorType === CursorType.None)
					return;

				this.lastButtonMoveTicks = game.CurrentTicks;

				game.Move(true, 1.0, cursorType);
			} else if (this.Type === LayoutType.Map3D) {
				for (let i = 0; i < 9; ++i) {
					if (buttonGrid.IsButtonPressed(i)) {
						pressedCursors.push(Layout.MoveButtonCursorMapping3D[i]);
					}
				}

				const cursorTypes = Layout.CombineMoveCursorTypes3D(pressedCursors);

				if (cursorTypes.length === 0)
					return;

				if (cursorTypes.length === 1) {
					if (cursorTypes[0] === CursorType.ArrowRotateLeft)
						game.ExecuteNextUpdateCycle(() => buttonGrid.ReleaseButton(6, true));
					else if (cursorTypes[0] === CursorType.ArrowRotateRight)
						game.ExecuteNextUpdateCycle(() => buttonGrid.ReleaseButton(8, true));
				}

				if (game.CurrentTicks - this.lastButtonMoveTicks < moveDelay)
					return;

				this.lastButtonMoveTicks = game.CurrentTicks;

				game.Move(true, 1.0, cursorTypes);
			}
		};

		const GetTooltip = tooltipType => this.GetTooltip(tooltipType);

		switch (this.Type) {
			case LayoutType.Map2D:
				if (game.CoreConfiguration.IsMobile) {
					for (let i = 0; i < 9; i++)
						buttonGrid.SetButton(i, ButtonType.Empty, true, null, false);
				} else if (this.ButtonGridPage === 0) {
					buttonGrid.SetButton(0, ButtonType.MoveUpLeft, false, () => HandleButtonMove(CursorType.ArrowUpLeft), true, null, null, moveDelay);
					buttonGrid.SetButton(1, ButtonType.MoveUp, false, () => HandleButtonMove(CursorType.ArrowUp), true, null, null, moveDelay);
					buttonGrid.SetButton(2, ButtonType.MoveUpRight, false, () => HandleButtonMove(CursorType.ArrowUpRight), true, null, null, moveDelay);
					buttonGrid.SetButton(3, ButtonType.MoveLeft, false, () => HandleButtonMove(CursorType.ArrowLeft), true, null, null, moveDelay);
					buttonGrid.SetButton(4, ButtonType.Wait, false, () => this.OpenWaitPopup(), false, GetTooltip(Button.TooltipType.Wait));
					buttonGrid.SetButton(5, ButtonType.MoveRight, false, () => HandleButtonMove(CursorType.ArrowRight), true, null, null, moveDelay);
					buttonGrid.SetButton(6, ButtonType.MoveDownLeft, false, () => HandleButtonMove(CursorType.ArrowDownLeft), true, null, null, moveDelay);
					buttonGrid.SetButton(7, ButtonType.MoveDown, false, () => HandleButtonMove(CursorType.ArrowDown), true, null, null, moveDelay);
					buttonGrid.SetButton(8, ButtonType.MoveDownRight, false, () => HandleButtonMove(CursorType.ArrowDownRight), true, null, null, moveDelay);
				} else {
					buttonGrid.SetButton(0, ButtonType.Eye, false, null, false, GetTooltip(Button.TooltipType.Eye), () => CursorType.Eye);
					buttonGrid.SetButton(1, ButtonType.Hand, false, null, false, GetTooltip(Button.TooltipType.Hand), () => CursorType.Hand);
					buttonGrid.SetButton(2, ButtonType.Mouth, false, null, false, GetTooltip(Button.TooltipType.Mouth), () => CursorType.Mouth);
					buttonGrid.SetButton(3, ButtonType.Transport, !this.TransportEnabled, () => game.ToggleTransport(), false, GetTooltip(Button.TooltipType.Transport));
					buttonGrid.SetButton(4, ButtonType.Spells, game?.CanUseSpells() !== true, () => game.CastSpell(false), false, GetTooltip(Button.TooltipType.Spells));
					buttonGrid.SetButton(5, ButtonType.Camp, game?.Map?.CanCamp !== true || (game == null ? null : TravelTypeExtensions.CanCampOn(game.TravelType)) !== true, () => game.OpenCamp(false), false, GetTooltip(Button.TooltipType.Camp));
					buttonGrid.SetButton(6, ButtonType.Map, true, null, false, null);
					buttonGrid.SetButton(7, ButtonType.BattlePositions, false, () => game.ShowBattlePositionWindow(), false, GetTooltip(Button.TooltipType.BattlePositions));
					buttonGrid.SetButton(8, ButtonType.Options, false, () => this.OpenOptionMenu(), false, GetTooltip(Button.TooltipType.Options));
				}
				break;
			case LayoutType.Map3D:
				if (game.CoreConfiguration.IsMobile) {
					for (let i = 0; i < 9; i++)
						buttonGrid.SetButton(i, ButtonType.Empty, true, null, false);
				} else if (this.ButtonGridPage === 0) {
					buttonGrid.SetButton(0, ButtonType.TurnLeft, false, () => HandleButtonMove(CursorType.ArrowTurnLeft), true, null, null, moveDelay);
					buttonGrid.SetButton(1, ButtonType.MoveForward, false, () => HandleButtonMove(CursorType.ArrowForward), true, null, null, moveDelay);
					buttonGrid.SetButton(2, ButtonType.TurnRight, false, () => HandleButtonMove(CursorType.ArrowTurnRight), true, null, null, moveDelay);
					buttonGrid.SetButton(3, ButtonType.StrafeLeft, false, () => HandleButtonMove(CursorType.ArrowStrafeLeft), true, null, null, moveDelay);
					buttonGrid.SetButton(4, ButtonType.Wait, false, () => this.OpenWaitPopup(), false, GetTooltip(Button.TooltipType.Wait));
					buttonGrid.SetButton(5, ButtonType.StrafeRight, false, () => HandleButtonMove(CursorType.ArrowStrafeRight), true, null, null, moveDelay);
					buttonGrid.SetButton(6, ButtonType.RotateLeft, false, () => HandleButtonMove(CursorType.ArrowRotateLeft), true, null, null, moveDelay);
					buttonGrid.SetButton(7, ButtonType.MoveBackward, false, () => HandleButtonMove(CursorType.ArrowBackward), true, null, null, moveDelay);
					buttonGrid.SetButton(8, ButtonType.RotateRight, false, () => HandleButtonMove(CursorType.ArrowRotateRight), true, null, null, moveDelay);
				} else {
					buttonGrid.SetButton(0, ButtonType.Eye, false, () => game.TriggerMapEvents(EventTrigger.Eye), true, GetTooltip(Button.TooltipType.Eye));
					buttonGrid.SetButton(1, ButtonType.Hand, false, () => game.TriggerMapEvents(EventTrigger.Hand), true, GetTooltip(Button.TooltipType.Hand));
					buttonGrid.SetButton(2, ButtonType.Mouth, false, () => {
						if (!game.TriggerMapEvents(EventTrigger.Mouth)) {
							game.SpeakToParty();
						}
					}, true, GetTooltip(Button.TooltipType.Mouth));
					buttonGrid.SetButton(3, ButtonType.Transport, true, null, false); // Never enabled or usable in 3D maps
					buttonGrid.SetButton(4, ButtonType.Spells, game?.CanUseSpells() !== true, () => game.CastSpell(false), false, GetTooltip(Button.TooltipType.Spells));
					buttonGrid.SetButton(5, ButtonType.Camp, game?.Map?.CanCamp !== true, () => game.OpenCamp(false), false, GetTooltip(Button.TooltipType.Camp));
					buttonGrid.SetButton(6, ButtonType.Map, false, () => game.ShowAutomap(), false, GetTooltip(Button.TooltipType.Automap));
					buttonGrid.SetButton(7, ButtonType.BattlePositions, false, () => game.ShowBattlePositionWindow(), false, GetTooltip(Button.TooltipType.BattlePositions));
					buttonGrid.SetButton(8, ButtonType.Options, false, () => this.OpenOptionMenu(), false, GetTooltip(Button.TooltipType.Options));
				}
				break;
			case LayoutType.Inventory:
			{
				const hasInventoryItems = game.CurrentInventory.Inventory.Slots.some(item => item.ItemIndex !== 0);
				const hasEquippedItems = [...game.CurrentInventory.Equipment.Slots.values()].some(item => item.ItemIndex !== 0);
				const canUseItem = (hasInventoryItems || hasEquippedItems) && ConditionExtensions.CanUseItem(game.CurrentInventory.Conditions, game.CurrentInventory.Race === Race.Animal);
				const animalOrAbove = game.CurrentInventory.Race >= Race.Animal;
				const multiplePartyMembers = count(game.PartyMembers, p => p != null) > 1;
				buttonGrid.SetButton(0, ButtonType.Stats, false, () => game.OpenPartyMember(game.CurrentInventoryIndex, false), false, GetTooltip(Button.TooltipType.Stats));
				buttonGrid.SetButton(1, ButtonType.UseItem, !canUseItem, () => this.PickInventoryItemForAction((...a) => this.UseItem(...a),
					true, game.DataNameProvider.WhichItemToUseMessage), true, GetTooltip(Button.TooltipType.UseItem));
				buttonGrid.SetButton(2, ButtonType.Exit, false, () => game.CloseWindow(), false, GetTooltip(Button.TooltipType.Exit));
				if (game.OpenStorage?.AllowsItemDrop === true) {
					buttonGrid.SetButton(3, ButtonType.StoreItem, !hasInventoryItems, () => this.PickInventoryItemForAction((...a) => this.StoreItem(...a),
						false, game.DataNameProvider.WhichItemToStoreMessage), false, GetTooltip(Button.TooltipType.StoreItem));
					buttonGrid.SetButton(4, ButtonType.StoreGold, animalOrAbove || game.CurrentInventory?.Gold === 0, () => this.StoreGold(), false, GetTooltip(Button.TooltipType.StoreGold));
					buttonGrid.SetButton(5, ButtonType.StoreFood, animalOrAbove || game.CurrentInventory?.Food === 0, () => this.StoreFood(), false, GetTooltip(Button.TooltipType.StoreFood));
				} else {
					buttonGrid.SetButton(3, ButtonType.DropItem, !hasInventoryItems, () => this.PickInventoryItemForAction((...a) => this.DropItem(...a),
						false, game.DataNameProvider.WhichItemToDropMessage), false, GetTooltip(Button.TooltipType.DropItem));
					buttonGrid.SetButton(4, ButtonType.DropGold, animalOrAbove || isPlace(game.OpenStorage) || game.CurrentInventory?.Gold === 0, () => this.DropGold(), false, GetTooltip(Button.TooltipType.DropGold));
					buttonGrid.SetButton(5, ButtonType.DropFood, animalOrAbove || game.CurrentInventory?.Food === 0, () => this.DropFood(), false, GetTooltip(Button.TooltipType.DropFood));
				}
				buttonGrid.SetButton(6, ButtonType.ViewItem, !hasInventoryItems && !hasEquippedItems, () => this.PickInventoryItemForAction((...a) => this.ViewItem(...a),
					true, game.DataNameProvider.WhichItemToExamineMessage), false, GetTooltip(Button.TooltipType.ExamineItem));
				buttonGrid.SetButton(7, ButtonType.GiveGold, !multiplePartyMembers || animalOrAbove || isPlace(game.OpenStorage) || game.CurrentInventory?.Gold === 0, () => this.GiveGold(null), false, GetTooltip(Button.TooltipType.GiveGold));
				buttonGrid.SetButton(8, ButtonType.GiveFood, !multiplePartyMembers || animalOrAbove || game.CurrentInventory?.Food === 0, () => this.GiveFood(null), false, GetTooltip(Button.TooltipType.GiveFood));
				break;
			}
			case LayoutType.Stats:
				buttonGrid.SetButton(0, ButtonType.Inventory, false, () => game.OpenPartyMember(game.CurrentInventoryIndex, true), false, GetTooltip(Button.TooltipType.Inventory));
				buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(2, ButtonType.Exit, false, () => game.CloseWindow(), false, GetTooltip(Button.TooltipType.Exit));
				buttonGrid.SetButton(3, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
				break;
			case LayoutType.Items:
			{
				if (game.OpenStorage instanceof Chest) {
					const chest = game.OpenStorage;
					const CloseChest = () => {
						if (chest.IsBattleLoot) {
							if (ItemStorageExtensions.HasAnyImportantItem(chest, this.itemManager)) {
								this.ShowClickChestMessage(game.DataNameProvider.DontForgetItems +
									[...ItemStorageExtensions.GetImportantItemNames(chest, this.itemManager)].join(', ') + '.', null, true);
								return;
							}

							game.CloseWindow();
						} else {
							game.ChestClosed();
						}
					};
					buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
					buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
					buttonGrid.SetButton(2, ButtonType.Exit, false, CloseChest, false, GetTooltip(Button.TooltipType.Exit));
					buttonGrid.SetButton(3, ButtonType.Empty, false, null, false);
					buttonGrid.SetButton(4, ButtonType.DistributeGold, chest.Gold === 0, () => this.DistributeGold(chest), false, GetTooltip(Button.TooltipType.DistributeGold));
					buttonGrid.SetButton(5, ButtonType.DistributeFood, chest.Food === 0, () => this.DistributeFood(chest), false, GetTooltip(Button.TooltipType.DistributeFood));
					buttonGrid.SetButton(6, ButtonType.ViewItem, false, () => this.PickChestItemForAction((...a) => this.ViewItem(...a),
						game.DataNameProvider.WhichItemToExamineMessage), false, GetTooltip(Button.TooltipType.ExamineItem));
					buttonGrid.SetButton(7, ButtonType.GiveGold, chest.Gold === 0, () => this.GiveGold(chest), false, GetTooltip(Button.TooltipType.GiveGold));
					buttonGrid.SetButton(8, ButtonType.GiveFood, chest.Food === 0, () => this.GiveFood(chest), false, GetTooltip(Button.TooltipType.GiveFood));
				} else if (game.OpenStorage instanceof Merchant) {
					buttonGrid.SetButton(0, ButtonType.BuyItem, false, null, false, GetTooltip(Button.TooltipType.Buy)); // this is set later manually
					buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
					buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
					buttonGrid.SetButton(3, ButtonType.SellItem, false, null, false, GetTooltip(Button.TooltipType.Sell)); // this is set later manually
					buttonGrid.SetButton(4, ButtonType.ViewItem, false, null, false, GetTooltip(Button.TooltipType.ExamineItem)); // this is set later manually
					buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
					buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
					buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
					buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
				} else if (game.OpenStorage instanceof NonItemPlace) {
					const place = game.OpenStorage;
					switch (place.PlaceType) {
						case PlaceType.Trainer:
							buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
							buttonGrid.SetButton(3, ButtonType.Train, false, null, false, GetTooltip(Button.TooltipType.Train)); // this is set later manually
							buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
							break;
						case PlaceType.FoodDealer:
							buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
							buttonGrid.SetButton(3, ButtonType.BuyFood, false, null, false, GetTooltip(Button.TooltipType.Buy)); // this is set later manually
							buttonGrid.SetButton(4, ButtonType.DistributeFood, true, null, false, GetTooltip(Button.TooltipType.DistributeFood)); // this is set later manually
							buttonGrid.SetButton(5, ButtonType.GiveFood, true, null, false, GetTooltip(Button.TooltipType.GiveFood)); // this is set later manually
							buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
							break;
						case PlaceType.Healer:
							buttonGrid.SetButton(0, ButtonType.HealPerson, false, null, false, GetTooltip(Button.TooltipType.HealPerson)); // this is set later manually
							buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
							buttonGrid.SetButton(3, ButtonType.RemoveCurse, false, null, false, GetTooltip(Button.TooltipType.RemoveCurse)); // this is set later manually
							buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(6, ButtonType.HealCondition, false, null, false, GetTooltip(Button.TooltipType.HealCondition)); // this is set later manually
							buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
							break;
						case PlaceType.Inn:
							buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
							buttonGrid.SetButton(3, ButtonType.Camp, false, null, false, GetTooltip(Button.TooltipType.RestInn)); // this is set later manually
							buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
							break;
						case PlaceType.HorseDealer:
						case PlaceType.RaftDealer:
						case PlaceType.ShipDealer: {
							buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
							let buyButtonType;
							switch (place.PlaceType) {
								case PlaceType.HorseDealer: buyButtonType = ButtonType.BuyHorse; break;
								case PlaceType.RaftDealer: buyButtonType = ButtonType.BuyRaft; break;
								case PlaceType.ShipDealer: buyButtonType = ButtonType.BuyBoat; break;
								default: buyButtonType = ButtonType.Empty; break;
							}
							buttonGrid.SetButton(3, buyButtonType, false, null, false, GetTooltip(Button.TooltipType.Buy)); // this is set later manually
							buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
							break;
						}
						case PlaceType.Sage:
							buttonGrid.SetButton(0, ButtonType.Equipment, false, null, false, GetTooltip(Button.TooltipType.IdentifyEquipment)); // this is set later manually
							buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
							buttonGrid.SetButton(3, ButtonType.Inventory, false, null, false, GetTooltip(Button.TooltipType.IdentifyInventory)); // this is set later manually
							buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
							if (hasFlag(game.Features, Features.SageScrollIdentification))
								buttonGrid.SetButton(6, ButtonType.ReadScroll, false, null, false, GetTooltip(Button.TooltipType.IdentifyScroll)); // this is set later manually
							else
								buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
							break;
						case PlaceType.Blacksmith:
							buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
							buttonGrid.SetButton(3, ButtonType.RepairItem, false, null, false, GetTooltip(Button.TooltipType.Repair)); // this is set later manually
							buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
							break;
						case PlaceType.Enchanter:
							buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
							buttonGrid.SetButton(3, ButtonType.RechargeItem, false, null, false, GetTooltip(Button.TooltipType.Recharge)); // this is set later manually
							buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
							buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
							break;
						default:
							throw new AmbermoonException(ExceptionScope.Data, 'Invalid place type.');
					}
				} else { // Camp window or Locked screen
					if (game.CurrentWindow.Window === Window.Camp) {
						buttonGrid.SetButton(0, ButtonType.Spells, false, null, false, GetTooltip(Button.TooltipType.Spells)); // this is set later manually
						buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
						buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
						buttonGrid.SetButton(3, ButtonType.ReadScroll, false, null, false, GetTooltip(Button.TooltipType.ReadScroll)); // this is set later manually
						buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
						buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
						buttonGrid.SetButton(6, ButtonType.Sleep, false, null, false, GetTooltip(Button.TooltipType.Sleep)); // this is set later manually
						buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
						buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
					} else {
						buttonGrid.SetButton(0, ButtonType.Lockpick, false, null, false, GetTooltip(Button.TooltipType.Lockpick)); // this is set later manually
						buttonGrid.SetButton(1, ButtonType.UseItem, false, null, false, GetTooltip(Button.TooltipType.UseItem)); // this is set later manually
						buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
						buttonGrid.SetButton(3, ButtonType.FindTrap, false, null, false, GetTooltip(Button.TooltipType.FindTrap)); // this is set later manually
						buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
						buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
						buttonGrid.SetButton(6, ButtonType.DisarmTrap, false, null, false, GetTooltip(Button.TooltipType.DisarmTrap)); // this is set later manually
						buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
						buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
					}
				}
				break;
			}
			case LayoutType.Riddlemouth:
				buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
				buttonGrid.SetButton(3, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(6, ButtonType.Mouth, false, null, false, GetTooltip(Button.TooltipType.SolveRiddle)); // this is set later manually
				buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(8, ButtonType.Ear, false, null, false, GetTooltip(Button.TooltipType.HearRiddle)); // this is set later manually
				break;
			case LayoutType.Conversation:
				buttonGrid.SetButton(0, ButtonType.Mouth, false, null, false, GetTooltip(Button.TooltipType.Say)); // this is set later manually
				buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(2, ButtonType.Exit, false, null, false, GetTooltip(Button.TooltipType.Exit)); // this is set later manually
				buttonGrid.SetButton(3, ButtonType.ViewItem, false, null, false, GetTooltip(Button.TooltipType.ShowItemToNPC)); // this is set later manually
				buttonGrid.SetButton(4, ButtonType.AskToLeave, false, null, false, GetTooltip(Button.TooltipType.AskToLeave)); // this is set later manually
				buttonGrid.SetButton(5, ButtonType.AskToJoin, false, null, false, GetTooltip(Button.TooltipType.AskToJoin)); // this is set later manually
				buttonGrid.SetButton(6, ButtonType.GiveItem, false, null, false, GetTooltip(Button.TooltipType.GiveItemToNPC)); // this is set later manually
				buttonGrid.SetButton(7, ButtonType.GiveGoldToNPC, false, null, false, GetTooltip(Button.TooltipType.GiveGoldToNPC)); // this is set later manually
				buttonGrid.SetButton(8, ButtonType.GiveFoodToNPC, false, null, false, GetTooltip(Button.TooltipType.GiveFoodToNPC)); // this is set later manually
				break;
			case LayoutType.Battle:
				buttonGrid.SetButton(0, ButtonType.Flee, false, null, false, GetTooltip(Button.TooltipType.Flee)); // this is set later manually
				buttonGrid.SetButton(1, ButtonType.Options, false, () => this.OpenOptionMenu(), false, GetTooltip(Button.TooltipType.Options));
				buttonGrid.SetButton(2, ButtonType.Ok, false, null, false, GetTooltip(Button.TooltipType.StartBattleRound)); // this is set later manually
				buttonGrid.SetButton(3, ButtonType.BattlePositions, true, null, false, GetTooltip(Button.TooltipType.BattleMove)); // this is set later manually
				buttonGrid.SetButton(4, ButtonType.MoveForward, true, null, false, GetTooltip(Button.TooltipType.BattleAdvance)); // this is set later manually
				if (game.CoreConfiguration.AutoBattleRounds === 0)
					buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
				else
					buttonGrid.SetButton(5, Layout.AutoBattleButtonType, false, null, false, GetTooltip(Button.TooltipType.BattleAuto)); // this is set later manually
				buttonGrid.SetButton(6, ButtonType.Attack, true, null, false, GetTooltip(Button.TooltipType.BattleAttack)); // this is set later manually
				buttonGrid.SetButton(7, ButtonType.Defend, true, null, false, GetTooltip(Button.TooltipType.BattleDefend)); // this is set later manually
				buttonGrid.SetButton(8, ButtonType.Spells, true, null, false, GetTooltip(Button.TooltipType.BattleCast)); // this is set later manually
				break;
			case LayoutType.BattlePositions:
				buttonGrid.SetButton(0, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(1, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(2, ButtonType.Exit, false, () => game.CloseWindow(), false, GetTooltip(Button.TooltipType.Exit));
				buttonGrid.SetButton(3, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(4, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(5, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(6, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(7, ButtonType.Empty, false, null, false);
				buttonGrid.SetButton(8, ButtonType.Empty, false, null, false);
				break;
		}
	}

	AddSunkenBox(area, displayLayer = 1) {
		// TODO: use named palette colors
		const darkBorderColor = this.game.GetUIColor(26);
		const brightBorderColor = this.game.GetUIColor(31);
		const fillColor = this.game.GetUIColor(27);

		// upper dark border
		this.FillArea(new Rect(area.X, area.Y, area.Width - 1, 1), darkBorderColor, displayLayer);
		// left dark border
		this.FillArea(new Rect(area.X, area.Y + 1, 1, area.Height - 2), darkBorderColor, displayLayer);
		// fill
		this.FillArea(new Rect(area.X + 1, area.Y + 1, area.Width - 2, area.Height - 2), fillColor, displayLayer);
		// right bright border
		this.FillArea(new Rect(area.Right - 1, area.Y + 1, 1, area.Height - 2), brightBorderColor, displayLayer);
		// lower bright border
		this.FillArea(new Rect(area.X + 1, area.Bottom - 1, area.Width - 1, 1), brightBorderColor, displayLayer);
	}

	OpenAmountInputBox(message, imageIndex, name, maxAmount,
		submitAction, abortAction = null) {
		this.buttonGrid?.HideTooltips();
		this.ClosePopup(false);

		this.activePopup = new Popup(this.game, this.RenderView, new Position(64, 64), 11, 6, false);
		this.activePopup.DisableButtons = true;
		this.activePopup.CloseOnClick = false;

		if (imageIndex != null) {
			// Item display (also gold or food)
			const itemArea = new Rect(79, 79, 18, 18);
			this.activePopup.AddSunkenBox(itemArea);
			this.activePopup.AddItemImage(itemArea.CreateModified(1, 1, -2, -2), imageIndex);
		}
		if (name != null) {
			// Item name display (also gold or food)
			const itemNameArea = new Rect(99, 82, 125, 10);
			this.activePopup.AddSunkenBox(itemNameArea);
			this.activePopup.AddText(itemNameArea.CreateModified(1, 2, -1, -3), name, TextColor.Red, TextAlign.Center);
		}
		// Message display
		const messageArea = new Rect(79, 98, 145, 10);
		this.activePopup.AddSunkenBox(messageArea);
		this.activePopup.AddText(messageArea.CreateModified(1, 2, -1, -3), message, TextColor.LightOrange, TextAlign.Center);
		// Amount input
		const input = this.activePopup.AddTextInput(new Position(128, 119), 7, TextAlign.Center,
			TextInput.ClickAction.FocusOrSubmit, TextInput.ClickAction.Abort);
		input.DigitsOnly = true;
		input.MaxIntegerValue = maxAmount;
		input.ReactToGlobalClicks = true;
		input.ClearOnNewInput = true;
		input.Text = '0';
		input.Aborted.add(() => this.game.CursorType = CursorType.Sword);
		input.InputSubmitted.add(_ => this.game.CursorType = CursorType.Sword);

		const Submit = () => {
			if (input.Value === 0) {
				if (abortAction != null)
					abortAction();
				this.ClosePopup(false);
			} else
				submitAction?.(input.Value);
		};

		const ChangeInputValueTo = amount => {
			input.Text = String(Util.Limit(0, amount, maxAmount));
		};

		const ChangeInputValue = changeAmount => {
			ChangeInputValueTo(input.Value + changeAmount);
		};

		// Increase and decrease buttons
		const increaseButton = this.activePopup.AddButton(new Position(80, 110));
		const decreaseButton = this.activePopup.AddButton(new Position(80, 127));
		increaseButton.ButtonType = ButtonType.MoveUp;
		decreaseButton.ButtonType = ButtonType.MoveDown;
		increaseButton.DisplayLayer = 200;
		decreaseButton.DisplayLayer = 200;
		increaseButton.LeftClickAction = () => ChangeInputValue(1);
		decreaseButton.LeftClickAction = () => ChangeInputValue(-1);
		increaseButton.RightClickAction = () => ChangeInputValueTo(maxAmount);
		decreaseButton.RightClickAction = () => ChangeInputValueTo(0);
		increaseButton.InstantAction = true;
		decreaseButton.InstantAction = true;
		increaseButton.ContinuousActionDelayInTicks = Math.trunc(GameCore.TicksPerSecond / 5);
		decreaseButton.ContinuousActionDelayInTicks = Math.trunc(GameCore.TicksPerSecond / 5);
		increaseButton.ContinuousActionDelayReductionInTicks = 1;
		decreaseButton.ContinuousActionDelayReductionInTicks = 1;
		// OK button
		const okButton = this.activePopup.AddButton(new Position(192, 127));
		okButton.ButtonType = ButtonType.Ok;
		okButton.DisplayLayer = 200;
		okButton.LeftClickAction = Submit;
		this.activePopup.ReturnAction = Submit;

		this.itemGrids.forEach(itemGrid => itemGrid.HideTooltip());
		this.HideTooltip();

		return this.activePopup;
	}

	Ask(question, yesAction) {
		const text = this.RenderView.TextProcessor.CreateText(question);
		this.OpenYesNoPopup
		(
			text,
			() => {
				this.ClosePopup(false);
				this.game.InputEnable = true;
				this.game.Resume();
				yesAction?.();
			},
			() => {
				this.ClosePopup(false);
				this.game.InputEnable = true;
				this.game.Resume();
			},
			() => {
				this.game.InputEnable = true;
				this.game.Resume();
			}, 1
		);
		this.game.Pause();
		this.game.InputEnable = false;
		this.game.CursorType = CursorType.Sword;
	}

	ShowTextItem(index, subIndex) {
		const text = this.game.ItemManager.GetText(index, subIndex);

		if (text == null)
			return false;

		this.game.Pause();
		this.game.InputEnable = false;

		this.OpenTextPopup(this.game.ProcessText(text), new Position(16, 52), 256, 112, true, true, false, TextColor.BrightGray, () => {
			this.game.InputEnable = true;
			this.game.Resume();
			this.game.ResetCursor();
		});
		this.game.CursorType = CursorType.Click;

		return true;
	}

	TryEquipmentDrop(itemSlot) {
		return this.itemGrids[1].TryEquipmentDrop(itemSlot);
	}

	GetInventoryGrid() { return this.itemGrids[0]; }
	GetEquipmentGrid() { return this.itemGrids[1]; }

	CanConsumeItem(item, itemSlot) {
		// In Ambermoon Advanced the consume logic was changed.
		// But the lantern won't work anymore then so we adjust the logic here.
		const lantern = item.Index === 243 && !this.RenderView.GameData?.IsAmberstar; // web port: 243 is the Ambermoon lantern only
		let canConsume = !lantern && hasFlag(item.Flags, ItemFlags.DestroyAfterUsage);

		if (canConsume && !hasFlag(item.Flags, ItemFlags.Stackable) && item.MaxCharges !== 0) {
			canConsume = item.MaxRecharges !== 0 && item.MaxRecharges !== 255 && itemSlot.RechargeTimes >= item.MaxRecharges;
		}

		return canConsume;
	}

	UseItem(itemGrid, slot, itemSlot) {
		const game = this.game;
		const itemGrids = this.itemGrids;
		const wasInputEnabled = game.InputEnable;
		game.InputEnable = false;
		game.ExecuteNextUpdateCycle(() => itemGrid.HideTooltip());

		if (hasFlag(itemSlot.Flags, ItemSlotFlags.Broken)) {
			this.SetInventoryMessage(game.DataNameProvider.CannotUseBrokenItems, true);
			return;
		}

		const user = game.CurrentInventory;
		const itemIndex = itemSlot.ItemIndex;
		const item = this.itemManager.GetItem(itemIndex);
		const RollDice1000 = () => game.RandomInt(0, 999);

		const HasRightWindowForEvent = eventType => {
			switch (eventType) {
				case EventType.Chest: return game.LastWindow.Window === Window.MapView || game.LastWindow.Window === Window.Chest;
				case EventType.Door: return game.LastWindow.Window === Window.MapView || game.LastWindow.Window === Window.Door;
				default: return game.LastWindow.Window === Window.MapView;
			}
		};

		let eventX = 0, eventY = 0, eventType = 0;
		let useMapEvent = false;

		if (!game.BattleActive && !game.CampActive &&
			(game.LastWindow.Window === Window.MapView || game.LastWindow.Window === Window.Chest || game.LastWindow.Window === Window.Door)) {
			[useMapEvent, eventX, eventY, eventType] = game.TestUseItemMapEvent(itemIndex);
			useMapEvent = useMapEvent && HasRightWindowForEvent(eventType);
		}

		if (useMapEvent) {
			const Use = broke => {
				this.ReduceItemCharge(itemSlot, true, itemGrid === itemGrids[1], game.CurrentInventory, () => {
					if (broke && itemGrid === itemGrids[1]) { // equipped
						// Try to unequip
						const emptyInventorySlot = firstOrDefault(game.CurrentInventory.Inventory.Slots, s => s.Empty);

						if (emptyInventorySlot != null) {
							emptyInventorySlot.Replace(itemSlot);

							if (slot === EquipmentSlot.RightHand - 1 && item.NumberOfHands === 2) {
								// For equipped two-handed weapons also remove the red cross in second hand slot
								itemGrids[1].GetItemSlot(slot + 2).Clear();
								if (game.CurrentWindow.Window === Window.Inventory)
									itemGrids[1].UpdateItem(slot + 2);
							}

							itemSlot.Clear();
							if (game.CurrentWindow.Window === Window.Inventory)
								itemGrids[1].UpdateItem(slot);

						}
					}

					const currentInventoryIndex = game.CurrentInventoryIndex; // close window will null this

					game.CloseWindow(() => {
						if (wasInputEnabled)
							game.InputEnable = true;
						game.UpdateCursor();
						game.CurrentInventoryIndex = currentInventoryIndex; // TODO: this won't work long enough if some events open/close windows or are async/event-based
						game.TriggerMapEvents(EventTrigger.Item0 + itemIndex, eventX, eventY);
						game.CurrentInventoryIndex = null;
					});
				});
			};
			if (item.CanBreak && RollDice1000() < item.BreakChance) {
				itemSlot.Flags |= ItemSlotFlags.Broken;
				this.UpdateItemSlot(itemSlot);

				const message = game.CurrentInventory.Name + format(game.DataNameProvider.BattleMessageWasBroken, item.Name);
				game.ShowMessagePopup(message, () => Use(true));
			} else {
				Use(false);
			}
			return;
		}

		if (item.Type === ItemType.Key && (item.Spell === Spell.None || item.Spell === Spell.Lockpicking)) {
			this.SetInventoryMessage(game.DataNameProvider.WrongPlaceToUseItem, true);
			return;
		}

		if (!item.IsUsable) {
			this.SetInventoryMessage(game.DataNameProvider.ItemHasNoEffectHere, true);
			return;
		}

		if (!ClassExtensions.Contains(item.Classes, user.Class)) {
			this.SetInventoryMessage(game.DataNameProvider.WrongClassToUseItem, true);
			return;
		}

		if (item.Type === ItemType.TextScroll && item.TextIndex !== 0) {
			const ShowText = () => {
				if (game.CoreConfiguration.AutoDerune && item.Index === 145) { // Special case: rune alphabet
					game.Pause();
					game.InputEnable = false;

					this.OpenTextPopup(game.ProcessText(CustomTexts.GetText(game.GameLanguage, CustomTexts.Index.RuneTableUsage)),
						new Position(16, 52), 256, 112, true, true, false, TextColor.BrightGray, () => {
							game.InputEnable = true;
							game.Resume();
							game.ResetCursor();
						});
					game.CursorType = CursorType.Click;
				} else if (!this.ShowTextItem(item.TextIndex, item.TextSubIndex))
					throw new AmbermoonException(ExceptionScope.Data, `Invalid text index for item '${item.Name}'`);
			};

			if (item.CanBreak && RollDice1000() < item.BreakChance) {
				itemSlot.Flags |= ItemSlotFlags.Broken;
				this.UpdateItemSlot(itemSlot);
				const message = game.CurrentInventory.Name + format(game.DataNameProvider.BattleMessageWasBroken, item.Name);
				game.ShowMessagePopup(message, ShowText);
			} else {
				ShowText();
			}
			return;
		} else if (item.Type === ItemType.SpecialItem) {
			if (game.CurrentSavegame.IsSpecialItemActive(item.SpecialItemPurpose)) {
				this.SetInventoryMessage(game.DataNameProvider.SpecialItemAlreadyInUse, true);
			} else {
				game.StartSequence();
				this.DestroyItem(itemSlot, 50, true, () => {
					game.EndSequence();
					game.CurrentSavegame.ActivateSpecialItem(item.SpecialItemPurpose);
					this.SetInventoryMessage(game.DataNameProvider.SpecialItemActivated, true);
				});
			}
			return;
		}

		if (game.BattleActive) {
			if (item.Spell !== Spell.None) {
				if (!hasFlag(getValue(game.SpellInfos, item.Spell).ApplicationArea, SpellApplicationArea.Battle)) {
					this.SetInventoryMessage(game.DataNameProvider.WrongPlaceToUseItem, true);
					return;
				}

				const worldFlag = 1 << game.Map.World;

				if (!hasFlag(getValue(game.SpellInfos, item.Spell).Worlds, worldFlag)) {
					this.SetInventoryMessage(game.DataNameProvider.WrongWorldToUseItem, true);
					return;
				}

				if (itemSlot.NumRemainingCharges === 0) {
					if (hasFlag(item.Flags, ItemFlags.Stackable))
						itemSlot.NumRemainingCharges = Math.max(1, item.InitialCharges);
					else {
						this.SetInventoryMessage(game.DataNameProvider.NoChargesLeft, true);
						return;
					}
				}

				if (item.Spell === Spell.SelfHealing && !game.CurrentInventory.Alive) {
					this.SetInventoryMessage(game.DataNameProvider.ItemHasNoEffectHere, true);
					return;
				}

				// Note: itemGrids[0] is inventory and itemGrids[1] is equipment
				const equipped = itemGrid === itemGrids[1];
				const caster = game.CurrentInventory;
				game.CloseWindow(() => {
					game.PickBattleSpell(item.Spell, slot, equipped, caster);
					if (wasInputEnabled)
						game.InputEnable = true;
					game.UpdateCursor();
				});
				return;
			} else {
				this.SetInventoryMessage(game.DataNameProvider.ItemHasNoEffectHere, true);
				return;
			}
		} else {
			if (item.Spell !== Spell.None) {
				const worldFlag = 1 << game.Map.World;

				if (!hasFlag(getValue(game.SpellInfos, item.Spell).Worlds, worldFlag)) {
					this.SetInventoryMessage(game.DataNameProvider.WrongWorldToUseItem, true);
					return;
				}

				if (hasFlag(game.Map.Flags, MapFlags.NoMarkOrReturn) && (item.Spell === Spell.WordOfMarking ||
					item.Spell === Spell.WordOfReturning)) {
					this.SetInventoryMessage(game.DataNameProvider.ItemCannotBeUsedHere, true);
					return;
				}

				let wrongPlace = false;

				if (!hasFlag(game.Map.Flags, MapFlags.CanUseMagic) && item.Type === ItemType.SpellScroll) {
					wrongPlace = true;
				} else if (game.LastWindow.Window === Window.Camp) {
					wrongPlace = !hasFlag(getValue(game.SpellInfos, item.Spell).ApplicationArea, SpellApplicationArea.Camp);
				} else if (game.LastWindow.Window !== Window.Battle) {
					if (!hasFlag(getValue(game.SpellInfos, item.Spell).ApplicationArea, SpellApplicationArea.AnyMap)) {
						if (game.Map.IsWorldMap)
							wrongPlace = !hasFlag(getValue(game.SpellInfos, item.Spell).ApplicationArea, SpellApplicationArea.WorldMapOnly);
						else if (game.Map.Type === MapType.Map3D) {
							if (!hasFlag(game.Map.Flags, MapFlags.Outdoor))
								wrongPlace = !hasFlag(getValue(game.SpellInfos, item.Spell).ApplicationArea, SpellApplicationArea.DungeonOnly);
							else
								wrongPlace = true;
						} else {
							wrongPlace = true;
						}
					}
				} else {
					wrongPlace = true;
				}

				if (wrongPlace) {
					this.SetInventoryMessage(game.DataNameProvider.WrongPlaceToUseItem, true);
					return;
				}

				if (item.MaxCharges !== 0 && itemSlot.NumRemainingCharges === 0) {
					this.SetInventoryMessage(game.DataNameProvider.NoChargesLeft, true);
					return;
				}

				if (item.Spell === Spell.MountWasp) {
					if (game.TravelType !== TravelType.Walk) {
						this.SetInventoryMessage(game.DataNameProvider.WrongPlaceToUseItem, true);
					} else {
						itemGrid.HideTooltip();
						ItemAnimation.Play(game, this.RenderView, ItemAnimation.Type.Enchant, itemGrid.GetSlotPosition(slot), () => {
							if (wasInputEnabled)
								game.InputEnable = true;
							game.UpdateCursor();
							game.UseSpell(game.CurrentInventory, item.Spell, itemGrid, true);
						});
					}
				} else if (item.Spell === Spell.CallEagle) {
					if (game.TravelType !== TravelType.Walk) {
						this.SetInventoryMessage(game.DataNameProvider.CannotCallEagleIfNotOnFoot, true);
					} else if (hasFlag(game.Map.Flags, MapFlags.NoEagleOrBroom)) {
						this.SetInventoryMessage(game.DataNameProvider.WrongPlaceToUseItem, true);
					} else {
						itemGrid.HideTooltip();
						ItemAnimation.Play(game, this.RenderView, ItemAnimation.Type.Enchant, itemGrid.GetSlotPosition(slot), () => {
							if (wasInputEnabled)
								game.InputEnable = true;

							game.UpdateCursor();
							game.UseSpell(game.CurrentInventory, item.Spell, itemGrid, true);
						});
					}
				} else if (item.Spell === Spell.SelfHealing && !game.CurrentInventory.Alive) {
					this.SetInventoryMessage(game.DataNameProvider.ItemHasNoEffectHere, true);
					return;
				} else if (item.Spell === Spell.SelfReviving && game.CurrentInventory.Alive) {
					this.SetInventoryMessage(game.DataNameProvider.IsNotDead, true);
					return;
				} else {
					// Note: itemGrids[0] is inventory and itemGrids[1] is equipment
					const equipped = itemGrid === itemGrids[1];
					const usingPlayer = game.CurrentInventory;

					const ConsumeItem = effectHandler => {
						const Done = () => {
							effectHandler?.();
							if (wasInputEnabled)
								game.InputEnable = true;
							game.UpdateCursor();
						};

						if (itemSlot.NumRemainingCharges <= 1 && this.CanConsumeItem(item, itemSlot)) {
							if (game.CurrentInventory === usingPlayer) {
								this.DestroyItem(itemSlot, 25, true, Done);
							} else {
								const item = this.itemManager.GetItem(itemSlot.ItemIndex);

								if (equipped)
									game.EquipmentRemoved(usingPlayer, itemSlot.ItemIndex, 1, hasFlag(itemSlot.Flags, ItemSlotFlags.Cursed));
								else
									usingPlayer.TotalWeight -= item.Weight;

								itemSlot.Remove(1);
							}
						} else {
							if (item.MaxCharges !== 0 && itemSlot.NumRemainingCharges > 0)
								--itemSlot.NumRemainingCharges;
							if (game.CurrentInventory === usingPlayer)
								ItemAnimation.Play(game, this.RenderView, ItemAnimation.Type.Enchant, itemGrid.GetSlotPosition(slot), Done);
						}
					};

					game.UseSpell(game.CurrentInventory, item.Spell, itemGrid, true, ConsumeItem);
				}
			} else if (item.Type === ItemType.Transportation) {
				if (game.LastWindow.Window !== Window.MapView || !game.Map.IsWorldMap) {
					this.SetInventoryMessage(game.DataNameProvider.WrongPlaceToUseItem, true);
					return;
				}

				if (game.TravelType !== TravelType.Walk) {
					// Note: There is a message especially for the flying disc but
					// it is not used in this case. Don't know yet where it is actually used.
					this.SetInventoryMessage(game.DataNameProvider.CannotUseItHere, true);
					return;
				} else if (item.Transportation === Transportation.WitchBroom && hasFlag(game.Map.Flags, MapFlags.NoEagleOrBroom)) {
					this.SetInventoryMessage(game.DataNameProvider.WrongPlaceToUseItem, true);
				}

				if (wasInputEnabled)
					game.InputEnable = true;
				game.UpdateCursor();

				switch (item.Transportation) {
					case Transportation.FlyingDisc:
						game.ActivateTransport(TravelType.MagicalDisc);
						break;
					case Transportation.WitchBroom:
						game.ActivateTransport(TravelType.WitchBroom);
						break;
					default:
						throw new AmbermoonException(ExceptionScope.Data, `Unexpected transport type from item '${item.Name}': ${enumName(Transportation, item.Transportation)}`);
				}
			} else {
				this.SetInventoryMessage(game.DataNameProvider.WrongPlaceToUseItem, true);
				return;
			}
		}
	}

	ReduceItemCharge(itemSlot, slotVisible,
		equip, character, followAction = null) {
		itemSlot.NumRemainingCharges = Math.max(0, itemSlot.NumRemainingCharges - 1);

		if (itemSlot.NumRemainingCharges === 0) {
			const item = this.itemManager.GetItem(itemSlot.ItemIndex);

			if (this.CanConsumeItem(item, itemSlot)) {
				if (slotVisible) {
					for (const itemGrid of this.itemGrids)
						itemGrid.HideTooltip();
					this.game.InputEnable = false;
					this.DestroyItem(itemSlot, 25, true, () => {
						if (!itemSlot.Empty)
							itemSlot.NumRemainingCharges = Math.max(1, item.InitialCharges);
						this.game.InputEnable = true;
						this.game.AddTimedEvent(50, followAction);
					});
					return;
				} else {
					const itemIndex = itemSlot.ItemIndex;
					itemSlot.Remove(1);
					if (character instanceof PartyMember) {
						const partyMember = character;
						if (equip)
							this.game.EquipmentRemoved(partyMember, itemIndex, 1, false);
						else
							this.game.InventoryItemRemoved(itemIndex, 1, partyMember);
					}
					if (!itemSlot.Empty)
						itemSlot.NumRemainingCharges = Math.max(1, item.InitialCharges);
				}
			}
		}

		followAction?.();
	}

	DistributeGold(chest) {
		const initialGold = chest.Gold;
		chest.Gold = this.game.DistributeGold(chest.Gold, false);

		if (chest.Gold !== initialGold) {
			this.game.ChestGoldChanged();
			this.UpdateLayoutButtons();
		}
	}

	DistributeFood(chest) {
		const initialFood = chest.Food;
		chest.Food = this.game.DistributeFood(chest.Food, false);

		if (chest.Food !== initialFood) {
			this.game.ChestFoodChanged();
			this.UpdateLayoutButtons();
		}
	}

	GiveGold(chest) {
		const game = this.game;

		const GiveAmount = amount => {
			this.ClosePopup();
			this.CancelDrag();

			if (![...game.PartyMembers].some(p => p.Race !== Race.Animal && p.MaxGoldToTake >= amount)) {
				if (chest != null)
					this.ShowClickChestMessage(game.DataNameProvider.NoOneCanCarryThatMuch);
				else
					this.SetInventoryMessage(game.DataNameProvider.NoOneCanCarryThatMuch, true);
				return;
			}

			this.draggedGold = amount;
			game.CursorType = CursorType.Gold;
			game.TrapMouse(Global.PartyMemberPortraitArea);
			this.draggedGoldOrFoodRemover = chest == null
				? (gold => {
					game.CurrentInventory.RemoveGold(gold);
					game.UpdateCharacterInfo();
					this.UpdateLayoutButtons();
					game.UntrapMouse();
					this.SetInventoryMessage(null);
					this.ButtonsDisabled = false;
				})
				: gold => {
					chest.Gold -= gold;
					game.ChestGoldChanged();
					this.UpdateLayoutButtons();
					game.UntrapMouse();
					this.ButtonsDisabled = false;
				};

			if (chest != null)
				this.ShowChestMessage(game.DataNameProvider.GiveToWhom);
			else
				this.SetInventoryMessage(game.DataNameProvider.GiveToWhom);

			this.ButtonsDisabled = true;

			for (let i = 0; i < GameCore.MaxPartyMembers; ++i) {
				const partyMember = game.GetPartyMember(i);

				if (partyMember != null && partyMember !== game.CurrentInventory) {
					this.UpdateCharacterStatus(i, partyMember === game.CurrentInventory ? null :
						partyMember.Race !== Race.Animal && partyMember.MaxGoldToTake >= amount && !game.HasPartyMemberFled(partyMember) ? UIGraphic.StatusHandTake : UIGraphic.StatusHandStop);
				}
			}
		};

		// Note: 96 is the object icon index for coins (gold).
		this.OpenAmountInputBox(game.DataNameProvider.GiveHowMuchGoldMessage,
			96, game.DataNameProvider.GoldName, chest == null ? game.CurrentInventory.Gold : chest.Gold,
			GiveAmount);
	}

	/**
	 * Overload 1 (private): GiveFood(Chest? chest)
	 * Overload 2: GiveFood(uint food, Action<uint>? foodRemover, Action? setup, Action? abortAction, Action? cannotCarryHandler)
	 */
	GiveFood(...args) {
		const game = this.game;

		if (args.length === 1) {
			const chest = args[0];
			this.GiveFood(chest == null ? game.CurrentInventory.Food : chest.Food,
				chest == null
					? (food => {
						game.CurrentInventory.RemoveFood(food);
						game.UpdateCharacterInfo();
						this.UpdateLayoutButtons();
						game.UntrapMouse();
						this.SetInventoryMessage(null);
						this.ButtonsDisabled = false;
					})
					: food => {
						chest.Food -= food;
						game.ChestFoodChanged();
						this.UpdateLayoutButtons();
						game.UntrapMouse();
						this.ButtonsDisabled = false;
					},
				chest == null
					? () => this.SetInventoryMessage(game.DataNameProvider.GiveToWhom)
					: () => this.ShowChestMessage(game.DataNameProvider.GiveToWhom),
				null,
				() => {
					if (chest != null)
						this.ShowClickChestMessage(game.DataNameProvider.NoOneCanCarryThatMuch);
					else
						this.SetInventoryMessage(game.DataNameProvider.NoOneCanCarryThatMuch, true);
				});
			return;
		}

		const [food, foodRemover, setup, abortAction, cannotCarryHandler] = args;

		const GiveAmount = amount => {
			this.ClosePopup();
			this.CancelDrag();

			if (![...game.PartyMembers].some(p => p.Race !== Race.Animal && p.MaxFoodToTake >= amount)) {
				cannotCarryHandler?.();
				return;
			}

			this.draggedFood = amount;
			game.CursorType = CursorType.Food;
			game.TrapMouse(Global.PartyMemberPortraitArea);
			this.draggedGoldOrFoodRemover = foodRemover;
			setup?.();

			for (let i = 0; i < GameCore.MaxPartyMembers; ++i) {
				const partyMember = game.GetPartyMember(i);

				if (partyMember != null && partyMember !== game.CurrentInventory) {
					this.UpdateCharacterStatus(i, partyMember === game.CurrentInventory ? null :
						partyMember.Race !== Race.Animal && partyMember.MaxFoodToTake >= amount && !game.HasPartyMemberFled(partyMember) ? UIGraphic.StatusHandTake : UIGraphic.StatusHandStop);
				}
			}
		};

		// Note: 109 is the object icon index for food.
		this.OpenAmountInputBox(game.DataNameProvider.GiveHowMuchFoodMessage,
			109, game.DataNameProvider.FoodName, food, GiveAmount, abortAction);
	}

	ShowChestMessage(message, textAlign = TextAlign.Center) {
		this.ChestText?.Destroy();

		if (message != null) {
			const bounds = new Rect(114, 46, 189, 48);
			this.ChestText = this.AddText(bounds, this.game.ProcessText(message, bounds), TextColor.White, textAlign);
		} else {
			this.ChestText = null;
		}
	}

	ShowClickChestMessage(message, clickEvent = null, remainAfterClick = false) {
		const bounds = new Rect(114, 46, 189, 48);
		this.ChestText?.Destroy();
		this.ChestText = this.AddScrollableText(bounds, this.game.ProcessText(message, bounds));
		this.ChestText.Clicked.add(scrolledToEnd => {
			if (scrolledToEnd) {
				if (remainAfterClick) {
					this.ChestText.WithScrolling = false;
				} else {
					this.ChestText?.Destroy();
					this.ChestText = null;
				}
				this.game.InputEnable = true;
				this.game.CursorType = CursorType.Sword;
				clickEvent?.();
			}
		});
		this.game.CursorType = CursorType.Click;
		this.game.InputEnable = false;
	}

	/**
	 * Private helper: AddButton(Position position, ButtonType type, Action? leftClickAction, byte displayLayer,
	 *   List<FilledArea> areas, bool allowOnlyOnce = false)
	 */
	AddButton(position, type, leftClickAction, displayLayer,
		areas, allowOnlyOnce = false) {
		const brightBorderColor = this.game.GetUIColor(31);
		const darkBorderColor = this.game.GetUIColor(26);
		displayLayer = Math.min(displayLayer, 251);

		areas.push(this.FillArea(new Rect(position.X, position.Y, Button.Width + 1, Button.Height + 1), brightBorderColor, displayLayer++));
		areas.push(this.FillArea(new Rect(position.X - 1, position.Y - 1, Button.Width + 1, Button.Height + 1), darkBorderColor, displayLayer++));
		areas.push(this.FillArea(new Rect(position.X, position.Y, Button.Width, Button.Height), Color.Black, displayLayer++));
		const button = new Button(this.RenderView, position, null);

		const ClickOnce = () => {
			button.LeftClickAction = null;
			leftClickAction?.();
			leftClickAction = null;
		};

		button.PaletteIndex = this.game.UIPaletteIndex;
		button.ButtonType = type;
		button.Disabled = false;
		button.DisplayLayer = displayLayer;
		button.LeftClickAction = leftClickAction != null && allowOnlyOnce ? ClickOnce : leftClickAction;

		return button;
	}

	ShowGameOverButtons(choiceEvent, hasSavegames) {
		const areas = [];

		const Choose = load => {
			areas.forEach(area => area?.Destroy());
			this.questionYesButton?.Destroy();
			this.questionYesButton = null;
			this.questionNoButton?.Destroy();
			this.questionNoButton = null;
			this.game.InputEnable = true;
			choiceEvent?.(load);
		};

		this.questionYesButton?.Destroy();
		this.questionNoButton?.Destroy();
		this.questionYesButton = this.AddButton(new Position(128, 169), hasSavegames ? ButtonType.Load : ButtonType.Stats, () => Choose(true), 2, areas, true);
		this.questionNoButton = this.AddButton(new Position(128 + Button.Width, 169), ButtonType.Quit, () => Choose(false), 2, areas, true);
	}

	ShowPlaceQuestion(message, answerEvent, textAlign = TextAlign.Center) {
		const bounds = new Rect(114, 46, 189, 28);
		const areas = [];

		const Answer = answer => {
			areas.forEach(area => area?.Destroy());
			this.questionYesButton?.Destroy();
			this.questionYesButton = null;
			this.questionNoButton?.Destroy();
			this.questionNoButton = null;
			this.ChestText?.Destroy();
			this.ChestText = null;
			this.game.InputEnable = true;
			answerEvent?.(answer);
		};

		this.ChestText?.Destroy();
		this.ChestText = this.AddText(bounds, this.game.ProcessText(message, bounds), TextColor.White, textAlign);
		this.questionYesButton?.Destroy();
		this.questionNoButton?.Destroy();
		this.questionYesButton = this.AddButton(new Position(223, 75), ButtonType.Yes, () => Answer(true), 2, areas, true);
		this.questionNoButton = this.AddButton(new Position(223 + Button.Width, 75), ButtonType.No, () => Answer(false), 2, areas, true);
		this.game.CursorType = CursorType.Click;
		this.game.InputEnable = false;
	}

	DropGold() {
		const DropAmount = amount => {
			this.Ask(this.game.DataNameProvider.DropGoldQuestion, () => this.game.DropGold(amount));
		};

		// Note: 96 is the object icon index for coins (gold).
		this.OpenAmountInputBox(this.game.DataNameProvider.DropHowMuchGoldMessage,
			96, this.game.DataNameProvider.GoldName, this.game.CurrentInventory.Gold,
			DropAmount);
	}

	DropFood() {
		const DropAmount = amount => {
			this.Ask(this.game.DataNameProvider.DropFoodQuestion, () => this.game.DropFood(amount));
		};

		// Note: 109 is the object icon index for food.
		this.OpenAmountInputBox(this.game.DataNameProvider.DropHowMuchFoodMessage,
			109, this.game.DataNameProvider.FoodName, this.game.CurrentInventory.Food,
			DropAmount);
	}

	ViewItem(itemGrid, slot, itemSlot) {
		itemGrid.HideTooltip();
		this.game.ShowItemPopup(itemSlot, () => this.game.UpdateCursor());
	}

	/**
	 * Overload 1 (private): DropItem(ItemGrid itemGrid, int slot, ItemSlot itemSlot)
	 * Overload 2 (private): DropItem() - drops the dragged item
	 */
	DropItem(itemGrid, slot, itemSlot) {
		if (arguments.length === 0) {
			// void DropItem()
			this.draggedItem = null;

			if (this.game.OpenStorage instanceof Chest ||
				this.game.OpenStorage instanceof Merchant ||
				this.game.OpenStorage instanceof NonItemPlace) {
				this.ChestText?.Destroy();
				this.ChestText = null;
			}

			if (!(this.game.OpenStorage instanceof GameCore.ConversationItems)) {
				this.SetInventoryMessage(null);
			}

			// Remove hand icons and set current status icons
			[...this.game.PartyMembers].forEach(p => this.UpdateCharacterStatus(p));

			this.DraggedItemDropped.invoke();
			return;
		}

		const item = this.itemManager.GetItem(itemSlot.ItemIndex);

		const DropAmount = amount => {
			const DropIt = () => {
				// TODO: animation where the item falls down the screen
				const itemIndex = itemSlot.ItemIndex;
				itemSlot.Remove(amount);
				itemGrid.SetItem(slot, itemSlot); // update appearance
				this.game.InventoryItemRemoved(itemIndex, amount);
				this.game.UpdateCharacterInfo();
			};

			itemGrid.HideTooltip();
			this.Ask(this.game.DataNameProvider.DropItemQuestion, DropIt);
		};

		if (!hasFlag(item.Flags, ItemFlags.NotImportant)) {
			itemGrid.HideTooltip();
			this.SetInventoryMessage(this.game.DataNameProvider.ItemIsImportant, true);
			return;
		}

		if (hasFlag(itemSlot.Flags, ItemSlotFlags.Locked)) {
			itemGrid.HideTooltip();
			this.SetInventoryMessage(this.game.DataNameProvider.ThisCantBeMoved, true);
			return;
		}

		if (itemSlot.Amount > 1) {
			itemGrid.HideTooltip();
			this.OpenAmountInputBox(this.game.DataNameProvider.DropHowMuchItemsMessage,
				item.GraphicIndex, item.Name, itemSlot.Amount, DropAmount);
		} else {
			DropAmount(1);
		}
	}

	StoreGold() {
		// Note: 96 is the object icon index for coins (gold).
		const chest = this.game.OpenStorage instanceof Chest ? this.game.OpenStorage : null;

		this.OpenAmountInputBox(this.game.DataNameProvider.StoreHowMuchGoldMessage,
			96, this.game.DataNameProvider.GoldName, Math.min(this.game.CurrentInventory.Gold, 0xffff - chest.Gold),
			amount => {
				this.game.StoreGold(amount);
				if (chest.Gold === 0xffff)
					this.SetInventoryMessage(this.game.DataNameProvider.ChestNowFull, true);
			});
	}

	StoreFood() {
		// Note: 109 is the object icon index for food.
		const chest = this.game.OpenStorage instanceof Chest ? this.game.OpenStorage : null;

		this.OpenAmountInputBox(this.game.DataNameProvider.StoreHowMuchFoodMessage,
			109, this.game.DataNameProvider.FoodName, Math.min(this.game.CurrentInventory.Food, 0xffff - chest.Food),
			amount => {
				this.game.StoreFood(amount);

				if (chest.Food === 0xffff)
					this.SetInventoryMessage(this.game.DataNameProvider.ChestNowFull, true);
			});
	}

	StoreItem(itemGrid, slot, itemSlot) {
		if (hasFlag(itemSlot.Flags, ItemSlotFlags.Locked)) {
			this.SetInventoryMessage(this.game.DataNameProvider.ThisCantBeMoved, true);
			return;
		}

		const slots = CollectionExtensions.ToList(this.game.OpenStorage.Slots);
		let maxItemsToStore = 0;
		const item = this.itemManager.GetItem(itemSlot.ItemIndex);

		const StoreAmount = amount => {
			this.ClosePopup(false);

			const itemIndex = itemSlot.ItemIndex;

			// TODO: animation where the item flies to the right of the screen
			if (this.game.StoreItem(itemSlot, amount)) {
				this.game.InventoryItemRemoved(itemIndex, amount);
				itemGrid.SetItem(slot, itemSlot); // update appearance
				this.game.UpdateCharacterInfo();
			}
		};

		if (slots.some(slot => slot.Empty))
			maxItemsToStore = 99;
		else {
			if (hasFlag(item.Flags, ItemFlags.Stackable)) {
				for (const possibleSlot of slots.filter(s => s.ItemIndex === item.Index)) {
					maxItemsToStore += 99 - possibleSlot.Amount;
				}
			}
		}

		if (maxItemsToStore === 0) {
			this.SetInventoryMessage(this.game.DataNameProvider.ChestFull, true);
			return;
		}

		if (itemSlot.Amount > 1) {
			this.OpenAmountInputBox(this.game.DataNameProvider.StoreHowMuchItemsMessage,
				item.GraphicIndex, item.Name, Math.min(itemSlot.Amount, maxItemsToStore), amount => {
					StoreAmount(amount);
					if (amount === maxItemsToStore && !slots.some(slot => slot.Empty || (slot.ItemIndex === item.Index && slot.Amount < 99)))
						this.SetInventoryMessage(this.game.DataNameProvider.ChestNowFull, true);
				});
		} else {
			StoreAmount(1);

			if ((maxItemsToStore === 1 || (maxItemsToStore === 99 && !hasFlag(item.Flags, ItemFlags.Stackable))) &&
				!slots.some(slot => slot.Empty))
				this.SetInventoryMessage(this.game.DataNameProvider.ChestNowFull, true);
		}
	}

	get InventoryMessageWaitsForClick() { return this.inventoryMessage != null && !this.game.InputEnable; }

	ClickInventoryMessage() { this.inventoryMessage?.InvokeClickEvent(); }

	SetInventoryMessage(message, waitForClick = false) {
		if (message == null) {
			this.inventoryMessage?.Destroy();
			this.inventoryMessage = null;
		} else {
			if (waitForClick) {
				for (const itemGrid of this.itemGrids)
					itemGrid.HideTooltip();
				this.inventoryMessage?.Destroy();
				this.game.CursorType = CursorType.Click;
				this.inventoryMessage = this.AddScrollableText(new Rect(21, 51, 156, 20), this.game.ProcessText(message));
				this.inventoryMessage.Clicked.add(scrolledToEnd => {
					if (scrolledToEnd) {
						this.inventoryMessage?.Destroy();
						this.inventoryMessage = null;
						this.game.InputEnable = true;
						this.game.CursorType = CursorType.Sword;
						this.game.UpdateCursor();
					}
				});
				this.game.CursorType = CursorType.Click;
				this.game.InputEnable = false;
				this.game.AddTimedEvent(50, () => this.SetActiveTooltip(null, null));
			} else if (this.inventoryMessage == null) {
				this.inventoryMessage = this.AddScrollableText(new Rect(21, 51, 156, 14), this.game.ProcessText(message));
			} else {
				this.inventoryMessage.SetText(this.game.ProcessText(message));
			}
		}
	}

	PickChestItemForAction(itemAction, message) {
		const itemGrids = this.itemGrids;
		this.ButtonsDisabled = true;
		this.ShowChestMessage(message);
		const itemArea = new Rect(16, 139, 151, 53);
		this.game.TrapMouse(itemArea);

		const ItemChosen = (itemGrid, slot, itemSlot) => {
			this.ShowChestMessage(null);
			itemGrids[0].DisableDrag = false;
			itemGrids[0].ItemClicked.remove(ItemChosen);
			itemGrids[0].RightClicked.remove(Aborted);
			this.game.UntrapMouse();
			this.ButtonsDisabled = false;

			if (itemGrid != null && itemSlot != null)
				itemAction?.(itemGrid, slot, itemSlot);
		};

		const Aborted = () => {
			ItemChosen(null, 0, null);
			return true;
		};

		itemGrids[0].DisableDrag = true;
		itemGrids[0].ItemClicked.add(ItemChosen);
		itemGrids[0].RightClicked.add(Aborted);
	}

	PickInventoryItemForAction(itemAction, includeEquipment, message) {
		const itemGrids = this.itemGrids;
		this.ButtonsDisabled = true;
		this.SetInventoryMessage(message);

		// Note: itemGrids[0] is the inventory and itemGrids[1] is the equipment.
		this.game.TrapMouse(includeEquipment ? Global.InventoryAndEquipTrapArea : Global.InventoryTrapArea);

		const ItemChosen = (itemGrid, slot, itemSlot) => {
			this.SetInventoryMessage(null);
			itemGrids[0].DisableDrag = false;
			itemGrids[1].DisableDrag = false;
			itemGrids[0].ItemClicked.remove(ItemChosen);
			itemGrids[1].ItemClicked.remove(ItemChosen);
			itemGrids[0].RightClicked.remove(Aborted);
			itemGrids[1].RightClicked.remove(Aborted);
			this.game.UntrapMouse();
			this.ButtonsDisabled = false;

			if (itemGrid != null && itemSlot != null) {
				// Catch two-handed weapon left hand slot click
				if (itemSlot.ItemIndex === 0 &&
					itemGrid === itemGrids[1] && // equip
					slot + 1 === EquipmentSlot.LeftHand) {
					slot -= 2;
					itemSlot = itemGrid.GetItemSlot(slot);
				}

				itemAction?.(itemGrid, slot, itemSlot);
			}
		};

		const Aborted = () => {
			ItemChosen(null, 0, null);
			return true;
		};

		itemGrids[0].DisableDrag = true;
		itemGrids[1].DisableDrag = true;
		itemGrids[0].ItemClicked.add(ItemChosen);
		itemGrids[1].ItemClicked.add(ItemChosen);
		itemGrids[0].RightClicked.add(Aborted);
		itemGrids[1].RightClicked.add(Aborted);
	}

	Destroy() {
		Util.SafeCall(() => this.sprite?.Delete());
		Util.SafeCall(() => {
			for (const portraitBackground of this.portraitBackgrounds)
				portraitBackground?.Delete();
		});
		Util.SafeCall(() => {
			for (const portraitBarBackground of this.portraitBarBackgrounds)
				portraitBarBackground?.Delete();
		});
		Util.SafeCall(() => {
			for (const portraitBorder of this.portraitBorders)
				portraitBorder?.Delete();
		});
		Util.SafeCall(() => {
			for (const portraitName of this.portraitNames)
				portraitName?.Delete();
		});
		Util.SafeCall(() => {
			for (const portrait of this.portraits)
				portrait?.Delete();
		});
		Util.SafeCall(() => {
			for (const characterStatusIcon of this.characterStatusIcons)
				characterStatusIcon?.Delete();
		});
		Util.SafeCall(() => {
			for (const barArea of this.barAreas)
				barArea?.Delete();
		});
		Util.SafeCall(() => {
			for (const characterBar of this.characterBars)
				characterBar?.Destroy();
		});
		Util.SafeCall(() => {
			for (const fadeEffectArea of this.fadeEffectAreas)
				fadeEffectArea?.Delete();
		});
		Util.SafeCall(() => {
			for (const fadeEffect of this.fadeEffects)
				fadeEffect?.Destroy();
		});
		Util.SafeCall(() => this.buttonGrid.Visible = false);
	}

	Reset(keepInventoryMessage = false) {
		this.OptionMenuOpen = false;
		Util.SafeCall(() => {
			this.ChestText?.Destroy();
			this.ChestText = null;
		});
		Util.SafeCall(() => this.tooltips.length = 0);
		Util.SafeCall(() => {
			if (keepInventoryMessage) {
				removeItem(this.texts, this.inventoryMessage);
				this.texts.forEach(text => text?.Destroy());
				this.texts.length = 0;
				this.texts.push(this.inventoryMessage);
			} else {
				this.texts.forEach(text => text?.Destroy());
				this.texts.length = 0;
				this.inventoryMessage?.Destroy();
				this.inventoryMessage = null;
			}
		});
		Util.SafeCall(() => {
			this.additionalSprites.forEach(sprite => sprite?.Delete());
			this.additionalSprites.length = 0;
		});
		Util.SafeCall(() => {
			this.sprite80x80Picture?.Delete();
			this.sprite80x80Picture = null;
		});
		Util.SafeCall(() => {
			this.eventPicture?.Delete();
			this.eventPicture = null;
		});
		Util.SafeCall(() => {
			this.itemGrids.forEach(grid => grid.Destroy());
			this.itemGrids.length = 0;
		});
		Util.SafeCall(() => {
			this.filledAreas.forEach(area => area?.Delete());
			this.filledAreas.length = 0;
		});
		Util.SafeCall(() => {
			this.activePopup?.Destroy();
			this.activePopup = null;
		});
		Util.SafeCall(() => {
			this.activeTooltipText?.Delete();
			this.activeTooltipText = null;
		});
		Util.SafeCall(() => {
			this.activeTooltipBackground?.Delete();
			this.activeTooltipBackground = null;
			if (this.activeTooltipBorders != null) {
				for (let i = 0; i < this.activeTooltipBorders.length; ++i) {
					this.activeTooltipBorders[i]?.Delete();
					this.activeTooltipBorders[i] = null;
				}
			}
		});
		Util.SafeCall(() => {
			this.battleMessage?.Destroy();
			this.battleMessage = null;
		});
		Util.SafeCall(() => {
			this.battleEffectAnimations.forEach(a => a?.Destroy());
			this.battleEffectAnimations.length = 0;
		});
		Util.SafeCall(() => {
			this.activeSpellSprites?.clear(); // sprites are destroyed above
			this.activeSpellDurationBars.clear(); // areas are destroyed above
			[...(this.activeSpellDurationBackgrounds?.values() ?? [])].forEach(b => b?.Delete());
			this.activeSpellDurationBackgrounds?.clear();
		});
		Util.SafeCall(() => {
			this.specialItemSprites?.clear(); // sprites are destroyed above
			this.specialItemTexts?.clear(); // texts are destroyed above
		});
		Util.SafeCall(() => {
			this.monsterCombatGraphics.forEach(g => { g.Animation?.Destroy(); g.BattleFieldSprite?.Delete(); this.RemoveTooltip(g.Tooltip); });
			this.monsterCombatGraphics.length = 0;
		});
		Util.SafeCall(() => {
			this.questionYesButton?.Destroy();
			this.questionYesButton = null;
			this.questionNoButton?.Destroy();
			this.questionNoButton = null;
		});

		// Note: Don't remove fadeEffects or bars here.
	}

	SetActiveCharacter(slot, partyMembers) {
		for (let i = 0; i < this.portraitNames.length; ++i) {
			if (this.portraitNames[i] != null) { // In this case partyMembers[i] is also non-null
				if (i === slot)
					this.portraitNames[i].TextColor = TextColor.ActivePartyMember;
				else if (!partyMembers[i].Alive || !ConditionExtensions.CanSelect(partyMembers[i].Conditions))
					this.portraitNames[i].TextColor = TextColor.DeadPartyMember;
				else if (this.game.HasPartyMemberFled(partyMembers[i]))
					this.portraitNames[i].TextColor = TextColor.DeadPartyMember;
				else
					this.portraitNames[i].TextColor = TextColor.PartyMember;
			}
		}
	}

	UpdateCharacterNameColors(activeSlot) {
		const partyMembers = range(0, GameCore.MaxPartyMembers).map(i => this.game.GetPartyMember(i));

		for (let i = 0; i < this.portraitNames.length; ++i) {
			if (this.portraitNames[i] != null) { // In this case partyMembers[i] is also non-null
				if (!partyMembers[i].Alive || !ConditionExtensions.CanSelect(partyMembers[i].Conditions))
					this.portraitNames[i].TextColor = TextColor.DeadPartyMember;
				else if (this.game.HasPartyMemberFled(partyMembers[i]))
					this.portraitNames[i].TextColor = TextColor.DeadPartyMember;
				else
					this.portraitNames[i].TextColor = activeSlot === i ? TextColor.ActivePartyMember : TextColor.PartyMember;
			}
		}
	}

	AttachToPortraitAnimationEvent(finishAction) {
		if (this.portraitAnimation == null)
			finishAction?.();
		else {
			const tempAnimation = this.portraitAnimation;
			const Finished = () => {
				tempAnimation.Finished.remove(Finished);
				finishAction?.();
			};
			tempAnimation.Finished.add(Finished);
		}
	}

	PlayPortraitAnimation(slot, partyMember, finishAction = null, forceAnimation = false) {
		const newState = partyMember == null ? PartyMemberPortaitState.Empty
			: partyMember.Alive ? PartyMemberPortaitState.Normal : PartyMemberPortaitState.Dead;

		if (!forceAnimation && this.portraitStates[slot] === newState) {
			finishAction?.();
			return false;
		}

		const animation = forceAnimation || (this.portraitStates[slot] !== PartyMemberPortaitState.None && this.portraitStates[slot] !== PartyMemberPortaitState.Dead);

		this.portraitStates[slot] = newState;
		let newGraphicIndex;
		switch (newState) {
			case PartyMemberPortaitState.Empty:
				newGraphicIndex = Graphics.GetUIGraphicIndex(UIGraphic.EmptyCharacterSlot);
				break;
			case PartyMemberPortaitState.Dead:
				newGraphicIndex = partyMember.Race === Race.Animal ? Graphics.GetUIGraphicIndex(UIGraphic.CatSkull) : Graphics.GetUIGraphicIndex(UIGraphic.Skull);
				break;
			default:
				newGraphicIndex = Graphics.PortraitOffset + partyMember.PortraitIndex - 1;
				break;
		}

		if (animation) {
			// If dismissed, the mask moves down from the top in front of the portrait.
			// If died, the background stays static, the portrait drops down and the skull comes from top.
			// If added to party, the mask moves down, revealing the portrait.
			// If portraits are exchanged, the old portrait moves down, revealing the new one.
			const yOffset = newState === PartyMemberPortaitState.Normal ? 0 : -34;
			const sprite = this.portraits[slot];
			const overlaySprite = this.RenderView.SpriteFactory.Create(32, 34, true, 1);
			overlaySprite.Layer = this.renderLayer;
			overlaySprite.X = Global.PartyMemberPortraitAreas[slot].Left + 1;
			overlaySprite.Y = Global.PartyMemberPortraitAreas[slot].Top + 1;
			overlaySprite.ClipArea = Global.PartyMemberPortraitAreas[slot].CreateModified(1, 1, -2, -2);
			overlaySprite.TextureAtlasOffset = sprite.TextureAtlasOffset;
			overlaySprite.PaletteIndex = this.game.PrimaryUIPaletteIndex;
			overlaySprite.Visible = true;
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(newGraphicIndex);
			sprite.Y = Global.PartyMemberPortraitAreas[slot].Top + 1 + yOffset;

			if (this.portraitAnimation != null) {
				if (this.portraitAnimation.PrimarySprite != null) {
					this.portraitAnimation.PrimarySprite.Y = 1;
					this.portraitAnimation.PrimarySprite.DisplayLayer = this.portraitAnimation.InitialDisplayLayer;
				}

				this.portraitAnimation.SecondarySprite?.Delete();
			}

			this.portraitAnimation = new PortraitAnimation();
			this.portraitAnimation.StartTicks = this.game.BattleActive ? this.game.CurrentNormalizedBattleTicks : this.game.CurrentAnimationTicks;
			this.portraitAnimation.Offset = yOffset;
			this.portraitAnimation.InitialOffset = yOffset;
			this.portraitAnimation.PrimarySprite = sprite;
			this.portraitAnimation.SecondarySprite = overlaySprite;
			switch (newState) {
				case PartyMemberPortaitState.Dead: this.portraitAnimation.Movement = PortraitAnimation.MoveType.MoveBoth; break;
				case PartyMemberPortaitState.Empty: this.portraitAnimation.Movement = PortraitAnimation.MoveType.MovePrimary; break;
				default: this.portraitAnimation.Movement = PortraitAnimation.MoveType.MoveSecondary; break;
			}
			this.portraitAnimation.InitialDisplayLayer = sprite.DisplayLayer;

			const Finished = () => {
				if (this.portraitAnimation != null)
					this.portraitAnimation.Finished.remove(Finished);
				this.SetCharacter(slot, partyMember);
				finishAction?.();
			};

			this.portraitAnimation.Finished.add(Finished);
			return true;
		} else {
			this.portraits[slot].TextureAtlasOffset = this.textureAtlas.GetOffset(newGraphicIndex);
			finishAction?.();
			return false;
		}
	}

	/**
	 * While at a healer there is a golden symbol on the active portrait.
	 */
	SetCharacterHealSymbol(slot) {
		if (slot == null) {
			this.healerSymbol.Visible = false;
		} else {
			const area = Global.PartyMemberPortraitAreas[slot];

			this.healerSymbol.X = area.X + 1;
			this.healerSymbol.Y = area.Y + 1;
			this.healerSymbol.Visible = true;
		}
	}

	/**
	 * @param initialDelay TimeSpan as milliseconds
	 */
	DestroyItem(itemSlot, initialDelay, consumed = false, finishAction = null,
		animationPosition = null, applyRemoveEffects = true) {
		const game = this.game;
		let itemGrid = null;
		let slotIndex = -1;

		for (const grid of this.itemGrids) {
			slotIndex = grid.SlotFromItemSlot(itemSlot);

			if (slotIndex !== -1) {
				itemGrid = grid;
				break;
			}
		}

		if (slotIndex === -1)
			throw new AmbermoonException(ExceptionScope.Application, 'Invalid item slot');

		const equipment = game.CurrentWindow.Window === Window.Inventory && itemGrid === this.itemGrids[1];

		// Scroll inventory into view if item is not visible
		if (!equipment && !itemGrid.SlotVisible(slotIndex)) {
			let scrollOffset = slotIndex;

			if (scrollOffset % Inventory.VisibleWidth !== 0)
				scrollOffset -= scrollOffset % Inventory.VisibleWidth;

			itemGrid.ScrollTo(scrollOffset);
		}

		const ApplyItemRemoveEffects = () => {
			const item = this.itemManager.GetItem(itemSlot.ItemIndex);
			const partyMember = game.CurrentInventory ?? game.CurrentPartyMember;

			partyMember.TotalWeight -= item.Weight;

			if (equipment)
				game.EquipmentRemoved(itemSlot.ItemIndex, 1, hasFlag(itemSlot.Flags, ItemSlotFlags.Cursed));

			if (game.CurrentWindow.Window === Window.Inventory)
				game.UpdateCharacterInfo();
		};

		if (consumed) {
			ItemAnimation.Play(game, this.RenderView, ItemAnimation.Type.Consume, animationPosition ?? itemGrid.GetSlotPosition(slotIndex),
				finishAction, initialDelay, 300, () => itemGrid.SlotVisible(slotIndex));

			if (applyRemoveEffects) {
				game.AddTimedEvent(initialDelay + 200, () => {
					ApplyItemRemoveEffects();
					itemSlot.Remove(1);
					itemGrid.SetItem(slotIndex, itemSlot);
				});
			}
		} else {
			ItemAnimation.Play(game, this.RenderView, ItemAnimation.Type.Destroy, animationPosition ?? itemGrid.GetSlotPosition(slotIndex),
				finishAction, initialDelay, null, this.itemManager.GetItem(itemSlot.ItemIndex), 300, () => itemGrid.SlotVisible(slotIndex));

			if (applyRemoveEffects) {
				game.AddTimedEvent(initialDelay, () => {
					ApplyItemRemoveEffects();
					itemSlot.Remove(1);
					itemGrid.SetItem(slotIndex, itemSlot);
				});
			}
		}
	}

	GetItem(itemSlot) {
		for (const itemGrid of this.itemGrids) {
			const slotIndex = itemGrid.SlotFromItemSlot(itemSlot);

			if (slotIndex !== -1)
				return itemGrid.GetItem(slotIndex);
		}

		return null;
	}

	GetItemSlotPosition(itemSlot, allowScrollIntoView) {
		for (const itemGrid of this.itemGrids) {
			const slotIndex = itemGrid.SlotFromItemSlot(itemSlot);

			if (slotIndex !== -1) {
				if (allowScrollIntoView && !itemGrid.SlotVisible(slotIndex)) {
					let scrollOffset = slotIndex;

					if (scrollOffset % Inventory.VisibleWidth !== 0)
						scrollOffset -= scrollOffset % Inventory.VisibleWidth;

					itemGrid.ScrollTo(scrollOffset);
				} else if (!itemGrid.SlotVisible(slotIndex)) {
					return null;
				}

				return itemGrid.GetSlotPosition(slotIndex);
			}
		}

		return null;
	}

	/**
	 * Overload 1: UpdateCharacter(PartyMember partyMember, Action? portraitAnimationFinishedHandler = null, bool forceUpdate = false)
	 * Overload 2: UpdateCharacter(int slot, Action? portraitAnimationFinishedHandler = null)
	 */
	UpdateCharacter(partyMemberOrSlot, portraitAnimationFinishedHandler = null, forceUpdate = false) {
		if (typeof partyMemberOrSlot === 'number') {
			const slot = partyMemberOrSlot;
			this.SetCharacter(slot, this.game.GetPartyMember(slot), false, portraitAnimationFinishedHandler);
			return;
		}

		const partyMember = partyMemberOrSlot;
		const slot = this.game.SlotFromPartyMember(partyMember);

		this.SetCharacter(slot, partyMember, false, portraitAnimationFinishedHandler, false, forceUpdate);
	}

	/**
	 * Set portait to 0 to remove the portrait.
	 */
	SetCharacter(slot, partyMember, initialize = false,
		portraitAnimationFinishedHandler = null, forceAnimation = false, forceUpdate = false) {
		let sprite = this.portraits[slot] ??= this.RenderView.SpriteFactory.Create(32, 34, true, 2);

		const AddPortraitBackground = () => {
			sprite = this.portraitBackgrounds[slot] ??= this.RenderView.SpriteFactory.Create(32, 34, true, 0);
			sprite.Layer = this.renderLayer;
			sprite.X = Global.PartyMemberPortraitAreas[slot].Left + 1;
			sprite.Y = Global.PartyMemberPortraitAreas[slot].Top + 1;
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.UICustomGraphicOffset + UICustomGraphic.PortraitBackground);
			sprite.PaletteIndex = toByte(this.RenderView.GraphicInfoProvider.PrimaryUIPaletteIndex + 3 - 1);
			sprite.Visible = true;
		};

		sprite.Layer = this.renderLayer;
		sprite.X = Global.PartyMemberPortraitAreas[slot].Left + 1;
		sprite.Y = Global.PartyMemberPortraitAreas[slot].Top + 1;
		sprite.ClipArea = Global.PartyMemberPortraitAreas[slot].CreateModified(1, 1, -2, -2);
		let animation = false;
		if (initialize) {
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.EmptyCharacterSlot));
			this.portraitStates[slot] = PartyMemberPortaitState.None;
		} else {
			if (forceAnimation && this.portraitStates[slot] === PartyMemberPortaitState.None)
				this.portraitStates[slot] = PartyMemberPortaitState.Empty;
			animation = this.PlayPortraitAnimation(slot, partyMember, portraitAnimationFinishedHandler, forceUpdate && !forceAnimation);
		}
		sprite.PaletteIndex = this.game.PrimaryUIPaletteIndex;
		sprite.Visible = true;

		if (!animation) {
			if (partyMember == null) {
				this.portraitBackgrounds[slot]?.Delete();
				this.portraitBackgrounds[slot] = null;
				this.portraitNames[slot]?.Delete();
				this.portraitNames[slot] = null;
				this.characterStatusIcons[slot]?.Delete();
				this.characterStatusIcons[slot] = null;
			} else {
				AddPortraitBackground();

				let text = this.portraitNames[slot];
				const name = this.RenderView.TextProcessor.CreateText(partyMember.Name.substring(0, Math.min(5, partyMember.Name.length)));

				if (text == null) {
					text = this.portraitNames[slot] = this.RenderView.RenderTextFactory.Create(
						this.game.PrimaryUIPaletteIndex,
						this.textLayer, name, TextColor.PartyMember, true,
						this.GetTextRect(Global.PartyMemberPortraitAreas[slot].Left + 2, Global.PartyMemberPortraitAreas[slot].Top + 31, 30, 6),
						TextAlign.Center);
				} else {
					text.Text = name;
				}
				text.DisplayLayer = 3;
				text.PaletteIndex = this.game.PrimaryUIPaletteIndex;
				text.TextColor = partyMember.Alive ? this.game.CurrentPartyMember === partyMember ? TextColor.ActivePartyMember : TextColor.PartyMember : TextColor.DeadPartyMember;
				text.Visible = true;
				this.UpdateCharacterStatus(partyMember);
			}
		} else if (partyMember != null) {
			AddPortraitBackground();
		}

		this.FillCharacterBars(slot, partyMember);

		if (initialize)
			portraitAnimationFinishedHandler?.();
	}

	/**
	 * Overload 1: UpdateCharacterStatus(int slot, UIGraphic? graphicIndex = null)
	 * Overload 2: UpdateCharacterStatus(PartyMember partyMember)
	 */
	UpdateCharacterStatus(slotOrPartyMember, graphicIndex = null) {
		if (typeof slotOrPartyMember !== 'number') {
			const partyMember = slotOrPartyMember;
			const slot = this.game.SlotFromPartyMember(partyMember);

			if (partyMember.Alive && partyMember.Overweight) {
				// Overweight
				this.UpdateCharacterStatus(slot, UIGraphic.StatusOverweight);
			} else if (partyMember.Conditions !== Condition.None) {
				const conditions = partyMember.VisibleConditions;
				const conditionCount = conditions.length;

				if (conditionCount === 1) {
					this.UpdateCharacterStatus(slot, Graphics.GetConditionGraphic(conditions[0]));
				} else {
					const ticksPerCondition = GameCore.TicksPerSecond * 2;
					const index = Math.trunc((this.game.CurrentTicks % (conditionCount * ticksPerCondition)) / ticksPerCondition);

					this.UpdateCharacterStatus(slot, Graphics.GetConditionGraphic(conditions[index]));
				}
			} else {
				this.UpdateCharacterStatus(slot, null);
			}
			return;
		}

		const slot = slotOrPartyMember;
		const sprite = this.characterStatusIcons[slot] ??= this.RenderView.SpriteFactory.Create(16, 16, true, 3);
		sprite.Layer = this.renderLayer;
		sprite.PaletteIndex = this.game.PrimaryUIPaletteIndex;
		sprite.X = Global.PartyMemberPortraitAreas[slot].Left + 33;
		sprite.Y = Global.PartyMemberPortraitAreas[slot].Top + 2;

		if (graphicIndex != null) {
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(graphicIndex));
			sprite.Visible = true;
		} else {
			sprite.Visible = false;
		}
	}

	/**
	 * Overload 1: FillCharacterBars(PartyMember partyMember)
	 * Overload 2: FillCharacterBars(int slot, PartyMember? partyMember)
	 */
	FillCharacterBars(slot, partyMember) {
		if (arguments.length === 1) {
			partyMember = slot;
			slot = this.game.SlotFromPartyMember(partyMember);
		}

		const alive = partyMember?.Alive === true;
		const hp = !alive ? 0 : partyMember.HitPoints.CurrentValue;
		const sp = !alive ? 0 : partyMember.SpellPoints.CurrentValue;
		const lpPercentage = !alive ? 0.0
			: Math.min(1.0, hp / partyMember.HitPoints.TotalMaxValue);
		const spPercentage = !alive || !ClassExtensions.IsMagic(partyMember.Class) ? 0.0
			: Math.min(1.0, sp / partyMember.SpellPoints.TotalMaxValue);

		this.characterBars[slot * 4 + 0]?.Fill(lpPercentage, hp !== 0);
		this.characterBars[slot * 4 + 1]?.Fill(lpPercentage, hp !== 0);
		this.characterBars[slot * 4 + 2]?.Fill(spPercentage, sp !== 0);
		this.characterBars[slot * 4 + 3]?.Fill(spPercentage, sp !== 0);
	}

	AddActiveSpell(activeSpellType, activeSpell, battle) {
		if (this.activeSpellSprites.has(activeSpellType))
			return;

		const baseLocation = battle ? new Position(0, 170) : new Position(208, 106);
		const index = activeSpellType;
		const graphicIndex = Graphics.GetUIGraphicIndex(UIGraphic.Candle + index);
		dictionaryAdd(this.activeSpellSprites, activeSpellType, this.AddSprite(new Rect(baseLocation.X + index * 16, baseLocation.Y, 16, 16), graphicIndex, this.game.UIPaletteIndex));

		dictionaryAdd(this.activeSpellDurationBackgrounds, activeSpellType, this.CreateArea(new Rect(baseLocation.X + 1 + index * 16, baseLocation.Y + 17, 14, 4),
			this.game.GetUIColor(26), 2));
		const durationBar = new Bar(this.filledAreas,
			this.CreateArea(new Rect(baseLocation.X + 2 + index * 16, baseLocation.Y + 18, 12, 2), this.game.GetUIColor(31), 3), 12, true);
		dictionaryAdd(this.activeSpellDurationBars, activeSpellType, durationBar);
		durationBar.Fill(activeSpell.Duration / 200.0);
	}

	RemoveAllActiveSpells() {
		for (const activeSpell of EnumHelper.GetValues(ActiveSpellType))
			this.UpdateActiveSpell(activeSpell, null);
	}

	UpdateActiveSpell(activeSpellType, activeSpell) {
		if (activeSpell == null) {
			const [found, value] = tryGetValue(this.activeSpellSprites, activeSpellType);
			if (found) {
				value?.Delete();
				this.activeSpellSprites.delete(activeSpellType);
				getValue(this.activeSpellDurationBackgrounds, activeSpellType)?.Delete();
				this.activeSpellDurationBackgrounds.delete(activeSpellType);
				getValue(this.activeSpellDurationBars, activeSpellType)?.Destroy();
				this.activeSpellDurationBars.delete(activeSpellType);
			}
		} else {
			if (!this.activeSpellSprites.has(activeSpellType)) {
				this.AddActiveSpell(activeSpellType, activeSpell, false);
			} else { // update duration display
				getValue(this.activeSpellDurationBars, activeSpellType).Fill(activeSpell.Duration / 200.0, true);
			}
		}
	}

	GetCompassString() {
		/// This contains all of theidrection starting with W (West) and going
		/// clock-wise until W again and then additional N-W and N again.
		/// It is used for the compass which can scroll and display
		/// 3 directions partially at once.
		/// English example: "W  N-W  N  N-E  E  S-E  S  S-W  W  N-W  N  "
		/// There are always 2 spaces between each direction. I think 1 space
		/// as a divider and 1 space to the right/left of the 1-character
		/// directions.
		const baseString = this.game.DataNameProvider.CompassDirections;
		let playerAngle = this.game.PlayerAngle;

		if (playerAngle < 0)
			playerAngle += 360;
		if (playerAngle >= 360)
			playerAngle -= 360;

		// The display is 32 pixels wide so when displaying for example the W
		// in the center (direction is exactle west), there are two spaces to
		// each size and a 1 pixel line of the S-W and N-W.
		// To accomplish that we display not 5 but 7 characters and clip the
		// text accordingly.

		// There are 32 possible text rotations. The first (0) is 1 left of N-W.
		// The last (31) is a bit left of N-W. Increasing rotates right.
		// Rotating by 45° (e.g. from N to N-E) needs 4 text index increases (1 step ~ 11°).
		// Rotating by 90° (e.g. from N to E) needs 8 text index increases (1 step ~ 11°).
		// There is 1° difference per 45° and therefore 8° for a full rotation of 360°.
		// The exact angle range for one text index is 360°/32 = 11.25°.

		// As the first index is for left of N-W and this is -56.25°, we use it as a base angle
		// by adding 45 to the real player angle.
		let index = Util.Round((playerAngle + 56.25) / 11.25);

		if (index >= 32)
			index -= 32;

		return baseString.substring(index, index + 7);
	}

	AddSpecialItem(specialItem) {
		const game = this.game;
		switch (specialItem) {
			case SpecialItemPurpose.Compass:
			{
				dictionaryAdd(this.specialItemSprites, specialItem, this.AddSprite(new Rect(208, 73, 32, 32),
					Graphics.GetUIGraphicIndex(UIGraphic.Compass), game.UIPaletteIndex, 4)); // Note: The display layer must be greater than the windchain layer
				const text = this.AddText(new Rect(203, 86, 42, 7),
					this.GetCompassString(), TextColor.BrightGray);
				dictionaryAdd(this.specialItemTexts, SpecialItemPurpose.Compass, text);
				text.Clip(new Rect(208, 86, 32, 7));
				break;
			}
			case SpecialItemPurpose.MonsterEye:
			{
				dictionaryAdd(this.specialItemSprites, specialItem, this.AddSprite(new Rect(240, 49, 32, 32),
					Graphics.GetUIGraphicIndex(game.MonsterSeesPlayer ? UIGraphic.MonsterEyeActive
						: UIGraphic.MonsterEyeInactive), game.UIPaletteIndex, 3));
				break;
			}
			case SpecialItemPurpose.DayTime:
			{
				dictionaryAdd(this.specialItemSprites, specialItem, this.AddSprite(new Rect(272, 73, 32, 32),
					Graphics.GetUIGraphicIndex(UIGraphic.Night + TimeExtensions.GetDayTime(game.GameTime)), game.UIPaletteIndex, 3));
				break;
			}
			case SpecialItemPurpose.WindChain:
				dictionaryAdd(this.specialItemSprites, specialItem, this.AddSprite(new Rect(240, 89, 32, 15),
					Graphics.GetUIGraphicIndex(UIGraphic.Windchain), game.UIPaletteIndex, 3));
				break;
			case SpecialItemPurpose.MapLocation:
				dictionaryAdd(this.specialItemTexts, SpecialItemPurpose.MapLocation, this.AddText(new Rect(210, 50, 30, 14),
					`X:${String(game.PartyPosition.X + 1).padStart(3)}^Y:${String(game.PartyPosition.Y + 1).padStart(3)}`, TextColor.BrightGray));
				break;
			case SpecialItemPurpose.Clock:
				dictionaryAdd(this.specialItemTexts, SpecialItemPurpose.Clock, this.AddText(new Rect(273, 54, 30, 7),
					`${String(game.GameTime.Hour).padStart(2)}:${formatNumber(game.GameTime.Minute, '00')}`, TextColor.BrightGray));
				break;
			default:
				throw new AmbermoonException(ExceptionScope.Application, `Invalid special item: ${enumName(SpecialItemPurpose, specialItem)}`);
		}
	}

	UpdateSpecialItems() {
		const game = this.game;

		// Update compass
		if (this.specialItemTexts.has(SpecialItemPurpose.Compass))
			this.specialItemTexts.get(SpecialItemPurpose.Compass).SetText(game.ProcessText(this.GetCompassString()));

		// Update monster eye
		if (this.specialItemSprites.has(SpecialItemPurpose.MonsterEye))
			this.specialItemSprites.get(SpecialItemPurpose.MonsterEye).TextureAtlasOffset =
				this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(game.MonsterSeesPlayer ? UIGraphic.MonsterEyeActive : UIGraphic.MonsterEyeInactive));

		// Update daytime display
		if (this.specialItemSprites.has(SpecialItemPurpose.DayTime))
			this.specialItemSprites.get(SpecialItemPurpose.DayTime).TextureAtlasOffset =
				this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.Night + TimeExtensions.GetDayTime(game.GameTime)));

		// Update map location
		if (this.specialItemTexts.has(SpecialItemPurpose.MapLocation))
			this.specialItemTexts.get(SpecialItemPurpose.MapLocation).SetText(
				game.ProcessText(`X:${String(game.PartyPosition.X + 1).padStart(3)}^Y:${String(game.PartyPosition.Y + 1).padStart(3)}`));

		// Update clock
		if (this.specialItemTexts.has(SpecialItemPurpose.Clock))
			this.specialItemTexts.get(SpecialItemPurpose.Clock).SetText(
				game.ProcessText(`${String(game.GameTime.Hour).padStart(2)}:${formatNumber(game.GameTime.Minute, '00')}`));
	}

	AddMapCharacterSprite(rect, textureIndex, baseLineOffset) {
		const sprite = this.RenderView.SpriteFactory.Create(rect.Width, rect.Height, false);
		sprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.Characters).GetOffset(textureIndex);
		sprite.BaseLineOffset = baseLineOffset;
		sprite.X = rect.Left;
		sprite.Y = rect.Top;
		sprite.PaletteIndex = toByte(this.game.Map.PaletteIndex - 1);
		sprite.Layer = this.RenderView.GetLayer(Layer.Characters);
		sprite.Visible = true;
		this.additionalSprites.push(sprite);
		return sprite;
	}

	/**
	 * C# overload AddSprite(Rect rect, uint textureIndex, byte paletteIndex, byte displayLayer, string? tooltip,
	 *   TextColor? tooltipTextColor, Layer? layer, out Tooltip? createdTooltip, bool visible = true).
	 * Its JS parameter list would be identical to the other AddSprite overload, so it got its own name.
	 * Returns [sprite, createdTooltip] (out parameter convention).
	 */
	AddSpriteWithTooltip(rect, textureIndex, paletteIndex, displayLayer,
		tooltip, tooltipTextColor, layer, visible = true) {
		let createdTooltip = null;
		const sprite = this.RenderView.SpriteFactory.Create(rect.Width, rect.Height, true);
		sprite.TextureAtlasOffset = layer == null ? this.textureAtlas.GetOffset(textureIndex)
			: TextureAtlasManager.Instance.GetOrCreate(layer).GetOffset(textureIndex);
		sprite.DisplayLayer = displayLayer;
		sprite.X = rect.Left;
		sprite.Y = rect.Top;
		sprite.PaletteIndex = paletteIndex;
		sprite.Layer = layer == null ? this.renderLayer : this.RenderView.GetLayer(layer);
		sprite.Visible = visible;
		this.additionalSprites.push(sprite);

		if (tooltip != null)
			createdTooltip = this.AddTooltip(rect, tooltip, tooltipTextColor ?? TextColor.White);

		return [sprite, createdTooltip];
	}

	AddSprite(rect, textureIndex, paletteIndex, displayLayer = 2,
		tooltip = null, tooltipTextColor = null, layer = null, visible = true) {
		return this.AddSpriteWithTooltip(rect, textureIndex, paletteIndex, displayLayer, tooltip, tooltipTextColor, layer, visible)[0];
	}

	AddAnimatedSprite(rect, textureIndex, paletteIndex,
		numFrames, displayLayer = 2, layer = null, visible = true) {
		const textureAtlas = layer == null ? this.textureAtlas : TextureAtlasManager.Instance.GetOrCreate(layer);
		const sprite = this.RenderView.SpriteFactory.CreateAnimated(rect.Width, rect.Height, textureAtlas.Texture.Width, numFrames, true, displayLayer);
		sprite.TextureAtlasOffset = textureAtlas.GetOffset(textureIndex);
		sprite.DisplayLayer = displayLayer;
		sprite.X = rect.Left;
		sprite.Y = rect.Top;
		sprite.PaletteIndex = paletteIndex;
		sprite.Layer = layer == null ? this.renderLayer : this.RenderView.GetLayer(layer);
		sprite.Visible = visible;
		this.additionalSprites.push(sprite);
		return sprite;
	}

	AddTooltip(rect, tooltip, tooltipTextColor, textAlign = TextAlign.Center,
		backgroundColor = null, centerOnScreen = false) {
		const toolTip = new Tooltip();
		toolTip.Area = rect;
		toolTip.Text = tooltip;
		toolTip.TextColor = tooltipTextColor;
		toolTip.TextAlign = textAlign;
		toolTip.BackgroundColor = backgroundColor;
		toolTip.CenterOnScreen = centerOnScreen;
		this.tooltips.push(toolTip);
		return toolTip;
	}

	RemoveTooltip(tooltip) {
		removeItem(this.tooltips, tooltip);

		if (this.activeTooltip === tooltip)
			this.HideTooltip();
	}

	HideTooltip() {
		this.SetActiveTooltip(null, null);
		this.buttonGrid?.HideTooltips();
	}

	SetActiveTooltip(cursorPosition, tooltip) {
		const RenderView = this.RenderView;

		if (tooltip == null) { // remove
			if (this.activeTooltipText != null) {
				this.activeTooltipText?.Delete();
				this.activeTooltipText = null;
			}

			if (this.activeTooltipBackground != null) {
				this.activeTooltipBackground?.Delete();
				this.activeTooltipBackground = null;

				for (let i = 0; i < this.activeTooltipBorders.length; ++i) {
					this.activeTooltipBorders[i]?.Delete();
					this.activeTooltipBorders[i] = null;
				}
			}
		} else {
			if (this.activeTooltipText == null) {
				this.activeTooltipText = RenderView.RenderTextFactory.Create(toByte(RenderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1));
				this.activeTooltipText.Shadow = true;
				this.activeTooltipText.DisplayLayer = 250;
				this.activeTooltipText.Layer = RenderView.GetLayer(Layer.Text);
				this.activeTooltipText.Visible = true;
			}

			const text = RenderView.TextProcessor.CreateText(tooltip.Text);
			const textWidth = text.MaxLineSize * Global.GlyphWidth;

			this.activeTooltipText.Text = text;
			this.activeTooltipText.TextColor = tooltip.TextColor;
			let x = Util.Limit(0, tooltip.CenterOnScreen ? Math.trunc((Global.VirtualScreenWidth - textWidth) / 2) : cursorPosition.X - Math.trunc(textWidth / 2),
				Global.VirtualScreenWidth - textWidth);
			let y = cursorPosition.Y - text.LineCount * Global.GlyphLineHeight - 1;
			if (textWidth < Global.VirtualScreenWidth - 1) {
				if (x === 0)
					x = 2;
				else if (x + textWidth >= Global.VirtualScreenWidth - 1)
					x = Global.VirtualScreenWidth - textWidth - 2;
			}
			if (tooltip.BackgroundColor != null) {
				if (y >= 2)
					y -= 2;
			}
			if (y < 2 && cursorPosition.Y + text.LineCount * Global.GlyphLineHeight + 16 <= Global.VirtualScreenHeight)
				y = cursorPosition.Y + 16;
			let textArea = new Rect(x, y, textWidth, text.LineCount * Global.GlyphLineHeight);
			this.activeTooltipText.Place(this.GetTextRect(textArea), tooltip.TextAlign);

			if (tooltip.BackgroundColor != null) {
				textArea = textArea.CreateModified(-2, -2, 4, 4);

				if (this.activeTooltipBackground == null) {
					this.activeTooltipBackground = RenderView.ColoredRectFactory.Create(textArea.Width, textArea.Height, tooltip.BackgroundColor, 248);
					this.activeTooltipBackground.Layer = RenderView.GetLayer(Layer.MainMenuEffects);
					this.activeTooltipBackground.Visible = true;

					this.activeTooltipBorders[0] = RenderView.ColoredRectFactory.Create(textArea.Width, 1, Color.Black, 249);
					this.activeTooltipBorders[1] = RenderView.ColoredRectFactory.Create(1, textArea.Height - 2, Color.Black, 249);
					this.activeTooltipBorders[2] = RenderView.ColoredRectFactory.Create(1, textArea.Height - 2, Color.Black, 249);
					this.activeTooltipBorders[3] = RenderView.ColoredRectFactory.Create(textArea.Width, 1, Color.Black, 249);

					for (let i = 0; i < 4; ++i) {
						this.activeTooltipBorders[i].Layer = RenderView.GetLayer(Layer.UI);
						this.activeTooltipBorders[i].Visible = true;
					}
				} else {
					this.activeTooltipBackground.Resize(textArea.Width, textArea.Height);
					this.activeTooltipBackground.Color = tooltip.BackgroundColor;

					this.activeTooltipBorders[0].Resize(textArea.Width, 1);
					this.activeTooltipBorders[1].Resize(1, textArea.Height - 2);
					this.activeTooltipBorders[2].Resize(1, textArea.Height - 2);
					this.activeTooltipBorders[3].Resize(textArea.Width, 1);
				}

				this.activeTooltipBackground.X = textArea.X;
				this.activeTooltipBackground.Y = textArea.Y;

				this.activeTooltipBorders[0].X = textArea.X;
				this.activeTooltipBorders[0].Y = textArea.Y;
				this.activeTooltipBorders[1].X = textArea.X;
				this.activeTooltipBorders[1].Y = textArea.Y + 1;
				this.activeTooltipBorders[2].X = textArea.X + textArea.Width - 1;
				this.activeTooltipBorders[2].Y = textArea.Y + 1;
				this.activeTooltipBorders[3].X = textArea.X;
				this.activeTooltipBorders[3].Y = textArea.Y + textArea.Height - 1;
			} else if (this.activeTooltipBackground != null) {
				this.activeTooltipBackground?.Delete();
				this.activeTooltipBackground = null;

				for (let i = 0; i < 4; ++i) {
					this.activeTooltipBorders[i]?.Delete();
					this.activeTooltipBorders[i] = null;
				}
			}
		}

		this.activeTooltip = tooltip;
	}

	/**
	 * AddText(Rect rect, string text, ...) or AddText(Rect rect, IText text, ...)
	 */
	AddText(rect, text, color = TextColor.White,
		textAlign = TextAlign.Left, displayLayer = 2) {
		if (typeof text === 'string')
			return this.AddText(rect, this.RenderView.TextProcessor.CreateText(text), color, textAlign, displayLayer);

		const uiText = new UIText(this.RenderView, this.game.UIPaletteIndex, text, this.GetTextRect(rect), displayLayer, color, true, textAlign, false);
		this.texts.push(uiText);
		return uiText;
	}

	AddScrollableText(rect, text, color = TextColor.White,
		textAlign = TextAlign.Left, displayLayer = 2) {
		const scrollableText = this.CreateScrollableText(rect, text, color, textAlign, displayLayer);
		this.texts.push(scrollableText);
		return scrollableText;
	}

	CreateScrollableText(rect, text, color = TextColor.White,
		textAlign = TextAlign.Left, displayLayer = 2, shadow = true, paletteIndex = null) {
		const game = this.game;
		const scrollableText = new UIText(this.RenderView, paletteIndex ?? game.UIPaletteIndex, text, this.GetTextRect(rect),
			displayLayer, color, shadow, textAlign, true, (...args) => game.AddTimedEvent(...args));
		scrollableText.FreeScrollingStarted.add(() => {
			this.freeScrolledText = scrollableText;

			if (game.CoreConfiguration.IsMobile) {
				if (this.activePopup != null)
					this.activePopup.CanAbort = !this.activePopup.HasButtons && !this.activePopup.HasList && !this.activePopup.HasChildPopup;
			} else {
				game.ExecuteNextUpdateCycle(() => game.CursorType = CursorType.None);
			}
		});
		scrollableText.FreeScrollingEnded.add(() => {
			this.freeScrolledText = null;
			game.ExecuteNextUpdateCycle(() => {
				game.CursorType = CursorType.Sword;
				game.UpdateCursor();
			});
		});
		return scrollableText;
	}

	Set80x80Picture(picture, x = Global.LayoutX + 16, y = Global.LayoutY + 6) {
		if (picture === Picture80x80.None) {
			if (this.sprite80x80Picture != null)
				this.sprite80x80Picture.Visible = false;
		} else {
			const sprite = this.sprite80x80Picture ??= this.RenderView.SpriteFactory.Create(80, 80, true);
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.Pics80x80Offset + (picture - 1));
			sprite.X = x;
			sprite.Y = y;
			sprite.PaletteIndex = this.game.UIPaletteIndex;
			sprite.Layer = this.renderLayer;
			sprite.Visible = true;
		}
	}

	/**
	 * void AddEventPicture(uint index, out byte palette) -> returns [palette]
	 */
	AddEventPicture(index) {
		const sprite = this.eventPicture ??= this.RenderView.SpriteFactory.Create(320, 92, true, 10);
		let palette;
		// Web port: other games (Amberstar) provide their own event picture palettes.
		const customPalettes = this.RenderView.GraphicInfoProvider?.EventPicturePalettes;
		switch (customPalettes ? -1 : index) {
			case -1: palette = customPalettes[index]; break;
			// NOTE: These indexes are 1 lower than the subfile number in the container!
			case 0: palette = 26; break; // Valdyn portal
			case 1: palette = 31; break; // Grandfather in bed
			case 2: palette = 32; break; // Airship Lyramion -> Kire's moon
			case 3: palette = 32; break; // Airship Lyramion -> Morag
			case 4: palette = 32; break; // Airship Kire's moon -> Lyramion
			case 5: palette = 32; break; // Airship Kire's moon -> Morag (identical image to 3)
			case 6: palette = 32; break; // Airship Morag -> Lyramion
			case 7: palette = 32; break; // Airship Morag -> Kire's moon
			case 8: palette = 37; break; // Game over
			case 9: palette = 50; break; // Meeting Sheera
			case 10: palette = 51; break; // Sheera portal merge
			case 11: palette = 55; break; // Moranian rebels
			case 12: palette = 56; break; // Ancient desert city
			case 13: palette = 57; break; // Exiting airship mission
			default: throw new AmbermoonException(ExceptionScope.Data, `Invalid event picture index: ${index}. Valid indices are 0 to 12.`);
		}
		sprite.PaletteIndex = palette;
		sprite.Layer = this.renderLayer;
		sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.EventPictureOffset + index);
		sprite.X = 0;
		sprite.Y = 38;
		sprite.Visible = true;
		// Web port: custom event pictures have their own palette, the UI keeps the primary UI palette.
		return [customPalettes ? this.game.PrimaryUIPaletteIndex : palette];
	}

	CancelDrag() {
		if (this.draggedItem != null) {
			if (this.draggedItem.Reset(this.game, this))
				return;
			this.DropItem();
		}

		if (this.draggedGold !== 0 || this.draggedFood !== 0) {
			this.draggedGold = 0;
			this.draggedFood = 0;
			this.draggedGoldOrFoodRemover = null;
			this.DropItem();
			this.game.UntrapMouse();
		}

		// Remove hand icons and set current status icons
		[...this.game.PartyMembers].forEach(p => this.UpdateCharacterStatus(p));
		this.game.ItemDraggingCancelled();
	}

	get IsInventory() { return this.Type === LayoutType.Inventory; }
	get HasScrollableItemGrid() {
		return this.IsInventory ||
			((this.Type === LayoutType.Items || this.Type === LayoutType.Conversation) &&
				this.itemGrids.length !== 0 && !this.itemGrids[0].Disabled);
	}

	AddItemGrid(itemGrid) {
		this.itemGrids.push(itemGrid);
	}

	CreateArea(rect, color, displayLayer = 0, type = FilledAreaType.Custom) {
		const coloredRect = this.RenderView.ColoredRectFactory.Create(rect.Width, rect.Height,
			color, displayLayer);
		coloredRect.Layer = type === FilledAreaType.FadeEffect || type === FilledAreaType.CustomEffect
			? this.RenderView.GetLayer(Layer.Effects) : this.renderLayer;
		coloredRect.X = rect.Left;
		coloredRect.Y = rect.Top;
		coloredRect.Visible = true;
		switch (type) {
			case FilledAreaType.CharacterBar:
				this.barAreas.push(coloredRect);
				break;
			case FilledAreaType.FadeEffect:
				this.fadeEffectAreas.push(coloredRect);
				break;
			default:
				this.filledAreas.push(coloredRect);
				break;
		}
		return coloredRect;
	}

	/**
	 * FillArea(Rect rect, Color color, bool topMost) or FillArea(Rect rect, Color color, byte displayLayer)
	 */
	FillArea(rect, color, topMostOrDisplayLayer) {
		if (typeof topMostOrDisplayLayer === 'boolean')
			return new FilledArea(this.filledAreas, this.CreateArea(rect, color, topMostOrDisplayLayer ? 245 : 0));
		return new FilledArea(this.filledAreas, this.CreateArea(rect, color, topMostOrDisplayLayer));
	}

	AddPanel(rect, displayLayer) {
		return new Panel(this.game, rect, this.filledAreas, this, displayLayer);
	}

	/**
	 * @param startTime DateTime? as milliseconds (Date.now() based)
	 */
	AddColorFader(rect, startColor, endColor,
		durationInMilliseconds, removeWhenFinished, startTime = null) {
		const now = Date.now();
		const startingTime = startTime ?? now;
		const initialColor = startingTime > now ? Color.Transparent : startColor;

		this.fadeEffects.push(new FadeEffect(this.fadeEffectAreas, this.CreateArea(rect, initialColor, 255, FilledAreaType.FadeEffect), startColor,
			endColor, durationInMilliseconds, startingTime, removeWhenFinished));
	}

	AddFadeEffect(rect, color, fadeEffectType,
		durationInMilliseconds) {
		switch (fadeEffectType) {
			case FadeEffectType.FadeIn:
				this.AddColorFader(rect, new Color(color, 0), color, durationInMilliseconds, true);
				break;
			case FadeEffectType.FadeOut:
				this.AddColorFader(rect, color, new Color(color, 0), durationInMilliseconds, true);
				break;
			case FadeEffectType.FadeInAndOut: {
				const quarterDuration = Math.trunc(durationInMilliseconds / 4);
				const halfDuration = quarterDuration * 2;
				this.AddColorFader(rect, new Color(color, 0), color, quarterDuration, true);
				this.AddColorFader(rect, color, color, quarterDuration, true,
					Date.now() + quarterDuration);
				this.AddColorFader(rect, color, new Color(color, 0), halfDuration, true,
					Date.now() + halfDuration);
				break;
			}
		}
	}

	UpdateItemGrids() {
		for (const itemGrid of this.itemGrids) {
			itemGrid.Refresh();
		}
	}

	UpdateItemSlot(itemSlot) {
		for (const itemGrid of this.itemGrids) {
			const slotIndex = itemGrid.SlotFromItemSlot(itemSlot);

			if (slotIndex !== -1) {
				itemGrid.SetItem(slotIndex, itemSlot);
				break;
			}
		}
	}

	Update(currentTicks) {
		const game = this.game;
		this.buttonGrid.Update(currentTicks);
		this.activePopup?.Update(game.CurrentPopupTicks);

		for (let i = this.fadeEffects.length - 1; i >= 0; --i) {
			this.fadeEffects[i].Update();

			if (this.fadeEffects[i].Destroyed)
				this.fadeEffects.splice(i, 1);
		}

		if (this.Type === LayoutType.Map2D || this.Type === LayoutType.Map3D) {
			for (const activeSpell of EnumHelper.GetValues(ActiveSpellType)) {
				this.UpdateActiveSpell(activeSpell, game.CurrentSavegame.ActiveSpells[activeSpell]);
			}

			this.UpdateSpecialItems();
		}

		if (this.portraitAnimation != null) {
			const portraitAnimation = this.portraitAnimation;
			const animationTime = GameCore.TicksPerSecond;
			const elapsed = (game.BattleActive ? game.CurrentNormalizedBattleTicks : game.CurrentAnimationTicks) - portraitAnimation.StartTicks;

			if (elapsed >= animationTime) {
				portraitAnimation.PrimarySprite.Y = 1;
				portraitAnimation.PrimarySprite.DisplayLayer = portraitAnimation.InitialDisplayLayer;
				portraitAnimation.SecondarySprite.Delete();
				const tempAnimation = portraitAnimation;
				this.portraitAnimation = null;
				tempAnimation.OnFinished();
			} else {
				portraitAnimation.Offset = portraitAnimation.InitialOffset + Math.min(34, Math.trunc(elapsed * 34 / animationTime));

				switch (portraitAnimation.Movement) {
					case PortraitAnimation.MoveType.MovePrimary:
						portraitAnimation.PrimarySprite.Y = 1 + portraitAnimation.Offset;
						portraitAnimation.PrimarySprite.DisplayLayer = toByte(Math.min(255, portraitAnimation.InitialDisplayLayer + 10));
						break;
					case PortraitAnimation.MoveType.MoveSecondary:
						portraitAnimation.SecondarySprite.Y = 1 + portraitAnimation.Offset;
						portraitAnimation.SecondarySprite.DisplayLayer = toByte(Math.min(255, portraitAnimation.InitialDisplayLayer + 10));
						break;
					case PortraitAnimation.MoveType.MoveBoth:
						portraitAnimation.PrimarySprite.Y = 1 + portraitAnimation.Offset;
						portraitAnimation.SecondarySprite.Y = portraitAnimation.PrimarySprite.Y + portraitAnimation.PrimarySprite.Height;
						portraitAnimation.SecondarySprite.DisplayLayer = portraitAnimation.PrimarySprite.DisplayLayer = portraitAnimation.InitialDisplayLayer;
						break;
				}
			}
		}

		// The spell Blink uses blinking battle field slot markers
		for (const slotMarker of this.battleFieldSlotMarkers.values()) {
			if (slotMarker.BlinkStartTicks == null)
				slotMarker.Sprite.Visible = true;
			else {
				const diff = game.CurrentNormalizedBattleTicks - slotMarker.BlinkStartTicks;
				if (slotMarker.ToggleColors) {
					const slotColor = (diff % (Layout.TicksPerBlink * 2) < Layout.TicksPerBlink) ? BattleFieldSlotColor.Orange : BattleFieldSlotColor.Yellow;
					const textureIndex = Graphics.UICustomGraphicOffset + UICustomGraphic.BattleFieldYellowBorder + slotColor - 1;
					slotMarker.Sprite.Visible = true;
					slotMarker.Sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(textureIndex);
				} else {
					slotMarker.Sprite.Visible = diff % (Layout.TicksPerBlink * 2) < Layout.TicksPerBlink;
				}
			}
		}
	}

	KeyChar(ch) {
		if (this.questionYesButton != null && (ch.toLowerCase() === 'y' || ch.toLowerCase() === 'j' || ch.toLowerCase() === 'o')) {
			this.questionYesButton.PressImmediately(this.game, false, true);
			return true;
		}

		if (this.questionNoButton != null && ch.toLowerCase() === 'n') {
			this.questionNoButton.PressImmediately(this.game, false, true);
			return true;
		}

		if (this.PopupActive && this.activePopup.KeyChar(ch))
			return true;

		return false;
	}

	HasQuestionYesButton() { return this.questionYesButton != null; }

	HasQuestionNoButton() { return this.questionYesButton != null; }

	KeyDown(key, keyModifiers) {
		if (this.HasQuestionYesButton() && key === Key.Return) {
			this.questionYesButton.PressImmediately(this.game, false, true);
			return;
		}

		if (this.HasQuestionNoButton() && key === Key.Escape) {
			this.questionNoButton.PressImmediately(this.game, false, true);
			return;
		}

		if (this.PopupActive && this.activePopup.KeyDown(key))
			return;

		if (!this.game.InputEnable)
			return;

		const itemGrids = this.itemGrids;

		switch (key) {
			case Key.Up:
				if (!this.PopupActive && this.HasScrollableItemGrid) {
					if (hasFlag(keyModifiers, KeyModifiers.Shift))
						itemGrids[0].ScrollToBegin();
					else
						itemGrids[0].ScrollUp();
				}
				break;
			case Key.Down:
				if (!this.PopupActive && this.HasScrollableItemGrid) {
					if (hasFlag(keyModifiers, KeyModifiers.Shift))
						itemGrids[0].ScrollToEnd();
					else
						itemGrids[0].ScrollDown();
				}
				break;
			case Key.PageUp:
				if (!this.PopupActive && this.HasScrollableItemGrid)
					itemGrids[0].ScrollPageUp();
				break;
			case Key.PageDown:
				if (!this.PopupActive && this.HasScrollableItemGrid)
					itemGrids[0].ScrollPageDown();
				break;
			case Key.Home:
				if (!this.PopupActive && this.HasScrollableItemGrid)
					itemGrids[0].ScrollToBegin();
				break;
			case Key.End:
				if (!this.PopupActive && this.HasScrollableItemGrid)
					itemGrids[0].ScrollToEnd();
				break;
		}
	}

	ScrollX(xScroll) {
		// bool right = xScroll < 0;

		// not used
		return false;
	}

	ScrollY(yScroll) {
		const down = this.game.CoreConfiguration.IsMobile ? yScroll > 0 : yScroll < 0;

		if (this.OptionMenuOpen && this.PopupActive && this.activePopup.Scroll(down, yScroll))
			return true;

		if (this.game.CoreConfiguration.IsMobile && this.PopupActive && this.freeScrolledText != null && this.activePopup.CanAbort) {
			if (this.activePopup.Scroll(down, yScroll))
				return true;
		}

		if (!this.game.InputEnable)
			return false;

		if (this.PopupActive && this.activePopup.Scroll(down, yScroll))
			return true;

		if (this.HasScrollableItemGrid)
			return this.itemGrids[0].Scroll(down);

		return false;
	}

	/**
	 * void LeftMouseUp(Position position, out CursorType? newCursorType, uint currentTicks) -> returns [newCursorType]
	 */
	LeftMouseUp(position, currentTicks) {
		let newCursorType = null;

		if (this.ignoreNextMouseUp) {
			this.ignoreNextMouseUp = false;
			return [newCursorType];
		}

		if (this.PopupActive) {
			this.activePopup.LeftMouseUp(position);
			return [newCursorType];
		}

		if (this.questionYesButton != null || this.questionNoButton != null) {
			// If those buttons are existing, only react to those buttons.
			this.questionYesButton?.LeftMouseUp(position, currentTicks);
			this.questionNoButton?.LeftMouseUp(position, currentTicks);
			return [newCursorType];
		}

		if (this.freeScrolledText != null)
			return [newCursorType];

		const [cursorType] = this.buttonGrid.MouseUp(position, MouseButtons.Left, currentTicks);

		if (cursorType != null) {
			newCursorType = cursorType;
			return [newCursorType];
		}

		if (!this.game.InputEnable)
			return [newCursorType];

		for (const itemGrid of this.itemGrids)
			itemGrid.LeftMouseUp(position);

		if (this.Type === LayoutType.Battle) {
			if (Global.BattleFieldArea.Contains(position)) {
				const slotColumn = Math.trunc((position.X - Global.BattleFieldX) / Global.BattleFieldSlotWidth);
				const slotRow = Math.trunc((position.Y - Global.BattleFieldY) / Global.BattleFieldSlotHeight);

				this.BattleFieldSlotClicked.invoke(slotColumn, slotRow, MouseButtons.Left);
			}
		}

		return [newCursorType];
	}

	/**
	 * void RightMouseUp(Position position, out CursorType? newCursorType, uint currentTicks) -> returns [newCursorType]
	 */
	RightMouseUp(position, currentTicks) {
		let newCursorType;

		if (TextInput.FocusedInput != null) {
			newCursorType = CursorType.None;
			return [newCursorType];
		}

		if (this.PopupActive) {
			newCursorType = null;
			this.activePopup.RightMouseUp(position);
			return [newCursorType];
		}

		[newCursorType] = this.buttonGrid.MouseUp(position, MouseButtons.Right, currentTicks);

		if (!this.game.InputEnable)
			return [newCursorType];

		if (this.Type === LayoutType.Battle) {
			if (Global.BattleFieldArea.Contains(position)) {
				const slotColumn = Math.trunc((position.X - Global.BattleFieldX) / Global.BattleFieldSlotWidth);
				const slotRow = Math.trunc((position.Y - Global.BattleFieldY) / Global.BattleFieldSlotHeight);

				this.BattleFieldSlotClicked.invoke(slotColumn, slotRow, MouseButtons.Right);
			}
		}

		return [newCursorType];
	}

	AbortPickingTargetInventory() {
		if (this.game.CurrentWindow.Window === Window.Inventory) {
			if (this.itemGrids[0] != null) {
				this.itemGrids[0].ClearItemClickEventHandlers();
				this.itemGrids[0].DisableDrag = false;
			}
			if (this.itemGrids[1] != null) {
				this.itemGrids[1].ClearItemClickEventHandlers();
				this.itemGrids[1].DisableDrag = false;
			}
		}
		this.game.AbortPickingTargetInventory();
	}

	/**
	 * bool Click(Position position, MouseButtons buttons, ref CursorType cursorType, uint currentTicks,
	 *   bool pickingNewLeader = false, bool pickingTargetPlayer = false, bool pickingTargetInventory = false,
	 *   KeyModifiers keyModifiers = KeyModifiers.None)
	 * -> returns [result, cursorType]
	 */
	Click(position, buttons, cursorType,
		currentTicks, pickingNewLeader = false, pickingTargetPlayer = false,
		pickingTargetInventory = false, keyModifiers = KeyModifiers.None) {
		const game = this.game;
		const itemGrids = this.itemGrids;
		const result = value => [value, cursorType];

		if (pickingTargetPlayer) {
			if (buttons === MouseButtons.Right) {
				game.AbortPickingTargetPlayer();
				return result(true);
			}
		} else if (pickingTargetInventory) {
			if (this.Type === LayoutType.Inventory && buttons === MouseButtons.Left) {
				for (const itemGrid of itemGrids) {
					let clicked;
					[clicked, , cursorType] = itemGrid.Click(position, this.draggedItem,
						buttons, cursorType, null);
					if (clicked) {
						return result(true);
					}
				}
			}

			if (buttons === MouseButtons.Right) {
				this.AbortPickingTargetInventory();
				return result(true);
			}
		} else if (!pickingNewLeader) {
			if (this.OptionMenuOpen && !this.PopupActive && this.pyrdacorLinkArea?.Contains(position) && buttons === MouseButtons.Left) {
				globalThis.open?.('https://amberworlds.info/pyrdacor', '_blank', 'noopener');
				return result(true);
			}
			if (this.freeScrolledText != null) {
				this.freeScrolledText.Click(position);
				return result(true);
			} else if (this.Type === LayoutType.Event && !game.GameOverButtonsVisible) {
				cursorType = CursorType.Click;
				this.texts[0].Click(position);
				return result(true);
			} else if (this.questionYesButton != null || this.questionNoButton != null) {
				// If those buttons are existing, only react to those buttons.
				return result(this.questionYesButton?.LeftMouseDown(position, currentTicks) === true ||
					this.questionNoButton?.LeftMouseDown(position, currentTicks) === true);
			} else if (this.activePopup?.CloseOnClick !== true) {
				if (this.ChestText != null) {
					if (buttons === MouseButtons.Left || buttons === MouseButtons.Right) {
						if (this.ChestText.Click(position)) {
							cursorType = this.ChestText?.WithScrolling === true ? CursorType.Click : CursorType.Sword;
							return result(true);
						}
					}
				} else if (this.InventoryMessageWaitsForClick) {
					if (buttons === MouseButtons.Left || buttons === MouseButtons.Right) {
						this.inventoryMessage?.Click(position);
						cursorType = this.inventoryMessage == null ? CursorType.Sword : CursorType.Click;
						return result(true);
					}
				} else if (game.ConversationTextActive && this.Type === LayoutType.Conversation) {
					cursorType = CursorType.Click;
					const scrollText = last(this.texts, text => text.WithScrolling);
					scrollText?.Click(position);
					return result(true);
				}
			}

			if (this.PopupActive) {
				const activePopup = this.activePopup;

				if (!activePopup.CloseOnClick && buttons === MouseButtons.Right && activePopup.TestButtonRightClick(position))
					return result(true);

				if (activePopup.CloseOnClick || (buttons === MouseButtons.Right && activePopup.CanAbort &&
					(!activePopup.HasTextInput() || TextInput.FocusedInput == null))) {
					this.ClosePopup();
					return result(true);
				} else if (game.CoreConfiguration.IsMobile && activePopup.CanAbort &&
					!this.OptionMenuOpen && !activePopup.HasTextInput() && !activePopup.HasButtons &&
					!activePopup.HasList) {
					// Close popups with tap on mobile but not save/load or popups with buttons or text input.
					this.ClosePopup();
					return result(true);
				} else {
					const [popupClicked, ignoreNextMouseUp] = activePopup.Click(position, buttons);
					this.ignoreNextMouseUp = ignoreNextMouseUp;
					if (popupClicked)
						return result(true);
				}

				if (activePopup.DisableButtons || TextInput.FocusedInput != null)
					return result(false);
			}

			if (this.draggedItem == null) {
				const [buttonClicked, newCursorType] = this.buttonGrid.MouseDown(position, buttons, currentTicks);

				if (buttonClicked) {
					if (newCursorType != null)
						cursorType = newCursorType;
					return result(true);
				}
			}

			if (!game.InputEnable || this.PopupActive)
				return result(false);

			if (this.Type === LayoutType.BattlePositions &&
				game.BattlePositionWindowClick(position, buttons)) {
				cursorType = CursorType.Sword;
				return result(true);
			}

			const dragHandler = item => {
				this.draggedItem = item;
				this.draggedItem.Item.Position = position;
				this.draggedItem.SourcePlayer = this.IsInventory ? game.CurrentInventoryIndex : null;
				this.PostItemDrag();
			};

			if (buttons === MouseButtons.Left) {
				for (const itemGrid of itemGrids) {
					let clicked, itemAction;
					[clicked, itemAction, cursorType] = itemGrid.Click(position, this.draggedItem,
						buttons, cursorType, dragHandler, keyModifiers);
					if (clicked) {
						if (itemAction === ItemGrid.ItemAction.Drop)
							this.DropItem();

						return result(true);
					}
				}
			} else if (buttons === MouseButtons.Right) {
				if (this.draggedItem == null) {
					cursorType = CursorType.Sword;

					for (const itemGrid of itemGrids) {
						let clicked;
						[clicked, , cursorType] = itemGrid.Click(position, null, buttons, cursorType,
							dragHandler);
						if (clicked) {
							return result(true);
						}
					}
				}
			}
		} else if (buttons !== MouseButtons.Left) {
			return result(false);
		}

		for (let i = 0; i < GameCore.MaxPartyMembers; ++i) {
			const partyMember = game.GetPartyMember(i);

			if (partyMember == null)
				continue;

			if (Global.ExtendedPartyMemberPortraitAreas[i].Contains(position)) {
				if (this.draggedItem != null) {
					if (buttons === MouseButtons.Left && partyMember.Alive && ConditionExtensions.CanOpenInventory(partyMember.Conditions)) {
						if (this.draggedItem.SourcePlayer === i && this.draggedItem.Equipped !== true) {
							this.CancelDrag();
						} else {
							let droppedOnce = false;

							while (true) {
								if (!partyMember.CanTakeItems(this.itemManager, this.draggedItem.Item.Item) ||
									game.HasPartyMemberFled(partyMember)) {
									if (droppedOnce)
										break;
									else
										return result(false);
								}

								const remaining = game.DropItem(i, null, this.draggedItem.Item.Item);

								if (remaining === 0) {
									this.draggedItem.Item.Destroy();

									if (this.draggedItem.SourcePlayer == null && game.OpenStorage != null)
										game.ItemRemovedFromStorage();

									this.DropItem();
									break;
								} else
									this.draggedItem.Item.Update(false);

								droppedOnce = true;
							}
						}

						if (game.CurrentInventoryIndex === i) {
							itemGrids[0].Refresh();
						}
					} else if (buttons === MouseButtons.Right && ConditionExtensions.CanOpenInventory(partyMember.Conditions)) {
						// Only allow opening inventory with dragged item if we are
						// not inside a chest window.
						if (game.CurrentInventory != null) {
							if (i !== game.CurrentInventoryIndex) {
								if (game.HasPartyMemberFled(partyMember))
									return result(false);
								else
									game.OpenPartyMember(i, this.Type !== LayoutType.Stats);
							} else
								return result(false);
						} else { // In chest or place window right click aborts dragging instead
							this.CancelDrag();
						}
					}

					return result(true);
				} else if (this.draggedGold !== 0 && partyMember.Alive && ConditionExtensions.CanOpenInventory(partyMember.Conditions)) {
					if (buttons === MouseButtons.Left) {
						if (partyMember.MaxGoldToTake >= this.draggedGold && partyMember.Race !== Race.Animal) {
							partyMember.AddGold(this.draggedGold);
							this.draggedGoldOrFoodRemover?.(this.draggedGold);
							this.CancelDrag();
							game.CursorType = CursorType.Sword;
						} else
							cursorType = CursorType.Gold;
					} else if (buttons === MouseButtons.Right) {
						this.draggedGoldOrFoodRemover?.(0);
						this.CancelDrag();
						game.CursorType = CursorType.Sword;
					}

					return result(true);
				} else if (this.draggedFood !== 0 && partyMember.Alive && ConditionExtensions.CanOpenInventory(partyMember.Conditions)) {
					if (buttons === MouseButtons.Left) {
						if (partyMember.MaxFoodToTake >= this.draggedFood && partyMember.Race !== Race.Animal) {
							partyMember.AddFood(this.draggedFood);
							this.draggedGoldOrFoodRemover?.(this.draggedFood);
							this.CancelDrag();
							game.CursorType = CursorType.Sword;
						} else
							cursorType = CursorType.Food;
					} else if (buttons === MouseButtons.Right) {
						this.draggedGoldOrFoodRemover?.(0);
						this.CancelDrag();
						game.CursorType = CursorType.Sword;
					}

					return result(true);
				} else {
					if (buttons === MouseButtons.Left) {
						if (pickingTargetPlayer) {
							if (partyMember != null)
								game.FinishPickingTargetPlayer(i);
							return result(true);
						} else if (pickingTargetInventory) {
							if (partyMember != null) {
								const canAccessInventory = !game.HasPartyMemberFled(partyMember) && ConditionExtensions.CanOpenInventory(partyMember.Conditions);
								if (canAccessInventory)
									this.TargetInventoryPlayerSelected(i, partyMember);
							}
							return result(true);
						}

						game.SetActivePartyMember(i);
					} else if (buttons === MouseButtons.Right)
						game.OpenPartyMember(i, this.Type !== LayoutType.Stats);

					return result(true);
				}
			}
		}

		if (buttons === MouseButtons.Right && this.IsDragging) {
			this.CancelDrag();
			return result(true);
		}

		if (this.draggedGold !== 0)
			cursorType = CursorType.Gold;
		if (this.draggedFood !== 0)
			cursorType = CursorType.Food;

		return result(false);
	}

	TargetInventoryPlayerSelected(slot, partyMember) {
		const game = this.game;
		const itemGrids = this.itemGrids;

		const FinishPickingTargetItem = (itemGrid, slotIndex, itemSlot) => {
			if (itemSlot.ItemIndex === 0)
				return;

			itemGrids[0].DisableDrag = false;
			itemGrids[1].DisableDrag = false;
			itemGrids[0].ItemClicked.remove(FinishPickingTargetItem);
			itemGrids[1].ItemClicked.remove(FinishPickingTargetItem);
			game.FinishPickingTargetInventory(itemGrid, slotIndex, itemSlot);
		};

		if (game.FinishPickingTargetInventory(slot)) {
			if (ConditionExtensions.CanOpenInventory(partyMember.Conditions)) {
				game.OpenPartyMember(slot, true, () => {
					this.SetInventoryMessage(game.DataNameProvider.WhichItemAsTarget);
					game.TrapMouse(Global.InventoryAndEquipTrapArea);
					itemGrids[0].DisableDrag = true;
					itemGrids[1].DisableDrag = true;
					itemGrids[0].ItemClicked.add(FinishPickingTargetItem);
					itemGrids[1].ItemClicked.add(FinishPickingTargetItem);
				});
			}
		}
	}

	PostItemDrag() {
		const game = this.game;

		for (let i = 0; i < GameCore.MaxPartyMembers; ++i) {
			const partyMember = game.GetPartyMember(i);

			if (partyMember?.Alive === true) {
				this.UpdateCharacterStatus(i, partyMember.CanTakeItems(this.itemManager, this.draggedItem.Item.Item) &&
					!game.HasPartyMemberFled(partyMember) ? UIGraphic.StatusHandTake : UIGraphic.StatusHandStop);
			}
		}

		if (game.CurrentWindow.Window !== Window.Inventory && (game.OpenStorage instanceof Chest || game.OpenStorage instanceof Merchant)) {
			this.SetInventoryMessage(null);
			this.ShowChestMessage(game.DataNameProvider.WhereToMoveIt);
		} else if (!(game.OpenStorage instanceof GameCore.ConversationItems)) {
			this.SetInventoryMessage(game.DataNameProvider.WhereToMoveIt);
		}
	}

	/**
	 * void SaveListScrollDrag(Position position, ref CursorType cursorType) -> returns [cursorType]
	 */
	SaveListScrollDrag(position, cursorType) {
		if (this.PopupActive && this.activePopup.Drag(position))
			cursorType = CursorType.None;
		return [cursorType];
	}

	/**
	 * void Drag(Position position, ref CursorType cursorType) -> returns [cursorType]
	 */
	Drag(position, cursorType) {
		if (this.activePopup != null && this.activePopup.Drag(position)) {
			cursorType = CursorType.None;
			return [cursorType];
		}

		for (const itemGrid of this.itemGrids) {
			if (itemGrid.Drag(position)) {
				cursorType = CursorType.None;
				return [cursorType];
			}
		}

		return [cursorType];
	}

	DragItems(uiItem, takeAll, dragAction, dragger) {
		const DragItem = amount => {
			this.ClosePopup(false);

			if (amount > 0)
				dragAction?.(dragger?.(), amount);
		};

		if (takeAll || uiItem.Item.Amount === 1) {
			DragItem(uiItem.Item.Amount);
		} else {
			const item = this.itemManager.GetItem(uiItem.Item.ItemIndex);

			this.OpenAmountInputBox(this.game.DataNameProvider.TakeHowManyMessage, item.GraphicIndex, item.Name,
				uiItem.Item.Amount, DragItem);
		}
	}

	UpdateDraggedItemPosition(position) {
		if (this.draggedItem != null) {
			this.draggedItem.Item.Position = position;
		}
	}

	MouseMoved(diff) {
		if (this.freeScrolledText != null) {
			this.freeScrolledText?.MouseMove(diff.Y, this.game.CoreConfiguration.IsMobile);
		}
	}

	HoverButtonGrid(position) {
		if (this.game.CoreConfiguration.ShowButtonTooltips) {
			this.HideTooltip();
			this.buttonGrid?.Hover(position);
		}
	}

	/**
	 * bool Hover(Position position, ref CursorType cursorType) -> returns [result, cursorType]
	 */
	Hover(position, cursorType) {
		if (this.PopupActive) {
			this.activePopup.Hover(position);
			return [true, cursorType];
		}

		if (this.Type === LayoutType.BattlePositions) {
			this.game.BattlePositionWindowDrag(position);
			return [true, cursorType];
		}

		if (this.draggedItem != null) {
			this.draggedItem.Item.Position = position;
			cursorType = CursorType.SmallArrow;
		} else if (cursorType === CursorType.None || (cursorType >= CursorType.ArrowUp && cursorType <= CursorType.Wait)) {
			cursorType = CursorType.Sword;
		}

		let consumed = false;

		// Note: We must call Hover for all item grids
		// so that the hovered item text can also be
		// removed if not hovered!
		for (const itemGrid of this.itemGrids) {
			if (itemGrid.Hover(position))
				consumed = true;
		}

		if (!consumed) {
			if (!this.game.BattleRoundActive) {
				for (const tooltip of this.tooltips) {
					if (tooltip.Area.Contains(position)) {
						this.SetActiveTooltip(position, tooltip);
						consumed = true;
						break;
					}
				}
			}

			if (!consumed) {
				this.SetActiveTooltip(position, null);
				this.HoverButtonGrid(position);
			}
		}

		return [consumed, cursorType];
	}

	GetButtonAction(index) { return this.buttonGrid.GetButtonAction(index); }

	PressButton(index, currentTicks) {
		if (this.PopupActive)
			return null;

		return this.buttonGrid.PressButton(index, currentTicks);
	}

	ReleaseButton(index, immediately = false) {
		this.buttonGrid.ReleaseButton(index, immediately);
	}

	ReleaseButtons(immediately = false) {
		for (let i = 0; i < 9; ++i)
			this.ReleaseButton(i, immediately);
	}

	static GetPlayerSlotCenterPosition(column) {
		return new Position(40 + column * 40 + 20, Global.CombatBackgroundArea.Center.Y);
	}

	static GetPlayerSlotTargetPosition(column) {
		return new Position(40 + column * 40 + 20, Global.CombatBackgroundArea.Bottom);
	}

	// This is used for spells and effects. X is center of monster and Y is in the upper half.
	// Static version: Layout.GetMonsterCombatCenterPosition(IGameRenderView renderView, int position, Monster monster)
	static GetMonsterCombatCenterPosition(renderView, position, monster) {
		const column = position % 6;
		const row = Math.trunc(position / 6);
		const combatBackgroundArea = Global.CombatBackgroundArea;
		const centerX = Math.trunc(combatBackgroundArea.Width / 2);
		const sizeMultiplier = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(row);
		const slotWidth = Util.Round(40 * sizeMultiplier);
		const height = Util.Round(sizeMultiplier * monster.MappedFrameHeight);
		return new Position(centerX - (3 - column) * slotWidth + Math.trunc(slotWidth / 2), combatBackgroundArea.Y + BattleEffects.RowYOffsets[row] - Math.trunc(height / 2));
	}

	static GetMonsterCombatGroundPosition(renderView, position) {
		const column = position % 6;
		const row = Math.trunc(position / 6);
		const combatBackgroundArea = Global.CombatBackgroundArea;
		const centerX = Math.trunc(combatBackgroundArea.Width / 2);
		const sizeMultiplier = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(row);
		const slotWidth = Util.Round(40 * sizeMultiplier);
		return new Position(centerX - (3 - column) * slotWidth + Math.trunc(slotWidth / 2), combatBackgroundArea.Y + BattleEffects.RowYOffsets[row]);
	}

	// Static version: Layout.GetMonsterCombatTopPosition(IGameRenderView renderView, int position, Monster monster)
	static GetMonsterCombatTopPosition(renderView, position, monster) {
		const column = position % 6;
		const row = Math.trunc(position / 6);
		const combatBackgroundArea = Global.CombatBackgroundArea;
		const centerX = Math.trunc(combatBackgroundArea.Width / 2);
		const sizeMultiplier = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(row);
		const slotWidth = Util.Round(40 * sizeMultiplier);
		const height = Util.Round(sizeMultiplier * monster.MappedFrameHeight);
		return new Position(centerX - (3 - column) * slotWidth + Math.trunc(slotWidth / 2), combatBackgroundArea.Y + BattleEffects.RowYOffsets[row] - height);
	}

	/**
	 * Instance overloads: GetMonsterCombatCenterPosition(int position, Monster monster) or
	 * GetMonsterCombatCenterPosition(int column, int row, Monster monster)
	 */
	GetMonsterCombatCenterPosition(...args) {
		if (args.length === 3) {
			const [column, row, monster] = args;
			return this.GetMonsterCombatCenterPosition(column + row * 6, monster);
		}
		const [position, monster] = args;
		return Layout.GetMonsterCombatCenterPosition(this.RenderView, position, monster);
	}

	GetMonsterCombatTopPosition(position, monster) {
		return Layout.GetMonsterCombatTopPosition(this.RenderView, position, monster);
	}

	AddMonsterCombatSprite(column, row, monster, displayLayer,
		paletteIndex) {
		const sizeMultiplier = this.RenderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(row);
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.BattleMonsterRow);
		const sprite = this.RenderView.SpriteFactory.Create(monster.MappedFrameWidth, monster.MappedFrameHeight, true);
		sprite.TextureSize = new Size(monster.FrameWidth, monster.FrameHeight);
		sprite.TextureAtlasOffset = textureAtlas.GetOffset(monster.Index);
		sprite.DisplayLayer = displayLayer;
		sprite.PaletteIndex = paletteIndex;
		sprite.Layer = this.RenderView.GetLayer(Layer.BattleMonsterRow);
		const animation = new BattleAnimation(sprite);
		animation.Visible = true;
		animation.SetStartFrame(this.GetMonsterCombatCenterPosition(column, row, monster), sizeMultiplier);
		const monsterCombatGraphic = new MonsterCombatGraphic();
		monsterCombatGraphic.Monster = monster;
		monsterCombatGraphic.Row = row;
		monsterCombatGraphic.Column = column;
		monsterCombatGraphic.Animation = animation;
		const [battleFieldSprite, tooltip] = this.AddSpriteWithTooltip(new Rect
		(
			Global.BattleFieldX + column * Global.BattleFieldSlotWidth,
			Global.BattleFieldY + row * Global.BattleFieldSlotHeight - 1,
			Global.BattleFieldSlotWidth, Global.BattleFieldSlotHeight + 1
		), Graphics.BattleFieldIconOffset + Class.Monster + monster.CombatGraphicIndex - 1,
		this.game.PrimaryUIPaletteIndex, toByte(3 + row), monster.Name, TextColor.BattleMonster, Layer.UI);
		monsterCombatGraphic.BattleFieldSprite = battleFieldSprite;
		monsterCombatGraphic.Tooltip = tooltip;
		this.monsterCombatGraphics.push(monsterCombatGraphic);
		return animation;
	}

	RemoveMonsterCombatSprite(monster) {
		const monsterCombatGraphic = firstOrDefault(this.monsterCombatGraphics, g => g.Monster === monster);

		if (monsterCombatGraphic != null) {
			monsterCombatGraphic.Animation?.Destroy();
			monsterCombatGraphic.BattleFieldSprite?.Delete();
			this.RemoveTooltip(monsterCombatGraphic.Tooltip);
			removeItem(this.monsterCombatGraphics, monsterCombatGraphic);
		}
	}

	GetMonsterBattleAnimation(monster) { return firstOrDefault(this.monsterCombatGraphics, g => g.Monster === monster)?.Animation ?? null; }

	GetMonsterBattleFieldTooltip(monster) { return firstOrDefault(this.monsterCombatGraphics, g => g.Monster === monster)?.Tooltip ?? null; }

	ResetMonsterCombatSprite(monster) {
		const frame = monster.GetAnimationFrameIndices(MonsterAnimationType.Move)[0];
		firstOrDefault(this.monsterCombatGraphics, g => g.Monster === monster)?.Animation?.Reset(frame);
	}

	ResetMonsterCombatSprites() {
		this.monsterCombatGraphics.forEach(g => {
			if (g != null) {
				const frame = g.Monster.GetAnimationFrameIndices(MonsterAnimationType.Move)[0];
				g.Animation?.Reset(frame);
			}
		});
	}

	UpdateMonsterCombatSprite(monster, animationType, animationTicks, totalTicks) {
		const monsterCombatGraphic = firstOrDefault(this.monsterCombatGraphics, g => g.Monster === monster);

		if (monsterCombatGraphic != null) {
			const animation = monsterCombatGraphic.Animation;

			if (animationTicks === 0) // new animation
				animation.Play(monster.GetAnimationFrameIndices(animationType), Math.trunc(GameCore.TicksPerSecond / 6), totalTicks);

			animation.Update(totalTicks);

			return animation;
		}

		return null;
	}

	MoveMonsterTo(column, row, monster) {
		const monsterCombatGraphic = firstOrDefault(this.monsterCombatGraphics, g => g.Monster === monster);

		if (monsterCombatGraphic != null) {
			// slot: 16x13
			// graphic: 16x14 (1 pixel higher than the slot)
			// x starts at 96, y at 134
			monsterCombatGraphic.BattleFieldSprite.X = Global.BattleFieldX + column * Global.BattleFieldSlotWidth;
			monsterCombatGraphic.BattleFieldSprite.Y = Global.BattleFieldY + row * Global.BattleFieldSlotHeight - 1;
			monsterCombatGraphic.Tooltip.Area = new Rect(monsterCombatGraphic.BattleFieldSprite.X, monsterCombatGraphic.BattleFieldSprite.Y,
				monsterCombatGraphic.BattleFieldSprite.Width, monsterCombatGraphic.BattleFieldSprite.Height);
			monsterCombatGraphic.BattleFieldSprite.DisplayLayer = toByte(3 + row);
		}
	}

	/**
	 * Overload 1: SetBattleFieldSlotColor(int column, int row, BattleFieldSlotColor slotColor, uint? blinkStartTime = null)
	 * Overload 2: SetBattleFieldSlotColor(int index, BattleFieldSlotColor slotColor, uint? blinkStartTime = null)
	 *
	 * Dispatch: 4 arguments -> overload 1, 2 arguments -> overload 2. With 3 arguments overload 1 is used
	 * if the third argument is a BattleFieldSlotColor value and the first two arguments are a valid
	 * column (0..5) and row (0..4), otherwise overload 2 (third argument = blink start ticks).
	 */
	SetBattleFieldSlotColor(...args) {
		let index, slotColor, blinkStartTime;

		if (args.length === 4 || (args.length === 3 && isColumnRowSlotColorCall(args))) {
			// SetBattleFieldSlotColor(column + row * 6, slotColor, blinkStartTime)
			const [column, row] = args;
			index = column + row * 6;
			slotColor = args[2];
			blinkStartTime = args[3] ?? null;
		} else {
			[index, slotColor, blinkStartTime = null] = args;
		}

		if (slotColor === BattleFieldSlotColor.None) {
			if (this.battleFieldSlotMarkers.has(index)) {
				this.battleFieldSlotMarkers.get(index).Sprite?.Delete();
				this.battleFieldSlotMarkers.delete(index);
			}
		} else {
			const textureIndex = Graphics.UICustomGraphicOffset + UICustomGraphic.BattleFieldYellowBorder + slotColor % 3 - 1;

			if (!this.battleFieldSlotMarkers.has(index)) {
				const marker = new BattleFieldSlotMarker();
				marker.Sprite = this.AddSprite(Global.BattleFieldSlotArea(index), textureIndex, this.game.UIPaletteIndex, 2);
				marker.BlinkStartTicks = blinkStartTime;
				marker.ToggleColors = slotColor === BattleFieldSlotColor.Both;
				this.battleFieldSlotMarkers.set(index, marker);
			} else {
				const marker = this.battleFieldSlotMarkers.get(index);
				marker.Sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(textureIndex);
				marker.BlinkStartTicks = blinkStartTime;
				marker.ToggleColors = slotColor === BattleFieldSlotColor.Both;
			}
		}
	}

	ClearBattleFieldSlotColors() {
		for (const slotMarker of this.battleFieldSlotMarkers.values())
			slotMarker.Sprite?.Delete();

		this.battleFieldSlotMarkers.clear();
	}

	ClearBattleFieldSlotColorsExcept(exceptionSlotIndex) {
		for (const [Key, Value] of [...this.battleFieldSlotMarkers].filter(([key]) => key !== exceptionSlotIndex))
			Value.Sprite?.Delete();

		const exceptionSlot = this.battleFieldSlotMarkers == null ? null : getValue(this.battleFieldSlotMarkers, exceptionSlotIndex);

		this.battleFieldSlotMarkers?.clear();

		if (exceptionSlot != null)
			dictionaryAdd(this.battleFieldSlotMarkers, exceptionSlotIndex, exceptionSlot);
	}

	SetBattleMessage(message, textColor = TextColor.White) {
		if (message == null) {
			this.battleMessage?.Destroy();
			this.battleMessage = null;

			this.game.UpdateActiveBattleSpells();
		} else {
			const area = new Rect(5, 139, 84, 54);
			const glyphSize = new Size(Global.GlyphWidth, Global.GlyphLineHeight);
			let text = this.game.ProcessText(message);
			text = this.RenderView.TextProcessor.WrapText(text, area, glyphSize);

			if (this.battleMessage == null) {
				this.battleMessage = this.AddScrollableText(area, text, textColor);
			} else {
				this.battleMessage.SetText(text);
				this.battleMessage.SetTextColor(textColor);
			}

			this.game.HideActiveBattleSpells();
		}
	}

	CreateBattleEffectAnimations(amount = 1) {
		if (this.battleEffectAnimations.length !== 0) {
			this.battleEffectAnimations.forEach(a => a?.Destroy());
			this.battleEffectAnimations.length = 0;
		}

		for (let i = 0; i < amount; ++i) {
			const sprite = this.AddSprite(new Rect(0, 0, 16, 16), Graphics.CombatGraphicOffset, 17, 0, null, null, Layer.BattleEffects, false);
			this.battleEffectAnimations.push(new BattleAnimation(sprite));
		}

		return this.battleEffectAnimations;
	}

	// Field initializers which are declared further down in the C# class body.
	initLaterFields() {
		this.lastButtonMoveTicks = 0;
	}
}

/** Dispatch helper for the 3 argument call of Layout.SetBattleFieldSlotColor (see there). */
function isColumnRowSlotColorCall(args) {
	const [first, second, third] = args;
	if (third == null)
		return false;
	return Object.values(BattleFieldSlotColor).includes(third) &&
		first >= 0 && first < 6 && second >= 0 && second < 5;
}

export { DraggedItem as Layout_DraggedItem };
