// Port of Ambermoon.Data.Common/Enumerations/Language.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const Language = Object.freeze({
	None: 0,
	Human: 1,
	Elfish: 2,
	Dwarfish: 4,
	Gnomish: 8,
	Sylphic: 0x10,
	Felinic: 0x20,
	Morag: 0x40,
	Animal: 0x80
});

export const ExtendedLanguage = Object.freeze({
	None: 0,
	Ancient: 1
});
