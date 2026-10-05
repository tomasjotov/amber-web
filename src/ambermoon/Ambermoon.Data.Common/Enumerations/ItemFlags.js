// Port of Ambermoon.Data.Common/Enumerations/ItemFlags.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const ItemFlags = Object.freeze({
	None: 0,
	Accursed: 1,
	NotImportant: 2,
	Stackable: 4,
	RemovableDuringFight: 8,
	DestroyAfterUsage: 0x10,
	Indestructible: 0x20,
	Cloneable: 0x40,
	ExtendedGraphicIndex: 0x80
});
