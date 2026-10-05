// Port of Ambermoon.Core/UI/Button.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Button in the button grid or in popups

import { getValue, isNullOrEmpty, isNullOrWhiteSpace, toByte, toUInt } from '../../../runtime.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { GameLanguage } from '../../Ambermoon.Data.Common/IGameData.js';
import { ButtonType } from '../../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Layer } from '../Render/Layer.js';
import { Graphics } from '../Render/Graphics.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';
import { Global } from './Global.js';

const TooltipType = Object.freeze({
	Exit: 0,
	Quit: 1,
	Options: 2,
	Save: 3,
	Load: 4,
	New: 5,
	Eye: 6,
	Hand: 7,
	Mouth: 8,
	Transport: 9,
	Spells: 10,
	Camp: 11,
	Automap: 12,
	BattlePositions: 13,
	Wait: 14,
	Stats: 15,
	Inventory: 16,
	UseItem: 17,
	ExamineItem: 18,
	StoreItem: 19,
	StoreGold: 20,
	StoreFood: 21,
	DropItem: 22,
	DropGold: 23,
	DropFood: 24,
	GiveGold: 25,
	GiveFood: 26,
	DistributeGold: 27,
	DistributeFood: 28,
	Buy: 29,
	Sell: 30,
	Train: 31,
	HealPerson: 32,
	RemoveCurse: 33,
	HealCondition: 34,
	RestInn: 35,
	IdentifyEquipment: 36,
	IdentifyInventory: 37,
	Repair: 38,
	Recharge: 39,
	ReadScroll: 40,
	Sleep: 41,
	Lockpick: 42,
	FindTrap: 43,
	DisarmTrap: 44,
	SolveRiddle: 45,
	HearRiddle: 46,
	Say: 47,
	ShowItemToNPC: 48,
	GiveItemToNPC: 49,
	GiveGoldToNPC: 50,
	GiveFoodToNPC: 51,
	AskToJoin: 52,
	AskToLeave: 53,
	Flee: 54,
	StartBattleRound: 55,
	BattleMove: 56,
	BattleAdvance: 57,
	BattleAttack: 58,
	BattleDefend: 59,
	BattleCast: 60,
	IdentifyScroll: 61,
	BattleAuto: 62
});

// Created lazily on first use (uses imported enums).
let tooltips = null;

function createTooltips() {
	return new Map([
		[GameLanguage.German, [
			'Schließen',
			'Spiel beenden',
			'Optionen',
			'Speichern',
			'Laden',
			'Neues Spiel',
			'Untersuchen',
			'Berühren',
			'Sprechen',
			'Transport',
			'Zaubersprüche',
			'Lager',
			'Karte',
			'Kampfpositionen',
			'Warten',
			'Charakterinfo',
			'Inventar',
			'Gegenstand benutzen',
			'Gegenstand untersuchen',
			'Gegenstand in Truhe packen',
			'Gold in Truhe packen',
			'Rationen in Truhe packen',
			'Gegenstand wegwerfen',
			'Gold wegwerfen',
			'Rationen wegwerfen',
			'Gold überreichen',
			'Rationen überreichen',
			'Gold aufteilen',
			'Rationen aufteilen',
			'Kaufen',
			'Verkaufen',
			'Trainieren',
			'Person heilen',
			'Fluch entfernen',
			'Kondition heilen',
			'Übernachten',
			'Ausrüstung identifizieren',
			'Gegenstände identifizieren',
			'Gegenstand reparieren',
			'Gegenstand laden',
			'Spruchrolle lesen',
			'Schlafen',
			'Schloss knacken',
			'Falle finden',
			'Falle entschärfen',
			'Antwort eingeben',
			'Rätsel anhören',
			'Etwas sagen',
			'Gegenstand zeigen',
			'Gegenstand geben',
			'Gold geben',
			'Rationen geben',
			'In Gruppe einladen',
			'Aus Gruppe entlassen',
			'Flüchten',
			'Kampfrunde starten',
			'Bewegen',
			'Vorrücken',
			'Angreifen',
			'Verteidigen',
			'Zaubern',
			'Nötige Spruchlernpunkte ermitteln',
			'Automatischer Kampf',
		]],
		[GameLanguage.English, [
			'Close',
			'Quit game',
			'Options',
			'Save',
			'Load',
			'New game',
			'Examine',
			'Touch',
			'Speak',
			'Transport',
			'Spell book',
			'Camp',
			'Map',
			'Battle positions',
			'Wait',
			'Character stats',
			'Inventory',
			'Use item',
			'Examine item',
			'Store item in chest',
			'Store gold in chest',
			'Store food in chest',
			'Drop item',
			'Drop gold',
			'Drop food',
			'Hand over gold',
			'Hand over food',
			'Distribute gold',
			'Distribute food',
			'Buy',
			'Sell',
			'Train',
			'Heal person',
			'Remove curse',
			'Heal condition',
			'Stay for the night',
			'Identify equipment',
			'Identify items',
			'Repair item',
			'Recharge item',
			'Read spell scroll',
			'Sleep',
			'Lockpick',
			'Find trap',
			'Disarm trap',
			'Answer',
			'Rehear riddle',
			'Say something',
			'Show item',
			'Give item',
			'Give gold',
			'Give food',
			'Ask to join',
			'Ask to leave',
			'Flee',
			'Start round',
			'Move',
			'Advance',
			'Attack',
			'Defend',
			'Cast spell',
			'Determine required spell learning points',
			'Auto-Battle',
		]],
		[GameLanguage.French, [
			'Fermer',
			'Quitter le jeu',
			'Options',
			'Sauvegarder le jeu',
			'Charger le jeu',
			'Nouveau jeu',
			'Examiner',
			'Toucher',
			'Parler',
			'Transport',
			'Livre de sorts',
			'Camp',
			'Carte',
			'Positions de combat',
			'Attendre',
			'Statistiques des personnages',
			'Inventaire',
			'Utiliser un objet',
			'Examiner un objet',
			'Stocker un objet dans le coffre',
			'Stocker l\'or dans le coffre',
			'Stocker les aliments dans un coffre',
			'Jeter un objet',
			'Jeter l\'or',
			'Jeter les aliments',
			'Donner de l\'or',
			'Donner des aliments',
			'Distribuer l\'or',
			'Distribuer des aliments',
			'Acheter',
			'Vendre',
			'Former',
			'Guérir la personne',
			'Lever une malédiction',
			'Guérir l\'état de santé',
			'Rester pour la nuit',
			'Identifier l\'équipement',
			'Identifier les objets',
			'Réparer un objet',
			'Recharger un objet',
			'Lire le parchemin des sorts',
			'Sommeil',
			'Crocheter une serrure',
			'Trouver un piège',
			'Désarmer le piège',
			'Répondre',
			'Réécouter l\'énigme',
			'Parler',
			'Afficher l\'objet',
			'Donner l\'objet',
			'Donner de l\'or',
			'Donner des aliments',
			'Demander à rejoindre le groupe',
			'Demande de quitter le groupe',
			'Fuir',
			'Démarrer les actions',
			'Déplacer',
			'Advancer',
			'Attaquer',
			'Défendre',
			'Lancer un sort',
			'Déterminer les points d\'apprentissage des sorts',
			'Combat automatique',
		]],
		[GameLanguage.Polish, [
			'Zamknij',
			'Zakończ grę',
			'Opcje',
			'Zapisz',
			'Wczytaj',
			'Nowa gra',
			'Sprawdź',
			'Dotknij',
			'Rozmawiaj',
			'Transport',
			'Księga czarów',
			'Obóz',
			'Mapa',
			'Pozycja w walce',
			'Czekaj',
			'Statystyki postaci',
			'Ekwipunek',
			'Użyj przedmiot',
			'Sprawdź przedmiot',
			'Schowaj przedmiot w skrzyni',
			'Schowaj złoto w skrzyni',
			'Schowaj żywność w skrzyni',
			'Wyrzuć przedmiot',
			'Wyrzuć złoto',
			'Wyrzuć żywność',
			'Przekaż złoto',
			'Przekaż żywność',
			'Rozdziel złoto',
			'Rozdziel żywność',
			'Kup',
			'Sprzedaj',
			'Trenuj',
			'Ulecz osobę',
			'Usuń klątwę',
			'Ulecz stan',
			'Zostań na noc',
			'Zidentyfikuj sprzęt',
			'Zidentyfikuj przedmioty',
			'Napraw przedmiot',
			'Naładuj przedmiot',
			'Odczytaj zwój zaklęcia',
			'Śpij',
			'Otwórz zamek',
			'Znajdź pułapkę',
			'Rozbrój pułapkę',
			'Odpowiedz',
			'Powtórz zagadkę',
			'Powiedz coś',
			'Pokaż przedmiot',
			'Daj przedmiot',
			'Daj złoto',
			'Daj żywność',
			'Poproś o dołączenie',
			'Poproś o odejście',
			'Uciekaj',
			'Rozpocznij rundę',
			'Zmień pozycję',
			'Naprzód',
			'Atak',
			'Obrona',
			'Żuć zaklęcie',
			'Określ wymagane punkty nauki zaklęć',
			'Automatyczna walka',
		]],
		[GameLanguage.Czech, [
			'Zavřít',
			'Ukončit hru',
			'Nastavení',
			'Uložit',
			'Načíst',
			'Nová hra',
			'Zkoumat',
			'Dotknout',
			'Mluvit',
			'Přepravit',
			'Kniha kouzel',
			'Odpočinek',
			'Mapa',
			'Bojové pozice',
			'Čekat',
			'Statistiky postavy',
			'Inventář',
			'Použít předmět',
			'Zkoumat předmět',
			'Uložit předmět do truhly',
			'Uložit zlato do truhly',
			'Uložit jídlo do truhly',
			'Zahodit předmět',
			'Zahodit zlato',
			'Vyhodit jídlo',
			'Dát zlato',
			'Dát jídlo',
			'Rozděl zlato',
			'Rozděl jídlo',
			'Nákup',
			'Prodej',
			'Trénink',
			'Vyléčit osobu',
			'Odstranit kletbu',
			'Vyléčit stav',
			'Zůstat na noc',
			'Identifikovat výbavu',
			'Identifikovat předmět',
			'Opravit předmět',
			'Dobít předmět',
			'Přečíst svitek kouzla',
			'Spánek',
			'Odemknout',
			'Najít past',
			'Zneškodnit past',
			'Odpověď',
			'Zopakovat hádanku',
			'Řekni něco',
			'Ukaž předmět',
			'Dát předmět',
			'Dát zlato',
			'Dát jídlo',
			'Požádat o přijetí',
			'Požádat o odchod',
			'Utéct',
			'Začít kolo',
			'Pohyb',
			'Postup',
			'Útok',
			'Parírování',
			'Seslat kouzlo',
			'Určit body kouzel',
			'Automatický boj',
		]]
	]);
}

export class Button {
	static TooltipType = TooltipType;

	static get tooltips() {
		return tooltips ??= createTooltips();
	}

	static GetTooltip(gameLanguage, type) {
		return getValue(Button.tooltips, gameLanguage)[type];
	}

	static ButtonReleaseTime = 250;
	static Width = 32;
	static Height = 17;

	constructor(renderView, position, textureAtlasManager = null) {
		this.ToggleButton = false;
		this.buttonType = ButtonType.Empty;
		this.tooltipYOffset = 0;
		this.pressed = false;
		this.released = true;
		this.rightMouse = false;
		this.disabled = false;
		this.visible = true;
		this.pressedTime = 0; // DateTime.MinValue
		this.lastActionTimeInTicks = 0;
		this.continuousActionDelayInTicks = null;
		this.initialContinuousActionDelayInTicks = null;
		this.tooltip = null;
		this.tooltipText = null;
		this.TooltipColor = TextColor.White;
		this.TooltipOffset = null;
		this.LeftClickAction = null;
		this.RightClickAction = null;
		this.CursorChangeAction = null;
		/**
		 * If false the action is only triggered when the mouse
		 * button is released inside the button area after it
		 * was pressed in that area.
		 *
		 * If true the action is immediately triggered when clicked
		 * in the button area.
		 */
		this.InstantAction = false;
		/**
		 * Only used in conjunction with ContinuousActionDelayInTicks.
		 * If set to non-zero value each execution will reduce the delay by the given ticks
		 * down to 1 tick at max.
		 */
		this.ContinuousActionDelayReductionInTicks = 0;

		this.renderView = renderView;
		this.Area = new Rect(position, new Size(Button.Width, Button.Height));
		const paletteIndex = toByte(renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1);

		this.frameSprite = renderView.SpriteFactory.Create(Button.Width, Button.Height, true, 3);
		this.disableOverlay = renderView.SpriteFactory.Create(Button.Width, Button.Height - 6, true, 7);
		this.iconSprite = renderView.SpriteFactory.Create(Button.Width, Button.Height - 4, true, 5);

		const layer = renderView.GetLayer(Layer.UI);
		this.frameSprite.Layer = layer;
		this.disableOverlay.Layer = layer;
		this.iconSprite.Layer = layer;

		this.textureAtlas = (textureAtlasManager ?? TextureAtlasManager.Instance).GetOrCreate(Layer.UI);
		this.frameSprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.ButtonFrame));
		this.disableOverlay.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.ButtonDisabledOverlay));
		this.iconSprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetButtonGraphicIndex(ButtonType.Empty));

		this.frameSprite.PaletteIndex = paletteIndex;
		this.disableOverlay.PaletteIndex = paletteIndex;
		this.iconSprite.PaletteIndex = paletteIndex;

		this.frameSprite.X = position.X;
		this.frameSprite.Y = position.Y;
		this.disableOverlay.X = position.X;
		this.disableOverlay.Y = position.Y + 3;
		this.iconSprite.X = position.X;
		this.iconSprite.Y = position.Y + 2;

		this.frameSprite.Visible = true;
		this.disableOverlay.Visible = false;
		this.iconSprite.Visible = true;

		this.tooltipYOffset = Global.GlyphLineHeight - renderView.FontProvider.GetFont().GlyphHeight;
		const text = renderView.TextProcessor.CreateText('');
		this.tooltip = renderView.RenderTextFactory.Create(toByte(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1),
			renderView.GetLayer(Layer.Text), text, TextColor.White, true);
		this.tooltip.DisplayLayer = 254;
		this.tooltip.Visible = false;
	}

	get Tooltip() {
		return this.tooltipText;
	}

	set Tooltip(value) {
		this.tooltipText = value;

		if (isNullOrWhiteSpace(this.tooltipText) && this.tooltip != null)
			this.tooltip.Visible = false;
	}

	SetTooltip(text) {
		if (this.tooltip == null)
			return;

		const visible = !isNullOrWhiteSpace(text);

		if (visible) {
			const offset = this.TooltipOffset ?? new Position(0, 0);
			this.tooltip.Text = this.renderView.TextProcessor.CreateText(text);
			this.tooltip.TextColor = this.TooltipColor;
			const width = this.tooltip.Text.MaxLineSize * Global.GlyphWidth;
			this.tooltip.X = Math.min(Global.VirtualScreenWidth - width, offset.X + this.Area.Center.X - Math.trunc(width / 2));
			this.tooltip.Y = offset.Y + this.Area.Top - this.tooltip.Text.LineCount * Global.GlyphLineHeight + 1 + this.tooltipYOffset;
		}

		this.tooltip.Visible = visible;
	}

	HideTooltip() {
		this.SetTooltip(null);
	}

	get DisplayLayer() {
		return toByte(this.frameSprite.DisplayLayer - 3);
	}

	set DisplayLayer(value) {
		this.frameSprite.DisplayLayer = toByte(Math.min(251, value + 3));
		this.iconSprite.DisplayLayer = toByte(this.frameSprite.DisplayLayer + 2);
		this.disableOverlay.DisplayLayer = toByte(this.frameSprite.DisplayLayer + 4);
	}

	Destroy() {
		this.frameSprite?.Delete();
		this.disableOverlay?.Delete();
		this.iconSprite?.Delete();
		this.tooltip?.Delete();
	}

	get ButtonType() {
		return this.buttonType;
	}

	set ButtonType(value) {
		if (this.buttonType === value)
			return;

		this.buttonType = value;
		this.Pressed = false;
		this.released = true;

		this.iconSprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetButtonGraphicIndex(this.buttonType));
	}

	/**
	 * Delay between continuous actions while buttons stays
	 * pressed.
	 *
	 * null means no continuation.
	 */
	get ContinuousActionDelayInTicks() {
		return this.initialContinuousActionDelayInTicks;
	}

	set ContinuousActionDelayInTicks(value) {
		this.initialContinuousActionDelayInTicks = value;
		this.continuousActionDelayInTicks = value;
	}

	get Pressed() {
		return this.pressed;
	}

	set Pressed(value) {
		if (this.pressed === value)
			return;

		if (value)
			this.released = false;

		this.pressed = value;
		this.frameSprite.TextureAtlasOffset =
			this.textureAtlas.GetOffset(Graphics.GetUIGraphicIndex(this.pressed ? UIGraphic.ButtonFramePressed : UIGraphic.ButtonFrame));
		this.iconSprite.Y = this.frameSprite.Y + (this.pressed ? 4 : 2);

		if (!this.pressed)
			this.continuousActionDelayInTicks = this.initialContinuousActionDelayInTicks;
	}

	get Disabled() {
		return this.disabled || this.buttonType === ButtonType.Empty || !this.Visible;
	}

	set Disabled(value) {
		this.disabled = value;
		this.disableOverlay.Visible = this.Visible && this.disabled;
	}

	get Visible() {
		return this.visible;
	}

	set Visible(value) {
		if (this.visible === value)
			return;

		this.visible = value;

		this.frameSprite.Visible = this.visible;
		this.iconSprite.Visible = this.visible;
		this.disableOverlay.Visible = this.visible && this.disabled;
	}

	get PaletteIndex() {
		return this.frameSprite.PaletteIndex;
	}

	set PaletteIndex(value) {
		this.frameSprite.PaletteIndex = value;
		this.disableOverlay.PaletteIndex = value;
		this.iconSprite.PaletteIndex = value;
	}

	/**
	 * Overloads:
	 * - LeftMouseUp(position, currentTicks): void
	 * - LeftMouseUp(position, ref cursorType, currentTicks): returns [cursorType]
	 */
	LeftMouseUp(position, cursorTypeOrTicks, currentTicks) {
		if (arguments.length < 3) {
			if (this.ToggleButton)
				return;

			this.LeftMouseUp(position, null, cursorTypeOrTicks);
			return;
		}

		let cursorType = cursorTypeOrTicks;

		if (this.Disabled || this.rightMouse || this.ToggleButton)
			return [cursorType];

		if (this.Pressed && !this.InstantAction && this.Area.Contains(position)) {
			cursorType = this.ExecuteActions(currentTicks, false);
		}

		this.released = true;
		this.Pressed = false;

		return [cursorType];
	}

	RightMouseUp(position, currentTicks) {
		if (this.Disabled || !this.rightMouse || this.ToggleButton)
			return;

		if (this.Pressed && !this.InstantAction && this.Area.Contains(position)) {
			this.ExecuteActions(currentTicks, true);
		}

		this.rightMouse = false;
		this.released = true;
		this.Pressed = false;
	}

	/**
	 * Overloads:
	 * - LeftMouseDown(position, currentTicks): bool
	 * - LeftMouseDown(position, ref cursorType, currentTicks): returns [bool, cursorType]
	 */
	LeftMouseDown(position, cursorTypeOrTicks, currentTicks) {
		if (arguments.length < 3) {
			const [result] = this.LeftMouseDown(position, null, cursorTypeOrTicks);
			return result;
		}

		let cursorType = cursorTypeOrTicks;

		if (this.Disabled)
			return [false, cursorType];

		if (this.Area.Contains(position)) {
			this.pressedTime = Date.now();
			this.rightMouse = false;

			if (this.ToggleButton) {
				this.Pressed = !this.Pressed;
				cursorType = this.ExecuteActions(currentTicks, false);
				return [true, cursorType];
			}

			this.Pressed = true;

			if (this.InstantAction) {
				if (this.continuousActionDelayInTicks == null)
					this.released = true;
				cursorType = this.ExecuteActions(currentTicks, false);
			}

			return [true, cursorType];
		}

		return [false, cursorType];
	}

	RightMouseDown(position, currentTicks) {
		if (this.Disabled || this.ToggleButton)
			return false;

		if (this.Area.Contains(position)) {
			this.pressedTime = Date.now();
			this.Pressed = true;
			this.rightMouse = true;

			if (this.InstantAction) {
				if (this.continuousActionDelayInTicks == null)
					this.released = true;
				this.ExecuteActions(currentTicks, true);
			}

			return true;
		}

		return false;
	}

	Hover(position) {
		if (!isNullOrEmpty(this.tooltipText) && this.Area.Contains(position))
			this.SetTooltip(this.tooltipText);
		else
			this.HideTooltip();
	}

	ExecuteActions(currentTicks, rightMouse) {
		this.lastActionTimeInTicks = currentTicks;
		const cursorChangeAction = this.CursorChangeAction; // The action invoke might change this by swapping buttons!
		if (rightMouse)
			this.RightClickAction?.();
		else
			this.LeftClickAction?.();

		if (this.continuousActionDelayInTicks != null && this.continuousActionDelayInTicks > 1)
			this.continuousActionDelayInTicks = toUInt(Math.max(1, this.continuousActionDelayInTicks - this.ContinuousActionDelayReductionInTicks));

		return cursorChangeAction?.() ?? null;
	}

	PressImmediately(game, rightMouse = false, delayedPressAnimation = false) {
		if (!this.Disabled) {
			const Press = (action) => {
				const PressAction = () => {
					this.released = true;
					action?.();
				};

				if (delayedPressAnimation) {
					this.Pressed = true;
					game.AddTimedEvent(250, PressAction);
				} else {
					PressAction();
				}
			};

			if (rightMouse) {
				if (this.RightClickAction != null)
					Press(this.RightClickAction);
			} else {
				if (this.LeftClickAction != null)
					Press(this.LeftClickAction);
			}
		}
	}

	Press(currentTicks) {
		if (this.Disabled)
			return null;

		this.pressedTime = Date.now();
		this.Pressed = true;
		this.rightMouse = false;

		if (this.InstantAction) {
			if (this.continuousActionDelayInTicks == null)
				this.released = true;
		} else
			this.released = true;

		return this.ExecuteActions(currentTicks, false);
	}

	Release(immediately = false) {
		if (immediately)
			this.Pressed = false;

		this.released = true;
	}

	Update(currentTicks) {
		if (this.ToggleButton)
			return;

		if (this.Pressed && this.released && (Date.now() - this.pressedTime) >= Button.ButtonReleaseTime)
			this.Pressed = false;

		if (this.Pressed && this.continuousActionDelayInTicks != null) {
			if (toUInt(currentTicks - this.lastActionTimeInTicks) >= this.continuousActionDelayInTicks)
				this.ExecuteActions(currentTicks, this.rightMouse);
		}
	}
}

export { TooltipType as Button_TooltipType };
