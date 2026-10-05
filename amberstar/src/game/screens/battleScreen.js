// Battles. Not implemented in the C# port at all, so this is a new implementation based on
// the original data (monster groups, first person monster graphics, tactical icons, combat
// backgrounds and palettes) and the combat rules described in the original documentation:
// a 6x5 tactical grid (3 monster rows, 2 party rows), round based, actions are planned per
// party member and executed by one button press.
import { ScreenType, ScreenFadeType } from './screen.js';
import { ButtonGridScreen } from './buttonGridScreen.js';
import { Layer } from '../../engine/layerSetup.js';
import { TextAlignment, TransparentPaper } from '../ui/text.js';
import { ButtonType, CursorType, Layout, StatusIcon, UIGraphic } from '../../data/enums.js';
import { Key, KeyModifiers, MouseButtons } from '../keys.js';
import { Message } from '../messages.js';
import {
	Condition, Skill, Attribute, isDead, hasAnyConditionOf, addCondition, ItemType, cloneItem,
} from '../../data/characters.js';
import { Text } from '../../data/text.js';
import { GameState } from '../gameState.js';
import { random, rectContains } from '../util.js';

const ViewX = 16, ViewY = 49, ViewW = 176, ViewH = 112;
const GridX = 208, GridY = 49, Cell = 16;
const Cols = 6, Rows = 5;
const MessageArea = { x: 16, y: 177, w: 176, h: 14 };
const GridArea = { x: GridX, y: GridY, w: Cols * Cell, h: Rows * Cell };

export const BattleAction = { None: 0, Attack: 1, Parry: 2, Move: 3, Flee: 4 };

const ActionStatusIcon = {
	[BattleAction.Attack]: StatusIcon.Attack,
	[BattleAction.Parry]: StatusIcon.Parry,
	[BattleAction.Move]: StatusIcon.Move,
	[BattleAction.Flee]: StatusIcon.Flee,
};

// Depth layout of the first person view per grid row (0 = farthest)
const RowView = [
	{ group: 0, spread: 0.42, bottom: 106, layer: 10 },
	{ group: 1, spread: 0.68, bottom: 124, layer: 20 },
	{ group: 2, spread: 1.0, bottom: 150, layer: 30 },
	{ group: 2, spread: 1.15, bottom: 168, layer: 40 },
];

export class BattleScreen extends ButtonGridScreen {
	constructor() {
		super();
		this.combatants = [];
		this.sprites = [];
		this.selected = 1;
		this.pickMode = null;
		this.executing = false;
		this.messageLabel = null;
		this.background = null;
		this.animationTick = 0;
		this.finished = false;
		this.killed = [];
	}

	get type() { return ScreenType.Battle; }
	get fadeType() { return ScreenFadeType.Both; }
	get allowInventoryAccess() { return false; }
	get closeOnEscape() { return false; }
	get buttonGridPaletteIndex() { return this.palette ?? 0; }

	keypadPressesButton() { return true; }

	init() {
		super.init();
		this.messageLabel = this.addLabelArea(MessageArea.x, MessageArea.y, MessageArea.w, MessageArea.h, 50);
		this.messageLabel.alignment = TextAlignment.Center;
	}

	open(closeAction) {
		const game = this.game;
		const setup = game.battleSetup;
		this.setup = setup;
		this.backgroundIndex = setup.background;
		this.palette = game.paletteIndexProvider.getCombatPaletteIndex(this.backgroundIndex);
		this.finished = false;
		this.executing = false;
		this.killed = [];
		this.pickMode = null;
		this.#createCombatants();
		super.open(closeAction);
		game.startBattleMusic();
		game.setLayout(Layout.Battle, this.palette);
		game.cursor.cursorType = CursorType.Sword;
		game.cursor.paletteIndex = this.palette;
		const layer = game.getRenderLayer(Layer.Battle);
		this.background = layer.createSprite();
		Object.assign(this.background, { x: ViewX, y: ViewY, width: ViewW, height: ViewH, displayLayer: 1, paletteIndex: this.palette, opaque: true });
		this.background.textureOffset = layer.config.texture.getOffset(game.graphicIndexProvider.getCombatBackgroundIndex(this.backgroundIndex));
		this.background.visible = true;
		this.selected = game.state.activePartyMemberIndex;
		this.#chooseDefaultActions();
		this.#refresh();
		this.#showText(game.assets.message(Message.AttackOrFlee));
	}

	close() {
		this.background.visible = false;
		this.sprites.forEach(s => s.visible = false);
		this.sprites = [];
		this.messageLabel.visible = false;
		this.game.untrapMouse();
		this.game.resetStatusIcons();
		if (this.game.inBattle)
			this.game.endBattleMusic();
		super.close();
		const active = this.game.screenHandler.activeScreen;
		if (active)
			this.game.cursor.paletteIndex = active.buttonGridPaletteIndex ?? 0;
	}

	// ---------------- setup ----------------

	#createCombatants() {
		const game = this.game;
		this.combatants = [];
		const group = game.assets.loadMonsterGroup(this.setup.monsterGroupIndex);
		(group ?? []).forEach((rowInfo, i) => {
			if (!rowInfo.monsterIndex || !rowInfo.mask)
				return;
			const row = 2 - i;
			const template = game.assets.loadMonsterCharacter(rowInfo.monsterIndex);
			for (let col = 0; col < Cols; col++) {
				if (!(rowInfo.mask & (1 << (Cols - 1 - col))))
					continue;
				const m = cloneMonster(template);
				this.combatants.push({ monster: true, character: m, row, col, action: BattleAction.Attack, target: null, gfx: template.battleGraphicIndex, name: template.name, animFrame: 0, fled: false });
			}
		});
		// Party
		const used = new Set();
		for (const { slotIndex, partyMember } of game.state.membersWithSlot()) {
			if (!partyMember || hasAnyConditionOf(partyMember, Condition.DeadAshesDust | Condition.Petrified))
				continue;
			let pos = game.state.combatPositions[slotIndex];
			if (pos == null || pos >= 12 || used.has(pos))
				pos = [...Array(12).keys()].find(p => !used.has(p));
			used.add(pos);
			this.combatants.push({
				monster: false, character: partyMember, slot: slotIndex + 1, row: 3 + Math.floor(pos / 6), col: pos % 6,
				action: BattleAction.Parry, target: null, name: partyMember.name, animFrame: 0, fled: false,
			});
		}
	}

	#chooseDefaultActions() {
		for (const c of this.#party()) {
			const target = this.#adjacentEnemies(c)[0];
			if (target) {
				c.action = BattleAction.Attack;
				c.target = target;
			} else if (this.#hasRangedWeapon(c.character) && this.#monsters().length) {
				c.action = BattleAction.Attack;
				c.target = this.#monsters()[0];
			} else {
				c.action = BattleAction.Parry;
				c.target = null;
			}
		}
	}

	#party() { return this.combatants.filter(c => !c.monster && !c.fled && !isDead(c.character)); }
	#monsters() { return this.combatants.filter(c => c.monster && !c.fled && c.character.hitPoints.currentValue > 0); }
	#at(row, col) { return this.combatants.find(c => c.row === row && c.col === col && !c.fled && (!c.monster ? !isDead(c.character) : c.character.hitPoints.currentValue > 0)); }

	#adjacent(a, b) {
		return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;
	}

	#adjacentEnemies(c) {
		const enemies = c.monster ? this.#party() : this.#monsters();
		return enemies.filter(e => this.#adjacent(c, e));
	}

	#hasRangedWeapon(pm) {
		const weapon = pm.equipment?.[3]?.item;
		if (!weapon || weapon.type !== ItemType.LongRangedWeapon)
			return false;
		if (!weapon.usedAmmoType)
			return true;
		const ammo = pm.equipment[5]?.item;
		return ammo && ammo.ammoType === weapon.usedAmmoType && pm.equipment[5].count > 0;
	}

	// ---------------- rendering ----------------

	#refresh() {
		const game = this.game;
		const layer = game.getRenderLayer(Layer.Battle);
		const atlas = layer.config.texture;
		const gip = game.graphicIndexProvider;
		this.sprites.forEach(s => s.visible = false);
		this.sprites = [];

		const addSprite = (x, y, w, h, textureIndex, displayLayer) => {
			const s = layer.createSprite();
			Object.assign(s, { x, y, width: w, height: h, displayLayer, paletteIndex: this.palette });
			s.textureOffset = atlas.getOffset(textureIndex);
			s.visible = true;
			this.sprites.push(s);
			return s;
		};

		// First person view of the monsters (far rows first)
		const monsters = this.#monsters().sort((a, b) => a.row - b.row);
		for (const m of monsters) {
			const view = RowView[Math.min(m.row, 3)];
			const frames = gip.getMonsterFrameIndices(m.gfx, view.group);
			if (!frames.length)
				continue;
			const frameIndex = frames[Math.min(m.animFrame, frames.length - 1)];
			const graphic = game.assets.loadMonsterGraphics(m.gfx)[view.group][Math.min(m.animFrame, frames.length - 1)];
			const spacing = ViewW * view.spread / Cols;
			const cx = ViewX + ViewW / 2 + (m.col - (Cols - 1) / 2) * spacing;
			const x = Math.round(cx - graphic.width / 2);
			const y = ViewY + Math.min(ViewH, view.bottom - 49 + 0) - graphic.height;
			const s = addSprite(x, Math.max(ViewY - 20, y), graphic.width, graphic.height, frameIndex, view.layer + m.col);
			s.clipRect = { x: ViewX, y: ViewY, w: ViewW, h: ViewH };
		}

		// Tactical grid
		const frame = Math.floor(this.animationTick / 20) % 3;
		for (const c of this.combatants) {
			if (c.fled)
				continue;
			const dead = c.monster ? c.character.hitPoints.currentValue <= 0 : isDead(c.character);
			if (dead)
				continue;
			const group = c.monster ? 9 + c.gfx : Math.min(c.character.class, 9);
			addSprite(GridX + c.col * Cell, GridY + c.row * Cell, Cell, Cell, gip.getTacticIconIndex(group * 3 + frame), 10);
		}

		// Selection marker for the selected party member
		const sel = this.#selectedCombatant();
		if (sel && !this.executing) {
			const s = layer.createColoredRect();
			Object.assign(s, { x: GridX + sel.col * Cell, y: GridY + sel.row * Cell, width: Cell, height: Cell, displayLayer: 5 });
			s.color = { r: 64, g: 64, b: 160, a: 255 };
			s.visible = true;
			this.sprites.push(s);
			if (sel.action === BattleAction.Attack && sel.target && !sel.target.fled) {
				const t = layer.createColoredRect();
				Object.assign(t, { x: GridX + sel.target.col * Cell, y: GridY + sel.target.row * Cell, width: Cell, height: Cell, displayLayer: 5 });
				t.color = { r: 160, g: 32, b: 32, a: 255 };
				t.visible = true;
				this.sprites.push(t);
			}
			if (sel.action === BattleAction.Move && sel.target) {
				const t = layer.createColoredRect();
				Object.assign(t, { x: GridX + sel.target.col * Cell, y: GridY + sel.target.row * Cell, width: Cell, height: Cell, displayLayer: 5 });
				t.color = { r: 32, g: 128, b: 32, a: 255 };
				t.visible = true;
				this.sprites.push(t);
			}
		}

		// Status icons above the portraits show the planned actions
		for (const c of this.combatants) {
			if (c.monster)
				continue;
			if (c.fled || isDead(c.character))
				game.hideStatusIcon(c.slot - 1);
			else
				game.setStatusIcon(c.slot - 1, ActionStatusIcon[c.action] ?? StatusIcon.HandStop, true, true);
		}
		this.requestButtonSetup();
	}

	#selectedCombatant() {
		return this.#party().find(c => c.slot === this.selected) ?? this.#party()[0] ?? null;
	}

	#showText(text) {
		if (typeof text === 'string')
			text = Text.fromString(text);
		this.messageLabel.setText(text, MessageArea.w, 15, TransparentPaper, this.palette);
		this.messageLabel.visible = true;
	}

	update(elapsedTicks) {
		super.update(elapsedTicks);
		const before = Math.floor(this.animationTick / 20);
		this.animationTick += elapsedTicks;
		if (Math.floor(this.animationTick / 20) !== before && !this.executing)
			this.#refresh();
	}

	// ---------------- input ----------------

	setupButtons(grid) {
		for (let i = 0; i < 9; i++)
			grid.setButton(i, ButtonType.Empty);
		if (this.finished)
			return;
		const sel = this.#selectedCombatant();
		const canAct = !this.executing && sel && !hasAnyConditionOf(sel.character, Condition.Stunned | Condition.Sleeping | Condition.Petrified | Condition.Mad | Condition.Panicked);
		grid.setButton(0, ButtonType.Sword);
		grid.setButton(1, ButtonType.Shield);
		grid.setButton(2, ButtonType.Flee);
		grid.setButton(3, ButtonType.Advance);
		grid.setButton(4, ButtonType.UseMagic);
		grid.setButton(5, ButtonType.UseItem);
		grid.setButton(7, ButtonType.Ok);
		grid.enableButton(0, canAct && (this.#adjacentEnemies(sel).length > 0 || this.#hasRangedWeapon(sel.character)));
		grid.enableButton(1, canAct);
		grid.enableButton(2, canAct && sel.row === 4);
		grid.enableButton(3, canAct);
		grid.enableButton(4, false);
		grid.enableButton(5, false);
		grid.enableButton(7, !this.executing);
	}

	buttonClicked(index) {
		if (this.executing || this.finished)
			return;
		const sel = this.#selectedCombatant();
		if (!sel)
			return;
		switch (index) {
			case 0:
				this.pickMode = 'attack';
				this.#showText('ATTACK WHICH MONSTER?');
				break;
			case 1:
				sel.action = BattleAction.Parry;
				sel.manualParry = true;
				sel.target = null;
				this.pickMode = null;
				break;
			case 2:
				sel.action = BattleAction.Flee;
				sel.target = null;
				this.pickMode = null;
				break;
			case 3:
				this.pickMode = 'move';
				this.#showText('MOVE WHERE?');
				break;
			case 7:
				this.pickMode = null;
				this.#executeRound();
				return;
		}
		this.#refresh();
	}

	keyChar(ch, modifiers) {
		if (ch >= '1' && ch <= '6') {
			this.#select(ch.charCodeAt(0) - 48);
			return true;
		}
		return false;
	}

	keyDown(key, modifiers) {
		if (key === Key.Enter || key === Key.Space) {
			if (!this.executing && !this.finished)
				this.#executeRound();
			return true;
		}
		if (key === Key.Escape) {
			this.pickMode = null;
			this.#showText(this.game.assets.message(Message.AttackOrFlee));
			return true;
		}
		return super.keyDown(key, modifiers);
	}

	#select(slot) {
		if (this.executing)
			return;
		if (!this.#party().some(c => c.slot === slot))
			return;
		this.selected = slot;
		this.game.state.setActivePartyMember(slot);
		this.pickMode = null;
		this.#refresh();
	}

	mouseDown(position, buttons, modifiers) {
		const game = this.game;
		if (this.executing || this.finished)
			return true;
		if (buttons === MouseButtons.Right) {
			this.pickMode = null;
			this.#showText(game.assets.message(Message.AttackOrFlee));
			return true;
		}
		const slot = game.testPartyPortraitHit(position);
		if (slot != null) {
			this.#select(slot);
			return true;
		}
		if (rectContains(GridArea, position)) {
			const col = Math.floor((position.x - GridX) / Cell);
			const row = Math.floor((position.y - GridY) / Cell);
			const occupant = this.#at(row, col);
			const sel = this.#selectedCombatant();
			if (this.pickMode === 'attack' && occupant?.monster && sel) {
				if (this.#adjacent(sel, occupant) || this.#hasRangedWeapon(sel.character)) {
					sel.action = BattleAction.Attack;
					sel.manualParry = false;
					sel.target = occupant;
					this.pickMode = null;
					this.#showText(game.assets.message(Message.AttackOrFlee));
				}
			} else if (this.pickMode === 'move' && sel && !occupant && row >= 3 && Math.abs(row - sel.row) <= 1 && Math.abs(col - sel.col) <= 1) {
				sel.action = BattleAction.Move;
				sel.target = { row, col };
				this.pickMode = null;
				this.#showText(game.assets.message(Message.AttackOrFlee));
			} else if (occupant && !occupant.monster) {
				this.#select(occupant.slot);
				return true;
			}
			this.#refresh();
			return true;
		}
		return super.mouseDown(position, buttons, modifiers);
	}

	// ---------------- round execution ----------------

	#executeRound() {
		const game = this.game;
		this.executing = true;
		this.requestButtonSetup();
		const order = this.combatants.filter(c => !c.fled && (c.monster ? c.character.hitPoints.currentValue > 0 : !isDead(c.character)))
			.map(c => ({ c, speed: (c.character.attributes?.[Attribute.Speed]?.totalCurrent ?? 0) + random(0, 30) }))
			.sort((a, b) => b.speed - a.speed)
			.map(e => e.c);
		const steps = [];
		for (const c of order) {
			const attacks = Math.max(1, c.character.attacksPerRound || 1);
			if (c.monster) {
				steps.push(() => this.#monsterTurn(c));
				for (let i = 1; i < attacks; i++)
					steps.push(() => this.#monsterTurn(c, true));
			} else {
				steps.push(() => this.#partyTurn(c));
				if (c.action === BattleAction.Attack)
					for (let i = 1; i < attacks; i++)
						steps.push(() => this.#partyTurn(c, true));
			}
		}
		const next = () => {
			if (this.#checkEnd())
				return;
			const step = steps.shift();
			if (!step) {
				this.#endRound();
				return;
			}
			const delay = step();
			this.#refresh();
			game.addDelayedActionMs(delay ? 650 : 0, next);
		};
		next();
	}

	#endRound() {
		this.executing = false;
		this.combatants.forEach(c => c.animFrame = 0);
		this.#chooseDefaultActionsKeepingValid();
		if (!this.#selectedCombatant()) {
			this.#checkEnd();
			return;
		}
		this.selected = this.#selectedCombatant().slot;
		this.#showText(this.game.assets.message(Message.AttackOrFlee));
		this.#refresh();
	}

	#chooseDefaultActionsKeepingValid() {
		for (const c of this.#party()) {
			if (c.action === BattleAction.Attack && c.target && c.target.character.hitPoints.currentValue > 0 &&
				(this.#adjacent(c, c.target) || this.#hasRangedWeapon(c.character)))
				continue;
			if (c.action === BattleAction.Parry && c.manualParry)
				continue;
			const target = this.#adjacentEnemies(c)[0];
			c.action = target ? BattleAction.Attack : BattleAction.Parry;
			c.target = target ?? null;
		}
	}

	#cannotAct(character) {
		return hasAnyConditionOf(character, Condition.Stunned | Condition.Sleeping | Condition.Petrified);
	}

	/** Returns true if something visible happened (to delay the next step) */
	#partyTurn(c, followUp = false) {
		const game = this.game;
		if (c.fled || isDead(c.character) || this.#cannotAct(c.character))
			return false;
		switch (c.action) {
			case BattleAction.Attack: {
				let target = c.target;
				const ranged = this.#hasRangedWeapon(c.character);
				if (!target || target.character.hitPoints.currentValue <= 0 || (!ranged && !this.#adjacent(c, target)))
					target = ranged ? this.#monsters()[0] : this.#adjacentEnemies(c)[0];
				if (!target)
					return false;
				c.target = target;
				if (ranged)
					this.#consumeAmmo(c.character);
				this.#attack(c, target);
				return true;
			}
			case BattleAction.Move: {
				const t = c.target;
				if (t && !this.#at(t.row, t.col)) {
					c.row = t.row;
					c.col = t.col;
					game.state.combatPositions[c.slot - 1] = (t.row - 3) * 6 + t.col;
				}
				c.action = BattleAction.Parry;
				c.target = null;
				return true;
			}
			case BattleAction.Flee: {
				if (game.probe(Math.max(10, c.character.attributes[Attribute.Speed].totalCurrent))) {
					c.fled = true;
					this.#showText(`${c.name} FLEES.`);
				} else {
					this.#showText(`${c.name} CANNOT FLEE!`);
				}
				return true;
			}
			default:
				return false;
		}
	}

	#consumeAmmo(pm) {
		const weapon = pm.equipment[3]?.item;
		if (!weapon?.usedAmmoType)
			return;
		const slot = pm.equipment[5];
		if (slot.count > 0) {
			slot.count--;
			pm.totalWeight -= slot.item.weight;
			if (slot.count === 0)
				slot.clearItem();
		}
	}

	#monsterTurn(m, followUp = false) {
		const game = this.game;
		const mc = m.character;
		if (mc.hitPoints.currentValue <= 0 || this.#cannotAct(mc))
			return false;
		// Morale: monsters flee when badly hurt
		if (!followUp && mc.morale && mc.hitPoints.currentValue * 100 < (mc.startHP || 1) * (100 - mc.morale) / 4 && game.probe(20)) {
			m.fled = true;
			this.#showText(`${m.name} FLEES.`);
			return true;
		}
		const targets = this.#adjacentEnemies(m);
		if (targets.length) {
			const target = targets[random(0, targets.length)];
			this.#attack(m, target);
			return true;
		}
		if (followUp)
			return false;
		// Move towards the nearest party member
		const party = this.#party();
		if (!party.length)
			return false;
		let best = null, bestDist = 1e9;
		for (const p of party) {
			const d = Math.max(Math.abs(p.row - m.row), Math.abs(p.col - m.col));
			if (d < bestDist) {
				bestDist = d;
				best = p;
			}
		}
		const candidates = [];
		for (let dr = -1; dr <= 1; dr++)
			for (let dc = -1; dc <= 1; dc++) {
				const r = m.row + dr, col = m.col + dc;
				if ((dr || dc) && r >= 0 && r <= 3 && col >= 0 && col < Cols && !this.#at(r, col))
					candidates.push({ r, col, d: Math.max(Math.abs(best.row - r), Math.abs(best.col - col)) });
			}
		candidates.sort((a, b) => a.d - b.d);
		if (candidates.length && candidates[0].d < bestDist) {
			m.row = candidates[0].r;
			m.col = candidates[0].col;
			return true;
		}
		return false;
	}

	#attack(attacker, defender) {
		const game = this.game;
		const a = attacker.character, d = defender.character;
		const msg = id => game.assets.message(id).getLines(1000).join(' ');
		attacker.animFrame = 1;
		const attackSkill = a.skills?.[Skill.Attack]?.totalCurrent ?? 50;
		if (!game.probe(Math.max(5, attackSkill))) {
			this.#showText(`${attacker.name} ${msg(Message.AttackMisses)}`);
			return;
		}
		if (!defender.monster && defender.action === BattleAction.Parry && game.probe(d.skills?.[Skill.Parry]?.totalCurrent ?? 0)) {
			this.#showText(`${defender.name} ${msg(Message.AttackParried)}`);
			return;
		}
		const maxDamage = Math.max(1, (a.damage ?? 0) + (a.bonusDamage ?? 0) + (a.magicBonusWeapon ?? 0) + Math.floor((a.attributes?.[Attribute.Strength]?.totalCurrent ?? 0) / 25));
		const defense = (d.defense ?? 0) + (d.bonusDefense ?? 0) + (d.magicBonusArmor ?? 0);
		const damage = Math.max(0, random(1, maxDamage + 1) - random(0, defense + 1));
		if (damage === 0) {
			this.#showText(`${attacker.name} ${msg(Message.AttackHitsButNoDamage)}`);
			return;
		}
		d.hitPoints.currentValue = Math.max(0, d.hitPoints.currentValue - damage);
		if (!defender.monster)
			this.#damageSplash(defender.slot - 1);
		this.#showText(`${attacker.name} ${msg(Message.AttackHitsWithDamage)} ${damage}`);
		if (d.hitPoints.currentValue === 0) {
			if (defender.monster) {
				this.killed.push(defender);
			} else {
				addCondition(d, Condition.Dead);
			}
			game.updatePartyMembers();
		}
	}

	#damageSplash(slotIndex) {
		const game = this.game;
		const splash = game.createSprite(Layer.UI, { x: 16 + slotIndex * 48, y: 2 }, { width: 32, height: 32 },
			game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.DamageSplash), 0);
		splash.displayLayer = 30;
		game.addDelayedActionMs(450, () => splash.visible = false);
	}

	// ---------------- end of battle ----------------

	#checkEnd() {
		const game = this.game;
		if (this.finished)
			return true;
		const party = this.#party();
		const monsters = this.#monsters();
		if (party.length === 0) {
			const anyFled = this.combatants.some(c => !c.monster && c.fled && !isDead(c.character));
			this.finished = true;
			this.executing = false;
			if (anyFled) {
				this.#finish(false);
			} else {
				game.screenHandler.popScreen();
				game.addDelayedActionMs(1200, () => game.gameOver());
			}
			return true;
		}
		if (monsters.length === 0) {
			this.finished = true;
			this.executing = false;
			this.#finish(this.killed.length > 0 && !this.combatants.some(c => c.monster && c.fled));
			return true;
		}
		return false;
	}

	#finish(victory) {
		const game = this.game;
		const setup = this.setup;
		const lines = [];
		if (victory || this.killed.length) {
			const alive = [...game.state.members()].filter(pm => !isDead(pm));
			const exp = this.killed.reduce((s, k) => s + (k.character.defeatExperience ?? 0), 0);
			if (alive.length && exp > 0) {
				const share = Math.floor(exp / alive.length);
				alive.forEach(pm => pm.experiencePoints += share);
				lines.push(`${game.assets.message(Message.EachMemberReceives).getLines(1000).join(' ')} ${share} EP`);
			}
			// Loot
			let gold = 0;
			const items = [];
			for (const k of this.killed) {
				gold += k.character.gold ?? 0;
				for (const slot of [...k.character.equipment, ...k.character.inventory])
					if (slot.item && slot.count > 0 && slot.item.type !== ItemType.MonsterItem)
						items.push({ item: cloneItem(slot.item), count: slot.count });
			}
			const left = gold > 0 ? game.distributeGold(gold) : 0;
			if (gold > 0)
				lines.push(`${gold - left} GOLD`);
			for (const { item, count } of items) {
				let given = false;
				for (const { slotIndex, partyMember } of game.state.membersWithSlot()) {
					if (!partyMember || isDead(partyMember))
						continue;
					if (game.tryAddItem(slotIndex + 1, item, count)) {
						GameState.recalculateWeight(partyMember);
						lines.push(`${partyMember.name}: ${game.itemName(item)}`);
						given = true;
						break;
					}
				}
				if (!given)
					lines.push(`${game.itemName(item)} ${game.assets.message(Message.NoMemberHasRoomForItem).getLines(1000).join(' ')}`);
			}
		}
		const done = () => {
			setup.onFinished?.(victory);
		};
		game.screenHandler.popScreen();
		if (victory) {
			const intro = game.assets.message(Message.AfterBattleLoot).getLines(1000).join(' ');
			game.addDelayedActionMs(1100, () => game.showTextMessage([intro, ...lines].join('#'), done));
		} else {
			game.addDelayedActionMs(1100, done);
		}
	}
}

function cloneMonster(m) {
	return {
		...m,
		hitPoints: m.hitPoints.copy(),
		startHP: m.hitPoints.currentValue,
		spellPoints: m.spellPoints.copy(),
		attributes: Object.fromEntries(Object.entries(m.attributes).map(([k, v]) => [k, v.copy()])),
		skills: Object.fromEntries(Object.entries(m.skills).map(([k, v]) => [k, v.copy()])),
	};
}
