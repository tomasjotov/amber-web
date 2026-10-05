// Port of Ambermoon.Data.Legacy/Characters/PartyMemberReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EventReader } from '../Serialization/EventReader.js';
import { TextReader } from '../Serialization/TextReader.js';
import { CharacterReader } from './CharacterReader.js';

export class PartyMemberReader extends CharacterReader {
	ReadPartyMember(partyMember, dataReader, partyTextReader, fallbackDataReader = null) {
		this.ReadCharacter(partyMember, dataReader);
		const eventOffset = dataReader.Position;
		try {
			EventReader.ReadEvents(dataReader, partyMember.Events, partyMember.EventList);
		}
		catch (e) {
			if (fallbackDataReader == null)
				throw e;

			// Events were messed up on writing but we can load them from initial save eventually.
			partyMember.EventList.length = 0;
			partyMember.Events.length = 0;
			fallbackDataReader.Position = eventOffset;
			EventReader.ReadEvents(fallbackDataReader, partyMember.Events, partyMember.EventList);
			console.log('Fixed corrupted savegame');
		}
		partyMember.Texts = partyTextReader == null ? [] : TextReader.ReadTexts(partyTextReader);
	}
}
