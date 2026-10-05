// Port of Ambermoon.Data.Legacy/Characters/CharacterManager.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, getValue } from '../../../runtime.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { NPC } from '../../Ambermoon.Data.Common/NPC.js';
import { Monster } from '../../Ambermoon.Data.Common/Monster.js';
import { MonsterGroup } from '../../Ambermoon.Data.Common/MonsterGroup.js';
import { DataReader } from '../Serialization/DataReader.js';
import { DataWriter } from '../Serialization/DataWriter.js';
import { PartyMemberReader } from './PartyMemberReader.js';
import { NPCReader } from './NPCReader.js';
import { MonsterReader } from './MonsterReader.js';
import { MonsterGroupReader } from './MonsterGroupReader.js';
import { MonsterWriter } from './MonsterWriter.js';

// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

export class CharacterManager {
	constructor(gameData) {
		this.initialPartyMembers = new Map();
		this.npcs = new Map();
		this.monsters = new Map();
		this.monsterGroups = new Map();

		const partyMemberReader = new PartyMemberReader();
		const npcReader = new NPCReader();
		const monsterReader = new MonsterReader(gameData);
		const monsterGroupReader = new MonsterGroupReader();

		let partyCharacterContainer = gameData.Files.get('Initial/Party_char.amb');
		if (partyCharacterContainer === undefined)
			partyCharacterContainer = getValue(gameData.Files, 'Save.00/Party_char.amb');
		let monsterDataContainer = gameData.Files.get('Monster_char_data.amb');
		if (monsterDataContainer === undefined)
			monsterDataContainer = getValue(gameData.Files, 'Monster_char.amb');

		for (const [key, value] of partyCharacterContainer.Files) {
			if (value.Size !== 0)
				add(this.initialPartyMembers, key, PartyMember.Load(key, partyMemberReader, value, getValue(getValue(gameData.Files, 'Party_texts.amb').Files, key)));
		}
		for (const [key, value] of getValue(gameData.Files, 'NPC_char.amb').Files) {
			if (value.Size !== 0)
				add(this.npcs, key, NPC.Load(key, npcReader, value, getValue(getValue(gameData.Files, 'NPC_texts.amb').Files, key)));
		}
		for (const [key, value] of monsterDataContainer.Files) {
			if (value.Size !== 0)
				add(this.monsters, key, Monster.Load(key, monsterReader, value));
		}
		for (const [key, value] of getValue(gameData.Files, 'Monster_groups.amb').Files) { // load after monsters!
			if (value.Size !== 0)
				add(this.monsterGroups, key, MonsterGroup.Load(this, monsterGroupReader, value));
		}
	}

	GetMonster(index) { return index === 0 || !this.monsters.has(index) ? null : this.monsters.get(index); }

	CloneMonster(monster) {
		const writer = new DataWriter();
		const monsterWriter = new MonsterWriter();
		monsterWriter.WriteMonster(monster, writer);

		const reader = DataReader.FromData(writer.ToArray());
		const monsterReader = new MonsterReader();
		const clone = Monster.Load(monster.Index, monsterReader, reader);
		clone.CombatGraphic = monster.CombatGraphic;

		return clone;
	}

	GetInitialPartyMember(index) { return index === 0 || !this.initialPartyMembers.has(index) ? null : this.initialPartyMembers.get(index); }

	GetNPC(index) { return index === 0 || !this.npcs.has(index) ? null : this.npcs.get(index); }

	GetMonsterGroup(index) { return index === 0 || !this.monsterGroups.has(index) ? null : this.monsterGroups.get(index); }

	get InitialPartyMembers() { return [...this.initialPartyMembers.values()]; }
	get NPCs() { return [...this.npcs.values()]; }
	get Monsters() { return [...this.monsters.values()]; }
	get MonsterGroups() { return this.monsterGroups; }
	get MonsterGraphicAtlasProvider() { return null; } // If not given, the CombatGraphic of the Monster is used to create the texture atlas.
}
