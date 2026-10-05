// Port of Ambermoon.Data.Common/IGameData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// IGameData and ILegacyGameData are pure interfaces and therefore not ported.

export const GameDataSource = Object.freeze({
	Unknown: 0,
	Memory: 1,
	ADF: 2,
	LegacyFiles: 3,
	ADFAndLegacyFiles: 4
});

export const GameLanguage = Object.freeze({
	English: 0,
	German: 1,
	French: 2,
	Polish: 3,
	Czech: 4
});

/** Enum.TryParse(string, out GameLanguage) -> [success, value] */
function tryParseGameLanguage(languageString) {
	if (languageString == null)
		return [false, 0];

	const s = languageString.trim();

	if (/^[+-]?\d+$/.test(s))
		return [true, parseInt(s, 10)];

	if (Object.prototype.hasOwnProperty.call(GameLanguage, s))
		return [true, GameLanguage[s]];

	return [false, 0];
}

export class GameLanguageExtensions {
	static ToGameLanguage(languageString) {
		const [parsed, gameLanguage] = tryParseGameLanguage(languageString);

		if (parsed)
			return gameLanguage;

		languageString = languageString.toLowerCase().trim();

		if (languageString === 'german' || languageString === 'deutsch' || languageString === 'ger' || languageString === 'de')
			return GameLanguage.German;
		if (languageString === 'french' || languageString === 'français' || languageString === 'fre' || languageString === 'fr')
			return GameLanguage.French;
		if (languageString === 'polish' || languageString === 'polski' || languageString === 'pol' || languageString === 'pl')
			return GameLanguage.Polish;
		if (languageString === 'czech' || languageString === 'český' || languageString === 'česky' || languageString === 'ces' || languageString === 'cze' || languageString === 'cs')
			return GameLanguage.Czech;

		return GameLanguage.English;
	}
}
