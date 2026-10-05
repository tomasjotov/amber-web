// Port of Ambermoon.Data.Legacy/Characters/NPCReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EventReader } from '../Serialization/EventReader.js';
import { TextReader } from '../Serialization/TextReader.js';
import { CharacterReader } from './CharacterReader.js';

export class NPCReader extends CharacterReader {
	ReadNPC(npc, dataReader, npcTextReader) {
		this.ReadCharacter(npc, dataReader);
		EventReader.ReadEvents(dataReader, npc.Events, npc.EventList);
		npc.Texts = TextReader.ReadTexts(npcTextReader);
	}
}
