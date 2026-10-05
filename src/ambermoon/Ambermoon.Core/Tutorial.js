// Port of Ambermoon.Core/Tutorial.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { newArray, tryGetValue, getValue } from '../runtime.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { GameLanguage } from '../Ambermoon.Data.Common/IGameData.js';
import { PopupTextEvent } from '../Ambermoon.Data.Common/Event.js';
import { Color } from './Render/Color.js';
import { Layer } from './Render/Layer.js';
import { TextAlign } from './Render/TextAlign.js';
import { Button } from './UI/Button.js';
import { Global } from './UI/Global.js';
import { GameCore } from './GameCore.js';

const MobileButtonAreaX = 202;
const MobileButtonAreaY = 37 + 92;
const MobileButtonAreaWidth = 108;
const MobileButtonAreaHeight = 71;
const MobileButtonAreaFactorX = MobileButtonAreaWidth / 1526.0;
const MobileButtonAreaFactorY = MobileButtonAreaHeight / 994.0;

// Note: The text dictionaries are created lazily (on first use) to avoid using other modules at module evaluation time.
let textDictionaries = null;

function getTextDictionaries() {
	if (textDictionaries != null)
		return textDictionaries;

	const introductionTooltips = new Map([
		[GameLanguage.German, "Tutorial"],
		[GameLanguage.English, "Tutorial"],
		[GameLanguage.French, "Tutoriel"],
		[GameLanguage.Polish, "Tutoriál"],
		[GameLanguage.Czech, "Poradnik"],
	]);
	const introduction = new Map([
		[GameLanguage.German, "Hi ~SELF~ und willkommen zum Ambermoon Remake.^^Möchtest du eine kleine Einführung?"],
		[GameLanguage.English, "Hi ~SELF~ and welcome to the Ambermoon Remake.^^Do you need a little introduction?"],
		[GameLanguage.French, "Bonjour ~SELF~ et bienvenue sur Ambermoon Remake.^^Avez-vous besoin d'une petite introduction ?"],
		[GameLanguage.Polish, "Cześć ~SELF~, witaj w Ambermoon Remake.^^Potrzebujesz małego wprowadzenia?"],
		[GameLanguage.Czech, "Ahoj ~SELF~ a vítej v remaku původního Ambermoon.^^Potřebuješ hru trochu představit?"],
	]);
	const tips = new Map([
		[GameLanguage.German, [
			// Tip 1
			"Die Schaltflächen am unteren rechten Bildschirmrand enthalten sehr viele Funktionen " +
			"des Spiels. Wenn du dich auf dem Hauptbildschirm befindest, kannst du eine zweite " +
			"Belegung der Schaltflächen nutzen indem du auf den Bereich rechtsklickst oder die " +
			"Enter-Taste benutzt.",
			// Tip 2
			"Du kannst auch das NumPad auf der Tastatur nutzen um die Schaltflächen auszulösen." +
			"Die Anordnung der Tasten entspricht den Schaltflächen im Spiel. Mit der Taste 7 auf " +
			"dem NumPad würde so die Schaltfläche links oben (das Auge) ausgelöst.",
			// Tip 3
			"Im oberen Bereich siehst du die Spielerportraits. Du kannst die Portraits anklicken um " +
			"den aktiven Spieler auszuwählen. Per Rechtsklick gelangst du ins Inventar. " +
			"Die Tasten 1-6 selektieren ebenfalls den Charakter, und F1-F6 öffnen das jeweilige Inventar.",
			// Tip 4
			"Du kannst dich mit der Maus, den Tasten W, A, S, D oder auch den Pfeiltasten auf der Map "+
			"bewegen. In 2D kannst du per Rechtsklick auf die Map den Cursor umschalten und aus ihm " +
			"einen Aktionscursor machen, mit dem du Dinge untersuchen oder berühren oder aber mit " +
			"NPCs sprechen kannst.",
			// End
			"Ich bin nun still und wünsche dir viel Spaß beim Spielen von Ambermoon!"
		]],
		[GameLanguage.English, [
			// Tip 1
			"The buttons in the lower right area of the screen provide many useful functions of " +
			"the game. If you are on the main screen you can toggle the buttons by pressing the " +
			"right mouse button while hovering the area or hitting the Return key. It will unlock " +
			"additional functions.",
			// Tip 2
			"You can also use the NumPad on your keyboard to control those buttons. The layout " +
			"is exactly as the in-game buttons. So hitting the key 7 will be equivalent to pressing " +
			"the upper left button (the eye).",
			// Tip 3
			"In the upper area you see the character portraits. You can click on them to select the " +
			"active player or right click them to open the inventories. The keyboard keys 1-6 will select " +
			"a player as well and keys F1-F6 will open the inventories.",
			// Tip 4
			"You can move on maps by using the mouse, keys W, A, S, D or the cursor keys. In 2D you can " +
			"right click on the map to change the cursor into an action cursor to interact with objects " +
			"or characters like NPCs.",
			// End
			"Now I'm quiet. Have fun playing Ambermoon!"
		]],
		[GameLanguage.French, [
			// Tip 1
			"Les boutons situés dans la partie inférieure droite de l'écran permettent d'accéder à " +
			"de nombreuses fonctions utiles du jeu. Si vous êtes sur l'écran principal, vous pouvez " +
			"faire basculer les boutons en appuyant sur le bouton droit de la souris tout en survolant " +
			"la zone ou en appuyant sur la touche Retour. Cela révèle des fonctions supplémentaires.",
			// Tip 2
			"Vous pouvez également utiliser le pavé numérique de votre clavier pour contrôler ces boutons." +
			"La disposition est exactement la même que celle des boutons du jeu. Ainsi, appuyer sur la " +
			"touche 7 équivaudra à appuyer sur le bouton supérieur gauche (l'œil).",
			// Tip 3
			"Dans la partie supérieure, vous voyez les portraits des personnages. Vous pouvez cliquer sur " +
			"eux pour sélectionner le joueur actif ou faire un clic droit pour ouvrir les inventaires." +
			"Les touches 1 à 6 du clavier permettent de sélectionner un joueur et les touches F1 à F6 " +
			"ouvrent les inventaires.",
			// Tip 4
			"Vous pouvez vous déplacer sur les cartes à l'aide de la souris, des touches W, A, S, D ou " +
			"des touches du curseur. En 2D, vous pouvez faire un clic droit sur la carte pour transformer " +
			"le curseur en curseur d'action afin d'interagir avec des objets ou des personnages comme les PNJ.",
			// End
			"Maintenant, je suis silencieux. Amusez-vous bien avec Ambermoon !"
		]],
		[GameLanguage.Polish, [
			// Tip 1
			"Przyciski w prawym dolnym rogu ekranu zapewniają wiele przydatnych funkcji " +
			"w grze. Na głównym ekranie można je przełączać , naciskając prawy " +
			"przycisk myszki nad ich obszarem lub wciskając klawisz Return. To pokaże " +
			"dodatkowe funkcje.",
			// Tip 2
			"Do obsługi tych przycisków możesz też użyć klawiatury numerycznej. Układ " +
			"jest dokładnie taki sam jak przycisków w grze. Tak więc klawisz 7 odpowiada " +
			"górnemu lewemu przyciskowi (oko).",
			// Tip 3
			"W górnej części znajdują się portrety postaci. Kliknięcie w jeden z nich wybiera " +
			"aktywną postać a prawy klik otwiera ekwipunek. Z klawiatury, klawisze 1-6 wybierają " +
			"aktywną postać a F1-F6 otworzą ekwipunek.",
			// Tip 4
			"Po mapie możesz się poruszać używając myszy, klawiszy W, A, S, D lub strzałek." +
			"W widoku 2D prawy klik na mapie zmienia kursor w ikonę interakcji z obiektami " +
			"lub postaciami takimi jak NPC.",
			// End
			"Teraz zamilknę. baw się dobrze grając w Ambermoon!"
		]],
		[GameLanguage.Czech, [
			// Tip 1
			"Ikony v pravé dolní části obrazovky poskytují mnoho užitečných funkcí ve hře. " +
			"Pokud jsi na hlavní obrazovce, můžeš přepínat zobrazení ikon stiskem " +
			"pravého tlačítka myši po najetí na oblast, nebo stiskem klávesy Enter. Tím se odemknou " +
			"další funkce.",
			// Tip 2
			"Ikony lze ovládat také pomocí numerické klávesnice. Rozložení " +
			"je přesně takové, jaké jsou plochy ikon ve hře. Takže stisknutí klávesy 7 bude ekvivalent stisknutí " +
			"levého horního tlačítka (oka).",
			// Tip 3
			"V horní části se zobrazují portréty postav. Kliknutím na ně, můžeš vybrat " +
			"aktivního hrdinu a pomocí pravého tlačítka otevřeš inventář. Klávesy 1-6 vyberou " +
			"postavu a klávesy F1-F6 otevírají inventář.",
			// Tip 4
			"Na mapě se můžeš pohybovat pomocí myši, kláves W, A, S, D nebo kurzorových kláves. Ve 2D můžeš " +
			"kliknutím pravým tlačítkem myši na mapě, změnit kurzor na akční kurzor pro interakci s objekty, " +
			"nebo postavami, jako jsou NPC.",
			// End
			"Teď už budu zticha. Bav se při hraní Ambermoonu!"
		]],
	]);
	const mobileTips = new Map([
		[GameLanguage.German, [
			// Tip 1
			"Die Schaltflächen am unteren rechten Bildschirmrand enthalten sehr viele Funktionen " +
			"des Spiels. Wenn du dich auf dem Hauptbildschirm befindest, kannst du weitere " +
			"Schaltflächen einblenden, indem du die Schaltfläche in der unteren rechten Ecke " +
			"antippst. Es gibt 3 Schaltflächen-Seiten, die du so durchschalten kannst.",
			// Tip 2
			"Mit dem Steuerkreuz kannst du dich bewegen. Ein kurzes Antippen der Pfeile bewegt " +
			"den Charakter einen Schritt in die gewünschte Richtung. Wenn du den Finger auf der " +
			"Mitte des Steuerkreuzes gedrückt hälst und ihn dann bewegst, kannst du kontinuierlich " +
			"in jede Richtung laufen.",
			// Tip 3
			"Wenn du eine Aktion wie das Auge wählst, siehst du über deinem Charakter " +
			"ein Symbol. Wenn du dann auf der Karte ein Objekt antippst, wird der aktive " +
			"Charakter mit diesem Objekt interagieren. Diese Aktionen haben aber eine " +
			"begrenzte Reichweite!",
			// Tip 4
			"Du kannst auf der Karte deinen Finger gedrückt halten. Dies ermöglicht eine direkte " +
			"Interaktion mit Objekten. Auch das hat natürlich eine begrenzte Reichweite, also solltest " +
			"du nah am Zielobjekt stehen. In 3D-Bereichen ist dies ebenfalls mit Objekten vor dir möglich.",
			// Tip 5
			"Im oberen Bereich siehst du die Spielerportraits. Du kannst die Portraits antippen um " +
			"den aktiven Spieler auszuwählen. Wenn du den Finger gedrückt hälst gelangst du ins Inventar.",
			// Tip 6
			"Wenn du diese Einführung nochmals sehen möchtest, kannst du ein neues Spiel starten und " +
			"dort den Schalter für das Tutorial aktivieren.",
			// End
			"Ich bin nun still und wünsche dir viel Spaß beim Spielen von Ambermoon!"
		]],
		[GameLanguage.English, [
			// Tip 1
			"The buttons at the bottom right of the screen contain many of the game's functions. " +
			"When you are on the main screen, you can show additional buttons by tapping the button in " +
			"the lower right corner. There are 3 button pages that you can cycle through.",
			// Tip 2
			"You can move using the D-pad. A short tap on an arrow moves the character one step in the " +
			"chosen direction. If you hold your finger on the center of the D-pad and then move it, you " +
			"can walk continuously in any direction.",
			// Tip 3
			"When you choose an action such as the eye, you will see an icon above your character. When " +
			"you then tap an object on the map, the active character will interact with it. However, " +
			"these actions have a limited range!",
			// Tip 4
			"You can keep your finger pressed on the map. This enables direct interaction with objects. " +
			"This also has a limited range, so you should stand close to the target object. In 3D areas, " +
			"this is also possible with objects in front of you.",
			// Tip 5
			"At the top you can see the player portraits. You can tap a portrait to select the active " +
			"player. If you hold your finger on a portrait, you will enter the inventory.",
			// Tip 6
			"If you want to see this introduction again, you can start a new game and enable the " +
			"tutorial switch there.",
			// End
			"Now I'm quiet. Have fun playing Ambermoon!"
		]],
		[GameLanguage.French, [
			// Tip 1
			"Les boutons en bas à droite de l'écran regroupent de nombreuses fonctions du jeu. " +
			"Depuis l'écran principal, tu peux afficher d'autres boutons en appuyant sur celui " +
			"situé dans le coin inférieur droit. Il existe 3 pages de boutons que tu peux faire défiler.",
			// Tip 2
			"Tu peux te déplacer avec la croix directionnelle. Un court appui sur une flèche déplace " +
			"le personnage d'un pas dans la direction choisie. Si tu maintiens ton doigt au centre de " +
			"la croix puis que tu le bouges, tu peux marcher continuellement dans n'importe quelle direction.",
			// Tip 3
			"Lorsque tu choisis une action comme l'œil, une icône apparaît au-dessus de ton personnage. " +
			"En touchant ensuite un objet sur la carte, ton personnage actif interagira avec lui. Toutefois, " +
			"ces actions ont une portée limitée !",
			// Tip 4
			"Tu peux garder ton doigt appuyé sur la carte. Cela permet d'interagir directement avec les objets. " +
			"Là aussi, la portée est limitée, donc tu dois être suffisamment proche de l'objet visé. Dans les " +
			"zones 3D, cela fonctionne également avec les objets devant toi.",
			// Tip 5
			"En haut, tu vois les portraits des personnages. Tu peux toucher un portrait pour sélectionner le " +
			"personnage actif. Si tu maintiens ton doigt dessus, tu accèdes à l'inventaire.",
			// Tip 6
			"Si tu veux revoir cette introduction, tu peux démarrer une nouvelle partie et activer l'option du tutoriel.",
			// End
			"Maintenant, je suis silencieux. Amusez-vous bien avec Ambermoon !"
		]],
		[GameLanguage.Polish, [
			// Tip 1
			"Przyciski w prawym dolnym rogu ekranu zawierają wiele funkcji gry. Na ekranie głównym możesz wyświetlić " +
			"dodatkowe przyciski, dotykając przycisku w prawym dolnym rogu. Są 3 strony przycisków, między którymi " +
			"możesz przełączać.",
			// Tip 2
			"Możesz poruszać się za pomocą krzyżaka. Krótkie stuknięcie strzałki przesuwa postać o jeden krok w " +
			"wybranym kierunku. Jeśli przytrzymasz palec na środku krzyżaka i poruszysz nim, możesz chodzić " +
			"nieprzerwanie w dowolnym kierunku.",
			// Tip 3
			"Gdy wybierzesz akcję, np. oko, nad twoją postacią pojawi się ikona. Jeśli następnie stukniesz obiekt " +
			"na mapie, aktywna postać wejdzie z nim w interakcję. Te akcje mają jednak ograniczony zasięg!",
			// Tip 4
			"Możesz przytrzymać palec na mapie. Umożliwia to bezpośrednią interakcję z obiektami. To również ma " +
			"ograniczony zasięg, więc powinieneś stać blisko celu. W obszarach 3D jest to również możliwe z " +
			"obiektami znajdującymi się przed tobą.",
			// Tip 5
			"Na górze widać portrety graczy. Możesz stuknąć portret, aby wybrać aktywnego gracza. Jeśli " +
			"przytrzymasz palec na portrecie, wejdziesz do ekwipunku.",
			// Tip 6
			"Jeśli chcesz ponownie obejrzeć to wprowadzenie, możesz rozpocząć nową grę i tam włączyć samouczek.",
			// End
			"Teraz zamilknę. baw się dobrze grając w Ambermoon!"
		]],
		[GameLanguage.Czech, [
			// Tip 1
			"Tlačítka v pravém dolním rohu obrazovky obsahují mnoho funkcí hry. Na hlavní obrazovce můžeš zobrazit " +
			"další tlačítka klepnutím na tlačítko v pravém dolním rohu. Jsou zde 3 stránky tlačítek, mezi kterými " +
			"můžeš přepínat.",
			// Tip 2
			"Můžeš se pohybovat pomocí směrového kříže. Krátké klepnutí na šipku posune postavu o jeden krok " +
			"požadovaným směrem. Pokud podržíš prst uprostřed kříže a pohneš jím, můžeš nepřetržitě chodit " +
			"jakýmkoli směrem.",
			// Tip 3
			"Když vybereš akci, například oko, objeví se nad tvojí postavou symbol. Když pak klepneš na objekt " +
			"na mapě, aktivní postava s ním bude interagovat. Tyto akce však mají omezený dosah!",
			// Tip 4
			"Můžeš držet prst na mapě. To umožňuje přímou interakci s objekty. I zde je dosah omezený, takže " +
			"bys měl stát blízko cílového objektu. V 3D oblastech to funguje také s objekty před tebou.",
			// Tip 5
			"Nahoře vidíš portréty hráčů. Klepnutím na portrét vybereš aktivního hráče. Pokud na portrétu " +
			"podržíš prst, otevře se inventář.",
			// Tip 6
			"Pokud chceš toto úvodní vysvětlení vidět znovu, můžeš spustit novou hru a tam zapnout přepínač tutoriálu.",
			// End
			"Teď už budu zticha. Bav se při hraní Ambermoonu!"
		]],
	]);

	textDictionaries = { introductionTooltips, introduction, tips, mobileTips };
	return textDictionaries;
}

export class Tutorial {
	constructor(game, drawTouchFingerRequest) {
		this.mobileButtonAreaIconWidth = Util.Round(MobileButtonAreaFactorX * 270);
		this.mobileButtonAreaIconHeight = Util.Round(MobileButtonAreaFactorY * 276);
		this.mobileButtonAreaArrowIconX = MobileButtonAreaX + Util.Round(MobileButtonAreaFactorX * 1116.0);
		this.mobileButtonAreaArrowIconY = MobileButtonAreaY + Util.Round(MobileButtonAreaFactorY * 528.0);
		this.mobileButtonAreaEyeIconX = MobileButtonAreaX + Util.Round(MobileButtonAreaFactorX * 136.0);
		this.mobileButtonAreaEyeIconY = MobileButtonAreaY + Util.Round(MobileButtonAreaFactorY * 186.0);
		this.markers = newArray(4);

		const { introduction, tips, mobileTips } = getTextDictionaries();

		this.game = game;
		this.drawTouchFingerRequest = drawTouchFingerRequest;
		const textSource = game.CoreConfiguration.IsMobile ? mobileTips : tips;
		const [hasLanguageTexts, languageTexts] = tryGetValue(textSource, game.GameLanguage);
		this.texts = hasLanguageTexts
			? languageTexts : getValue(textSource, GameLanguage.English);
		const [hasText, text] = tryGetValue(introduction, game.GameLanguage);
		this.introductionText = hasText
			? text : getValue(introduction, GameLanguage.English);
	}

	get MobileButtonAreaArrowIconArea() { return new Rect(this.mobileButtonAreaArrowIconX, this.mobileButtonAreaArrowIconY, this.mobileButtonAreaIconWidth, this.mobileButtonAreaIconHeight); }
	get MobileButtonAreaEyeIconArea() { return new Rect(this.mobileButtonAreaEyeIconX, this.mobileButtonAreaEyeIconY, this.mobileButtonAreaIconWidth, this.mobileButtonAreaIconHeight); }

	GetText(index) { return index === 0 ? this.introductionText : this.texts[index - 1]; }

	static GetIntroductionTooltip(language) {
		const { introductionTooltips } = getTextDictionaries();
		const [found, tooltip] = tryGetValue(introductionTooltips, language);
		return found ? tooltip : getValue(introductionTooltips, GameLanguage.English);
	}

	Run(renderView) {
		this.game.StartSequence();
		this.game.ShowDecisionPopup(this.GetText(0), response => {
			if (response === PopupTextEvent.Response.Yes) {
				this.ShowTips(renderView);
			} else {
				this.game.EndSequence();
			}
		}, 4, 0, TextAlign.Center, false);
	}

	ShowMarker(renderView, area) {
		const red = new Color(255, 0, 0);
		const markers = this.markers;
		markers[0] = renderView.ColoredRectFactory.Create(area.Width, 1, red, 15);
		markers[1] = renderView.ColoredRectFactory.Create(1, area.Height - 2, red, 15);
		markers[2] = renderView.ColoredRectFactory.Create(1, area.Height - 2, red, 15);
		markers[3] = renderView.ColoredRectFactory.Create(area.Width, 1, red, 15);

		markers[0].X = area.Left;
		markers[0].Y = area.Top;
		markers[1].X = area.Left;
		markers[1].Y = area.Top + 1;
		markers[2].X = area.Right - 1;
		markers[2].Y = area.Top + 1;
		markers[3].X = area.Left;
		markers[3].Y = area.Bottom - 1;

		const layer = renderView.GetLayer(Layer.UI);

		for (const marker of markers) {
			marker.Layer = layer;
			marker.Visible = true;
		}
	}

	HideMarker() {
		for (const marker of this.markers)
			marker?.Delete();
	}

	DrawTouchFinger(x, y, longPress, clipArea = null, behindPopup = false) {
		this.drawTouchFingerRequest?.(x, y, longPress, clipArea, behindPopup);
	}

	HideTouchFinger() {
		this.drawTouchFingerRequest?.(-1, -1, false, null, false);
	}

	ToggleButtons() {
		this.game.InputEnable = true;
		this.game.ToggleButtonGridPage();
		this.game.InputEnable = false;
	}

	ShowTips(renderView) {
		const bind = f => f.bind(this);

		if (this.game.CoreConfiguration.IsMobile)
			Tutorial.ShowTipChain(renderView, bind(this.ShowTip1), bind(this.ShowTip2), bind(this.ShowTip3), bind(this.ShowTip4),
				bind(this.ShowTip5), bind(this.ShowTip6), bind(this.ShowTutorialEnd));
		else
			Tutorial.ShowTipChain(renderView, bind(this.ShowTip1), bind(this.ShowTip2), bind(this.ShowTip3), bind(this.ShowTip4),
				bind(this.ShowTutorialEnd));
	}

	/** ShowTipChain(renderView, params tips) and ShowTipChain(renderView, IEnumerable tips) */
	static ShowTipChain(renderView, ...tips) {
		if (tips.length === 1 && Array.isArray(tips[0]))
			tips = tips[0];

		const count = tips.length;

		if (count === 1)
			tips[0]?.(renderView, null);
		else
			tips[0]?.(renderView, () => Tutorial.ShowTipChain(renderView, tips.slice(1)));
	}

	ShowMessagePopup(textId, closeAction = null, yOffset = 0) {
		this.game.ShowMessagePopup(this.GetText(textId), closeAction, TextAlign.Center, 0, new Position(0, yOffset));
	}

	ShowTip1(renderView, next) {
		let yOffset = 0;

		if (this.game.CoreConfiguration.IsMobile) {
			this.ShowMarker(renderView, new Rect(MobileButtonAreaX - 1, MobileButtonAreaY - 1,
				MobileButtonAreaWidth, MobileButtonAreaHeight));

			const arrowIconArea = this.MobileButtonAreaArrowIconArea;
			this.DrawTouchFinger(arrowIconArea.Center.X + 4, arrowIconArea.Center.Y + 14, false);

			this.game.HideMobileTouchpadDisableOverlay = true;
			yOffset = -20;
		} else {
			this.ShowMarker(renderView, new Rect(Global.ButtonGridX - 1, Global.ButtonGridY - 1,
				3 * Button.Width + 2, 3 * Button.Height + 2));
		}

		this.ShowMessagePopup(1, next, yOffset);
	}

	ShowTip2(renderView, next) {
		let yOffset = 0;

		if (this.game.CoreConfiguration.IsMobile) {
			this.HideTouchFinger();
			this.HideMarker();
			this.ShowMarker(renderView, new Rect(MobileButtonAreaX - 1, MobileButtonAreaY - 1,
				MobileButtonAreaWidth, MobileButtonAreaHeight));
			this.DrawTouchFinger(MobileButtonAreaX + Math.trunc(MobileButtonAreaWidth / 2) + 4, MobileButtonAreaY + Math.trunc(MobileButtonAreaHeight / 2) + 4, true);

			yOffset = -20;
		} else {
			this.ToggleButtons();
		}

		this.ShowMessagePopup(2, next, yOffset);
	}

	ShowTip3(renderView, next) {
		let yOffset = 0;

		this.HideMarker();

		if (this.game.CoreConfiguration.IsMobile) {
			this.HideTouchFinger();

			const eyeIconArea = this.MobileButtonAreaEyeIconArea;
			this.ShowMarker(renderView, new Rect(eyeIconArea.X - 3, eyeIconArea.Y - 3,
				this.mobileButtonAreaIconWidth + 6, this.mobileButtonAreaIconHeight + 6));
			this.DrawTouchFinger(eyeIconArea.Center.X + 2, eyeIconArea.Center.Y + 16, false);

			yOffset = -20;
		} else {
			this.ToggleButtons();
			this.ShowMarker(renderView, Global.PartyMemberPortraitArea);
		}

		this.ShowMessagePopup(3, next, yOffset);
	}

	ShowTip4(renderView, next) {
		const Map2DViewArea = GameCore.Map2DViewArea;

		this.HideMarker();

		if (this.game.CoreConfiguration.IsMobile) {
			this.DrawTouchFinger(Map2DViewArea.Right - 72, Map2DViewArea.Bottom - 50, false);
			this.ShowMarker(renderView, new Rect(Map2DViewArea.X + 16 - 2, Map2DViewArea.Y + 32 - 2, 20, 20));
			this.game.SetClickHandler(next);
			this.game.InputEnable = false;
			this.game.CurrentMobileAction = GameCore.MobileAction.Eye;
		} else {
			this.ShowMarker(renderView, Map2DViewArea);
			this.game.ShowMessagePopup(this.GetText(4), next);
		}
	}

	ShowTip5(renderView, next) {
		const Map2DViewArea = GameCore.Map2DViewArea;

		// Mobile only
		this.game.CurrentMobileAction = GameCore.MobileAction.None;
		this.game.InputEnable = true;
		this.DrawTouchFinger(Map2DViewArea.Center.X, Map2DViewArea.Bottom - 36, true);
		this.HideMarker();
		this.ShowMessagePopup(4, () => {
			this.HideTouchFinger();
			if (next != null)
				this.game.ExecuteNextUpdateCycle(next);
		}, -20);
	}

	ShowTip6(renderView, next) {
		// Mobile only
		this.DrawTouchFinger(Global.PartyMemberPortraitArea.X + 34, Global.PartyMemberPortraitArea.Y + 32, false, new Rect(0, 0, Global.VirtualScreenHeight, 64), true);
		this.ShowMarker(renderView, Global.PartyMemberPortraitArea);

		this.ShowMessagePopup(5, () => {
			this.game.ExecuteNextUpdateCycle(() => {
				this.HideTouchFinger();
				this.HideMarker();

				this.game.OpenPartyMember(0, true, () => {
					this.game.InputEnable = false;
					this.game.SetClickHandler(() => {
						this.game.InputEnable = true;
						this.game.CloseWindow(() => {
							this.ShowMessagePopup(6, next);
						});
					});
				});
			});
		});
	}

	ShowTutorialEnd(renderView, next) {
		this.HideMarker();
		this.game.ShowMessagePopup(this.GetText(this.texts.length), () => {
			this.game.HideMobileTouchpadDisableOverlay = false;
			next?.();
		});
	}
}
