// Port of Amberstar.Game.Screens.Map3DScreen.
import { ButtonGridScreen } from './buttonGridScreen.js';
import { ScreenType, ScreenFadeType } from './screen.js';
import { ButtonGrid } from '../ui/controls.js';
import { TextAlignment, TransparentPaper } from '../ui/text.js';
import { Layer } from '../../engine/layerSetup.js';
import { ButtonType, CursorType, Direction, EventType, MapFlags, Layout, LabBlockType, BlockFacing, PerspectiveLocation, hourToDayTime, DayTime, MapCharacterType, directionOffset } from '../../data/enums.js';
import { EventTrigger, createEvent } from '../events.js';
import { MapCharacter } from '../mapCharacter.js';
import { MonsterEncounters } from '../monsterEncounters.js';
import { Key, MouseButtons } from '../keys.js';
import { rectContains } from '../util.js';
import { canMove } from '../../data/characters.js';
import { ButtonLayout } from '../game.js';

// [x, y] offsets per direction for the 14 perspective locations
const PerspectiveMappings = {
	[Direction.North]: [[-1, -3], [1, -3], [0, -3], [-1, -2], [1, -2], [0, -2], [-1, -1], [1, -1], [0, -1], [-1, 0], [1, 0], [0, 0], [-2, -3], [2, -3]],
	[Direction.East]: [[3, -1], [3, 1], [3, 0], [2, -1], [2, 1], [2, 0], [1, -1], [1, 1], [1, 0], [0, -1], [0, 1], [0, 0], [3, -2], [3, 2]],
	[Direction.South]: [[1, 3], [-1, 3], [0, 3], [1, 2], [-1, 2], [0, 2], [1, 1], [-1, 1], [0, 1], [1, 0], [-1, 0], [0, 0], [2, 3], [-2, 3]],
	[Direction.West]: [[-3, 1], [-3, -1], [-3, 0], [-2, 1], [-2, -1], [-2, 0], [-1, 1], [-1, -1], [-1, 0], [0, 1], [0, -1], [0, 0], [-3, 2], [-3, -2]],
};

const TicksPerStep = 16;
const TicksPerTurn = 16;
const AnimationTicksPerFrame = 25;
const ViewWidth = 144;
const ViewHeight = 144;
const OffsetX = 32;
const OffsetY = 49;
const SkyTransparentColorIndex = 11;
const LabTileFlags = { BlockAllMovement: 0x80 };

export class Map3DScreen extends ButtonGridScreen {
	constructor() {
		super();
		this.map = null;
		this.labData = null;
		this.skyGradient = [];
		this.images = [];
		this.characters = [];
		this.currentTicks = 0;
		this.lastMoveTicks = 0;
		this.lastTurnTicks = 0;
		this.lastAnimationFrame = 0;
		this.palette = 0;
		this.mouseIsDown = false;
		this.mapNameText = null;
		this.boundMinuteChanged = () => this.#minuteChanged();
		this.encounters = new MonsterEncounters();
	}

	get type() { return ScreenType.Map3D; }
	get fadeType() { return ScreenFadeType.None; }
	get buttonGridPaletteIndex() { return this.palette; }

	keypadPressesButton(index) {
		return this.game.buttonLayout === ButtonLayout.Actions || index === 4 || index === 6 || index === 8;
	}

	mapChanged() {
		this.#loadMap(this.game.state.mapIndex);
		this.#showMapName();
		this.#afterMove();
	}

	init() {
		super.init();
		this.skyGradients = this.game.assets.loadSkyGradients();
	}

	screenPushed(screen) {
		super.screenPushed(screen);
		if (!screen.transparent) {
			this.images.forEach(i => i.visible = false);
			this.skyGradient.forEach(g => g.visible = false);
			this.mapNameText.visible = false;
		}
		this.mouseIsDown = false;
		this.game.pause();
	}

	screenPopped(screen) {
		if (!screen.transparent) {
			this.#setLayout();
			this.images.forEach(i => i.visible = true);
			this.skyGradient.forEach(g => g.visible = true);
			this.mapNameText.visible = true;
		}
		super.screenPopped(screen);
		this.game.resume();
	}

	#setLayout() {
		this.game.setLayout(Layout.Map3D, this.palette);
	}

	#showMapName() {
		this.mapNameText?.delete();
		this.mapNameText = this.game.textManager.create(this.map.name, 15, TransparentPaper, this.palette);
		this.mapNameText.showInArea(OffsetX, OffsetY - this.mapNameText.lineHeight - 3, ViewWidth, ViewHeight, 100, TextAlignment.Center);
	}

	open(closeAction) {
		super.open(closeAction);
		this.currentTicks = 0;
		this.lastMoveTicks = 0;
		this.lastTurnTicks = 0;
		this.mouseIsDown = false;
		this.#setLayout();
		this.#loadMap(this.game.state.mapIndex);
		this.#showMapName();
		this.#afterMove();
		this.game.time.minuteChanged.add(this.boundMinuteChanged);
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
			if ((moveX === 0) !== (moveY === 0))
				this.#checkMove(moveY < 0, moveY > 0, moveX < 0, moveX > 0, false, false);
			else if (moveY === -1)
				this.#checkMove(false, false, false, false, moveX < 0, moveX > 0);
			else
				this.#rotate(moveX > 0);
		} else {
			switch (this.getButtonType(index)) {
				case ButtonType.Eye: {
					const p = game.state.partyPosition;
					const [ox, oy] = directionOffset(game.state.partyDirection);
					const fx = p.x + ox, fy = p.y + oy;
					const map = this.map;
					if (fx >= 0 && fx < map.width && fy >= 0 && fy < map.height) {
						const eventIndex = map.tiles[fx + fy * map.width].event;
						const ev = eventIndex !== 0 ? map.events[eventIndex - 1] : null;
						if (ev && game.isEventActive(map, eventIndex, ev)) {
							const mapEvent = createEvent(ev, eventIndex);
							if (mapEvent)
								game.eventHandler.handleEvent(EventTrigger.Eye, mapEvent, map);
						}
					}
					break;
				}
				case ButtonType.Mouth: {
					const p = game.state.partyPosition;
					const [ox, oy] = directionOffset(game.state.partyDirection);
					const character = this.characters.find(c => {
						const cp = c.position;
						return ((cp.x === p.x && cp.y === p.y) || (cp.x === p.x + ox && cp.y === p.y + oy)) &&
							game.state.isMapCharacterActive(this.map.index, 1 + c.index);
					});
					if (character) {
						if (character.type === MapCharacterType.Person) {
							game.state.currentConversationCharacter = { characterIndex: character.characterIndex, map: character.map, index: character.index };
							if (game.screenHandler.factories[ScreenType.Conversation])
								game.screenHandler.pushScreen(ScreenType.Conversation);
						} else if (character.type === MapCharacterType.Popup) {
							game.showTextMessage(game.getMapText(this.map.index, character.characterIndex - 1));
						}
					}
					break;
				}
				case ButtonType.Camp:
					game.openCamp?.();
					break;
				case ButtonType.Map:
					game.openAutomap?.();
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
			grid.setButton(0, ButtonType.TurnLeft);
			grid.setButton(1, ButtonType.MoveForward);
			grid.setButton(2, ButtonType.TurnRight);
			grid.setButton(3, ButtonType.StrafeLeft);
			grid.setButton(4, ButtonType.Sleep);
			grid.setButton(5, ButtonType.StrafeRight);
			grid.setButton(6, ButtonType.RotateLeft);
			grid.setButton(7, ButtonType.MoveBackward);
			grid.setButton(8, ButtonType.RotateRight);
			const active = game.state.activePartyMember;
			const enable = active ? canMove(active, false) : false;
			for (let i = 0; i < 9; i++)
				if (i !== 4)
					grid.enableButton(i, enable);
		} else {
			grid.setButton(0, ButtonType.Eye);
			grid.setButton(1, ButtonType.Ear);
			grid.enableButton(1, false);
			grid.setButton(2, ButtonType.Mouth);
			grid.setButton(3, ButtonType.UseTransport);
			grid.enableButton(3, false);
			grid.setButton(4, ButtonType.UseMagic);
			grid.enableButton(4, false);
			grid.setButton(5, ButtonType.Camp);
			grid.enableButton(5, !!game.openCamp && ((this.map?.flags ?? 0) & MapFlags.CanCamp) !== 0);
			grid.setButton(6, ButtonType.Map);
			grid.enableButton(6, !!game.openAutomap);
			grid.setButton(7, ButtonType.PartyPositions);
			grid.enableButton(7, false);
			grid.setButton(8, ButtonType.Disk);
			grid.enableButton(8, !!game.openOptions);
		}
	}

	close() {
		this.mouseIsDown = false;
		this.game.time.minuteChanged.remove(this.boundMinuteChanged);
		this.#clearView();
		this.skyGradient.forEach(g => g.visible = false);
		this.skyGradient = [];
		this.characters = [];
		this.mapNameText?.delete();
		super.close();
	}

	#minuteChanged() {
		if (this.game.paused)
			return;
		if ((this.map.flags & MapFlags.City) && this.game.canSee())
			this.#updateSky(true);
		if (this.characters.length !== 0) {
			for (const c of this.characters)
				c.update(this.game);
		}
		this.#updateView();
		this.#checkMonsters();
	}

	#checkMonsters() {
		if (this.game.paused || !this.game.inputEnabled)
			return;
		this.encounters.check(this.game, this.map, this.characters, () => this.#updateView());
	}

	/** Combat background (1-14) from the lab tile flags at the party position */
	combatBackground() {
		const p = this.game.state.partyPosition;
		const flags = this.#getTileFlags(p.x, p.y);
		for (let bit = 16; bit < 30; bit++)
			if (flags & (1 << bit))
				return bit - 15;
		return (this.map.flags & MapFlags.City) ? 8 : 9;
	}

	update(elapsedTicks) {
		if (elapsedTicks === 0)
			return;
		this.currentTicks += elapsedTicks;
		const animationFrame = Math.floor(this.currentTicks / AnimationTicksPerFrame);
		if (animationFrame !== this.lastAnimationFrame) {
			this.lastAnimationFrame = animationFrame;
			for (const image of this.images)
				image.currentFrameIndex++;
		}
		if (this.game.inputEnabled && !this.game.paused && this.currentTicks >= this.lastMoveTicks + TicksPerStep)
			this.#checkMoveByInput();
	}

	#afterMove() {
		const game = this.game;
		const p = game.state.partyPosition;
		this.#updateView();
		game.time.moved3D();
		const map = this.map;
		const eventIndex = map.tiles[p.x + p.y * map.width].event;
		if (eventIndex === 0) {
			this.#checkMonsters();
			return;
		}
		const ev = map.events[eventIndex - 1];
		if (!ev || !game.isEventActive(map, eventIndex, ev))
			return;
		const mapEvent = createEvent(ev, eventIndex);
		if (!mapEvent)
			return;
		if (ev.type === EventType.Place || ev.type === EventType.Door || ev.type === EventType.DoorExit || ev.type === EventType.Chest ||
			ev.type === EventType.Teleporter || ev.type === EventType.MapExit || ev.type === EventType.WindGate || ev.type === EventType.TravelExit) {
			// The C# version resets the position for these events (teleports included). Map exits and teleports
			// change the position anyway, so we only push the party back for blocking events.
			if (ev.type === EventType.Place || ev.type === EventType.Door || ev.type === EventType.DoorExit || ev.type === EventType.Chest) {
				game.state.resetPartyPosition();
				this.#updateView();
			}
		}
		game.eventHandler.handleEvent(EventTrigger.Move, mapEvent, map);
	}

	resetPartyPosition() {
		if (this.game.state.resetPartyPosition())
			this.#updateView();
	}

	#canMoveTo(x, y, player, collisionClass) {
		const map = this.map;
		if (x < 0 || y < 0 || x >= map.width || y >= map.height)
			return false;
		if (!player) {
			if (this.characters.some(c => c.position.x === x && c.position.y === y))
				return false;
			const p = this.game.state.partyPosition;
			if (p.x === x && p.y === y)
				return false;
		} else if (this.characters.some(c => c.position.x === x && c.position.y === y &&
			this.game.state.isMapCharacterActive(map.index, 1 + c.index) && c.type !== MapCharacterType.Popup)) {
			return false;
		}
		const flags = this.#getTileFlags(x, y);
		if (flags & LabTileFlags.BlockAllMovement)
			return false;
		if ((flags & (1 << (8 + collisionClass))) === 0) {
			// Doors and other events can be entered even if the tile blocks movement
			const ev = this.#eventAt(x, y);
			if (ev && (ev.type === EventType.Door || ev.type === EventType.DoorExit || ev.type === EventType.MapExit ||
				ev.type === EventType.Place || ev.type === EventType.Teleporter || ev.type === EventType.Chest))
				return player;
			return false;
		}
		return true;
	}

	#eventAt(x, y) {
		const map = this.map;
		const eventIndex = map.tiles[x + y * map.width].event;
		if (eventIndex === 0)
			return null;
		const ev = map.events[eventIndex - 1];
		return ev && this.game.isEventActive(map, eventIndex, ev) ? ev : null;
	}

	#updateSky(canSee) {
		if (!canSee) {
			this.skyGradient.forEach(g => g.visible = false);
			this.skyGradient = [];
			return;
		}
		const dayTime = hourToDayTime(this.game.state.hour);
		const gradient = this.skyGradients[dayTime];
		const palette = this.game.assets.loadPalette(this.labData.paletteIndex);
		const sky = palette[SkyTransparentColorIndex];
		const skyColor = { r: sky[0], g: sky[1], b: sky[2], a: 255 };
		this.skyGradient.forEach(g => g.visible = false);
		this.skyGradient = [];
		const layer = this.game.getRenderLayer(Layer.Map3D);
		const createSkyLine = (y, color) => {
			const line = layer.createColoredRect();
			line.color = color;
			line.x = OffsetX;
			line.y = OffsetY + y;
			line.width = ViewWidth;
			line.height = 1;
			line.displayLayer = 0;
			line.visible = true;
			this.skyGradient.push(line);
		};
		for (let y = 0; y < gradient.length - 1; y++)
			createSkyLine(y, { r: gradient[y][0], g: gradient[y][1], b: gradient[y][2], a: 255 });
		createSkyLine(gradient.length - 1, skyColor);
	}

	#getTileFlags(x, y) {
		const tile = this.map.tiles[x + y * this.map.width];
		if (tile.labTileIndex === 0)
			return 0;
		return this.map.labTiles[tile.labTileIndex - 1]?.flags ?? 0;
	}

	#checkMove(forward, backward, left, right, turnLeft, turnRight) {
		const dir = this.game.state.partyDirection;
		// forward offsets per direction
		const fwd = directionOffset(dir);
		const rightDir = directionOffset((dir + 1) & 3);
		if (forward && !backward)
			this.#move(fwd[0], fwd[1]);
		else if (backward && !forward)
			this.#move(-fwd[0], -fwd[1]);
		else if (left && !right)
			this.#move(-rightDir[0], -rightDir[1]);
		else if (right && !left)
			this.#move(rightDir[0], rightDir[1]);
		else if (turnLeft && !turnRight)
			this.#turnTo((dir + 3) & 3);
		else if (turnRight && !turnLeft)
			this.#turnTo((dir + 1) & 3);
	}

	#checkMoveByInput() {
		const game = this.game;
		let left = game.isKeyDown('A');
		let right = game.isKeyDown('D');
		let forward = game.isKeyDown(Key.Up) || game.isKeyDown('W');
		let backward = game.isKeyDown(Key.Down) || game.isKeyDown('S');
		let turnLeft = game.isKeyDown(Key.Left) || game.isKeyDown('Q');
		let turnRight = game.isKeyDown(Key.Right) || game.isKeyDown('E');

		if (this.mouseIsDown && game.inputEnabled && !game.paused) {
			switch (game.cursor.cursorType) {
				case CursorType.ArrowForward3D: forward = true; break;
				case CursorType.ArrowBackward3D: backward = true; break;
				case CursorType.ArrowLeft3D: left = true; break;
				case CursorType.ArrowRight3D: right = true; break;
				case CursorType.ArrowTurnLeft3D: turnLeft = true; break;
				case CursorType.ArrowTurnRight3D: turnRight = true; break;
			}
		}

		if (game.buttonLayout === ButtonLayout.Movement) {
			left ||= game.isKeyDown(Key.Keypad4);
			right ||= game.isKeyDown(Key.Keypad6);
			forward ||= game.isKeyDown(Key.Keypad8);
			backward ||= game.isKeyDown(Key.Keypad2);
			turnLeft ||= game.isKeyDown(Key.Keypad7);
			turnRight ||= game.isKeyDown(Key.Keypad9);
		}

		this.#checkMove(forward, backward, left, right, turnLeft, turnRight);
	}

	keyDown(key, modifiers) {
		if (super.keyDown(key, modifiers))
			return true;
		this.#checkMoveByInput();
		return true;
	}

	mouseDown(position, buttons, modifiers) {
		const game = this.game;
		if (buttons === MouseButtons.Right) {
			if (rectContains(ButtonGrid.Area, position)) {
				game.buttonLayout = 1 - game.buttonLayout;
				this.requestButtonSetup();
				return true;
			}
			const slot = game.testPartyPortraitHit(position);
			if (slot != null) {
				game.openInventory(slot);
				return true;
			}
		} else {
			this.mouseIsDown = true;
			const mapArea = { x: OffsetX, y: OffsetY, w: ViewWidth, h: ViewHeight };
			if (rectContains(mapArea, position)) {
				const ct = game.cursor.cursorType;
				if (ct === CursorType.Zzz) {
					game.time.tick();
					return true;
				} else if (ct === CursorType.FullTurnLeft || ct === CursorType.FullTurnRight) {
					this.#rotate(ct === CursorType.FullTurnRight);
					return true;
				} else if (ct >= CursorType.ArrowForward3D && ct <= CursorType.ArrowTurnLeft3D) {
					this.lastMoveTicks = -TicksPerStep;
					this.lastTurnTicks = -TicksPerTurn;
					this.#checkMoveByInput();
					return true;
				}
			}
		}
		return super.mouseDown(position, buttons, modifiers);
	}

	mouseUp(position, buttons, modifiers) {
		this.mouseIsDown = false;
		return super.mouseUp(position, buttons, modifiers);
	}

	mouseMove(position, buttons) {
		super.mouseMove(position, buttons);
		const game = this.game;
		const mapArea = { x: OffsetX, y: OffsetY, w: ViewWidth, h: ViewHeight };
		if (rectContains(mapArea, position)) {
			const rx = position.x - mapArea.x, ry = position.y - mapArea.y;
			const left = rx < mapArea.w / 4, right = rx >= mapArea.w * 3 / 4;
			const up = ry < mapArea.h / 4, down = ry >= mapArea.h * 3 / 4;
			let c;
			if (up)
				c = left ? CursorType.ArrowTurnLeft3D : right ? CursorType.ArrowTurnRight3D : CursorType.ArrowForward3D;
			else if (down)
				c = left ? CursorType.FullTurnLeft : right ? CursorType.FullTurnRight : CursorType.ArrowBackward3D;
			else
				c = left ? CursorType.ArrowLeft3D : right ? CursorType.ArrowRight3D : CursorType.Zzz;
			game.cursor.cursorType = c;
		} else if (game.cursor.cursorType !== CursorType.Sword) {
			game.cursor.cursorType = CursorType.Sword;
		}
	}

	#move(x, y) {
		if (this.currentTicks - this.lastMoveTicks < TicksPerStep)
			return;
		this.lastMoveTicks = this.currentTicks;
		const p = this.game.state.partyPosition;
		const tx = p.x + x, ty = p.y + y;
		if (this.#canMoveTo(tx, ty, true, 0)) {
			this.game.state.setPartyPosition(tx, ty);
			this.#afterMove();
		}
	}

	#turnTo(newDirection) {
		if (this.currentTicks - this.lastTurnTicks < TicksPerTurn)
			return;
		this.lastTurnTicks = this.currentTicks;
		this.game.state.partyDirection = newDirection;
		this.#updateView();
	}

	#rotate(right) {
		// Full turn (180°) - not implemented in the C# port yet
		this.lastTurnTicks = this.currentTicks;
		this.game.state.partyDirection = (this.game.state.partyDirection + 2) & 3;
		this.#updateView();
	}

	#facingByRelativeOffset(ox, oy) {
		switch (this.game.state.partyDirection) {
			case Direction.North: return ox < 0 ? BlockFacing.LeftOfPlayer : ox > 0 ? BlockFacing.RightOfPlayer : BlockFacing.FacingPlayer;
			case Direction.East: return oy < 0 ? BlockFacing.LeftOfPlayer : oy > 0 ? BlockFacing.RightOfPlayer : BlockFacing.FacingPlayer;
			case Direction.South: return ox < 0 ? BlockFacing.RightOfPlayer : ox > 0 ? BlockFacing.LeftOfPlayer : BlockFacing.FacingPlayer;
			case Direction.West: return oy < 0 ? BlockFacing.RightOfPlayer : oy > 0 ? BlockFacing.LeftOfPlayer : BlockFacing.FacingPlayer;
			default: return BlockFacing.FacingPlayer;
		}
	}

	refreshView() {
		this.#updateView();
	}

	#updateView() {
		const game = this.game;
		const p = game.state.partyPosition;
		this.#clearView();

		const offsets = PerspectiveMappings[game.state.partyDirection];
		const layer = game.getRenderLayer(Layer.Map3D);
		const atlas = layer.config.texture;
		const gip = game.graphicIndexProvider;
		const labData = this.labData;
		const map = this.map;
		let displayLayer = 40;

		const createImage = () => layer.createAnimatedSprite();

		// Floor
		const floor = game.assets.loadBackground(labData.floorIndex);
		const floorSprite = createImage();
		floorSprite.width = floor.width;
		floorSprite.height = floor.height;
		floorSprite.x = OffsetX;
		floorSprite.y = OffsetY + ViewHeight - floor.height;
		floorSprite.textureOffset = atlas.getOffset(gip.getBackgroundGraphicIndex(labData.floorIndex));
		floorSprite.opaque = true;
		floorSprite.displayLayer = 5;
		floorSprite.paletteIndex = this.palette;
		// Floor is mirrored depending on the position (like in the original)
		floorSprite.mirrorX = ((p.x ^ p.y) & 1) === 1;
		floorSprite.visible = true;
		this.images.push(floorSprite);

		const hasSky = (map.flags & MapFlags.City) !== 0;
		const dayTime = hourToDayTime(game.state.hour);
		const cloud = game.assets.loadCloud(labData.ceilingIndex);

		if (hasSky && cloud && (dayTime === DayTime.Day || dayTime === DayTime.Dusk)) {
			const s = createImage();
			s.width = cloud.width;
			s.height = cloud.height;
			s.x = OffsetX;
			s.y = OffsetY;
			s.textureOffset = atlas.getOffset(gip.getCloudGraphicIndex(labData.ceilingIndex));
			s.transparentColorIndex = SkyTransparentColorIndex;
			s.displayLayer = 12;
			s.paletteIndex = this.palette;
			s.mirrorX = game.state.partyDirection === Direction.North || game.state.partyDirection === Direction.South;
			s.visible = true;
			this.images.push(s);
		} else {
			const ceiling = game.assets.loadBackground(labData.ceilingIndex);
			const s = createImage();
			s.width = ceiling.width;
			s.height = ceiling.height;
			s.x = OffsetX;
			s.y = OffsetY;
			s.textureOffset = atlas.getOffset(gip.getBackgroundGraphicIndex(labData.ceilingIndex));
			s.opaque = !hasSky;
			s.transparentColorIndex = hasSky ? SkyTransparentColorIndex : 0;
			s.displayLayer = 10;
			s.paletteIndex = this.palette;
			if (labData.outdoors)
				s.mirrorX = game.state.partyDirection === Direction.North || game.state.partyDirection === Direction.South;
			s.visible = true;
			this.images.push(s);
		}

		for (let i = 0; i < 14; i++) {
			let perspectiveLocation = i;
			const [ox, oy] = offsets[i];
			const x = p.x + ox, y = p.y + oy;
			if (x < 0 || y < 0 || x >= map.width || y >= map.height)
				continue;
			const tile = map.tiles[x + y * map.width];

			const drawBlock = (labBlock, customRenderX = null) => {
				if (!labBlock)
					return;
				if (labBlock.type !== LabBlockType.Wall && i > 11)
					return;
				if (i > 11) {
					displayLayer = 20 + (i % 12) * 10;
					perspectiveLocation = i % 12;
				}
				let location = perspectiveLocation;
				if (labBlock.type === LabBlockType.Object) {
					// Objects only have center row perspectives. Side rows reuse them with a custom x position.
					if (location === PerspectiveLocation.Left1 || location === PerspectiveLocation.Right1)
						return;
					if (location < PerspectiveLocation.Left1)
						location = Math.floor(location / 3) * 3 + 2;
				}
				const facing = labBlock.type === LabBlockType.Overlay ? this.#facingByRelativeOffset(ox, oy) : BlockFacing.FacingPlayer;
				const displayPlayerAdd = facing === BlockFacing.FacingPlayer ? 10 : 5;

				const addBlockSprite = f => {
					const perspective = labBlock.perspectives.find(pp => pp.location === location && pp.facing === f);
					if (!perspective)
						return;
					let renderX = customRenderX;
					if (renderX === OffsetX + ViewWidth)
						renderX -= Math.floor(perspective.frames[0].width / 2);
					const graphicIndex = gip.getLabBlockGraphicIndex(labBlock.index, location, f);
					if (graphicIndex == null)
						return;
					const textureOffset = atlas.getOffset(graphicIndex);
					if (perspective.special) {
						let s = createImage();
						s.frameCount = 1;
						s.width = perspective.frames[0].width;
						s.height = perspective.frames[0].height;
						s.displayLayer = displayLayer;
						s.paletteIndex = this.palette;
						s.textureOffset = textureOffset;
						s.x = OffsetX + perspective.renderX;
						s.y = OffsetY + perspective.renderY;
						s.visible = true;
						this.images.push(s);
						displayLayer += Math.floor(displayPlayerAdd / 2);
						s = createImage();
						s.frameCount = perspective.frames.length - 1;
						s.width = perspective.frames[1].width;
						s.height = perspective.frames[1].height;
						s.displayLayer = displayLayer;
						s.paletteIndex = this.palette;
						s.textureOffset = { x: textureOffset.x + perspective.frames[0].width, y: textureOffset.y };
						s.x = OffsetX + perspective.special.x;
						s.y = OffsetY + perspective.special.y;
						s.visible = true;
						this.images.push(s);
					} else {
						const s = createImage();
						s.frameCount = perspective.frames.length;
						s.width = perspective.frames[0].width;
						s.height = perspective.frames[0].height;
						s.displayLayer = displayLayer;
						s.paletteIndex = this.palette;
						s.textureOffset = textureOffset;
						s.x = renderX ?? (OffsetX + perspective.renderX);
						s.y = OffsetY + perspective.renderY;
						s.visible = true;
						this.images.push(s);
					}
					displayLayer = Math.min(255, displayLayer + displayPlayerAdd);
				};

				if (facing !== BlockFacing.FacingPlayer)
					addBlockSprite(facing);
				addBlockSprite(BlockFacing.FacingPlayer);
			};

			if (tile.labTileIndex !== 0) {
				const labTile = map.labTiles[tile.labTileIndex - 1];
				if (labTile) {
					const primary = labData.labBlocks[labTile.primaryLabBlockIndex - 1];
					if (primary && primary.type === LabBlockType.Overlay && labTile.secondaryLabBlockIndex !== 0)
						drawBlock(labData.labBlocks[labTile.secondaryLabBlockIndex - 1]);
					if (labTile.primaryLabBlockIndex !== 1)
						drawBlock(primary);
				}
			}

			const character = this.characters.find(c => c.position.x === x && c.position.y === y &&
				game.state.isMapCharacterActive(map.index, 1 + c.index));
			if (character && i <= 11) {
				const objectBlock = labData.labBlocks[character.icon - 1];
				let customX = null;
				if (perspectiveLocation % 3 === 0)
					customX = OffsetX;
				else if (perspectiveLocation % 3 === 1)
					customX = OffsetX + ViewWidth;
				drawBlock(objectBlock, customX);
			}
		}
	}

	#clearView() {
		this.images.forEach(i => i.visible = false);
		this.images = [];
	}

	#loadMap(index) {
		const game = this.game;
		this.map = applyTileChanges3D(game, game.assets.loadMap(index));
		this.labData = game.assets.loadLabData(this.map.tileset);
		this.palette = game.paletteIndexProvider.getLabyrinthPaletteIndex(this.labData.paletteIndex - 1);
		this.characters = [];
		const map = this.map;
		for (let i = 0; i < map.characters.length; i++) {
			const data = map.characters[i];
			if (data.index !== 0 && data.icon !== 0)
				this.characters.push(new MapCharacter(map, i, map.characterPositions[i], game.state,
					(x, y, cc) => this.#canMoveTo(x, y, false, cc)));
		}
		this.skyGradient.forEach(g => g.visible = false);
		this.skyGradient = [];
		if ((map.flags & MapFlags.City) && game.canSee())
			this.#updateSky(true);
		if (map.songIndex !== 0)
			game.playSong(map.songIndex);
		game.state.mapIndex = index;
		game.state.setIsWorldMap(false);
		game.state.travelType = 0;
		game.cursor.paletteIndex = this.palette;
		this.requestButtonGridPaletteUpdate();
		this.requestButtonSetup(); // buttons depend on the map (camping)
		this.#setLayout();
	}

	/** Called by the ChangeTile event */
	tileChanged(mapIndex, x, y, tileIndex) {
		if (mapIndex !== this.map.index)
			return;
		const tile = this.map.tiles[(x - 1) + (y - 1) * this.map.width];
		if (tile)
			tile.labTileIndex = tileIndex;
		this.#updateView();
	}
}

export function applyTileChanges3D(game, map) {
	for (const t of game.state.getTileChanges(map.index)) {
		const tile = map.tiles[(t.x - 1) + (t.y - 1) * map.width];
		if (tile)
			tile.labTileIndex = t.tileIndex;
	}
	return map;
}
