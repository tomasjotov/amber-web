// Port of Ambermoon.Data.Legacy/Characters/MonsterGroupWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class MonsterGroupWriter {
	static WriteMonsterGroup(monsterGroup, dataWriter) {
		for (let r = 0; r < 3; ++r) {
			for (let c = 0; c < 6; ++c) {
				// Note: The C# 2D array Monsters[c, r] is a jagged array Monsters[c][r] in JS.
				// IDataWriter.Write(ushort) -> WriteWord (the integer overloads can't be distinguished in JS).
				dataWriter.WriteWord((monsterGroup.Monsters[c][r]?.Index ?? 0) & 0xffff);
			}
		}
	}
}
