// Port of Amberstar.Game.UI.PersonInfoView.
import { Layer } from '../../engine/layerSetup.js';
import { TextAlignment, TransparentPaper } from './text.js';
import { UIGraphic, UIText } from '../../data/enums.js';
import { Gender, Race } from '../../data/characters.js';
import { Text } from '../../data/text.js';
import { Game } from '../game.js';

const InfoText = { Race: 0, Gender: 1, Age: 2, ClassAndLevel: 3, EP: 4, LP: 5, SP: 6, SLP: 7, GoldAndFood: 8, Damage: 9, Protection: 10, Count: 11 };

export class PersonInfoView {
	constructor(game, person, personIndex, palette) {
		this._visible = true;
		this._extended = true;
		const paper = TransparentPaper;
		const portraitIndex = game.graphicIndexProvider.getPersonPortraitIndex(personIndex)
			?? game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.EmptyCharSlot);
		const pp = { x: 208, y: 49 };
		const ps = { width: 32, height: 34 };
		this.portraitBackground = game.createColoredRect(Layer.UI, pp, ps, { r: 0, g: 0, b: 0, a: 255 });
		this.portrait = game.createSprite(Layer.UI, pp, ps, portraitIndex, palette);
		this.portraitBackground.displayLayer = 0;
		this.portrait.displayLayer = 2;
		this.name = game.textManager.create(person.name, 1, paper, palette);
		this.name.showInArea(pp.x, pp.y + ps.height + 1, 96, 7, 2, TextAlignment.Center);

		let tx = pp.x + ps.width + 2;
		let ty = pp.y;
		const maxTextWidth = 320 - tx;
		const t = this.texts = new Array(InfoText.Count).fill(null);
		const uiString = id => game.uiTextString(id);

		if (person.race < Race.Monster)
			t[InfoText.Race] = game.textManager.create(game.nameText('race', person.race), maxTextWidth, 15, paper, palette);

		t[InfoText.Gender] = game.textManager.create(uiString(person.gender === Gender.Male ? UIText.Male : UIText.Female), 15, paper, palette);

		if (person.race < Race.Monster) {
			t[InfoText.Age] = game.textManager.create(`${uiString(UIText.Age)}${person.conversationData.age.currentValue}`, 15, paper, palette);
			if (person.class !== 0)
				t[InfoText.ClassAndLevel] = game.textManager.create(Text.fromString(`${game.nameString('class', person.class)} ${person.level}`), maxTextWidth, 15, paper, palette);
		}

		this.swordIcon = null;
		this.shieldIcon = null;

		if (person.isPartyMember) {
			const pm = person;
			let ep = uiString(UIText.EP);
			ep = Game.insertNumberIntoString(ep, ':', true, pm.experiencePoints, 100);
			t[InfoText.EP] = game.textManager.create(ep, 15, paper, palette);
			let lp = uiString(UIText.LP);
			lp = Game.insertNumberIntoString(lp, '/', false, pm.hitPoints.currentValue, 3, '0');
			lp = Game.insertNumberIntoString(lp, '/', true, pm.hitPoints.totalMax, 3, '0');
			t[InfoText.LP] = game.textManager.create(lp, 15, paper, palette);
			if (pm.learnedSpellSchools !== 0) {
				let sp = uiString(UIText.SP);
				sp = Game.insertNumberIntoString(sp, '/', false, pm.spellPoints.currentValue, 3, '0');
				sp = Game.insertNumberIntoString(sp, '/', true, pm.spellPoints.totalMax, 3, '0');
				t[InfoText.SP] = game.textManager.create(sp, 15, paper, palette);
				let slp = uiString(UIText.SLP);
				slp = Game.insertNumberIntoString(slp, '  ', false, pm.spellLearningPoints, 3, '0');
				t[InfoText.SLP] = game.textManager.create(slp, 15, paper, palette);
			}
			const goldFood = Game.formatValueString(uiString(UIText.GoldFood), pm.gold, pm.food);
			t[InfoText.GoldAndFood] = game.textManager.create(goldFood, 15, paper, palette);
			const placeholder = uiString(UIText.Colon);
			t[InfoText.Damage] = game.textManager.create(Game.insertNumberIntoString(placeholder, ':', true, pm.damage + pm.bonusDamage, 3, '0'), 15, paper, palette);
			t[InfoText.Protection] = game.textManager.create(Game.insertNumberIntoString(placeholder, ':', true, pm.defense + pm.bonusDefense, 3, '0'), 15, paper, palette);
			this.swordIcon = game.createSprite(Layer.UI, { x: 208, y: 120 }, { width: 16, height: 10 }, game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.Sword), palette);
			this.shieldIcon = game.createSprite(Layer.UI, { x: 256, y: 120 }, { width: 16, height: 10 }, game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.Shield), palette);
			this.swordIcon.opaque = true;
			this.shieldIcon.opaque = true;
		}

		const lineHeight = t[InfoText.Gender].lineHeight;
		for (let i = 0; i < t.length; i++) {
			t[i]?.show(tx, ty, 2);
			ty += lineHeight;
			if (i === InfoText.EP) {
				tx = pp.x + 12;
				ty += lineHeight + 1;
			} else if (i === InfoText.SLP) {
				tx -= 6;
			} else if (i === InfoText.GoldAndFood) {
				if (this.swordIcon)
					tx = this.swordIcon.x + this.swordIcon.width + 2;
				ty += 2;
			} else if (i === InfoText.Damage) {
				if (this.shieldIcon)
					tx = this.shieldIcon.x + this.shieldIcon.width + 2;
				ty -= lineHeight;
			}
		}
	}

	get visible() { return this._visible; }
	set visible(v) {
		if (this._visible === v)
			return;
		this._visible = v;
		this.portraitBackground.visible = v;
		this.portrait.visible = v;
		this.name.visible = v;
		this.texts.forEach((t, i) => {
			if (t)
				t.visible = (i === InfoText.GoldAndFood || i === InfoText.Damage || i === InfoText.Protection) ? v && this._extended : v;
		});
		if (this.swordIcon) this.swordIcon.visible = v && this._extended;
		if (this.shieldIcon) this.shieldIcon.visible = v && this._extended;
	}

	get extended() { return this._extended; }
	set extended(v) {
		if (this._extended === v)
			return;
		this._extended = v;
		for (const i of [InfoText.GoldAndFood, InfoText.Damage, InfoText.Protection])
			if (this.texts[i])
				this.texts[i].visible = this._visible && v;
		if (this.swordIcon) this.swordIcon.visible = this._visible && v;
		if (this.shieldIcon) this.shieldIcon.visible = this._visible && v;
	}

	destroy() {
		this.portraitBackground.visible = false;
		this.portrait.visible = false;
		this.name.delete();
		this.texts.forEach(t => t?.delete());
		this.texts.fill(null);
		if (this.swordIcon) this.swordIcon.visible = false;
		if (this.shieldIcon) this.shieldIcon.visible = false;
	}
}
