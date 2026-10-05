// Port of Ambermoon.Data.Legacy/Characters/NPCWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EventWriter } from '../Serialization/EventWriter.js';
import { TextWriter } from '../Serialization/TextWriter.js';
import { CharacterWriter } from './CharacterWriter.js';

export class NPCWriter extends CharacterWriter {
	/**
	 * WriteNPC(npc, dataWriter) or WriteNPC(npc, dataWriter, npcTextWriter)
	 */
	WriteNPC(npc, dataWriter, npcTextWriter) {
		if (arguments.length >= 3) {
			this.WriteNPC(npc, dataWriter);
			TextWriter.WriteTexts(npcTextWriter, npc.Texts);
			return;
		}

		this.WriteCharacter(npc, dataWriter);
		EventWriter.WriteEvents(dataWriter, npc.Events, npc.EventList);
	}
}
