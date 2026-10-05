// Port of Ambermoon.Data.Legacy/Characters/MonsterGroupReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class MonsterGroupReader {
	ReadMonsterGroup(characterManager, monsterGroup, dataReader) {
		dataReader.Position = 0;

		for (let r = 0; r < 3; ++r) {
			for (let c = 0; c < 6; ++c) {
				const monsterIndex = dataReader.ReadWord();

				// Note: The C# 2D array Monsters[c, r] is a jagged array Monsters[c][r] in JS.
				monsterGroup.Monsters[c][r] = monsterIndex === 0 ? null :
					characterManager.GetMonster(monsterIndex);
			}
		}
	}
}
