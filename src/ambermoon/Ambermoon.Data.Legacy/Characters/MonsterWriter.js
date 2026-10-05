// Port of Ambermoon.Data.Legacy/Characters/MonsterWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { CharacterWriter } from './CharacterWriter.js';

// Note: IDataWriter.Write(byte/ushort) can't be distinguished in JS. The DataWriter port provides WriteByte / WriteWord.
const writeByte = (writer, value) => writer.WriteByte(value & 0xff);
const writeWord = (writer, value) => writer.WriteWord(value & 0xffff);

export class MonsterWriter extends CharacterWriter {
	WriteMonster(monster, dataWriter) {
		this.WriteCharacter(monster, dataWriter);

		for (const animation of monster.Animations)
			dataWriter.Write(animation.FrameIndices);

		for (const animation of monster.Animations)
			writeByte(dataWriter, animation.UsedAmount);

		dataWriter.Write(monster.AtariPalette);
		dataWriter.Write(monster.MonsterPalette);
		writeByte(dataWriter, monster.AlternateAnimationBits);
		writeByte(dataWriter, monster.PaddingByte);
		writeWord(dataWriter, monster.FrameWidth);
		writeWord(dataWriter, monster.FrameHeight);
		writeWord(dataWriter, monster.MappedFrameWidth);
		writeWord(dataWriter, monster.MappedFrameHeight);
	}
}
