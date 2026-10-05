// Port of Ambermoon.Core/Render/Layer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const Layer = Object.freeze({
	// Note: Don't add aliases here as this is used for enumerating over all layers.
	None: -1,
	Map3DBackground: 0,
	Map3DBackgroundFog: 1,
	Map3DCeiling: 2,
	Map3D: 3,
	Billboards3D: 4,
	MapBackground1: 5,
	MapBackground2: 6,
	MapBackground3: 7,
	MapBackground4: 8,
	MapBackground5: 9,
	MapBackground6: 10,
	MapBackground7: 11,
	MapBackground8: 12,
	MapBackground9: 13,
	MapBackground10: 14,
	Characters: 15,
	MapForeground1: 16,
	MapForeground2: 17,
	MapForeground3: 18,
	MapForeground4: 19,
	MapForeground5: 20,
	MapForeground6: 21,
	MapForeground7: 22,
	MapForeground8: 23,
	MapForeground9: 24,
	MapForeground10: 25,
	FOW: 26,
	CombatBackground: 27,
	BattleMonsterRow: 28,
	BattleEffects: 29,
	UI: 30,
	Items: 31,
	Text: 32,
	SubPixelText: 33,
	SmallDigits: 34,
	MainMenuGraphics: 35,
	MainMenuText: 36,
	MainMenuEffects: 37,
	IntroGraphics: 38,
	IntroText: 39,
	IntroEffects: 40,
	OutroGraphics: 41,
	OutroText: 42,
	FantasyIntroGraphics: 43,
	FantasyIntroEffects: 44,
	Misc: 45,
	Images: 46,
	MobileOverlays: 47,
	Effects: 48,
	Cursor: 49,
	DrugEffect: 50,
});

// Partial part of the static class Global (see Ambermoon.Core/UI/Global.cs)
export class Global_Layer {
	static First2DLayer = Layer.MapBackground1;
	static Last2DLayer = Layer.MapForeground10;
	static LastLayer = Layer.DrugEffect;
}
