# Integration notes from porting workers

## Core Game parts (Party, Places, Windowing, Conversations, Items, Savegame, Settings, CustomTexts, DataProviders, Audio, Util, GameVersion)
- Not GameCore parts: CustomTexts.js (class CustomTexts), GameVersion.js (class GameVersion). Nested: GameSequence (Util.js), NameProvider (DataProviders.js), ConversationItems (Conversations.js) -> attach to GameCore if referenced.
- 2D arrays T[,] are jagged [x][y] (MonsterGroup.Monsters, ConversationItems.Slots, Merchant.Slots, Map.Blocks, Map.Tiles); CollectionExtensions.ToList(arr) for 2D.
- KeyValuePair -> { Key, Value }.
- Statics of other parts accessed via this.constructor (PartyMemberCharacterBits Map, MaxBaseLine, PartyMemberInitialCharacterBits, FadeTime -> Rendering must define static FadeTime).
- TimeSpan = ms.
- EventTrigger in Core = enum from Ambermoon.Core/MapExtensions.js.
- Out arrays: EventExtensions.ExecuteEvent(...) -> [event, trigger, lastEventStatus, aborted, eventProvider]; ItemSlot.CreateFromItem -> [slot, amount]; ItemSlot.FillWithNewItem -> [amount]; RecheckActivePartyMember -> [result, gameOver]; GetTransportsInVisibleArea -> [list, transportAtPlayer]; camera.GetForwardPosition/GetBackwardPosition, Geometry.BlockToCameraPosition -> [x, z]; layout.AddEventPicture -> [palette].
- Must be Event objects: GameCore ActivePlayerChanged, NewLeaderPicked, TargetPlayerPicked, TargetInventoryPicked, TargetItemPicked, MouseTrappedChanged, MousePositionChanged, ConfigurationChanged; Popup.Closed, Scrollbar.Scrolled, UIText.Clicked, Layout.DraggedItemDropped, ListBox.HoverItem, EventProvider.Provided, ItemGrid ItemClicked/ItemDragged/ItemDropped/ItemExchanged.
- Plain function fields: nextClickHandler, closeWindowHandler, itemDragCancelledHandler, showMobileTouchPadHandler.
- ShowBattleWindow overload: typeof args[1] === 'boolean'. LastWindow = DefaultWindow.clone() (WindowInfo struct).
- SpellInfos is a Map; characterInfoTexts Maps; renderMap2D.get(position); PartyMembers getter returns array; Savegame.PartyMembers, TileChangeEvents, Equipment.Slots are Maps; CurrentPartyMemberIndices/BattlePositions arrays.

## Data.Common part 2
- Character.js avoids importing subclasses: `is Monster` -> Type === CharacterType.Monster; lazy static tables.
- CharacterValue.SetField(fieldName, value, propertyName); PropertyChanged Event handlers (sender, { PropertyName }).
- Labdata.Object -> local LabdataObject, attached as Labdata.Object.
- 2D arrays [x][y] null-filled: Chest.Slots[6][4], Merchant.Slots[6][4], NonItemPlace.Slots[6][2], MonsterGroup.Monsters[6][3].
- SavegameData.MapEventBits BigInt array (ulong) -> SavegameSerializer ReadQword returns BigInt, writer handles BigInt.
- CharacterBits uint32; GlobalVariables, GotoPointBits, BattlePositions, DictionaryWords Uint8Array; TileChangeEvents, Automaps, PartyMembers, Chests, Merchants Maps.
- Character.IsImmuneToSpell(spell, supportElements) -> [immune, silent]; Damage overload by 2nd arg type.
- TextDictionary.Load(reader, kv) kv = [language, reader] or {Key, Value}.
- SpellInfos.Entries Map; SpellInfos.GetSPCost(SpellInfos.Entries, features, spell, caster), GetSLPCost(Entries, features, spell); SpellTargetExtensions.TargetsEnemy(t).
- GameLanguageExtensions.ToGameLanguage(str) static. OutroAction/OutroGraphicInfo init object. FantasyIntroAction(frames, command, ...params).

## GameCore main, Input, Lifecycle, Rendering, Spells, Tutorial, Ambermoon.Game
- GameCore.js attaches nested types (MobileIconAction, MobileAction, PlayerBattleAction, BattleEndInfo, BattleInfo, AutoBattleInfo, ConversationItems, NameProvider, AutomapOptions, AutomapWall, Movement, CharacterInfo, GameSequence).
- Hooks: Hook_PreUpdate(dt)/Hook_AfterTimedEventUpdate(dt) -> [proceed].
- DrugTicked, QuitRequested, Game.RequestAdvancedSavegamePatching are Events.
- AddTimedEvent(delayMs, action, ignoreFastBattleMode=false); TimedGameEvent in Lifecycle.js.
- Layout ref returns: Hover -> [bool, cursorType]; Drag/SaveListScrollDrag -> [cursorType]; Click -> [bool, cursorType]; RightMouseUp/LeftMouseUp -> [cursorType].
- Events used: SavegameTime GotTired/GotExhausted/NewDay/NewYear/MinuteChanged/HourChanged; RenderMap2D/3D.MapChanged; Layout.BattleFieldSlotClicked; static TextInput.FocusChanged.
- Teleport(mapIndex, x, y, dir, force) -> [result, blocked]. Party events TargetPlayerPicked etc. are Events.
- Data ConditionEvent needs static ConditionType.
- AdditionalSavegameSlots uses localStorage.

## Core Render helpers
- Color: new Color(r,g,b,a) = ints; Color.FromFloat(r,g,b,a=1) for float ctor (check Frontend/renderer usage!). (xrgb, a), (Color), (Color, a).
- Graphics offsets lazy static getters.
- TextureAtlasManager.CreateUIOnly -> { Key, Value }; AddAtlases(layer, ...{Offset, Atlas}|[o,a]) or Map. Providers duck-typed (GetGraphics / GetGraphicAtlas).
- Texture.ConvertPixelData(pixelData, format) -> [data, newFormat].
- BattleAnimation AnimationFinished/AnimationUpdated Events.
- Requires: FilledAreaType exported from UI/Layout.js; Layout static+instance GetMonsterCombatCenterPosition/GetMonsterCombatTopPosition; GameCore.AutoBattleButton, GameCore.TicksPerSecond statics.

## Core UI controls
- Button.LeftMouseUp(pos, cursorType, ticks) -> [cursorType]; LeftMouseDown(pos, cursorType, ticks) -> [bool, cursorType] (2 args -> bool).
- ButtonGrid.MouseUp -> [newCursorType]; MouseDown -> [bool, newCursorType]. Popup.Click -> [bool, ignoreNextMouseUp]. ItemGrid.Click -> [bool, itemAction, cursorType].
- List box items { Key, Value }. UIText timedEventCreator (ms, action).
- Events: UIText Clicked/Scrolled/FreeScrollingStarted/Ended; Scrollbar Scrolled; Popup Scrolled/Closed; ListBox HoverItem; TextInput InputSubmitted/Aborted/InputChanged/static FocusChanged; ItemGrid ItemDragged/Dropped/Exchanged/Clicked/RightClicked; ButtonGrid RightMouseClicked; VersionSelector Closed.
- Assumes IRenderText.GetTextColorPerLine returns array; GraphicInfoProvider.Palettes is Map; Tooltip exported from Layout.js.

## Common + Data.Common part 1
- !!! Map.js exports class Map (shadows global Map). CHECK every module importing { Map } from Data.Common/Map.js for `new Map(`/`instanceof Map` meant as dictionary -> globalThis.Map.
- Map.Tiles/Blocks/InitialTiles/InitialBlocks [Width][Height]. Nested: Map.TileType, Map.Tile, Map.Block, Map.CharacterReference(.Flags), Map.GotoPoint.
- Event.js: EventType, EventTrigger (flags) top-level; Event.CloneBytes static; IBranchEvent detect 'AlternativeBranchEventIndex' in ev; ToggleSwitchEvent.GlobalVariables frozen array of 4.
- Byte arrays Uint8Array. Equipment.Slots Map. TextureGraphicInfos.ObjectGraphicInfos -> [GraphicInfo, frames]; ObjectGraphicFrameCountsAndSizes {Key, Value}.
- Position/Size op_Multiply returns int class for integer factor.
- Features.Mod = 0x80000000 -> use (features >>> 31) !== 0.
- EnumHelper.GetValues(E) etc; CollectionExtensions.ForEach(array2D, action) arity-based.
- Battle.js failed node --check at that time (check).

## Audio (SonicArranger, Data.Legacy/Audio, Ambermoon.net/AudioOutput.js)
- Verified bit-identical vs C# for 31/32 songs (15 random noise). tools/render-ambermoon-song.mjs.
- AudioOutput({ audioContext, sampleRate }); unlock() from input handlers; installUnlockHandlers(window).
- IAudioStream.Stream(ms) -> Uint8Array; Song.SongDuration ms.
- SongManager(gameData) reads getValue(gameData.Files, 'Intro_music'|'Extro_music'|'Music.amb') containers with .Files Map keyed by int.

## Frontend pieces (Ambermoon.net/*, Frontend)
- src/ambermoon/runtime.js shim re-exports ../runtime.js (several files import runtime one level too shallow).
- Host steps: await Resources.load('assets/'); Configuration.Load(storage) etc. + UpgradeAdditionalSavegameSlots + SaveRequested.add(save);
  new RemakeSavegameManager(Configuration.GetSavePath(Configuration.GetVersionSavegameFolder(v)), configuration, saveStorage {get,set,remove,list,lastModified?}); [names, current] = GetSavegameNames(gameData, GameCore.NumBaseSavegameSlots).
  Fonts: new Font(introData.Glyphs, 6, 0), new Font(introData.LargeGlyphs, 10, introData.Glyphs.size); new IngameFontProvider(DataReader.FromData(Resources.IngameFont), gameData.FontProvider.GetFont()).
  Intro(renderView, introData, introFont, introFontLarge, byClick=>, startMusic) Update(delta sec)/Click(); FantasyIntro(rv, data, finish) Update/Abort.
  MainMenu(renderView, cursor, IntroData.GraphicPalettes, introFontLarge, texts, canContinue, loadingText0, loadingText1, playMusic, fromIntro); Closed.add(action) vs MainMenu.CloseAction; forward Update/Render/OnKeyDown/OnMouseDown/OnMouseMove.
  LoadingBar.Initialize(atlasMgr, LoadingBarGraphicProvider.GetGraphic); new LoadingBar(rv, 1/6, 1/8).
  AdvancedLogo 2414x2400 texture - check max texture size.
  OutroFactory(renderView, outroData, outroFont, outroFontLarge); MusicManager(configuration, gameData).
- SavegameManager (Data.Legacy) must use (path, storage) and keys <path>/Saves, <path>/Save.XX/...

## Core map rendering (RenderMap2D/3D, Player2D/3D, Character2D/3D, MapCharacter2D, MapAnimation)
- Load-order risk: Character2D.js must not be the first loaded of {Character2D, Player2D, MapCharacter2D, RenderMap2D}.
- RenderMap2D.get(x,y)/get(pos); IsMapVisible(i, lx, ly) -> [bool, lx, ly]; LimitScrollOffset(x,y,map?) -> [x,y]; LimitScrollOffset(pos) -> [newMap].
- Player2D.Move(...) -> [canMove, eventTriggered]; RenderMap3D.CharacterTypeFromBlock -> [type, automapType]; GetObjectPosition -> [x,y,z,size].
- Events: RenderMap2D.MapChanged(lastMap, maps), RenderMap3D.MapChanged, Character3D RandomMovementRequested/MoveRequested; camera.Turned must be Event.
- Character3D.RealPosition starts as shared FloatPosition.Zero (as C#).

## Core maps/events (MapHandling, EventHandling, Movement, Teleport, GameTime, extensions, Time, Geometry)
- Teleport(mapIndex, x, y, dir, force?, fade?) -> [bool, blocked]; TeleportEvent as 1st arg -> event version.
- MapExtensions.TriggerEvents: 6 args -> bool; 7 args (filter) -> [bool, hasMapEvent].
- TestUseItemMapEvent -> [bool, x, y, eventType]; GetEventIndex(pos) -> [eventIndex, mapIndex]; GetTransportAtPlayerLocation -> [transport, index]; GetTileFlags -> { Flags, CombatBackgroundIndex }.
- camera3D.GetForwardPosition(d, noX, noZ) -> [x, z].
- Uses GameCore_Lifecycle.TicksPerSecond (render helpers expect GameCore.TicksPerSecond static too).
- initialChests static Map filled in place.

## Core UI Layout
- AddSpriteWithTooltip(...) -> [sprite, tooltip] (new name). SetBattleFieldSlotColor ambiguity with 3 args: callers should pass 4 args for column/row form (check BattleHandling/Battle).
- Global static readonly Rects are cached getters.
- Layout returns: LeftMouseUp/RightMouseUp -> [cursorType]; Click -> [bool, cursorType]; Hover -> [bool, cursorType]; Drag/SaveListScrollDrag -> [cursorType]; AddEventPicture -> [palette].
- Needs GameCore.ConversationItems attached; Inventory.Slots array.

## Data.Legacy game data (GameData etc.) - tools/test-gamedata.mjs works on real data (v1.07 English)
- new GameData(loadPreference, logger, stopAtFirstError, versionPreference); LoadFromFiles(Map, savesOnly). Keys like 'Save.00/Party_data.sav'.
- !!! SavegameManager(storage, path='') but RemakeSavegameManager calls super(path, storage) -> FIX ORDER.
- storage { get, set, remove? }; keys 'Saves', 'Save.01/Party_data.sav', crash 'Save.99/...'.
- GetSavegameNames -> [names, current]; WriteSavegameName -> [name].
- DataNameProvider.GetGenderName(value, GenderFlag) in Items; GetElementName(x, ItemElement) in Battle.cs:1568 -> check callers.
- DataWriter WriteByte/WriteWord/WriteDword. Messages.Index static; UITextIndex from ExecutableData/UITexts.js. GraphicProvider.Palettes Map.

## Data.Legacy serialization
- DataWriter: WriteByte/WriteWord/WriteDword/WriteQword/WriteBool (Write(number) throws!), ReplaceByte/... ; ReadQword number, ReadQwordAsBigInt.
- AmigaExecutable.Deplode -> [data, hunkSizes, memFlags]; TextCommand.TryParse -> [ok, cmd].
- Graphic needs new Graphic(w, h, colorIndex).

## Renderer WebGL2 (smoke test tools/renderer-test.html 20/20 passed)
- const cp = CreateContextProvider(canvas, 'main'); new GameRenderView(cp, gameData, graphicInfoProvider, fontProvider, textProcessor, () => textureAtlasManager, canvas.width, canvas.height, new Size(cssW, cssH), {value:true}, {value:true}, () => ({Key: filter, Value: overlay}), () => effects, additionalPalettes, DeviceType.Desktop, SizingPolicy.FitRatio, OrientationPolicy.Support180DegreeRotation); view.Render(null) per frame.
- Context attrs: alpha false, depth true, stencil true, antialias false.
- Camera3D.Get*Position -> [x, z]; Turned Event. RenderView events Event objects. LayerConfig init object.

## Music (Amberstar)
- music.js renumbers Map.MusicIndex 1..19 -> 101..119 (after all converters). Audio.js: Amberstar song 0 keeps current song (done).

## graphics2D (Amberstar)
- Map.PaletteIndex = tilesetPaletteIndex(ctx, n); NPCGfxIndex = n; GraphicIndex = icon-1 (npcGraphicIndexForIcon). CombatBackgroundIndex = COM_BACK - 1.
- Optional: provider.PaletteIndexFromColorIndex = (map, c) => c for exact minimap colors.
