// Port of Amberstar.Game.Screens.Map2DScreen.
import { ButtonGridScreen } from './buttonGridScreen.js';
import { ScreenType, ScreenFadeType } from './screen.js';
import { ButtonGrid } from '../ui/controls.js';
import { TextAlignment, TransparentPaper } from '../ui/text.js';
import { Layer } from '../../engine/layerSetup.js';
import { ButtonType, CursorType, Direction, EventType, MapFlags, TileFlags, UIGraphic, UIGraphicInfo, Layout, MapCharacterType } from '../../data/enums.js';
import { WorldMapWidth, WorldMapHeight, getWorldMapIndex } from '../gameState.js';
import { MAP_EVENT_COUNT } from '../../data/maps.js';
import { EventTrigger, createEvent, cursorToEventTrigger } from '../events.js';
import { MapCharacter } from '../mapCharacter.js';
import { MonsterEncounters } from '../monsterEncounters.js';
import { Key } from '../keys.js';
import { MouseButtons } from '../keys.js';
import { limit, rectContains, pad } from '../util.js';
import { canMove } from '../../data/characters.js';
import { Message } from '../messages.js';
import { TicksPerSecond, ButtonLayout } from '../game.js';

// World map music depends on the kind of travel: Travellers Tune, Horse Song, High Seas, Flying High
const WorldMapSongs = [5, 3, 2, 2, 4, 4, 4];
const WorldMapSong = WorldMapSongs[0];
const CityTicksPerStep = 20;
const WorldMapBaseTicksPerStep = 2;
const OuchDisplayTime = Math.floor(TicksPerSecond / 6);
const TicksPerStep = [6, 3, 4, 3, 5, 1, 1].map(n => n * WorldMapBaseTicksPerStep);
const TilesPerRow = 11;
const TileRows = 9;
const TileWidth = 16;
const TileHeight = 16;
const MapViewWidth = TilesPerRow * TileWidth;
const MapViewHeight = TileRows * TileHeight;
const WorldMapPreloadOffset = 12;
const OffsetX = 16;
const OffsetY = 49;
const RenderOrderOffset = TileHeight / 4;
const MinScrollX = Math.floor(TilesPerRow / 2);
const MinScrollY = Math.floor(TileRows / 2) + 1;
const TileAnimationTicks = 8;

/** Combines 4 world map parts (2x2) into one map */
class WorldMap {
	constructor() {
		this.maps = [];
		this.mapCache = new Map();
		this.tiles = [];
		this.upperLeftMapIndex = 0;
		this.isWorldMap = true;
	}

	get index() { return this.maps[0].index; }
	get width() { return WorldMapWidth * 2; }
	get height() { return WorldMapHeight * 2; }
	get flags() { return this.maps[0].flags; }
	get name() { return this.maps[0].name; }
	get songIndex() { return WorldMapSong; }
	get characters() { return []; }
	get characterPositions() { return []; }
	get tileset() { return this.maps[0].tileset; }
	get events() { return this.maps.flatMap(m => m.events); }

	setMaps(maps, indices) {
		this.maps = maps;
		this.upperLeftMapIndex = indices[0];
		for (let i = 0; i < 4; i++)
			if (!this.mapCache.has(indices[i]))
				this.mapCache.set(indices[i], maps[i]);
		const W = this.width, H = this.height;
		this.tiles = new Array(W * H);
		for (let y = 0; y < WorldMapHeight; y++) {
			for (let x = 0; x < WorldMapWidth; x++) {
				this.tiles[x + y * W] = maps[0].tiles[x + y * WorldMapWidth];
				this.tiles[WorldMapWidth + x + y * W] = maps[1].tiles[x + y * WorldMapWidth];
				this.tiles[x + (y + WorldMapHeight) * W] = maps[2].tiles[x + y * WorldMapWidth];
				this.tiles[WorldMapWidth + x + (y + WorldMapHeight) * W] = maps[3].tiles[x + y * WorldMapWidth];
			}
		}
	}

	getMapByIndex(index) { return this.mapCache.get(index); }

	/** Returns the sub map and the local coordinates for a world map position */
	locate(x, y) {
		const right = x >= WorldMapWidth ? 1 : 0;
		const bottom = y >= WorldMapHeight ? 1 : 0;
		return { map: this.maps[right + bottom * 2], x: x - right * WorldMapWidth, y: y - bottom * WorldMapHeight };
	}
}

export class Map2DScreen extends ButtonGridScreen {
	constructor() {
		super();
		this.map = null;
		this.worldMap = null;
		this.tilesets = null;
		this.underlay = new Map();
		this.overlay = new Map();
		this.characters = [];
		this.mapCharacters = [];
		this.player = null;
		this.ouchBubble = null;
		this.ouchBubbleDeleteActionIndex = -1;
		this.lastScrollX = -1;
		this.lastScrollY = -1;
		this.tileGraphicOffset = 0;
		this.moveX = 0;
		this.moveY = 0;
		this.moveTickCounter = 0;
		this.lastMoveStartTicks = 0;
		this.currentTicks = 0;
		this.additionalMoveRequested = false;
		this.screenPushPlayerWasVisible = false;
		this.timeText = null;
		this.palette = 0;
		this.delayedMoveActionIndex = -1;
		this.mouseIsDown = false;
		this.mapNameText = null;
		this.lastAnimationFrame = 0;
		this.boundMinuteChanged = () => this.#minuteChanged();
		this.encounters = new MonsterEncounters();
	}

	get type() { return ScreenType.Map2D; }
	get fadeType() { return ScreenFadeType.None; }
	get buttonGridPaletteIndex() { return this.palette; }

	keypadPressesButton(index) {
		return this.game.buttonLayout === ButtonLayout.Actions || index === 4;
	}

	mapChanged() {
		this.#loadMap(this.game.state.mapIndex);
		this.#showMapName();
		this.#afterMove();
	}

	init() {
		super.init();
		this.tilesets = [this.game.assets.loadTileset(1), this.game.assets.loadTileset(2)];
		this.game.time.minuteChanged.add(() => {
			this.timeText?.delete();
			if (this.game.screenHandler.activeScreen?.type !== ScreenType.Map2D)
				return;
			this.#showTime();
		});
	}

	#showTime() {
		// The C# port shows the time here for debugging only. Not part of the original UI.
	}

	screenPushed(screen) {
		super.screenPushed(screen);
		this.#resetMovement();
		if (!screen.transparent) {
			this.underlay.forEach(t => t.visible = false);
			this.overlay.forEach(t => t.visible = false);
			this.screenPushPlayerWasVisible = this.player.visible;
			this.player.visible = false;
			this.mapNameText.visible = false;
			this.mapCharacters.forEach(c => c.visible = false);
		}
		this.timeText?.delete();
		this.game.pause();
	}

	screenPopped(screen) {
		if (!screen.transparent) {
			this.#setLayout();
			this.underlay.forEach(t => t.visible = true);
			this.overlay.forEach(t => t.visible = true);
			this.player.visible = this.screenPushPlayerWasVisible;
			this.mapNameText.visible = true;
			this.#updateMap();
		}
		this.#showTime();
		super.screenPopped(screen);
		this.game.resume();
	}

	open(closeAction) {
		super.open(closeAction);
		this.moveTickCounter = 0;
		this.lastMoveStartTicks = 0;
		this.currentTicks = 0;
		this.additionalMoveRequested = false;
		this.mouseIsDown = false;
		this.game.time.minuteChanged.add(this.boundMinuteChanged);
		this.#setLayout();
		this.#loadMap(this.game.state.mapIndex);
		this.#showMapName();
		this.#initPlayer();
		this.#afterMove();
		this.#showTime();
	}

	#minuteChanged() {
		if (this.game.paused)
			return;
		for (const c of this.characters)
			c.update(this.game);
		this.#fillMap(this.lastScrollX, this.lastScrollY, true);
		this.#checkMonsters();
	}

	#checkMonsters() {
		if (this.worldMap || this.game.paused || !this.game.inputEnabled)
			return;
		this.encounters.check(this.game, this.map, this.characters, () => this.#fillMap(this.lastScrollX, this.lastScrollY, true));
	}

	/** Combat background (1-14) from the tile flags at the party position */
	combatBackground() {
		const p = this.game.state.partyPosition;
		const flags = this.#getTileFlags(p.x, p.y);
		for (let bit = 16; bit < 30; bit++)
			if (flags & (1 << bit))
				return bit - 15;
		return 1;
	}

	#setLayout() {
		this.game.setLayout(Layout.Map2D, this.palette);
	}

	#showMapName() {
		this.mapNameText?.delete();
		this.mapNameText = this.game.textManager.create(this.map.name, 15, TransparentPaper, this.palette);
		this.mapNameText.showInArea(OffsetX, OffsetY - this.mapNameText.lineHeight - 3, TilesPerRow * TileWidth, TileRows * TileHeight, 100, TextAlignment.Center);
	}

	buttonClicked(index) {
		const game = this.game;
		if (game.buttonLayout === ButtonLayout.Movement) {
			if (index === 4) {
				game.time.tick();
				return;
			}
			const moveX = index % 3 - 1;
			const moveY = Math.floor(index / 3) - 1;
			if (moveY < 0) game.state.partyDirection = Direction.Up;
			else if (moveY > 0) game.state.partyDirection = Direction.Down;
			else if (moveX < 0) game.state.partyDirection = Direction.Left;
			else if (moveX > 0) game.state.partyDirection = Direction.Right;
			if (this.currentTicks - this.lastMoveStartTicks >= this.#getTicksPerStep()) {
				this.lastMoveStartTicks = this.currentTicks;
				if (this.#movePlayer(moveX, moveY))
					this.#afterMove();
			}
		} else {
			const buttonType = this.getButtonType(index);
			const createActionCursorTrapArea = mouth => {
				const p = game.state.partyPosition;
				const prx = OffsetX + (p.x - this.lastScrollX) * TileWidth;
				const pry = OffsetY + (p.y - this.lastScrollY) * TileHeight;
				const range = mouth ? 2 : 1;
				const sx = limit(OffsetX + 7, prx - (range - 1) * TileWidth - TileWidth / 2, OffsetX + MapViewWidth - 1);
				const sy = limit(OffsetY + 7, pry - (range - 1) * TileHeight - TileHeight / 2, OffsetY + MapViewHeight - 1);
				return {
					x: sx, y: sy,
					w: Math.min(range * 2 * TileWidth, OffsetX + MapViewWidth - sx - 8),
					h: Math.min(range * 2 * TileHeight, OffsetY + MapViewHeight - sy - 8),
				};
			};
			switch (buttonType) {
				case ButtonType.Eye:
					game.cursor.cursorType = CursorType.Eye;
					game.trapMouse(createActionCursorTrapArea(false));
					break;
				case ButtonType.Ear:
					game.showTextMessage(Message.ListenNothingHeard);
					break;
				case ButtonType.Mouth:
					game.cursor.cursorType = CursorType.Mouth;
					game.trapMouse(createActionCursorTrapArea(true));
					break;
				case ButtonType.Camp:
					game.openCamp?.();
					break;
				case ButtonType.Disk:
					game.openOptions?.();
					break;
			}
		}
	}

	setupButtons(grid) {
		const game = this.game;
		if (game.buttonLayout === ButtonLayout.Movement) {
			grid.setButton(0, ButtonType.ArrowUpLeft);
			grid.setButton(1, ButtonType.ArrowUp);
			grid.setButton(2, ButtonType.ArrowUpRight);
			grid.setButton(3, ButtonType.ArrowLeft);
			grid.setButton(4, ButtonType.Sleep);
			grid.setButton(5, ButtonType.ArrowRight);
			grid.setButton(6, ButtonType.ArrowDownLeft);
			grid.setButton(7, ButtonType.ArrowDown);
			grid.setButton(8, ButtonType.ArrowDownRight);
			const active = game.state.activePartyMember;
			const enable = active ? canMove(active, false) : false;
			for (let i = 0; i < 9; i++)
				if (i !== 4)
					grid.enableButton(i, enable);
		} else {
			grid.setButton(0, ButtonType.Eye);
			grid.setButton(1, ButtonType.Ear);
			grid.setButton(2, ButtonType.Mouth);
			grid.setButton(3, ButtonType.UseTransport);
			grid.enableButton(3, false);
			grid.setButton(4, ButtonType.UseMagic);
			grid.enableButton(4, false);
			grid.setButton(5, ButtonType.Camp);
			grid.enableButton(5, !!game.openCamp && ((this.map?.flags ?? 0) & MapFlags.CanCamp) !== 0);
			grid.setButton(6, ButtonType.Map);
			grid.enableButton(6, false);
			grid.setButton(7, ButtonType.PartyPositions);
			grid.enableButton(7, false);
			grid.setButton(8, ButtonType.Disk);
			grid.enableButton(8, !!game.openOptions);
		}
	}

	close() {
		this.#resetMovement();
		this.game.time.minuteChanged.remove(this.boundMinuteChanged);
		this.#clearMap();
		if (this.player) {
			this.player.visible = false;
			this.player = null;
		}
		this.characters = [];
		this.mapCharacters.forEach(c => c.visible = false);
		this.mapCharacters = [];
		if (this.ouchBubble) {
			this.ouchBubble.visible = false;
			this.ouchBubble = null;
		}
		this.timeText?.delete();
		this.mapNameText?.delete();
		super.close();
	}

	#resetMovement() {
		this.moveX = 0;
		this.moveY = 0;
		this.mouseIsDown = false;
		this.game.deleteDelayedActions(this.delayedMoveActionIndex);
	}

	update(elapsedTicks) {
		const game = this.game;
		if (game.paused || !game.inputEnabled)
			this.#resetMovement();
		if (elapsedTicks === 0)
			return;
		this.currentTicks += elapsedTicks;

		// Tile animations (not part of the C# port yet)
		const animationFrame = Math.floor(this.currentTicks / TileAnimationTicks);
		if (animationFrame !== this.lastAnimationFrame) {
			this.lastAnimationFrame = animationFrame;
			this.#animateTiles(animationFrame);
		}

		if (this.moveX !== 0 || this.moveY !== 0) {
			this.moveTickCounter += elapsedTicks;
			const ticksPerStep = this.#getTicksPerStep();
			if (ticksPerStep > 0 && this.moveTickCounter >= ticksPerStep) {
				let moved = false;
				while (this.moveTickCounter >= ticksPerStep) {
					if (this.#movePlayer(this.moveX, this.moveY)) {
						moved = true;
						this.moveTickCounter -= ticksPerStep;
					} else {
						this.moveTickCounter = 0;
						break;
					}
				}
				if (moved)
					this.#afterMove();
			}
		} else {
			this.moveTickCounter = 0;
		}
	}

	#animateTiles(frame) {
		for (const sprites of [this.underlay, this.overlay]) {
			for (const sprite of sprites.values()) {
				if (!sprite.visible || sprite.frameCount <= 1)
					continue;
				const count = sprite.frameCount;
				if (sprite.waveAnimation && count > 2) {
					const period = 2 * count - 2;
					const f = (frame + (sprite.animationOffset ?? 0)) % period;
					sprite.currentFrameIndex = f < count ? f : period - f;
				} else {
					sprite.currentFrameIndex = frame + (sprite.animationOffset ?? 0);
				}
			}
		}
	}

	#getEventWithIndex(x, y, onlyActive = true) {
		let map = this.map, lx = x, ly = y;
		if (this.worldMap) {
			({ map, x: lx, y: ly } = this.worldMap.locate(x, y));
		}
		const eventIndex = map.tiles[lx + ly * map.width].event;
		if (eventIndex === 0)
			return null;
		const ev = map.events[eventIndex - 1];
		if (!ev)
			return null;
		if (onlyActive && !this.game.isEventActive(map, eventIndex, ev))
			return null;
		return { index: eventIndex, event: ev, map };
	}

	#getTileInfo(index) {
		return this.tilesets[this.map.tileset - 1].tiles[index - 1];
	}

	#blocksMovement(flags) {
		return (flags & TileFlags.BlockAllMovement) !== 0 || (flags & (1 << (8 + this.game.state.travelType))) === 0;
	}

	#tileBlocksMovement(x, y) {
		const found = this.#getEventWithIndex(x, y);
		if (found) {
			const t = found.event.type;
			if (t === EventType.MapExit || t === EventType.Teleporter || t === EventType.TrapDoor || t === EventType.Door ||
				t === EventType.Place || t === EventType.TravelExit || (t === EventType.WindGate && this.game.state.hasWindChain))
				return false;
		}
		const tile = this.map.tiles[x + y * this.map.width];
		if (tile.overlay !== 0) {
			const flags = this.#getTileInfo(tile.overlay).flags;
			if (!(flags & TileFlags.UnderlayHasPriority))
				return this.#blocksMovement(flags);
		}
		if (tile.underlay === 0)
			return false;
		return this.#blocksMovement(this.#getTileInfo(tile.underlay).flags);
	}

	#isCharacterAt(x, y) {
		return this.characters.some((c, i) => {
			const p = c.position;
			return p.x === x && p.y === y && this.game.state.isMapCharacterActive(this.map.index, 1 + c.index);
		});
	}

	#movePlayer(x, y) {
		this.additionalMoveRequested = false;
		const old = this.game.state.partyPosition;
		const newX = limit(0, old.x + x, this.map.width - 1);
		const newY = limit(0, old.y + y, this.map.height - 1);
		const blocked = (tx, ty) => this.#tileBlocksMovement(tx, ty) || this.#isCharacterAt(tx, ty);

		if (blocked(newX, newY)) {
			if (newY !== old.y && !blocked(old.x, newY)) {
				this.game.state.setPartyPosition(old.x, newY);
				return true;
			} else if (newX !== old.x && !blocked(newX, old.y)) {
				this.game.state.setPartyPosition(newX, old.y);
				return true;
			} else {
				this.#showOuchBubble();
				return false;
			}
		}

		this.game.state.setPartyPosition(newX, newY);
		return true;
	}

	#updateMap() {
		if (this.worldMap)
			this.#updateWorldMap();
		const p = this.game.state.partyPosition;
		this.#fillMap(p.x - Math.floor(TilesPerRow / 2), p.y - Math.floor(TileRows / 2), true);
		if (this.game.cursor.cursorType !== CursorType.Disk)
			this.game.simulateMouseMoveWithoutButton();
	}

	#afterMove(ignoreEvents = false) {
		this.#updateMap();
		this.game.time.moved2D();
		if (!ignoreEvents && !this.#tryExecuteMapEvent(EventTrigger.Move))
			this.#checkMonsters();
	}

	#tryExecuteMapEvent(trigger, x = null, y = null) {
		if (x == null)
			({ x, y } = this.game.state.partyPosition);
		const found = this.#getEventWithIndex(x, y);
		if (!found)
			return false;
		const mapEvent = createEvent(found.event, found.index);
		if (!mapEvent)
			return false;
		if (found.event.type === EventType.Place || found.event.type === EventType.Altar)
			this.resetPartyPosition();
		this.game.eventHandler.handleEvent(trigger, mapEvent, found.map);
		return true;
	}

	resetPartyPosition() {
		this.game.state.resetPartyPosition();
		if (this.worldMap)
			this.#updateWorldMap();
		this.#fillMap(this.lastScrollX, this.lastScrollY, true);
	}

	#updateMovement() {
		const game = this.game;
		let left = game.isKeyDown(Key.Left) || game.isKeyDown('A');
		let right = game.isKeyDown(Key.Right) || game.isKeyDown('D');
		let up = game.isKeyDown(Key.Up) || game.isKeyDown('W');
		let down = game.isKeyDown(Key.Down) || game.isKeyDown('S');
		let upLeft = game.isKeyDown('Q');
		let upRight = game.isKeyDown('E');
		let downLeft = game.isKeyDown('Y') || game.isKeyDown('Z');
		let downRight = game.isKeyDown('C');

		if (this.mouseIsDown && game.inputEnabled && !game.paused) {
			switch (game.cursor.cursorType) {
				case CursorType.ArrowUp2D: up = true; break;
				case CursorType.ArrowDown2D: down = true; break;
				case CursorType.ArrowLeft2D: left = true; break;
				case CursorType.ArrowRight2D: right = true; break;
				case CursorType.ArrowUpLeft2D: up = left = true; break;
				case CursorType.ArrowUpRight2D: up = right = true; break;
				case CursorType.ArrowDownLeft2D: down = left = true; break;
				case CursorType.ArrowDownRight2D: down = right = true; break;
				default: return;
			}
		}

		if (game.buttonLayout === ButtonLayout.Movement) {
			left ||= game.isKeyDown(Key.Keypad4);
			right ||= game.isKeyDown(Key.Keypad6);
			up ||= game.isKeyDown(Key.Keypad8);
			down ||= game.isKeyDown(Key.Keypad2);
			upLeft ||= game.isKeyDown(Key.Keypad7);
			upRight ||= game.isKeyDown(Key.Keypad9);
			downLeft ||= game.isKeyDown(Key.Keypad1);
			downRight ||= game.isKeyDown(Key.Keypad3);
		}

		if (upLeft || downLeft) left = true;
		if (upRight || downRight) right = true;
		if (upLeft || upRight) up = true;
		if (downLeft || downRight) down = true;

		if (this.additionalMoveRequested && !left && !right && !up && !down) {
			if (this.moveX !== 0 || this.moveY !== 0) {
				const timeTillNextMove = Math.max(0, this.#getTicksPerStep() - (this.currentTicks - this.lastMoveStartTicks));
				const x = this.moveX, y = this.moveY;
				game.deleteDelayedActions(this.delayedMoveActionIndex);
				this.delayedMoveActionIndex = game.addDelayedAction(timeTillNextMove, () => {
					this.lastMoveStartTicks = this.currentTicks;
					if (this.#movePlayer(x, y))
						this.#afterMove();
					this.moveTickCounter = 0;
				});
			}
			this.additionalMoveRequested = false;
		} else if (!this.additionalMoveRequested) {
			this.additionalMoveRequested = (this.currentTicks - this.lastMoveStartTicks) < this.#getTicksPerStep();
		}

		const wasMovingBefore = this.moveX !== 0 || this.moveY !== 0 || this.additionalMoveRequested;

		if (left && !right) {
			game.state.partyDirection = Direction.Left;
			this.moveX = -1;
		} else if (right && !left) {
			game.state.partyDirection = Direction.Right;
			this.moveX = 1;
		} else {
			this.moveX = 0;
		}

		if (up && !down) {
			game.state.partyDirection = Direction.Up;
			this.moveY = -1;
		} else if (down && !up) {
			game.state.partyDirection = Direction.Down;
			this.moveY = 1;
		} else {
			this.moveY = 0;
		}

		if (!wasMovingBefore && (this.moveX !== 0 || this.moveY !== 0)) {
			if (this.#movePlayer(this.moveX, this.moveY)) {
				this.lastMoveStartTicks = this.currentTicks;
				this.moveTickCounter = -this.#getTicksPerStep();
				this.#afterMove();
			}
		}
	}

	keyDown(key, modifiers) {
		if (super.keyDown(key, modifiers))
			return true;
		const ct = this.game.cursor.cursorType;
		if (ct < CursorType.Eye || ct > CursorType.Ear)
			this.#updateMovement();
		return true;
	}

	keyUp(key, modifiers) {
		if (super.keyUp(key, modifiers))
			return true;
		this.#updateMovement();
		return true;
	}

	#mousePositionToMapTilePosition(pos) {
		const x = this.lastScrollX + limit(0, Math.floor((pos.x - OffsetX) / TileWidth), this.map.width - 1);
		const y = this.lastScrollY + limit(0, Math.floor((pos.y - OffsetY) / TileHeight), this.map.height - 1);
		return { x, y };
	}

	mouseDown(position, buttons, modifiers) {
		const game = this.game;
		if (buttons === MouseButtons.Right) {
			const ct = game.cursor.cursorType;
			if (ct >= CursorType.Eye && ct <= CursorType.Ear) {
				game.cursor.cursorType = CursorType.Sword;
				game.untrapMouse();
				return true;
			} else if (rectContains(ButtonGrid.Area, position)) {
				game.buttonLayout = 1 - game.buttonLayout;
				this.requestButtonSetup();
				return true;
			} else {
				const slot = game.testPartyPortraitHit(position);
				if (slot != null) {
					game.openInventory(slot);
					return true;
				}
			}
		} else {
			this.mouseIsDown = true;
			const mapArea = { x: OffsetX, y: OffsetY, w: MapViewWidth, h: MapViewHeight };
			if (rectContains(mapArea, position)) {
				const ct = game.cursor.cursorType;
				if (ct === CursorType.Zzz) {
					game.time.tick();
					return true;
				} else if (ct >= CursorType.Eye && ct <= CursorType.Ear) {
					const trigger = cursorToEventTrigger(ct);
					const { x, y } = this.#mousePositionToMapTilePosition(position);
					game.cursor.cursorType = CursorType.Sword;
					game.untrapMouse();
					const character = this.characters.find(c => c.position.x === x && c.position.y === y);
					if (character && game.state.isMapCharacterActive(this.map.index, 1 + character.index)) {
						if (trigger === EventTrigger.Mouth && character.type === MapCharacterType.Person) {
							game.state.currentConversationCharacter = { characterIndex: character.characterIndex, map: character.map, index: character.index };
							if (game.screenHandler.factories[ScreenType.Conversation])
								game.screenHandler.pushScreen(ScreenType.Conversation);
							return true;
						}
						if (character.type === MapCharacterType.Popup && (trigger === EventTrigger.Mouth || trigger === EventTrigger.Eye)) {
							game.showTextMessage(game.getMapText(this.map.index, character.characterIndex - 1));
							return true;
						}
					}
					this.#tryExecuteMapEvent(trigger, x, y);
					return true;
				} else if (ct >= CursorType.ArrowUp2D && ct <= CursorType.ArrowDownLeft2D) {
					this.#updateMovement();
					return true;
				}
			}
		}
		return super.mouseDown(position, buttons, modifiers);
	}

	mouseUp(position, buttons, modifiers) {
		this.mouseIsDown = false;
		this.#updateMovement();
		return super.mouseUp(position, buttons, modifiers);
	}

	mouseMove(position, buttons) {
		super.mouseMove(position, buttons);
		const game = this.game;
		const ct = game.cursor.cursorType;
		if (ct === CursorType.Eye || ct === CursorType.Ear || ct === CursorType.Mouth || !this.player)
			return;
		const mapArea = { x: OffsetX, y: OffsetY, w: MapViewWidth, h: MapViewHeight };
		if (rectContains(mapArea, position)) {
			const left = position.x < this.player.x;
			const right = position.x >= this.player.x + 16;
			const up = position.y < this.player.y;
			const down = position.y >= this.player.y + 16;
			const lastCursor = ct;
			let c;
			if (up)
				c = left ? CursorType.ArrowUpLeft2D : right ? CursorType.ArrowUpRight2D : CursorType.ArrowUp2D;
			else if (down)
				c = left ? CursorType.ArrowDownLeft2D : right ? CursorType.ArrowDownRight2D : CursorType.ArrowDown2D;
			else
				c = left ? CursorType.ArrowLeft2D : right ? CursorType.ArrowRight2D : CursorType.Zzz;
			game.cursor.cursorType = c;
			if (buttons === MouseButtons.Left && lastCursor !== c)
				this.#updateMovement();
		} else if (ct >= CursorType.ArrowUp2D && ct <= CursorType.ArrowTurnLeft3D) {
			game.cursor.cursorType = CursorType.Sword;
			this.#updateMovement();
		}
	}

	#fillMap(scrollOffsetX, scrollOffsetY, force = false) {
		const map = this.map;
		if (scrollOffsetX < MinScrollX)
			scrollOffsetX = MinScrollX;
		else if (scrollOffsetX + TilesPerRow > map.width - MinScrollX)
			scrollOffsetX = map.width - TilesPerRow - MinScrollX;
		if (scrollOffsetY < MinScrollY)
			scrollOffsetY = MinScrollY;
		else if (scrollOffsetY + TileRows > map.height - MinScrollY)
			scrollOffsetY = map.height - TileRows - MinScrollY;

		// Small maps (smaller than the view) would produce negative offsets
		scrollOffsetX = Math.max(0, Math.min(scrollOffsetX, map.width - TilesPerRow));
		scrollOffsetY = Math.max(0, Math.min(scrollOffsetY, map.height - TileRows));

		if (!force && scrollOffsetX === this.lastScrollX && scrollOffsetY === this.lastScrollY)
			return;

		this.lastScrollX = scrollOffsetX;
		this.lastScrollY = scrollOffsetY;
		const portion = { x: scrollOffsetX, y: scrollOffsetY, w: TilesPerRow, h: TileRows };

		for (let y = 0; y < TileRows; y++) {
			for (let x = 0; x < TilesPerRow; x++) {
				const gridIndex = x + y * TilesPerRow;
				const mx = x + scrollOffsetX, my = y + scrollOffsetY;
				const tile = mx < map.width && my < map.height ? map.tiles[mx + my * map.width] : null;
				if (tile && tile.underlay !== 0)
					this.#createTileSprite(this.underlay, gridIndex, OffsetX + x * TileWidth, OffsetY + y * TileHeight, tile.underlay);
				else if (this.underlay.has(gridIndex))
					this.underlay.get(gridIndex).visible = false;
				if (tile && tile.overlay !== 0)
					this.#createTileSprite(this.overlay, gridIndex, OffsetX + x * TileWidth, OffsetY + y * TileHeight, tile.overlay, 2 * RenderOrderOffset);
				else if (this.overlay.has(gridIndex))
					this.overlay.get(gridIndex).visible = false;
			}
		}

		const p = this.game.state.partyPosition;
		const playerTile = map.tiles[p.x + p.y * map.width];

		const getBaseLineOffset = tile => {
			let baseLineOffset = 3 * RenderOrderOffset;
			let visible = true;
			if (tile.underlay !== 0 && (this.#getTileInfo(tile.underlay).flags & TileFlags.PartyInvisible))
				visible = false;
			if (tile.overlay !== 0) {
				const flags = this.#getTileInfo(tile.overlay).flags;
				if (flags & TileFlags.PartyInvisible)
					visible = false;
				if (flags & TileFlags.Foreground)
					baseLineOffset = RenderOrderOffset;
			}
			return { baseLineOffset, visible };
		};

		const playerInfo = getBaseLineOffset(playerTile);
		const atlas = this.game.getRenderLayer(Layer.Map2D).config.texture;
		const tileset = this.tilesets[map.tileset - 1];

		for (let i = 0; i < this.characters.length; i++) {
			const character = this.characters[i];
			const sprite = this.mapCharacters[i];
			const cp = character.position;
			if (cp.x < 0 || cp.y < 0 || cp.x >= map.width || cp.y >= map.height) {
				sprite.visible = false;
				continue;
			}
			const tile = map.tiles[cp.x + cp.y * map.width];
			let { baseLineOffset, visible } = getBaseLineOffset(tile);
			if (visible && !this.game.state.isMapCharacterActive(map.index, 1 + character.index))
				visible = false;
			sprite.visible = visible && rectContains(portion, cp);
			if (sprite.visible) {
				sprite.x = OffsetX + (cp.x - portion.x) * TileWidth;
				sprite.y = OffsetY + (cp.y - portion.y) * TileHeight;
				sprite.baseLineOffset = baseLineOffset;
				const tileInfo = tileset.tiles[character.icon - 1];
				sprite.textureOffset = atlas.getOffset(this.tileGraphicOffset + tileInfo.imageIndex);
			}
		}

		if (playerInfo.visible) {
			const tileInfo = tileset.tiles[tileset.playerSpriteIndex - 1];
			this.player.baseLineOffset = playerInfo.baseLineOffset;
			this.player.textureOffset = atlas.getOffset(this.tileGraphicOffset + tileInfo.imageIndex + this.game.state.travelType * 4 + this.game.state.partyDirection);
			this.player.x = OffsetX + (p.x - scrollOffsetX) * TileWidth;
			this.player.y = OffsetY + (p.y - scrollOffsetY) * TileHeight;
		}
		this.player.visible = playerInfo.visible;
	}

	#initPlayer() {
		const layer = this.game.getRenderLayer(Layer.Map2D);
		const tileset = this.tilesets[this.map.tileset - 1];
		const tileInfo = tileset.tiles[tileset.playerSpriteIndex - 1];
		const p = this.game.state.partyPosition;
		this.player = layer.createSprite();
		this.player.textureOffset = layer.config.texture.getOffset(this.tileGraphicOffset + tileInfo.imageIndex);
		this.player.x = OffsetX + p.x * TileWidth;
		this.player.y = OffsetY + p.y * TileHeight;
		this.player.paletteIndex = this.game.paletteIndexProvider.getTilesetPaletteIndex(this.map.tileset);
		this.player.width = TileWidth;
		this.player.height = TileHeight;
		this.player.visible = true;
		this.moveX = 0;
		this.moveY = 0;
		this.#fillMap(this.lastScrollX, this.lastScrollY, true);
	}

	#showOuchBubble() {
		const game = this.game;
		game.deleteDelayedActions(this.ouchBubbleDeleteActionIndex);
		if (this.ouchBubble)
			this.ouchBubble.visible = false;
		const layer = game.getRenderLayer(Layer.UI);
		const p = game.state.partyPosition;
		this.ouchBubble = layer.createSprite();
		this.ouchBubble.textureOffset = layer.config.texture.getOffset(game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.SmallOuch));
		this.ouchBubble.x = OffsetX + (p.x - this.lastScrollX) * TileWidth + 14;
		this.ouchBubble.y = OffsetY + (p.y - this.lastScrollY) * TileHeight - 10;
		this.ouchBubble.paletteIndex = game.paletteIndexProvider.getTilesetPaletteIndex(this.map.tileset);
		const [w, h] = UIGraphicInfo[UIGraphic.SmallOuch];
		this.ouchBubble.width = w;
		this.ouchBubble.height = h;
		this.ouchBubble.displayLayer = 50;
		this.ouchBubble.visible = true;
		this.ouchBubbleDeleteActionIndex = game.addDelayedAction(OuchDisplayTime, () => {
			if (this.ouchBubble) {
				this.ouchBubble.visible = false;
				this.ouchBubble = null;
			}
		});
	}

	#clearMap() {
		this.underlay.forEach(t => t.visible = false);
		this.underlay.clear();
		this.overlay.forEach(t => t.visible = false);
		this.overlay.clear();
	}

	#createTileSprite(mapLayer, gridIndex, x, y, index, baseLineOffset = 0) {
		const layer = this.game.getRenderLayer(Layer.Map2D);
		let sprite = mapLayer.get(gridIndex);
		if (!sprite) {
			sprite = layer.createAnimatedSprite();
			sprite.x = x;
			sprite.y = y;
			sprite.width = TileWidth;
			sprite.height = TileHeight;
			sprite.opaque = mapLayer === this.underlay;
			mapLayer.set(gridIndex, sprite);
		}
		const tileInfo = this.#getTileInfo(index);
		const newOffset = layer.config.texture.getOffset(this.tileGraphicOffset + tileInfo.imageIndex);
		if (sprite.tileIndex !== index) {
			sprite.tileIndex = index;
			sprite.frameCount = Math.max(1, tileInfo.frameCount);
			sprite.waveAnimation = (tileInfo.flags & TileFlags.WaveAnimation) !== 0;
			sprite.animationOffset = (tileInfo.flags & TileFlags.RandomAnimation) ? Math.floor(Math.random() * 16) : 0;
			sprite.currentFrameIndex = 0;
		}
		sprite.textureOffset = newOffset;
		sprite.paletteIndex = this.game.paletteIndexProvider.getTilesetPaletteIndex(this.map.tileset);
		sprite.baseLineOffset = baseLineOffset;
		sprite.visible = true;
		return sprite;
	}

	#getTicksPerStep() {
		return ((this.map?.flags ?? 0) & MapFlags.Wilderness) ? TicksPerStep[this.game.state.travelType] : CityTicksPerStep;
	}

	#updateWorldMap(mapIndex = null) {
		let newTopLeft = mapIndex ?? this.worldMap?.upperLeftMapIndex;
		if (newTopLeft == null)
			throw new Error('No world map active and no map index given.');

		let p = this.game.state.partyPosition;
		let changed = mapIndex != null;

		if (p.x < WorldMapPreloadOffset) {
			newTopLeft = getWorldMapIndex(newTopLeft, -1, 0);
			p = { x: p.x + WorldMapWidth, y: p.y };
			changed = true;
		} else if (p.x >= 2 * WorldMapWidth - WorldMapPreloadOffset) {
			newTopLeft = getWorldMapIndex(newTopLeft, 1, 0);
			p = { x: p.x - WorldMapWidth, y: p.y };
			changed = true;
		}
		if (p.y < WorldMapPreloadOffset) {
			newTopLeft = getWorldMapIndex(newTopLeft, 0, -1);
			p = { x: p.x, y: p.y + WorldMapHeight };
			changed = true;
		} else if (p.y >= 2 * WorldMapHeight - WorldMapPreloadOffset) {
			newTopLeft = getWorldMapIndex(newTopLeft, 0, 1);
			p = { x: p.x, y: p.y - WorldMapHeight };
			changed = true;
		}

		if (changed) {
			const indices = [
				newTopLeft,
				getWorldMapIndex(newTopLeft, 1, 0),
				getWorldMapIndex(newTopLeft, 0, 1),
				getWorldMapIndex(newTopLeft, 1, 1),
			];
			// Keep the last position consistent (it is used to push the party back)
			const lastPos = this.game.state.lastPosition;
			const dx = p.x - this.game.state.partyPosition.x, dy = p.y - this.game.state.partyPosition.y;
			this.game.state.setPartyPosition(p.x, p.y);
			this.game.state.lastPosition = { x: lastPos.x + dx, y: lastPos.y + dy };
			const firstTime = this.worldMap == null;
			this.worldMap ??= new WorldMap();
			const getMap = index => {
				if (index === mapIndex && firstTime)
					return this.game.assets.loadMap(index);
				return this.worldMap.getMapByIndex(index) ?? this.game.assets.loadMap(index);
			};
			this.worldMap.setMaps(indices.map(getMap), indices);
			this.map = this.worldMap;
			this.game.state.mapIndex = newTopLeft;
		}
	}

	#loadMap(index) {
		const game = this.game;
		this.lastScrollX = -1;
		this.lastScrollY = -1;
		this.map = applyTileChanges2D(game, game.assets.loadMap(index));
		const isWorldMap = (this.map.flags & MapFlags.Wilderness) !== 0;

		if (isWorldMap) {
			this.worldMap = null;
			this.#updateWorldMap(index);
			game.playSong(WorldMapSongs[game.state.travelType] ?? WorldMapSong);
		} else {
			if (this.map.songIndex !== 0)
				game.playSong(this.map.songIndex); // the C# port adds 1 here, but the maps store the song number directly
			game.state.mapIndex = index;
			this.worldMap = null;
		}

		this.tileGraphicOffset = this.map.tileset === 1 ? 0 : this.tilesets[0].graphics.length + 1;
		this.palette = game.paletteIndexProvider.getTilesetPaletteIndex(this.map.tileset);

		this.characters = [];
		this.mapCharacters.forEach(c => c.visible = false);
		this.mapCharacters = [];

		const map = this.map;
		for (let i = 0; i < map.characters.length; i++) {
			const data = map.characters[i];
			if (data.index !== 0 && data.icon !== 0) {
				this.characters.push(new MapCharacter(map, i, map.characterPositions[i], game.state,
					(x, y, collisionClass) => this.#canMoveTo(x, y, false, collisionClass)));
				const sprite = game.createSprite(Layer.Map2D, { x: 0, y: 0 }, { width: 16, height: 16 }, 1, this.palette, false);
				sprite.visible = false;
				this.mapCharacters.push(sprite);
			}
		}

		game.state.setIsWorldMap(isWorldMap);
		if (!isWorldMap)
			game.state.travelType = 0;
		game.cursor.paletteIndex = this.palette;
		this.requestButtonGridPaletteUpdate();
		this.requestButtonSetup(); // buttons depend on the map (camping)
		this.#setLayout();
		if (this.player) {
			this.player.paletteIndex = this.palette;
			this.#fillMap(this.lastScrollX, this.lastScrollY, true);
		}
	}

	#getTileFlags(x, y) {
		const tile = this.map.tiles[x + y * this.map.width];
		const underlayFlags = tile.underlay === 0 ? 0 : this.#getTileInfo(tile.underlay).flags;
		if (tile.overlay === 0)
			return underlayFlags;
		const overlayFlags = this.#getTileInfo(tile.overlay).flags;
		if (overlayFlags & TileFlags.UnderlayHasPriority)
			return underlayFlags;
		return overlayFlags;
	}

	#canMoveTo(x, y, player, collisionClass) {
		if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height)
			return false;
		if (!player) {
			if (this.characters.some(c => c.position.x === x && c.position.y === y))
				return false;
			const p = this.game.state.partyPosition;
			if (p.x === x && p.y === y)
				return false;
		}
		const flags = this.#getTileFlags(x, y);
		if (flags & TileFlags.BlockAllMovement)
			return false;
		return (flags & (1 << (8 + collisionClass))) !== 0;
	}

	/** Called by the ChangeTile event */
	tileChanged(mapIndex, x, y, tileIndex) {
		const map = this.worldMap ? this.worldMap.maps.find(m => m.index === mapIndex) : this.map;
		if (!map)
			return;
		const tile = map.tiles[(x - 1) + (y - 1) * map.width];
		if (tile)
			tile.overlay = tileIndex;
		if (this.worldMap)
			this.worldMap.setMaps(this.worldMap.maps, this.worldMap.maps.map(m => m.index));
		this.#fillMap(this.lastScrollX, this.lastScrollY, true);
	}

	refreshView() {
		this.#fillMap(this.lastScrollX, this.lastScrollY, true);
	}
}


/** Applies the saved tile changes to a (cached) 2D map */
export function applyTileChanges2D(game, map) {
	for (const t of game.state.getTileChanges(map.index)) {
		const tile = map.tiles[(t.x - 1) + (t.y - 1) * map.width];
		if (tile)
			tile.overlay = t.tileIndex;
	}
	return map;
}
