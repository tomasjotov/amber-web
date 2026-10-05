// Port of Ambermoon.Core/GameCore.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { applyPartials, initPartFields, hasFlag, toDictionary } from '../runtime.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Character } from '../Ambermoon.Data.Common/Character.js';
import { CursorType } from '../Ambermoon.Data.Common/CursorType.js';
import { Features } from '../Ambermoon.Data.Common/Enumerations/Features.js';
import { Color as TextColor } from '../Ambermoon.Data.Common/Enumerations/Color.js';
import { Condition } from '../Ambermoon.Data.Common/Enumerations/Condition.js';
import { UIGraphic } from '../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { CombatGraphicIndex } from '../Ambermoon.Data.Common/Enumerations/CombatGraphicIndex.js';
import { SpellInfos as DataSpellInfos } from '../Ambermoon.Data.Common/SpellInfo.js';
import { MouseButtons } from './MouseButtons.js';
import { Color as RenderColor } from './Render/Color.js';
import { Graphics } from './Render/Graphics.js';
import { Layer } from './Render/Layer.js';
import { TextAlign } from './Render/TextAlign.js';
import { TextureAtlasManager } from './Render/TextureAtlasManager.js';
import { Global } from './UI/Global.js';
import { Layout } from './UI/Layout.js';
import { TextInput } from './UI/TextInput.js';
import { GameVersion } from './Game/GameVersion.js';

import * as AudioModule from './Game/Audio.js';
import * as AutoBattleModule from './Game/AutoBattle.js';
import * as BattleHandlingModule from './Game/BattleHandling.js';
import * as ConversationsModule from './Game/Conversations.js';
import * as DataProvidersModule from './Game/DataProviders.js';
import * as EventHandlingModule from './Game/EventHandling.js';
import * as GameTimeModule from './Game/GameTime.js';
import * as InputModule from './Game/Input.js';
import * as ItemsModule from './Game/Items.js';
import * as LifecycleModule from './Game/Lifecycle.js';
import * as MapHandlingModule from './Game/MapHandling.js';
import * as MovementModule from './Game/Movement.js';
import * as PartyModule from './Game/Party.js';
import * as PlacesModule from './Game/Places.js';
import * as RenderingModule from './Game/Rendering.js';
import * as SavegameModule from './Game/Savegame.js';
import * as SettingsModule from './Game/Settings.js';
import * as SpellsModule from './Game/Spells.js';
import * as TeleportModule from './Game/Teleport.js';
import * as UtilModule from './Game/Util.js';
import * as WindowingModule from './Game/Windowing.js';

/**
 * Nested types of GameCore are exported by the part files. They are looked up by their plain
 * C# name, falling back to `GameCore_<Name>` in case a part exported it with the prefix.
 */
const nestedType = (module, name) => module[name] ?? module['GameCore_' + name];

export class GameCore {
	// NOTE: The content of the game core is spread across multiple source files in the "Game" folder.
	constructor(configuration, gameLanguage, renderView, graphicInfoProvider,
		savegameManager, savegameSerializer, textDictionary,
		cursor, audioOutput, songManager, fullscreenChangeHandler,
		resolutionChangeHandler, pressedKeyProvider,
		features, gameVersionName, version, keyboardRequest,
		drawTouchFingerRequest = null, showMobileTouchPadHandler = null) {
		initPartFields(this, GameCorePartials);

		const MaxPartyMembers = GameCore.MaxPartyMembers;

		this.Features = features;

		Character.FoodWeight = hasFlag(this.Features, Features.ReducedFoodWeight) ? 25 : 250;

		this.spellInfos = new Map(DataSpellInfos.Entries);

		this.drawTouchFingerRequest = drawTouchFingerRequest;
		this.showMobileTouchPadHandler = showMobileTouchPadHandler;
		this.keyboardRequest = keyboardRequest;

		this.gameVersionName = gameVersionName;

		this.currentUIPaletteIndex = this.PrimaryUIPaletteIndex = (renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1) & 0xff;
		this.SecondaryUIPaletteIndex = (renderView.GraphicInfoProvider.SecondaryUIPaletteIndex - 1) & 0xff;
		this.AutomapPaletteIndex = (renderView.GraphicInfoProvider.AutomapPaletteIndex - 1) & 0xff;

		this.fullscreenChangeHandler = fullscreenChangeHandler;
		this.resolutionChangeHandler = resolutionChangeHandler;
		this.CoreConfiguration = configuration;
		this.GameLanguage = gameLanguage;

		this.SavegameManager = savegameManager;
		this.savegameSerializer = savegameSerializer;

		this.cursor = cursor;
		this.pressedKeyProvider = pressedKeyProvider;
		this.movement = new GameCore.Movement(configuration.LegacyMode, configuration.IsMobile);
		this.nameProvider = new GameCore.NameProvider(this);
		this.renderView = renderView;
		this.AudioOutput = audioOutput;
		this.songManager = songManager;
		this.MapManager = renderView.GameData.MapManager;
		this.ItemManager = renderView.GameData.ItemManager;
		this.CharacterManager = renderView.GameData.CharacterManager;
		this.layout = new Layout(this, renderView, this.ItemManager);
		this.layout.BattleFieldSlotClicked.add((column, row, mouseButtons) => this.BattleFieldSlotClicked(column, row, mouseButtons));
		this.places = renderView.GameData.Places;
		this.DataNameProvider = renderView.GameData.DataNameProvider;
		this.fullVersion = version + `^${GameVersion.RemakeReleaseDate}^^${this.DataNameProvider.DataVersionString}^${this.DataNameProvider.DataInfoString}`;
		this.textDictionary = textDictionary;
		this.lightEffectProvider = renderView.GameData.LightEffectProvider;
		this.camera3D = renderView.Camera3D;
		this.windowTitle = renderView.RenderTextFactory.Create(
			(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1) & 0xff,
			renderView.GetLayer(Layer.Text),
			renderView.TextProcessor.CreateText(''), TextColor.BrightGray, true,
			this.layout.GetTextRect(8, 40, 192, 10), TextAlign.Center);
		this.windowTitle.DisplayLayer = 2;
		this.fow2D = renderView.FowFactory.Create(Global.Map2DViewWidth, Global.Map2DViewHeight,
			new Position(Global.Map2DViewX + Math.trunc(Global.Map2DViewWidth / 2), Global.Map2DViewY + Math.trunc(Global.Map2DViewHeight / 2)), 255);
		this.fow2D.BaseLineOffset = GameCore.FowBaseLine;
		this.fow2D.X = Global.Map2DViewX;
		this.fow2D.Y = Global.Map2DViewY;
		this.fow2D.Layer = renderView.GetLayer(Layer.FOW);
		this.fow2D.Visible = false;
		this.drugOverlay = renderView.ColoredRectFactory.Create(Global.VirtualScreenWidth, Global.VirtualScreenHeight, RenderColor.Black, 255);
		this.drugOverlay.Layer = renderView.GetLayer(Layer.DrugEffect);
		this.drugOverlay.X = 0;
		this.drugOverlay.Y = 0;
		this.drugOverlay.Visible = false;
		this.ouchSprite = renderView.SpriteFactory.Create(32, 23, true);
		this.ouchSprite.ClipArea = GameCore.Map2DViewArea;
		this.ouchSprite.Layer = renderView.GetLayer(Layer.UI);
		this.ouchSprite.PaletteIndex = this.currentUIPaletteIndex;
		this.ouchSprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.Ouch));
		this.ouchSprite.Visible = false;
		this.ouchEvent.Action = () => this.ouchSprite.Visible = false;

		if (this.CoreConfiguration.IsMobile) {
			this.mobileClickIndicator = renderView.SpriteFactory.Create(16, 16, true);
			this.mobileClickIndicator.Layer = renderView.GetLayer(Layer.Cursor);
			this.mobileClickIndicator.Visible = false;
			this.mobileClickIndicator.PaletteIndex = this.PrimaryUIPaletteIndex;
			this.mobileClickIndicator.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.Cursor).GetOffset(CursorType.Click);
		}

		for (let i = 0; i < MaxPartyMembers; ++i) {
			this.hurtPlayerSprites[i] = renderView.SpriteFactory.Create(32, 26, true, 200);
			this.hurtPlayerSprites[i].Layer = renderView.GetLayer(Layer.UI);
			this.hurtPlayerSprites[i].PaletteIndex = this.PrimaryUIPaletteIndex;
			this.hurtPlayerSprites[i].TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.GetUIGraphicIndex(UIGraphic.DamageSplash));
			this.hurtPlayerSprites[i].Visible = false;
			this.hurtPlayerDamageTexts[i] = renderView.RenderTextFactory.Create((renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1) & 0xff);
			this.hurtPlayerDamageTexts[i].Layer = renderView.GetLayer(Layer.Text);
			this.hurtPlayerDamageTexts[i].DisplayLayer = 201;
			this.hurtPlayerDamageTexts[i].TextAlign = TextAlign.Center;
			this.hurtPlayerDamageTexts[i].Shadow = true;
			this.hurtPlayerDamageTexts[i].TextColor = TextColor.White;
			this.hurtPlayerDamageTexts[i].Visible = false;
		}
		this.hurtPlayerEvent.Action = () => {
			for (let i = 0; i < MaxPartyMembers; ++i) {
				this.hurtPlayerDamageTexts[i].Visible = false;
				this.hurtPlayerSprites[i].Visible = false;
			}
		};
		this.battleRoundActiveSprite = renderView.SpriteFactory.Create(32, 36, true);
		this.battleRoundActiveSprite.Layer = renderView.GetLayer(Layer.UI);
		this.battleRoundActiveSprite.PaletteIndex = this.PrimaryUIPaletteIndex;
		this.battleRoundActiveSprite.DisplayLayer = 2;
		this.battleRoundActiveSprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI)
			.GetOffset(Graphics.CombatGraphicOffset + CombatGraphicIndex.UISwordAndMace);
		this.battleRoundActiveSprite.X = 240;
		this.battleRoundActiveSprite.Y = 150;
		this.battleRoundActiveSprite.Visible = false;

		// Create texture atlas for monsters in battle
		const textureAtlasManager = TextureAtlasManager.Instance;

		if (this.CharacterManager.MonsterGraphicAtlasProvider == null) {
			const monsterGraphicDictionary = toDictionary(this.CharacterManager.Monsters, m => m.Index, m => m.CombatGraphic);
			textureAtlasManager.AddFromGraphics(Layer.BattleMonsterRow, monsterGraphicDictionary);
			const monsterGraphicAtlas = textureAtlasManager.GetOrCreate(Layer.BattleMonsterRow);
			renderView.GetLayer(Layer.BattleMonsterRow).Texture = monsterGraphicAtlas.Texture;
		}

		this.layout.ShowPortraitArea(false);

		// Mobile action indicator
		this.mobileActionIndicator = renderView.SpriteFactory.Create(16, 16, true);
		this.mobileActionIndicator.Layer = renderView.GetLayer(Layer.UI);
		this.mobileActionIndicator.PaletteIndex = this.PrimaryUIPaletteIndex;
		this.mobileActionIndicator.DisplayLayer = 0;
		this.mobileActionIndicator.Visible = false;

		// Note: Bound as own property so that Destroy() can remove the same handler again.
		this.InputFocusChanged = this.InputFocusChanged.bind(this);
		TextInput.FocusChanged.add(this.InputFocusChanged);
	}

	/**
	 * This is called when the game starts.
	 */
	Run(continueGame, startCursorPosition) {
		this.layout.ShowPortraitArea(false);

		this.lastMousePosition = new Position(startCursorPosition);
		this.cursor.Type = CursorType.Sword;
		this.UpdateCursor(this.lastMousePosition, MouseButtons.None);

		if (continueGame) {
			this.ContinueGame();
		} else {
			this.NewGame(false);
		}
	}

	Schnism() {
		this.ShowMessagePopup(this.DataNameProvider.TurnOnTuneInAndDropOut, () =>
			this.DamageAllPartyMembers(p => 0, p => p.Alive, null, null, Condition.Drugged));
	}
}

const GameCorePartials = [
	AudioModule.GameCore_Audio,
	AutoBattleModule.GameCore_AutoBattle,
	BattleHandlingModule.GameCore_BattleHandling,
	ConversationsModule.GameCore_Conversations,
	DataProvidersModule.GameCore_DataProviders,
	EventHandlingModule.GameCore_EventHandling,
	GameTimeModule.GameCore_GameTime,
	InputModule.GameCore_Input,
	ItemsModule.GameCore_Items,
	LifecycleModule.GameCore_Lifecycle,
	MapHandlingModule.GameCore_MapHandling,
	MovementModule.GameCore_Movement,
	PartyModule.GameCore_Party,
	PlacesModule.GameCore_Places,
	RenderingModule.GameCore_Rendering,
	SavegameModule.GameCore_Savegame,
	SettingsModule.GameCore_Settings,
	SpellsModule.GameCore_Spells,
	TeleportModule.GameCore_Teleport,
	UtilModule.GameCore_Util,
	WindowingModule.GameCore_Windowing,
];

applyPartials(GameCore, GameCorePartials);

// Nested types declared inside the partial files (C# code refers to them as GameCore.X).
for (const [module, names] of [
	[InputModule, ['MobileIconAction', 'MobileAction']],
	[BattleHandlingModule, ['PlayerBattleAction', 'BattleEndInfo', 'BattleInfo']],
	[AutoBattleModule, ['AutoBattleInfo']],
	[ConversationsModule, ['ConversationItems']],
	[DataProvidersModule, ['NameProvider']],
	[MapHandlingModule, ['AutomapOptions', 'AutomapWall']],
	[MovementModule, ['Movement']],
	[RenderingModule, ['CharacterInfo']],
	[UtilModule, ['GameSequence']],
]) {
	for (const name of names) {
		if (Object.prototype.hasOwnProperty.call(GameCore, name))
			continue;
		const type = nestedType(module, name);
		if (type !== undefined)
			Object.defineProperty(GameCore, name, { value: type, writable: true, configurable: true });
	}
}

export { GameCorePartials };
