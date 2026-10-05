// Port of Ambermoon.Renderer.OpenGL/Enums.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Enums.cs - Globally needed enumerations

export const SizingPolicy = Object.freeze({
	FitRatio: 0,
	FitWindow: 1,
	FitRatioKeepOrientation: 2,
	FitWindowKeepOrientation: 3,
	FitRatioForcePortrait: 4,
	FitRatioForceLandscape: 5,
	FitWindowForcePortrait: 6,
	FitWindowForceLandscape: 7
});

export const DeviceType = Object.freeze({
	Desktop: 0,
	MobilePortrait: 1,
	MobileLandscape: 2
});

export const Orientation = Object.freeze({
	Default: -1,
	PortraitTopDown: 0,
	PortraitBottomUp: 1,
	LandscapeLeftRight: 2,
	LandscapeRightLeft: 3
});

export const OrientationPolicy = Object.freeze({
	Fixed: 0,
	Support180DegreeRotation: 1
});

export const Rotation = Object.freeze({
	None: 0,
	Deg90: 1,
	Deg180: 2,
	Deg270: 3
});
