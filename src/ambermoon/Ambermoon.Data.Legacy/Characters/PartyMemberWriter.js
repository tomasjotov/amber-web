// Port of Ambermoon.Data.Legacy/Characters/PartyMemberWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EventWriter } from '../Serialization/EventWriter.js';
import { TextWriter } from '../Serialization/TextWriter.js';
import { CharacterWriter } from './CharacterWriter.js';

export class PartyMemberWriter extends CharacterWriter {
	/**
	 * WritePartyMember(partyMember, dataWriter) or WritePartyMember(partyMember, dataWriter, textWriter)
	 */
	WritePartyMember(partyMember, dataWriter, textWriter) {
		if (arguments.length >= 3) {
			this.WritePartyMember(partyMember, dataWriter);
			TextWriter.WriteTexts(textWriter, partyMember.Texts);
			return;
		}

		this.WriteCharacter(partyMember, dataWriter);
		EventWriter.WriteEvents(dataWriter, partyMember.Events, partyMember.EventList);
	}
}
