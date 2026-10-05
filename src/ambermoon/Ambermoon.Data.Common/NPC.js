// Port of Ambermoon.Data.Common/NPC.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Character } from './Character.js';
import { CharacterType } from './Enumerations/CharacterType.js';

export class NPC extends Character {
	constructor() {
		super(CharacterType.NPC);

		this.Texts = null;
		this.Events = [];
		this.EventList = [];
	}

	get LookAtTextIndex() { return this.LookAtCharTextIndex; }

	static Load(index, npcReader, dataReader, npcTextReader) {
		const npc = new NPC();
		npc.Index = index;

		npcReader.ReadNPC(npc, dataReader, npcTextReader);

		return npc;
	}
}
