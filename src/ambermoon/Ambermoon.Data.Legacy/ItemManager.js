// Port of Ambermoon.Data.Legacy/ItemManager.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { getValue } from '../../runtime.js';

export class ItemManager {
	/**
	 * @param {Map<number, Item>} items
	 */
	constructor(items) {
		this.itemTexts = new Map();
		this.items = items;
	}

	AddTexts(index, texts) {
		this.itemTexts.set(index, texts);
	}

	GetItem(index) { return getValue(this.items, index); }

	GetText(index, subIndex) {
		const texts = this.itemTexts.get(index);
		return texts !== undefined ? subIndex < texts.length ? texts[subIndex] : null : null;
	}

	get Items() { return [...this.items.values()]; }
}
