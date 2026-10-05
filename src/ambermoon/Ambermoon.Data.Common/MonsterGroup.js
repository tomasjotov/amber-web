// Port of Ambermoon.Data.Common/MonsterGroup.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { newArray2D } from '../../runtime.js';

export class MonsterGroup {
	constructor() {
		/** C# Monster[6, 3] -> jagged array Monsters[column][row] */
		this.Monsters = newArray2D(6, 3);
	}

	static Load(characterManager, monsterGroupReader, dataReader) {
		const monsterGroup = new MonsterGroup();

		monsterGroupReader.ReadMonsterGroup(characterManager, monsterGroup, dataReader);

		return monsterGroup;
	}
}
