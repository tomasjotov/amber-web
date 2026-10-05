// Port of Ambermoon.Data.Common/IGraphicProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Only the enums are ported; the interfaces are pure interfaces.

// Note: 3D graphics are loaded through labdata
export const GraphicType = Object.freeze({
	Player: 0,
	Portrait: 1,
	Item: 2,
	Layout: 3,
	LabBackground: 4,
	Cursor: 5,
	Pics80x80: 6,
	UIElements: 7,
	EventPictures: 8,
	TravelGfx: 9,
	Transports: 10,
	NPC: 11,
	CombatBackground: 12,
	CombatGraphics: 13,
	BattleFieldIcons: 14,
	AutomapGraphics: 15,
	RiddlemouthGraphics: 16,
	Tileset1: 17 // NOTE: All other tilesets follow after this so keep this last!
});

export const MonsterRow = Object.freeze({
	Farthest: 0,
	Far: 1,
	Middle: 2,
	Near: 3
});
