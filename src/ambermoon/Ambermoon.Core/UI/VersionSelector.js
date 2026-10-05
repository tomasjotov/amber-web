// Port of Ambermoon.Core/UI/VersionSelector.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Game data version selection screen

import { Event, first, firstOrDefault, getValue, newArray, toByte } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { GameLanguage } from '../../Ambermoon.Data.Common/IGameData.js';
import { ButtonType } from '../../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Color } from '../Render/Color.js';
import { Layer } from '../Render/Layer.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Graphics } from '../Render/Graphics.js';
import { GameCore } from '../GameCore.js';
import { Key } from '../Key.js';
import { MouseButtons } from '../MouseButtons.js';
import { Global } from './Global.js';
import { Button } from './Button.js';
import { PopupFrame } from './PopupFrame.js';
import { Tooltip } from './Layout.js';

const FlagWidth = 16;
const FlagHeight = 16;
const NormalTooltipColor = TextColor.White;

/** $"{text,-n}" */
function alignLeft(value, n) {
	return String(value).padEnd(n, ' ');
}

export class VersionSelector {
	constructor(ambermoonNetVersion, renderView, textureAtlasManager,
		gameVersions, cursor, selectedVersion, saveOption, configuration) {
		this.borders = [];
		this.cursor = null;
		this.headerRenderText = null;
		this.versionTexts = newArray(5);
		this.versionTextHighlightShadows = newArray(5);
		this.versionHighlights = newArray(5);
		this.gameDataVersionTooltipArea = null;
		this.gameDataVersionTooltipText = null;
		this.selectedVersionMarker = null;
		this.changeSaveOptionButton = null;
		this.saveOptionText = null;
		this.saveOptionTooltip = new Tooltip();
		this.tooltipText = null;
		this.buttonBackgrounds = new Map();
		this.mergedGameVersions = [];
		this.selectedVersionLanguages = [];
		this.flagSunkenBox = null;
		this.tooltipBorder = null;
		this.tooltipBackground = null;
		this.languageChangeButtons = [];
		this.currentSaveTooltipText = null;
		this.okButton = null;
		this.versionAreas = [];
		this.selectedSaveOption = 0;
		this.selectedVersion = 0;
		this.versionCount = 0;
		this.ticks = 0;
		// (totalSelectedIndex, dataProvider: () => IGameData, saveInDataPath) => void
		this.Closed = new Event();

		this.renderView = renderView;
		this.configuration = configuration;
		this.textureAtlas = textureAtlasManager.GetOrCreate(Layer.UI);
		this.flagsTextureAtlas = textureAtlasManager.GetOrCreate(Layer.Misc);
		const fontTextureAtlas = textureAtlasManager.GetOrCreate(Layer.Text);
		const spriteFactory = renderView.SpriteFactory;
		const layer = renderView.GetLayer(Layer.UI);
		this.cursor = cursor;

		// #region Window
		const windowSize = new Size(16, 8);
		const windowArea = new Rect
		(
			Math.trunc((Global.VirtualScreenWidth - windowSize.Width * 16) / 2),
			Math.trunc((Global.VirtualScreenHeight - windowSize.Height * 16) / 2) - 8,
			windowSize.Width * 16,
			windowSize.Height * 16
		);
		const AddBorder = (frame, column, row) => {
			const sprite = spriteFactory.Create(16, 16, true);
			sprite.Layer = layer;
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetPopupFrameGraphicIndex(frame));
			sprite.PaletteIndex = 0;
			sprite.X = windowArea.X + column * 16;
			sprite.Y = windowArea.Y + row * 16;
			sprite.Visible = true;
			this.borders.push(sprite);
		};
		// 4 corners
		AddBorder(PopupFrame.FrameUpperLeft, 0, 0);
		AddBorder(PopupFrame.FrameUpperRight, windowSize.Width - 1, 0);
		AddBorder(PopupFrame.FrameLowerLeft, 0, windowSize.Height - 1);
		AddBorder(PopupFrame.FrameLowerRight, windowSize.Width - 1, windowSize.Height - 1);
		// top and bottom border
		for (let i = 0; i < windowSize.Width - 2; ++i) {
			AddBorder(PopupFrame.FrameTop, i + 1, 0);
			AddBorder(PopupFrame.FrameBottom, i + 1, windowSize.Height - 1);
		}
		// left and right border
		for (let i = 0; i < windowSize.Height - 2; ++i) {
			AddBorder(PopupFrame.FrameLeft, 0, i + 1);
			AddBorder(PopupFrame.FrameRight, windowSize.Width - 1, i + 1);
		}
		this.FillArea(new Rect(windowArea.X + 16, windowArea.Y + 16,
			windowSize.Width * 16 - 32, windowSize.Height * 16 - 32), this.GetPaletteColor(28), 0);
		// #endregion

		// #region Version list
		const versionListSize = new Size(14 * 16, 52);
		const versionListArea = new Rect
		(
			windowArea.Left + 16,
			windowArea.Top + 16 + 14,
			versionListSize.Width,
			versionListSize.Height
		);

		const width = ambermoonNetVersion.length * Global.GlyphWidth;
		const x = Math.trunc((Global.VirtualScreenWidth - width) / 2);
		this.AddText(new Position(x, Global.VirtualScreenHeight - 10),
			ambermoonNetVersion, TextColor.DarkerGray);
		const headerPosition = new Position(versionListArea.X, versionListArea.Y - 12);
		const headerText = this.GetHeaderText();
		this.headerRenderText = this.AddText(headerPosition, headerText, TextColor.BrightGray);
		this.gameDataVersionTooltipArea = new Rect(new Position(headerPosition.X + (headerText.length - 3) * Global.GlyphWidth, headerPosition.Y),
			new Size(3 * Global.GlyphWidth, Global.GlyphLineHeight - 1));
		this.gameDataVersionTooltipText = renderView.TextProcessor.CreateText(this.GetVersionInfoTooltip());
		this.gameDataVersionTooltipText = renderView.TextProcessor.WrapText(this.gameDataVersionTooltipText,
			new Rect(0, 0, 300, 200), new Size(Global.GlyphWidth, Global.GlyphLineHeight));
		this.AddSunkenBox(versionListArea.CreateModified(-1, -1, 2, 2));
		let versionToSelect = 0;
		for (let i = 0; i < gameVersions.length; ++i) {
			const gameVersion = gameVersions[i];

			if (gameVersion.MergeWithPrevious && this.mergedGameVersions.length !== 0) {
				this.mergedGameVersions[this.mergedGameVersions.length - 1].push(gameVersion);
			} else {
				const index = this.mergedGameVersions.length;
				const text = this.BuildVersionEntryText(gameVersion);
				const versionArea = new Rect(versionListArea.X, versionListArea.Y + index * 10, versionListArea.Width, 10);
				const markerArea = versionArea.CreateModified(0, 0, 0, -1);
				const highlight = this.versionHighlights[index] = this.FillArea(markerArea, Color.White, 6);
				highlight.Visible = false;
				this.versionTexts[index] = this.AddText(new Position(versionArea.X + 1, versionArea.Y + 2), text, TextColor.White, true, 14);
				this.versionTextHighlightShadows[index] = this.AddText(new Position(versionArea.X + 2, versionArea.Y + 3), text, TextColor.LightGray, false, 10);
				this.versionTextHighlightShadows[index].Visible = false;
				if (this.SelectedVersion === index)
					this.selectedVersionMarker = this.FillArea(markerArea, Color.Green, 2);
				this.versionAreas.push(versionArea);

				this.mergedGameVersions.push([gameVersion]);
			}

			// Note: This is the constructor parameter, not the field.
			if (selectedVersion === i)
				versionToSelect = this.mergedGameVersions.length - 1;
		}
		this.versionCount = this.mergedGameVersions.length;
		for (const mergedGameVersion of this.mergedGameVersions) {
			if (mergedGameVersion.some(v => v.Language === configuration.Language))
				this.selectedVersionLanguages.push(configuration.Language);
			else if (configuration.Language !== GameLanguage.English && mergedGameVersion.some(v => v.Language === GameLanguage.English))
				this.selectedVersionLanguages.push(GameLanguage.English);
			else
				this.selectedVersionLanguages.push(first(mergedGameVersion).Language);
		}
		// #endregion

		// #region Savegame option and OK button
		this.selectedSaveOption = saveOption % 2;
		this.changeSaveOptionButton = this.CreateButton(new Position(versionListArea.X, versionListArea.Bottom + 3), textureAtlasManager);
		this.changeSaveOptionButton.ButtonType = ButtonType.MoveRight;
		this.ShowSaveOptionButton(false);
		this.changeSaveOptionButton.LeftClickAction = () => this.ToggleSaveOption();
		const saveOptionPosition = new Position(versionListArea.X + 34, versionListArea.Bottom + 4);
		const savegameOptionText = this.GetSavegameOptionText(this.selectedSaveOption);
		this.saveOptionText = this.AddText(saveOptionPosition, savegameOptionText, TextColor.BrightGray);
		this.saveOptionText.Visible = false;
		this.okButton = this.CreateButton(new Position(versionListArea.Right - 32, versionListArea.Bottom + 3), textureAtlasManager);
		this.okButton.ButtonType = ButtonType.Ok;
		this.okButton.ToggleButton = configuration.IsMobile;
		this.okButton.Visible = true;
		this.okButton.LeftClickAction = () => {
			let totalSelectedIndex = 0;

			for (let i = 0; i < this.selectedVersion; ++i) {
				totalSelectedIndex += this.mergedGameVersions[i].length;
			}

			totalSelectedIndex += this.mergedGameVersions[this.selectedVersion].findIndex(v => v.Language === this.selectedVersionLanguages[this.selectedVersion]);

			this.Closed.invoke(totalSelectedIndex,
				first(this.mergedGameVersions[this.selectedVersion], v => v.Language === this.selectedVersionLanguages[this.selectedVersion]).DataProvider,
				this.IsSelectedVersionFromExternalData() && this.selectedSaveOption === 1);
		};
		this.saveOptionTooltip.Area = Global.GetTextRect(renderView, new Rect(saveOptionPosition, new Size(savegameOptionText.length * Global.GlyphWidth, Global.GlyphLineHeight)));
		this.UpdateSaveOptionTooltip();
		// #endregion

		// #region Language change button
		const languageCount = EnumHelper.GetValues(GameLanguage).length;
		const languageButtonArea = new Rect(versionListArea.Center.X - Math.trunc(languageCount * (FlagWidth + 4) / 2), this.okButton.Area.Top + 12, FlagWidth, FlagHeight);
		const renderLayer = renderView.GetLayer(Layer.Misc);
		const textureFactor = Math.trunc(renderLayer.TextureFactor);
		for (let i = 0; i < languageCount; ++i) {
			const language = i;
			if (configuration.Language === language)
				this.flagSunkenBox = this.AddSunkenBox(languageButtonArea.CreateModified(-2, -2, 4, 4), 1, 28);
			const languageChangeButton = renderView.SpriteFactory.Create(FlagWidth, FlagHeight, true, 3);
			languageChangeButton.Layer = renderLayer;
			languageChangeButton.TextureAtlasOffset = this.GetFlagImageOffset(language, textureFactor);
			languageChangeButton.X = languageButtonArea.X;
			languageChangeButton.Y = languageButtonArea.Y;
			languageChangeButton.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstFantasyIntroPaletteIndex + 2);
			languageChangeButton.Visible = true;
			this.languageChangeButtons.push(languageChangeButton);
			languageButtonArea.Position.X += FlagWidth + 4;
		}
		// #endregion

		this.tooltipText = this.AddText(new Position(), '', TextColor.White, true, 250);
		this.tooltipText.Visible = false;

		this.SelectedVersion = versionToSelect;
		this.UpdateLanguageDependentValues();
	}

	get SelectedVersion() {
		return this.selectedVersion;
	}

	set SelectedVersion(value) {
		if (this.selectedVersion !== value) {
			this.selectedVersion = value;

			const externalVersion = this.IsSelectedVersionFromExternalData();
			this.ShowSaveOptionButton(externalVersion);
			this.saveOptionText.Visible = externalVersion;
			this.selectedVersionMarker.X = this.versionAreas[value].X;
			this.selectedVersionMarker.Y = this.versionAreas[value].Y;
		}
	}

	IsSelectedVersionFromExternalData() {
		return first(this.mergedGameVersions[this.selectedVersion]).ExternalData;
	}

	BuildVersionEntryText(gameVersion) {
		const languageText = this.GetLanguageText(gameVersion.Language);
		return `${alignLeft(gameVersion.Info.substring(0, Math.min(20, gameVersion.Info.length)), 20)} ${alignLeft(gameVersion.Version, 4)} ${languageText.substring(0, Math.min(11, languageText.length))}`;
	}

	UpdateVersionText(index, language) {
		const gameVersions = this.mergedGameVersions[index];
		const gameVersion = firstOrDefault(gameVersions, v => v.Language === language) ?? firstOrDefault(gameVersions, v => v.Language === GameLanguage.English) ?? first(gameVersions);

		this.selectedVersionLanguages[index] = gameVersion.Language;

		this.versionTexts[index].Text = this.versionTextHighlightShadows[index].Text = this.renderView.TextProcessor.CreateText(this.BuildVersionEntryText(gameVersion));
	}

	UpdateVersionTexts(language) {
		for (let i = 0; i < this.mergedGameVersions.length; ++i) {
			this.UpdateVersionText(i, language);
		}
	}

	UpdateFlags() {
		const languageCount = EnumHelper.GetValues(GameLanguage).length;
		const x = this.languageChangeButtons[0].X;
		const sunkenBoxDist = this.flagSunkenBox[0].X - x;
		const textureFactor = Math.trunc(this.renderView.GetLayer(Layer.Misc).TextureFactor);

		for (let i = 0; i < languageCount; ++i) {
			const language = i;

			if (this.configuration.Language === language) {
				for (let b = 0; b < 5; ++b) {
					this.flagSunkenBox[b].X -= sunkenBoxDist;
					this.flagSunkenBox[b].X += i * (FlagWidth + 4) - 2;
				}
			}

			this.languageChangeButtons[i].TextureAtlasOffset = this.GetFlagImageOffset(language, textureFactor);
		}
	}

	GetFlagImageOffset(language, textureFactor) {
		return Position.op_Addition(this.flagsTextureAtlas.GetOffset(1), new Position(language * FlagWidth * textureFactor, 0)); // TODO: maybe later the image has multiple rows
	}

	GetLanguageText(gameLanguage) {
		switch (this.configuration.Language) {
			case GameLanguage.German:
				switch (gameLanguage) {
					case GameLanguage.German: return 'Deutsch';
					case GameLanguage.French: return 'Französisch';
					case GameLanguage.Polish: return 'Polnisch';
					case GameLanguage.Czech: return 'Tschechisch';
					default: return 'Englisch';
				}
			case GameLanguage.French:
				switch (gameLanguage) {
					case GameLanguage.German: return 'Allemand';
					case GameLanguage.French: return 'Français';
					case GameLanguage.Polish: return 'Polonais';
					case GameLanguage.Czech: return 'Tchèque';
					default: return 'Anglais';
				}
			case GameLanguage.Polish:
				switch (gameLanguage) {
					case GameLanguage.German: return 'Niemiecki';
					case GameLanguage.French: return 'Francuski';
					case GameLanguage.Polish: return 'Polski';
					case GameLanguage.Czech: return 'Czeski';
					default: return 'Angielski';
				}
			case GameLanguage.Czech:
				switch (gameLanguage) {
					case GameLanguage.German: return 'Německy';
					case GameLanguage.French: return 'Francouzky';
					case GameLanguage.Polish: return 'Polsky';
					case GameLanguage.Czech: return 'Česky';
					default: return 'Anglicky';
				}
			default:
				switch (gameLanguage) {
					case GameLanguage.German: return 'German';
					case GameLanguage.French: return 'French';
					case GameLanguage.Polish: return 'Polish';
					case GameLanguage.Czech: return 'Czech';
					default: return 'English';
				}
		}
	}

	GetHeaderText() {
		switch (this.configuration.Language) {
			case GameLanguage.German: return 'Wähle eine Spieldaten-Version:     (?)';
			case GameLanguage.French: return 'Choisir une version de données:    (?)';
			case GameLanguage.Polish: return 'Wybierz wersję gry:                (?)';
			case GameLanguage.Czech: return 'Vyberte verzi herních dat:         (?)';
			default: return 'Select a game data version:        (?)';
		}
	}

	GetVersionInfoTooltip() {
		let tooltip;
		switch (this.configuration.Language) {
			case GameLanguage.German:
				tooltip = 'Die Spieldaten-Version bezieht sich auf die Amiga-Basisdaten. Diese Versionierung ist unabhängig von der Ambermoon.net Version.';
				break;
			case GameLanguage.French:
				tooltip = 'La version des données concerne les données de base de l\'Amiga. Cette version est indépendante de la version d\'Ambermoon.net.';
				break;
			case GameLanguage.Polish:
				tooltip = 'Wersja danych gry odnosi się do danych bazowych Amigi. Ta wersja jest niezależna od wersji Ambermoon.net.';
				break;
			case GameLanguage.Czech:
				tooltip = 'Verze herních dat se vztahuje k základním datům Amigy. Tato verze je nezávislá na verzi Ambermoon.net.';
				break;
			default:
				tooltip = 'The game data version relates to the Amiga base data. This version is independent of the Ambermoon.net version.';
				break;
		}

		if (this.configuration.IsMobile)
			tooltip = tooltip.replaceAll('Ambermoon.net', 'Ambermoon');

		return tooltip;
	}

	GetSavegameOptionText(option) {
		if (option === 0) {
			switch (this.configuration.Language) {
				case GameLanguage.German: return 'Speichere beim Programm';
				case GameLanguage.French: return 'Sauvegarder au programme';
				case GameLanguage.Polish: return 'Zapis gry w ścieżce progr.';
				case GameLanguage.Czech: return 'Ulož do složky s programem';
				default: return 'Save games in program path';
			}
		} else {
			switch (this.configuration.Language) {
				case GameLanguage.German: return 'Speichere bei den Daten';
				case GameLanguage.French: return 'Sauvegarder aux données';
				case GameLanguage.Polish: return 'Zapis gry w ścieżce danych';
				case GameLanguage.Czech: return 'Ulož do složky s daty';
				default: return 'Save games in data path';
			}
		}
	}

	GetSavegameOptionTooltip(option) {
		if (option === 0) {
			switch (this.configuration.Language) {
				case GameLanguage.German:
					return 'Spielstände werden neben der Ambermoon.net.exe im Unterorder \'Saves\' gespeichert.';
				case GameLanguage.French:
					return 'Les sauvegardes sont stockées à côté d\'Ambermoon.net.exe dans le sous-dossier \'Saves\'.';
				case GameLanguage.Polish:
					return 'Zapisane gry są przechowywane obok pliku Ambermoon.net.exe w podfolderze \'Saves\'.';
				case GameLanguage.Czech:
					return 'Uložené hry jsou uloženy vedle souboru Ambermoon.net.exe v podsložce \'Saves\'.';
				default:
					return 'Savegames are stored next to the Ambermoon.net.exe inside the sub-folder \'Saves\'.';
			}
		} else {
			switch (this.configuration.Language) {
				case GameLanguage.German:
					return 'Spielstände werden im Pfad der Originaldaten gespeichert und überschreiben die Originalspielstände!';
				case GameLanguage.French:
					return 'Les sauvegardes sont stockées dans le chemin de données d\'origine et peuvent écraser les sauvegardes d\'origine!';
				case GameLanguage.Polish:
					return 'Zapisane gry są przechowywane w oryginalnej ścieżce danych i mogą nadpisywać oryginalne zapisy!';
				case GameLanguage.Czech:
					return 'Uložené hry jsou uloženy v originálním datovém souboru a mohou přepsat původní uložené hry!';
				default:
					return 'Savegames are stored in the original data path and may overwrite original savegames!';
			}
		}
	}

	ShowSaveOptionButton(show) {
		this.changeSaveOptionButton.Visible = show;

		for (const background of getValue(this.buttonBackgrounds, this.changeSaveOptionButton))
			background.Visible = show;
	}

	CreateButton(position, textureAtlasManager) {
		const button = new Button(this.renderView, position, textureAtlasManager);
		button.Disabled = false;
		button.DisplayLayer = 8;

		this.AddSunkenBox(new Rect(position.X - 1, position.Y - 1, Button.Width + 2, Button.Height + 2), 2, 0, button);

		return button;
	}

	UpdateHeaderText() {
		const headerText = this.GetHeaderText();
		this.headerRenderText.Text = this.renderView.TextProcessor.CreateText(headerText);
		this.gameDataVersionTooltipText = this.renderView.TextProcessor.CreateText(this.GetVersionInfoTooltip());
		this.gameDataVersionTooltipText = this.renderView.TextProcessor.WrapText(this.gameDataVersionTooltipText,
			new Rect(0, 0, 300, 200), new Size(Global.GlyphWidth, Global.GlyphLineHeight));
	}

	UpdateSaveOptionTexts() {
		const optionText = this.GetSavegameOptionText(this.selectedSaveOption);
		this.saveOptionText.Text = this.renderView.TextProcessor.CreateText(optionText);
		this.saveOptionTooltip.Area.Size.Width = optionText.length * Global.GlyphWidth;
		this.UpdateSaveOptionTooltip();
	}

	ToggleSaveOption() {
		this.selectedSaveOption = 1 - this.selectedSaveOption;
		this.UpdateSaveOptionTexts();
	}

	UpdateSaveOptionTooltip() {
		this.saveOptionTooltip.Text = this.GetSavegameOptionTooltip(this.selectedSaveOption);
		this.saveOptionTooltip.TextColor = this.selectedSaveOption === 0 ? NormalTooltipColor : TextColor.LightRed;
		this.currentSaveTooltipText = this.renderView.TextProcessor.CreateText(this.saveOptionTooltip.Text);
		this.currentSaveTooltipText = this.renderView.TextProcessor.WrapText(this.currentSaveTooltipText,
			new Rect(0, 0, 200, 200), new Size(Global.GlyphWidth, Global.GlyphLineHeight));
	}

	GetPaletteColor(colorIndex) {
		const paletteData = getValue(this.renderView.GraphicInfoProvider.Palettes, this.renderView.GraphicInfoProvider.PrimaryUIPaletteIndex).Data;

		return new Color
		(
			paletteData[colorIndex * 4 + 0],
			paletteData[colorIndex * 4 + 1],
			paletteData[colorIndex * 4 + 2],
			paletteData[colorIndex * 4 + 3]
		);
	}

	AddSunkenBox(area, displayLayer = 1, fillColorIndex = 27,
		associatedButton = null) {
		const darkBorderColor = this.GetPaletteColor(26);
		const brightBorderColor = this.GetPaletteColor(31);
		const fillColor = this.GetPaletteColor(fillColorIndex);

		// upper dark border
		const upperArea = this.FillArea(new Rect(area.X, area.Y, area.Width - 1, 1), darkBorderColor, displayLayer);
		// left dark border
		const leftArea = this.FillArea(new Rect(area.X, area.Y + 1, 1, area.Height - 2), darkBorderColor, displayLayer);
		// fill
		const fillArea = this.FillArea(new Rect(area.X + 1, area.Y + 1, area.Width - 2, area.Height - 2), fillColor, displayLayer);
		// right bright border
		const rightArea = this.FillArea(new Rect(area.Right - 1, area.Y + 1, 1, area.Height - 2), brightBorderColor, displayLayer);
		// lower bright border
		const lowerArea = this.FillArea(new Rect(area.X + 1, area.Bottom - 1, area.Width - 1, 1), brightBorderColor, displayLayer);

		if (associatedButton != null) {
			const areas = [upperArea, leftArea, fillArea, rightArea, lowerArea];
			this.buttonBackgrounds.set(associatedButton, areas);
			return areas;
		} else {
			return [upperArea, leftArea, fillArea, rightArea, lowerArea];
		}
	}

	FillArea(area, color, displayLayer = 1) {
		const filledArea = this.renderView.ColoredRectFactory.Create(area.Width, area.Height, color, displayLayer);

		filledArea.Layer = this.renderView.GetLayer(Layer.UI);
		filledArea.X = area.Left;
		filledArea.Y = area.Top;
		filledArea.Visible = true;

		return filledArea;
	}

	AddText(position, text, textColor, shadow = true,
		displayLayer = 1, fallbackChar = null) {
		const renderView = this.renderView;
		position = Global.GetTextRect(renderView, new Rect(position, new Size(Global.GlyphWidth, Global.GlyphLineHeight))).Position;
		const renderText = renderView.RenderTextFactory.Create(
			toByte(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1),
			renderView.GetLayer(Layer.Text),
			renderView.TextProcessor.CreateText(text, fallbackChar), textColor, shadow);
		renderText.DisplayLayer = displayLayer;
		renderText.X = position.X;
		renderText.Y = position.Y;
		renderText.PaletteIndex = toByte(renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1);
		renderText.Visible = true;
		return renderText;
	}

	Update(deltaTime) {
		this.ticks = GameCore.UpdateTicks(this.ticks, deltaTime);
		this.okButton.Update(this.ticks);
		this.changeSaveOptionButton.Update(this.ticks);
	}

	Render() {
		this.renderView.Render(null);
	}

	OnKeyDown(key, modifiers) {
		switch (key) {
			case Key.Up:
				this.SelectedVersion = (this.SelectedVersion - 1 + this.versionCount) % this.versionCount;
				break;
			case Key.Down:
				this.SelectedVersion = (this.SelectedVersion + 1) % this.versionCount;
				break;
			case Key.PageUp:
			case Key.Home:
				this.SelectedVersion = 0;
				break;
			case Key.PageDown:
			case Key.End:
				this.SelectedVersion = this.versionCount - 1;
				break;
			case Key.Return:
			case Key.Space: {
				const okButton = this.okButton;
				const action = okButton.LeftClickAction;
				okButton.LeftClickAction = () => {
					if (!this.configuration.IsMobile)
						okButton.Release(true);

					okButton.Disabled = true;
					action?.();
				};
				okButton.ContinuousActionDelayInTicks = Math.trunc(3 * GameCore.TicksPerSecond / 2);
				okButton.Pressed = true;
				break;
			}
		}

		if (!this.IsSelectedVersionFromExternalData())
			this.HideTooltip();
	}

	OnKeyUp(key, modifiers) {

	}

	OnKeyChar(keyChar) {

	}

	OnMouseUp(position, buttons) {
		if (buttons === MouseButtons.Left) {
			position = this.renderView.ScreenToGame(position);

			this.okButton.LeftMouseUp(position, 0);
			this.changeSaveOptionButton.LeftMouseUp(position, 0);
		}
	}

	OnMouseDown(position, buttons) {
		if (buttons === MouseButtons.Left) {
			position = this.renderView.ScreenToGame(position);

			for (let i = 0; i < this.versionAreas.length; ++i) {
				if (this.versionAreas[i].Contains(position)) {
					this.SelectedVersion = i;
					return;
				}
			}

			for (let i = 0; i < this.languageChangeButtons.length; ++i) {
				const button = this.languageChangeButtons[i];

				if (position.X >= button.X && position.X < button.X + button.Width &&
					position.Y >= button.Y && position.Y < button.Y + button.Height) {
					if (this.configuration.Language !== i) {
						this.configuration.Language = i;
						this.UpdateLanguageDependentValues();
					}
				}
			}

			if (this.configuration.IsMobile) {
				if (this.gameDataVersionTooltipArea.Contains(position)) {
					this.ShowTooltip(position, this.gameDataVersionTooltipText, NormalTooltipColor, true);
				} else {
					this.HideTooltip();
				}
			}

			this.okButton.LeftMouseDown(position, 0);
			this.changeSaveOptionButton.LeftMouseDown(position, 0);
		}
	}

	UpdateLanguageDependentValues() {
		this.UpdateHeaderText();
		this.UpdateFlags();
		this.UpdateSaveOptionTexts();
		this.UpdateVersionTexts(this.configuration.Language);
	}

	HighlightVersion(index) {
		for (let i = 0; i < this.versionHighlights.length; ++i) {
			if (this.versionHighlights[i] == null)
				continue;

			const active = i === index;
			this.versionHighlights[i].Visible = active;
			this.versionTexts[i].TextColor = active ? TextColor.Black : TextColor.White;
			this.versionTexts[i].Shadow = !active;
			this.versionTextHighlightShadows[i].Visible = active;
		}
	}

	ShowTooltip(position, text, textColor, up) {
		this.tooltipText.Text = text;
		this.tooltipText.TextColor = textColor;

		const textWidth = text.MaxLineSize * Global.GlyphWidth;
		const x = Util.Limit(0, position.X - Math.trunc(textWidth / 2), Global.VirtualScreenWidth - textWidth - 3);
		const textHeight = text.LineCount * Global.GlyphLineHeight;
		const y = up ? position.Y - textHeight - 8 : position.Y + 16;

		const backgroundColor = textColor === NormalTooltipColor ? this.GetPaletteColor(TextColor.Green) : this.GetPaletteColor(TextColor.Pink);

		this.tooltipText.Place(Global.GetTextRect(this.renderView, new Rect(x, y, textWidth, textHeight)), TextAlign.Center);
		this.tooltipText.Visible = true;
		this.tooltipBorder?.Delete();
		this.tooltipBackground?.Delete();
		this.tooltipBorder = this.FillArea(new Rect(x - 2, y - 3, textWidth + 4, textHeight + 4), this.GetPaletteColor(29), 248);
		this.tooltipBackground = this.FillArea(new Rect(x - 1, y - 2, textWidth + 2, textHeight + 2), backgroundColor, 249);
	}

	HideTooltip() {
		this.tooltipText.Visible = false;
		this.tooltipBorder?.Delete();
		this.tooltipBackground?.Delete();
	}

	OnMouseMove(position, buttons) {
		this.cursor.UpdatePosition(position, null);

		position = this.renderView.ScreenToGame(position);

		for (let i = 0; i < this.versionAreas.length; ++i) {
			if (this.versionAreas[i].Contains(position)) {
				this.HighlightVersion(i);
				return;
			}
		}

		this.HighlightVersion(-1);

		if (this.IsSelectedVersionFromExternalData() && this.currentSaveTooltipText != null && this.saveOptionTooltip.Area.Contains(position)) {
			this.ShowTooltip(position, this.currentSaveTooltipText, this.saveOptionTooltip.TextColor, false);
		} else if (this.gameDataVersionTooltipArea.Contains(position)) {
			this.ShowTooltip(position, this.gameDataVersionTooltipText, NormalTooltipColor, true);
		} else {
			this.HideTooltip();
		}
	}

	OnMouseWheel(xScroll, yScroll, mousePosition) {
		if (yScroll !== 0) {
			if (yScroll > 0) // up
				this.SelectedVersion = (this.SelectedVersion - 1 + this.versionCount) % this.versionCount;
			else
				this.SelectedVersion = (this.SelectedVersion + 1) % this.versionCount;

			if (!this.IsSelectedVersionFromExternalData())
				this.HideTooltip();
		} else if (xScroll !== 0) {
			let languageIndex = this.configuration.Language;

			if (xScroll > 0) { // left
				if (languageIndex <= 0)
					return;
				--languageIndex;
			} else { // right
				if (languageIndex >= this.languageChangeButtons.length - 1)
					return;
				++languageIndex;
			}

			this.configuration.Language = languageIndex;
			this.UpdateLanguageDependentValues();

			if (!this.IsSelectedVersionFromExternalData())
				this.HideTooltip();
		}
	}
}
