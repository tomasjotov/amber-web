// Port of Ambermoon.Data.Legacy/Serialization/PlacesReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Place } from '../../Ambermoon.Data.Common/Places.js';

/** string.Trim(' ', '\0') */
function trimSpaceAndNull(s) {
	return s.replace(/^[ \0]+|[ \0]+$/g, '');
}

export class PlacesReader {
	ReadPlaces(places, dataReader) {
		places.Entries.length = 0;

		const count = dataReader.ReadWord();

		for (let i = 0; i < count; ++i) {
			const place = new Place();
			place.Data = dataReader.ReadBytes(32);
			places.Entries.push(place);
		}

		for (let i = 0; i < count; ++i) {
			places.Entries[i].Name = trimSpaceAndNull(dataReader.ReadString(30));
		}
	}
}
