// Port of Amberstar.Game.Game (Game.cs and the GameRoutines partial classes).
import { Layer, BuiltinPalette } from '../engine/layerSetup.js';
import { GameState, Time } from './gameState.js';
import { ScreenHandler, ScreenType } from './screens/screen.js';
import { TextManager, Label } from './ui/text.js';
import { Cursor } from './ui/controls.js';
import { SortedStack, random as rnd, limit } from './util.js';
import { Key, keyByChar } from './keys.js';
import { UIGraphic, Direction } from '../data/enums.js';
import { Text } from '../data/text.js';
import {
	Condition, Attribute, isDead, getConditions, hasAnyConditionOf, addCondition, damage, maxWeight,
	conditionsToStatusIcons, ItemFlags,
} from '../data/characters.js';
import { writeSavegame, readSavegame } from '../data/savegame.js';
import { DataReader } from '../data/reader.js';
import { Message } from './messages.js';
import { createSaveData, readSaveData, getSlots, getSlot, writeSlot, getLastSlot, setLastSlot } from './saveSystem.js';

export const MaxPartyMembers = 6;
export const TicksPerSecond = 60;
export const GoldWeight = 10;
export const ButtonLayout = { Movement: 0, Actions: 1 };

const TicksPerStatusIconChange = TicksPerSecond;

/** The 19 songs of Amberstar (names from AMBERDEV). Maps store the song number directly. */
export const Song = {
	CityWalk: 1, HighSeas: 2, HorseSong: 3, FlyingHigh: 4, TravellersTune: 5, IrishSpring: 6, GwensLament: 7,
	EriksRevenge: 8, Fanfares: 9, OdeToSchnism: 10, MistyOrcHop: 11, Dreamcave: 12, MysticMoments: 13,
	LurkingHorror: 14, BardDance: 15, MinorQuarrels: 16, Lullaby: 17, FunkyDungeon: 18, HastaLaVista: 19,
};

export const TrapType = { None: 0, DamageTrap: 1, PoisonNeedle: 2, PoisonGasCloud: 3, BlindingFlash: 4, ParalyzingGasCloud: 5, StoneGaze: 6, Disease: 7 };

const TrapTable = {
	[TrapType.DamageTrap]: { activePlayerOnly: false, condition: Condition.None, message: Message.TrapExplosion },
	[TrapType.PoisonNeedle]: { activePlayerOnly: true, condition: Condition.Poisoned, message: Message.TrapPoisonedArrows },
	[TrapType.PoisonGasCloud]: { activePlayerOnly: true, condition: Condition.Poisoned, message: Message.TrapPoisonGas },
	[TrapType.BlindingFlash]: { activePlayerOnly: false, condition: Condition.Blind, message: Message.TrapBlindingFlash },
	[TrapType.ParalyzingGasCloud]: { activePlayerOnly: false, condition: Condition.Stunned, message: Message.TrapSleepGas },
	[TrapType.StoneGaze]: { activePlayerOnly: false, condition: Condition.Petrified, message: Message.TrapBasiliskEye },
	[TrapType.Disease]: { activePlayerOnly: false, condition: Condition.Diseased, message: Message.TrapSpores },
};

export class Game {
	static DefaultFadeTime = 1000;
	static TicksPerSecond = TicksPerSecond;
	static MaxPartyMembers = MaxPartyMembers;
	static random = rnd;

	/**
	 * @param {object} setup result of setupLayers
	 * @param {import('../data/assets.js').AssetProvider} assets
	 */
	constructor(setup, assets, options) {
		this.renderer = setup.renderer;
		this.assets = assets;
		this.graphicIndexProvider = setup.graphicIndexProvider;
		this.paletteIndexProvider = setup.paletteIndexProvider;
		this.paletteColorProvider = setup.paletteColorProvider;
		this.uiClasses = options.uiClasses;
		this.campHandler = options.uiClasses.campHandler;
		this.pressedKeyProvider = options.pressedKeyProvider;
		this.setMousePosition = options.setMousePosition ?? (() => { });
		this.onQuit = options.onQuit ?? (() => { });
		this.eventHandlerFactory = options.eventHandlerFactory;
		this.music = options.music ?? null;
		this.currentSong = 0;
		this.inBattle = false;
		this.songAfterBattle = 0;

		this.totalTime = 0;
		this.lastGameTicks = 0;
		this.gameTicks = 0;
		this.timedActions = new SortedStack();
		this.lastTimedActionKey = -1;

		// fading
		this.fadeArea = null;
		this.fadeColor = { r: 0, g: 0, b: 0, a: 255 };
		this.fadingStartTime = 0;
		this.fadingEndTime = 0;
		this.fadingOut = false;
		this.fadingHold = false;
		this.fadingIn = false;
		this.afterFadeOutAction = null;
		this.afterFadeInAction = null;
		this.fadeActionIndex = -1;

		// input
		this.pressedKeys = null;
		this.mouseTrapArea = null;
		this.lastMousePosition = { x: 0, y: 0 };
		this.inputEnabled = true;
		this.paused = false;

		// data providers
		this.currentText = null;
		this.currentItem = null;
		this.currentAmount = 0;
		this.currentMaxAmount = 0;
		this.currentWord = null;
		this.currentResult = false;

		// UI
		this.portraitSprites = new Array(MaxPartyMembers).fill(null);
		this.playerStatusIcons = new Array(MaxPartyMembers).fill(null);
		this.playerStatusIconIndices = new Array(MaxPartyMembers).fill(0);
		this.playerStatusIconTypes = Array.from({ length: MaxPartyMembers }, () => []);
		this.partyMemberNameBackgrounds = new Array(MaxPartyMembers).fill(null);
		this.partyMemberNames = new Array(MaxPartyMembers).fill(null);
		this.buttonLayout = ButtonLayout.Movement;
		this.portraitArea = { x: 16, y: 1, w: 6 * 48, h: 34 };

		this.screenHandler = new ScreenHandler(this, options.screenFactories);
		this.state = new GameState(options.savegame ?? assets.loadInitialSavegame(), assets);
		this.eventHandler = this.eventHandlerFactory(this);
		this.textManager = new TextManager(this, assets.loadFont(), setup.fontInfoProvider);
		this.time = new Time(this);
		this.cursor = new Cursor(this);

		const uiPaletteIndex = BuiltinPalette.UI;
		this.portraitBackgroundSprite = this.createSprite(Layer.Layout, { x: 0, y: 0 }, { width: 320, height: 36 }, 0, uiPaletteIndex);
		this.layoutSprite = this.createSprite(Layer.Layout, { x: 0, y: 37 }, { width: 320, height: 163 }, 0, 14);

		this.foreachPartyMemberSlot((i) => {
			const position = { x: 16 + i * 48, y: 1 };
			this.portraitSprites[i] = this.createSprite(Layer.UI, position, { width: 32, height: 34 },
				this.graphicIndexProvider.getUIGraphicIndex(UIGraphic.EmptyCharSlot), uiPaletteIndex);
			this.playerStatusIconIndices[i] = 0;
			this.playerStatusIconTypes[i] = [];
			const statusIcon = this.playerStatusIcons[i] = this.createSprite(Layer.UI, { x: position.x + 32, y: position.y }, { width: 16, height: 16 }, 0, uiPaletteIndex);
			statusIcon.displayLayer = 0;
			statusIcon.visible = false;
		});

		this.state.activePartyMemberChanged.add(() => this.updatePartyMembers());

		this.resetStatusIcons();
		this.updatePartyMembers();

		if (options.startInMenu) {
			this.setPartyUIVisible(false);
			this.playSong(Song.Fanfares);
			this.screenHandler.pushScreen(ScreenType.MainMenu);
		} else {
			const startMap = assets.loadMap(this.state.mapIndex);
			this.screenHandler.pushScreen(startMap.is3D ? ScreenType.Map3D : ScreenType.Map2D);
		}
	}

	// ---------------- Game.cs ----------------

	update(delta) {
		this.updateMusic(delta);

		this.totalTime += delta;
		this.gameTicks = Math.round(this.totalTime * TicksPerSecond);

		this.updateFading();

		// Execute all ready timed actions (the original executes one per update,
		// but browsers may run with low frame rates so we process all due ones).
		let action;
		let executed = 0;
		while ((action = this.timedActions.pop(this.gameTicks)) != null) {
			action.action();
			if (++executed > 100)
				break;
		}

		const elapsed = this.paused ? 0 : this.gameTicks - this.lastGameTicks;
		this.lastGameTicks = this.gameTicks;

		this.time.update(elapsed);
		this.screenHandler.activeScreen?.update(elapsed);
		this.updateStatusIcons();
		Label.updateBlinkAnimations(this.gameTicks);

		this.pressedKeys = null;
	}

	canSee() {
		return true; // TODO
	}

	quit() {
		this.onQuit();
		return true;
	}

	// ---------------- Rendering.cs ----------------

	getRenderLayer(layer) { return this.renderer.layers[layer]; }

	createSprite(layer, position, size, textureIndex, paletteIndex, opaque = false) {
		const renderLayer = this.getRenderLayer(layer);
		const sprite = renderLayer.createSprite();
		sprite.textureOffset = renderLayer.config.texture.getOffset(textureIndex);
		sprite.x = position.x;
		sprite.y = position.y;
		sprite.width = size.width;
		sprite.height = size.height;
		sprite.paletteIndex = paletteIndex;
		sprite.opaque = opaque;
		sprite.visible = true;
		return sprite;
	}

	createColoredRect(layer, position, size, color) {
		const rect = this.getRenderLayer(layer).createColoredRect();
		rect.color = { ...color };
		rect.x = position.x;
		rect.y = position.y;
		rect.width = size.width;
		rect.height = size.height;
		rect.visible = true;
		return rect;
	}

	static destroy(drawable) {
		if (drawable) {
			if (typeof drawable.delete === 'function')
				drawable.visible = false;
			else
				drawable.visible = false;
		}
	}

	#fadeIn(durationMs) {
		if (durationMs <= 0)
			return;
		this.fadeColor = { ...this.fadeColor, a: 255 };
		this.fadeArea ??= this.createColoredRect(Layer.TopMost, { x: 0, y: 0 }, { width: 320, height: 200 }, this.fadeColor);
		this.fadingStartTime = performance.now();
		this.fadingEndTime = this.fadingStartTime + durationMs;
		if (this.fadingOut && this.afterFadeOutAction) {
			const a = this.afterFadeOutAction;
			this.afterFadeOutAction = null;
			a();
		}
		this.fadingIn = true;
		this.fadingOut = false;
		this.fadingHold = false;
	}

	#fadeOut(durationMs, color = null) {
		if (this.fadingIn || durationMs <= 0)
			return;
		this.fadeColor = { ...(color ?? { r: 0, g: 0, b: 0 }), a: 0 };
		this.fadeArea ??= this.createColoredRect(Layer.TopMost, { x: 0, y: 0 }, { width: 320, height: 200 }, this.fadeColor);
		this.fadingStartTime = performance.now();
		this.fadingEndTime = this.fadingStartTime + durationMs;
		this.fadingOut = true;
	}

	fade(durationMs, finishAction = null, afterFadeOutAction = null, color = null) {
		if (durationMs <= 1) {
			afterFadeOutAction?.();
			finishAction?.();
			return;
		}

		if (this.fadingOut) {
			afterFadeOutAction?.();
			if (finishAction) {
				if (this.afterFadeInAction) {
					const old = this.afterFadeInAction;
					this.afterFadeInAction = () => { old(); finishAction(); };
				} else {
					this.afterFadeInAction = finishAction;
				}
			}
			return;
		} else if (this.fadingIn) {
			this.afterFadeInAction?.();
			this.fadingIn = false;
			this.fadingOut = false;
			this.fadingHold = false;
		}

		color ??= { r: 0, g: 0, b: 0 };
		let holdTime = Math.floor(durationMs / 10);
		let remainingTime = durationMs - holdTime;
		if (remainingTime % 2 === 1) {
			remainingTime--;
			holdTime++;
		}

		this.fadingHold = true;
		this.afterFadeOutAction = afterFadeOutAction;
		this.afterFadeInAction = finishAction;
		this.#fadeOut(remainingTime / 2, color);
		this.fadeActionIndex = this.addDelayedActionMs(remainingTime / 2 + holdTime, () => this.#fadeIn(remainingTime / 2));
	}

	updateFading() {
		const change = () => {
			const total = this.fadingEndTime - this.fadingStartTime;
			const elapsed = performance.now() - this.fadingStartTime;
			return limit(0, Math.round(elapsed * 255 / total), 255);
		};

		if (!this.fadeArea)
			return;

		if (this.fadingIn) {
			const alpha = 255 - change();
			if (this.fadeArea.color.a !== alpha) {
				this.fadeArea.color = { ...this.fadeArea.color, a: alpha };
				if (alpha === 0) {
					this.fadingIn = false;
					this.fadeArea.visible = false;
					this.fadeArea = null;
					const a = this.afterFadeInAction;
					this.afterFadeInAction = null;
					a?.();
				}
			}
		} else if (this.fadingOut) {
			const alpha = change();
			if (this.fadeArea.color.a !== alpha) {
				this.fadeArea.color = { ...this.fadeArea.color, a: alpha };
				if (alpha === 255) {
					const a = this.afterFadeOutAction;
					this.afterFadeOutAction = null;
					a?.();
					this.fadingOut = false;
					if (!this.fadingHold) {
						this.fadeArea.visible = false;
						this.fadeArea = null;
					}
				}
			}
		}
	}

	// ---------------- Utils.cs ----------------

	static randomRange(min, max) { return rnd(min, max); }

	probe(chance) {
		return this.state.travelType === 6 || chance === 100 || chance >= rnd(1, 100);
	}

	executeNextUpdateCycle(action) {
		this.addDelayedAction(0, action);
	}

	addDelayedAction(delayInTicks, action) {
		const key = ++this.lastTimedActionKey;
		this.timedActions.push(this.gameTicks + delayInTicks, { key, action });
		return key;
	}

	addDelayedActionMs(delayMs, action) {
		return this.addDelayedAction(Math.round(delayMs / 1000 * TicksPerSecond), action);
	}

	deleteDelayedActions(...keys) {
		const set = new Set(keys);
		return this.timedActions.remove(a => set.has(a.key)).length;
	}

	deleteDelayedActionsWhere(filter) {
		return this.timedActions.remove(a => filter(a.key)).length;
	}

	executeAndDeleteDelayedActions(key) {
		const removed = this.timedActions.remove(a => a.key === key);
		removed.forEach(a => a.action());
		return removed.length;
	}

	clearDelayedActions(...exceptKeys) {
		const keep = new Set(exceptKeys.filter(k => k !== -1));
		if (keep.size === 0)
			this.timedActions.clear();
		else
			this.deleteDelayedActionsWhere(k => !keep.has(k));
	}

	getMapText(mapIndex, index) {
		return this.assets.text('map', mapIndex).getTextBlock(index);
	}

	getCurrentMapText(index) {
		return this.getMapText(this.state.getIndexOfMapWithPlayer(), index);
	}

	// ---------------- DataProviders.cs ----------------

	loadUIText(uiText) {
		const bytes = this.assets.uiText(uiText);
		return Text.fromString(String.fromCharCode(...bytes));
	}

	/** UI text as string (may contain ink/paper control codes) */
	uiTextString(uiText) {
		return String.fromCharCode(...this.assets.uiText(uiText));
	}

	/** Fragment index of a name (kinds: race, class, attribute, skill, charInfo, language, condition, itemType, spellSchool, spell, spellLocation, spellTarget) */
	nameFragmentIndex(kind, index) {
		const p = this.assets.program;
		const table = {
			race: p.raceNames, class: p.classNames, attribute: p.attributeNames, skill: p.skillNames,
			charInfo: p.charInfoTexts, language: p.languageNames, condition: p.conditionNames,
			itemType: p.itemTypeNames, spellSchool: p.spellSchoolNames, spell: p.spellNames,
			spellLocation: p.spellLocationNames, spellTarget: p.spellTargetNames,
		}[kind];
		return table?.[index] ?? 0;
	}

	nameText(kind, index) {
		return Text.fromFragmentIndex(this.nameFragmentIndex(kind, index), this.assets.textFragments);
	}

	nameString(kind, index) {
		return this.assets.fragment(this.nameFragmentIndex(kind, index));
	}

	itemName(item) {
		return this.assets.fragment(item.nameIndex);
	}

	loadMessageText(message) {
		return this.assets.message(message);
	}

	getMaxLineLength(text) {
		const lines = text.getLines(100000);
		return Math.max(0, ...lines.map(l => [...l].filter(c => c >= ' ').length));
	}

	getMaxLineWidth(text) {
		return this.getMaxLineLength(text) * this.assets.loadFont().advance;
	}

	// ---------------- UI.cs ----------------

	setLayout(layout, paletteIndex = null) {
		const atlas = this.getRenderLayer(Layer.Layout).config.texture;
		this.layoutSprite.textureOffset = atlas.getOffset(layout);
		if (paletteIndex != null)
			this.layoutSprite.paletteIndex = paletteIndex;
	}

	updatePartyMembers() {
		for (let i = 0; i < MaxPartyMembers; i++)
			this.updatePartyMember(i);
	}

	updatePartyMember(slotIndex) {
		const partyMember = this.state.getPartyMember(1 + slotIndex);
		const layer = this.getRenderLayer(Layer.UI);
		let textureIndex;
		if (partyMember == null)
			textureIndex = this.graphicIndexProvider.getUIGraphicIndex(UIGraphic.EmptyCharSlot);
		else if (isDead(partyMember))
			textureIndex = this.graphicIndexProvider.getUIGraphicIndex(UIGraphic.Skull);
		else
			textureIndex = this.graphicIndexProvider.getPersonPortraitIndex(this.state.partyCharacterIndices[slotIndex])
				?? this.graphicIndexProvider.getUIGraphicIndex(UIGraphic.EmptyCharSlot);

		const portrait = this.portraitSprites[slotIndex];
		portrait.textureOffset = layer.config.texture.getOffset(textureIndex);

		if (this.partyMemberNameBackgrounds[slotIndex])
			this.partyMemberNameBackgrounds[slotIndex].visible = false;
		this.partyMemberNameBackgrounds[slotIndex] = null;
		this.partyMemberNames[slotIndex]?.delete();
		this.partyMemberNames[slotIndex] = null;

		portrait.visible = this.partyUIVisible !== false;
		if (partyMember && this.partyUIVisible !== false) {
			let name = partyMember.name;
			if (name.length > 5)
				name = name.slice(0, 5);
			const namePosition = { x: portrait.x + 2, y: portrait.y + portrait.height - 4 };
			const nameSize = { width: this.textManager.getTextRenderWidth(name), height: 6 };
			const bg = this.partyMemberNameBackgrounds[slotIndex] = this.createColoredRect(Layer.UI, namePosition, nameSize, { r: 0, g: 0, b: 0, a: 255 });
			bg.displayLayer = 5;
			const nameColorIndex = slotIndex === this.state.activePartyMemberIndex - 1 ? 8 : 9;
			const nameText = this.partyMemberNames[slotIndex] = this.textManager.create(name, nameColorIndex);
			nameText.showInArea(namePosition.x, namePosition.y, nameSize.width, nameSize.height, 10);
		}
	}

	setHandIconsByItem(item, count = 1) {
		let takers = 0;
		const weight = item.weight * count;
		this.foreachPartyMemberSlot((index, pm) => {
			if (pm == null)
				this.hideStatusIcon(index);
			else if (pm.totalWeight + weight <= maxWeight(pm)) {
				this.setStatusIcon(index, 8, true, true);
				takers++;
			} else
				this.setStatusIcon(index, 7, true, true);
		});
		return takers;
	}

	setHandIconsByGold(amount) {
		let takers = 0;
		const weight = amount * GoldWeight;
		this.foreachPartyMemberSlot((index, pm) => {
			if (pm == null)
				this.hideStatusIcon(index);
			else if (pm.gold + amount <= 32767 && pm.totalWeight + weight <= maxWeight(pm)) {
				this.setStatusIcon(index, 8, true, true);
				takers++;
			} else
				this.setStatusIcon(index, 7, true, true);
		});
		return takers;
	}

	resetStatusIcons() {
		this.foreachPartyMemberSlot((index, pm) => {
			if (pm == null) {
				this.hideStatusIcon(index);
				return;
			}
			const conditions = getConditions(pm);
			if (conditions === Condition.None)
				this.hideStatusIcon(index);
			else {
				this.playerStatusIconTypes[index] = conditionsToStatusIcons(conditions);
				this.setStatusIcon(index, this.playerStatusIconTypes[index][0], true);
			}
		});
	}

	setStatusIcon(slot, statusIcon, resetAnimationIndex = true, resetAnimationFrames = false) {
		const atlas = this.getRenderLayer(Layer.UI).config.texture;
		if (resetAnimationIndex || resetAnimationFrames)
			this.playerStatusIconIndices[slot] = 0;
		if (resetAnimationFrames)
			this.playerStatusIconTypes[slot] = [statusIcon];
		this.playerStatusIcons[slot].textureOffset = atlas.getOffset(this.graphicIndexProvider.getStatusIconIndex(statusIcon));
		this.playerStatusIcons[slot].visible = true;
	}

	hideStatusIcon(slot) {
		this.playerStatusIconIndices[slot] = 0;
		this.playerStatusIcons[slot].visible = false;
	}

	updateStatusIcons() {
		const atlas = this.getRenderLayer(Layer.UI).config.texture;
		for (const slot of this.getValidPartyMemberSlots()) {
			const types = this.playerStatusIconTypes[slot];
			if (types.length <= 1)
				continue;
			const cycle = types.length * TicksPerStatusIconChange;
			const frame = Math.floor((this.gameTicks % cycle) / TicksPerStatusIconChange);
			this.playerStatusIcons[slot].textureOffset = atlas.getOffset(this.graphicIndexProvider.getStatusIconIndex(types[frame]));
		}
	}

	testPartyPortraitHit(position) {
		if (position.x < 16 || position.x >= 304 || position.y < 1 || position.y >= 35)
			return null;
		const slot = 1 + Math.floor((position.x - 16) / 48);
		return this.state.hasPartyMemberInSlot(slot) ? slot : null;
	}

	/** text may be a string, a Text or a message index (number) */
	showTextMessage(text, nextAction = null) {
		if (typeof text === 'string')
			text = Text.fromString(text);
		else if (typeof text === 'number')
			text = this.assets.message(text);
		this.currentText = text;
		this.eventHandler.currentEvent = null;
		this.screenHandler.pushScreen(ScreenType.TextBox, nextAction);
	}

	askForConfirmation(text, confirmAction, cancelAction = null) {
		if (typeof text === 'string')
			text = Text.fromString(text);
		else if (typeof text === 'number')
			text = this.assets.message(text);
		this.currentText = text;
		this.screenHandler.pushScreen(ScreenType.Confirmation);
		const changed = (newScreen, oldScreen) => {
			if (oldScreen?.type === ScreenType.Confirmation) {
				this.screenHandler.screenChanged.remove(changed);
				if (!this.currentResult)
					cancelAction?.();
				else
					confirmAction?.();
			}
		};
		this.screenHandler.screenChanged.add(changed);
	}

	static formatValueString(text, ...args) {
		let i = 0;
		return text.replace(/[0-9]+/g, m => String(args[i++] ?? '').padStart(m.length, '0'));
	}

	static insertNumberIntoString(text, marker, after, number, maxLength, padding = null) {
		const markerIndex = text.indexOf(marker);
		if (markerIndex === -1)
			throw new Error(`Marker '${marker}' not found in text "${text}".`);
		let insertion = String(number);
		if (insertion.length > maxLength)
			insertion = '*'.repeat(maxLength);
		else if (insertion.length < maxLength && padding != null)
			insertion = insertion.padStart(maxLength, padding);
		const position = after ? markerIndex + marker.length : markerIndex - insertion.length;
		const chars = [...text];
		for (let i = 0; i < insertion.length; i++)
			chars[position + i] = insertion[i];
		return chars.join('');
	}

	// ---------------- UserInput.cs ----------------

	keyDown(key, modifiers) {
		const inGame = this.partyUIVisible && [ScreenType.Map2D, ScreenType.Map3D].includes(this.screenHandler.activeScreen?.type);
		if (key === Key.F5 && inGame) {
			this.screenHandler.pushScreen(ScreenType.SaveSlots);
			return;
		} else if (key === Key.F7 && inGame) {
			this.screenHandler.pushScreen(ScreenType.LoadSlots);
			return;
		}
		if (!this.inputEnabled)
			return;
		this.screenHandler.activeScreen?.keyDown(key, modifiers);
	}

	keyUp(key, modifiers) {
		if (!this.inputEnabled)
			return;
		this.screenHandler.activeScreen?.keyUp(key, modifiers);
	}

	keyChar(ch, modifiers) {
		if (!this.inputEnabled)
			return;
		this.screenHandler.activeScreen?.keyChar(ch, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		if (!this.inputEnabled)
			return;
		this.screenHandler.activeScreen?.mouseDown(this.#clampMouse(position), buttons, modifiers);
	}

	mouseUp(position, buttons, modifiers) {
		if (!this.inputEnabled)
			return;
		this.screenHandler.activeScreen?.mouseUp(this.#clampMouse(position), buttons, modifiers);
	}

	#clampMouse(position) {
		const t = this.mouseTrapArea;
		if (t)
			return { x: limit(t.x, position.x, t.x + t.w - 1), y: limit(t.y, position.y, t.y + t.h - 1) };
		return { x: limit(0, position.x, 319), y: limit(0, position.y, 199) };
	}

	mouseMove(position, buttons) {
		position = this.#clampMouse(position);
		this.lastMousePosition = position;
		this.cursor.position = position;
		if (!this.inputEnabled)
			return;
		this.screenHandler.activeScreen?.mouseMove(position, buttons);
	}

	mouseWheel(position, scrollX, scrollY, buttons) {
		if (!this.inputEnabled)
			return;
		this.screenHandler.activeScreen?.mouseWheel(this.#clampMouse(position), scrollX, scrollY, buttons);
	}

	trapMouse(rect) {
		this.mouseTrapArea = rect;
		const p = this.#clampMouse(this.lastMousePosition);
		if (p.x !== this.lastMousePosition.x || p.y !== this.lastMousePosition.y) {
			this.lastMousePosition = p;
			this.cursor.position = p;
			this.setMousePosition(p);
		}
	}

	trapMouseInPortraitArea() { this.trapMouse(this.portraitArea); }

	untrapMouse() {
		this.mouseTrapArea = null;
		this.screenHandler.activeScreen?.mouseMove(this.lastMousePosition, 0);
	}

	simulateMouseMoveWithoutButton() {
		this.mouseMove(this.lastMousePosition, 0);
	}

	isKeyDown(key) {
		if (!this.inputEnabled)
			return false;
		this.pressedKeys ??= this.pressedKeyProvider();
		if (typeof key === 'string')
			key = keyByChar(key);
		return this.pressedKeys.has(key);
	}

	pause() { this.paused = true; }
	resume() { this.paused = false; }
	enableInput(enable) { this.inputEnabled = enable; }

	// ---------------- Party.cs ----------------

	foreachPartyMember(action, disallowedConditions = Condition.None, allowedGender = null) {
		for (const pm of [...this.state.members()]) {
			if (!hasAnyConditionOf(pm, disallowedConditions) && (allowedGender == null || pm.gender === allowedGender))
				action(pm);
		}
	}

	/** Async variant: action(partyMember, next) */
	foreachPartyMemberAsync(action, finishedHandler, disallowedConditions = Condition.None, allowedGender = null) {
		const queue = [...this.state.members()].filter(p => !hasAnyConditionOf(p, disallowedConditions) && (allowedGender == null || p.gender === allowedGender));
		const next = () => {
			if (queue.length === 0) {
				finishedHandler?.();
				return;
			}
			action(queue.shift(), next);
		};
		next();
	}

	foreachPartyMemberSlot(action, disallowedConditions = Condition.None) {
		for (const { slotIndex, partyMember } of [...this.state.membersWithSlot()]) {
			if (partyMember && hasAnyConditionOf(partyMember, disallowedConditions))
				continue;
			action(slotIndex, partyMember);
		}
	}

	getValidPartyMemberSlots() {
		return [...this.state.membersWithSlot()].filter(p => p.partyMember != null).map(p => p.slotIndex);
	}

	openInventory(characterSlotIndex) {
		this.state.setCurrentInventory(characterSlotIndex);
		const active = this.screenHandler.activeScreen;
		if (active?.type === ScreenType.Inventory || active?.type === ScreenType.CharacterStats)
			active.switchToPartyMember(characterSlotIndex, true);
		else if (this.screenHandler.factories[ScreenType.Inventory])
			this.screenHandler.pushScreen(ScreenType.Inventory);
	}

	removeInventoryItem(partyMember, itemSlotIndex, count = 1) {
		if (typeof partyMember === 'number')
			partyMember = this.state.getPartyMember(partyMember);
		this.#itemRemoved(partyMember, partyMember.inventory[itemSlotIndex], count);
	}

	removeEquipment(partyMember, equipmentSlot, count = 1) {
		if (typeof partyMember === 'number')
			partyMember = this.state.getPartyMember(partyMember);
		this.#itemRemoved(partyMember, partyMember.equipment[equipmentSlot], count);
	}

	#itemRemoved(partyMember, itemSlot, count) {
		if (count === 0)
			return;
		if (itemSlot.count < count)
			throw new Error(`Tried to remove ${count} items but only ${itemSlot.count} were there.`);
		const item = itemSlot.item;
		if (itemSlot.count === count)
			itemSlot.clearItem();
		else
			itemSlot.count -= count;
		partyMember.totalWeight -= count * item.weight;
	}

	tryAddItem(partyMemberSlotIndex, item, count = 1) {
		const pm = this.state.getPartyMember(partyMemberSlotIndex);
		if (!pm)
			return false;
		if (item.flags & ItemFlags.Stackable) {
			const same = pm.inventory.filter(s => s.item?.index === item.index);
			let remaining = count;
			for (const s of same) {
				remaining -= Math.max(0, 99 - s.count);
				if (remaining <= 0)
					break;
			}
			if (remaining > 0 && !pm.inventory.some(s => s.item == null || s.count === 0))
				return false;
			for (const s of same) {
				const add = Math.min(count, Math.max(0, 99 - s.count));
				count -= add;
				s.count += add;
				if (count === 0)
					return true;
			}
		}
		const empty = pm.inventory.find(s => s.item == null || s.count === 0);
		if (!empty)
			return false;
		empty.setItem(item, count);
		return true;
	}

	tryAddGold(partyMemberSlotIndex, gold) {
		if (gold < 0)
			return false;
		const pm = this.state.getPartyMember(partyMemberSlotIndex);
		if (!pm)
			return false;
		const weight = gold * GoldWeight;
		if (pm.gold + gold <= 32767 && pm.totalWeight + weight <= maxWeight(pm)) {
			pm.gold += gold;
			return true;
		}
		return false;
	}

	distributeFood(amount) {
		const takers = [...this.state.members()].filter(pm => !hasAnyConditionOf(pm, Condition.DeadAshesDust));
		if (takers.length === 0)
			return amount;
		const share = Math.floor(amount / takers.length);
		let rest = amount - share * takers.length;
		for (const pm of takers) {
			pm.food = Math.min(32767, pm.food + share + (rest > 0 ? 1 : 0));
			rest--;
		}
		return 0;
	}

	distributeGold(amount) {
		let takers = [];
		this.foreachPartyMember(pm => {
			if (pm.race > 6)
				return;
			const maxGold = Math.min(Math.floor((maxWeight(pm) - pm.totalWeight) / GoldWeight), 32767 - pm.gold);
			if (maxGold > 0)
				takers.push({ taker: pm, maxAmount: maxGold });
		}, Condition.Mad | Condition.Petrified | Condition.DeadAshesDust);

		if (takers.length === 0)
			return amount;

		while (amount > 0) {
			let goldToTake = Math.floor(amount / takers.length);
			for (const t of takers) {
				if (goldToTake === 0)
					goldToTake = amount;
				const taken = Math.min(goldToTake, t.maxAmount, amount);
				t.taker.gold += taken;
				t.taker.totalWeight += taken * GoldWeight;
				t.maxAmount -= taken;
				amount -= taken;
			}
			takers = takers.filter(t => t.maxAmount > 0);
			if (takers.length === 0)
				break;
		}
		return amount;
	}

	// ---------------- MapEvents.cs ----------------

	saveEvent(eventIndex) {
		this.state.saveEvent(this.eventHandler.currentEventMapIndex, eventIndex);
	}

	isEventActive(map, eventIndex, event) {
		if (!event)
			return false;
		if (event.type === 4 /* Chest */ || event.type === 20 /* DoorExit */)
			return true;
		return this.state.isEventActive(map.index, eventIndex);
	}

	isCurrentEventSaved() {
		const ev = this.eventHandler.currentEvent;
		if (!ev || ev.index == null)
			return false;
		return !this.state.isEventActive(this.eventHandler.currentEventMapIndex, ev.index);
	}

	getCurrentLocation() {
		return { position: this.state.partyPosition, mapIndex: this.state.getIndexOfMapWithPlayer(), direction: this.state.partyDirection };
	}

	teleport(x, y, direction, mapIndex, fade) {
		this.enableInput(false);
		this.pause();
		this.clearDelayedActions(this.fadeActionIndex);

		if (this.state.getIndexOfMapWithPlayer() !== mapIndex)
			fade = true;

		const transition = () => {
			const map = this.assets.loadMap(mapIndex);
			this.state.setPartyPosition(x - 1, y - 1);
			if (direction !== Direction.Keep)
				this.state.partyDirection = direction;
			this.state.mapIndex = mapIndex;
			this.enableInput(true);
			this.resume();
			const active = this.screenHandler.activeScreen;
			const wanted = map.is3D ? ScreenType.Map3D : ScreenType.Map2D;
			if (active?.type === wanted)
				active.mapChanged();
			else {
				this.screenHandler.clearAllScreens();
				this.screenHandler.pushScreen(wanted);
			}
		};

		if (fade)
			this.fade(Game.DefaultFadeTime, null, transition);
		else
			transition();
	}

	showText(nextAction = null) {
		this.currentText = null;
		this.screenHandler.pushScreen(ScreenType.TextBox, nextAction);
	}

	showPictureWithText() {
		this.screenHandler.pushScreen(ScreenType.PictureText);
	}

	openPlace(placeEvent) {
		if (!placeEvent.alwaysOpen && (this.state.hour < placeEvent.openingHour || this.state.hour >= placeEvent.closingHour)) {
			this.showTextMessage(this.getCurrentMapText(placeEvent.closedTextIndex));
			return;
		}
		if (this.screenHandler.factories[ScreenType.Place])
			this.screenHandler.pushScreen(ScreenType.Place);
		else
			this.showTextMessage(this.assets.placeName(placeEvent.placeIndex) ?? 'PLACE');
	}

	showDoor() {
		this.screenHandler.pushScreen(ScreenType.Door);
	}

	showChest() {
		this.screenHandler.pushScreen(ScreenType.Chest);
	}

	triggerTrap(trapType, damageAmount, finishHandler = null) {
		if (trapType === TrapType.None)
			return;
		if (trapType === TrapType.DamageTrap && !(damageAmount > 0))
			return;
		const probeLuck = pm => this.probe(pm.attributes[Attribute.Luck].totalCurrent);
		const info = TrapTable[trapType];
		if (!info)
			return;
		const showMessageAndFinish = () => this.showTextMessage(info.message, finishHandler);
		if (info.activePlayerOnly) {
			const pm = this.state.activePartyMember;
			if (probeLuck(pm))
				return;
			addCondition(pm, info.condition);
			if (trapType === TrapType.DamageTrap)
				damage(pm, damageAmount, showMessageAndFinish);
			else
				showMessageAndFinish();
			this.afterPartyChange();
		} else {
			let finish = () => finishHandler?.();
			this.foreachPartyMemberAsync((pm, next) => {
				if (probeLuck(pm)) {
					next();
					return;
				}
				finish = showMessageAndFinish;
				addCondition(pm, info.condition);
				if (trapType === TrapType.DamageTrap)
					damage(pm, damageAmount, next);
				else
					next();
			}, () => { this.afterPartyChange(); finish(); }, Condition.Petrified | Condition.DeadAshesDust);
		}
	}

	/** Refresh portraits and status icons after party member stats changed */
	afterPartyChange() {
		this.resetStatusIcons();
		this.updatePartyMembers();
	}

	// ---------------- Battles (not in the C# port) ----------------

	/**
	 * Starts a battle against the given monster group (MON_DATA.AMB index).
	 * onFinished(victory) is called after the battle.
	 */
	startBattle(monsterGroupIndex, onFinished = null) {
		if (!this.screenHandler.factories[ScreenType.Battle] || this.screenHandler.activeScreen?.type === ScreenType.Battle)
			return;
		const group = this.assets.loadMonsterGroup(monsterGroupIndex);
		if (!group || !group.some(r => r.monsterIndex && r.mask))
			return;
		const background = this.screenHandler.activeScreen?.combatBackground?.() ?? 1;
		this.battleSetup = { monsterGroupIndex, background, onFinished };
		this.screenHandler.pushScreen(ScreenType.Battle);
	}

	gameOver() {
		this.endBattleMusic();
		this.playSong(Song.HastaLaVista);
		this.showTextMessage(Message.PartyDeath, () => {
			const slot = getLastSlot();
			if (slot && this.loadSlot(slot))
				return;
			this.openMainMenu();
		});
	}

	// ---------------- Extra screens (not in the C# port) ----------------

	openOptions() {
		this.screenHandler.pushScreen(ScreenType.Options);
	}

	openCamp() {
		this.campHandler?.(this);
	}

	openRiddlemouth(event) {
		this.screenHandler.pushScreen(ScreenType.Riddlemouth);
	}

	// ---------------- Main menu and save slots (not in the C# port) ----------------

	/** Shows or hides the party portraits (hidden in the main menu) */
	setPartyUIVisible(visible) {
		this.partyUIVisible = visible;
		this.portraitBackgroundSprite.visible = visible;
		for (let i = 0; i < MaxPartyMembers; i++) {
			this.portraitSprites[i].visible = visible;
			if (this.partyMemberNameBackgrounds[i])
				this.partyMemberNameBackgrounds[i].visible = visible;
			if (this.partyMemberNames[i])
				this.partyMemberNames[i].visible = visible;
			if (!visible)
				this.playerStatusIcons[i].visible = false;
		}
		if (visible) {
			this.resetStatusIcons();
			this.updatePartyMembers();
		}
	}

	openMainMenu() {
		this.inBattle = false;
		this.playSong(Song.Fanfares);
		this.enableInput(true);
		this.resume();
		this.clearDelayedActions();
		this.screenHandler.clearAllScreens();
		this.screenHandler.pushScreen(ScreenType.MainMenu);
	}

	/** Replaces the whole game state and continues at the stored position */
	startFromSaveData({ savegame, partyMembers }) {
		this.state.loadFrom(savegame);
		this.state.partyMembers = partyMembers;
		for (const pm of partyMembers.values())
			GameState.recalculateWeight(pm);
		this.buttonLayout = ButtonLayout.Movement;
		this.setPartyUIVisible(true);
		const p = this.state.partyPosition;
		this.teleport(1 + p.x, 1 + p.y, this.state.partyDirection, this.state.mapIndex, true);
	}

	hasSavegame() {
		return getSlots().some(Boolean);
	}

	saveSlot(slot, name) {
		try {
			writeSlot(slot, createSaveData(this, name));
			return true;
		} catch (e) {
			console.warn('Saving failed', e);
			return false;
		}
	}

	loadSlot(slot) {
		const data = getSlot(slot);
		if (!data)
			return false;
		setLastSlot(slot);
		this.startFromSaveData(readSaveData(data, this.assets));
		return true;
	}

	// Quick save / load (F5 / F7) use the last used slot
	saveGame() {
		const slot = getLastSlot() ?? 1;
		const name = getSlot(slot)?.name ?? 'QUICKSAVE';
		return this.saveSlot(slot, name);
	}

	loadGame() {
		const slot = getLastSlot();
		return slot ? this.loadSlot(slot) : false;
	}

	// ---------------- Audio.cs ----------------

	// The music is played by src/audio (Hippel COSO player + Paula emulation in an audio worklet).

	updateMusic(delta) { }

	get musicEnabled() { return this.music?.enabled ?? false; }

	setMusicEnabled(enabled) {
		this.music?.setEnabled(enabled);
		this.state.musicBlock = !enabled;
	}

	/** Song 1..19 (see Song). Songs started while a battle is running are remembered for after the battle. */
	playSong(songIndex) {
		if (!songIndex)
			return;
		if (this.inBattle) {
			this.songAfterBattle = songIndex;
			return;
		}
		this.currentSong = songIndex;
		this.music?.play(songIndex);
	}

	stopSong() {
		this.currentSong = 0;
		this.music?.stop();
	}

	startBattleMusic() {
		this.inBattle = true;
		this.songAfterBattle = this.currentSong;
		this.music?.play(Song.MinorQuarrels);
	}

	endBattleMusic() {
		this.inBattle = false;
		if (this.songAfterBattle)
			this.playSong(this.songAfterBattle);
		this.songAfterBattle = 0;
	}
}
