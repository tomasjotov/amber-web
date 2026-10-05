// Port of Ambermoon.Core/ICoreConfiguration.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Size } from '../Ambermoon.Common/Size.js';

export const SaveOption = Object.freeze({
	ProgramFolder: 0,
	DataFolder: 1,
});

export class ScreenResolutions {
	static GetPossibleResolutions(maxSize) {
		const resolutions = [];

		const defaultResolution = 16.0 / 10.0;
		const resolution = maxSize.Width / maxSize.Height;

		if (resolution <= defaultResolution + 0.0001) {
			// 16:10, 4:3, etc
			// Width is the leading dimension for resolutions.

			// 4/8, 5/8, 6/8 and 7/8 of max size
			for (let i = 0; i < 4; ++i) {
				const width = Math.trunc(maxSize.Width * (4 + i) / 8);
				resolutions.push(new Size(width, Math.trunc(width * 10 / 16)));
			}
		} else {
			// 16:9, etc
			// Height is the leading dimension for resolutions.

			// 4/8, 5/8, 6/8 and 7/8 of max size
			for (let i = 0; i < 4; ++i) {
				const height = Math.trunc(maxSize.Height * (4 + i) / 8);
				resolutions.push(new Size(Math.trunc(height * 16 / 10), height));
			}
		}

		return resolutions;
	}
}

export const GraphicFilter = Object.freeze({
	None: 0,
	Smooth: 1,
	Blur: 2,
	// Web port: edge-directed pixel art upscaler (xBR-lv2 style, see ScreenShader)
	PixelArt: 3,
});

export const GraphicFilterOverlay = Object.freeze({
	None: 0,
	Lines: 1,
	Grid: 2,
	Scanline: 3,
	CRT: 4,
});

export const Effects = Object.freeze({
	None: 0,
	Grayscale: 1,
	Sepia: 2,
});

export const Movement3D = Object.freeze({
	WASD: 0,
	WASDQE: 1,
});

// ICoreConfiguration is a pure interface (not ported).

export class ConfigurationExtensions {
	static GetScreenResolution(configuration) {
		let width = configuration.Width ?? null;
		let height = configuration.Height ?? null;

		if (width == null && height == null)
			width = 1280;

		if (width != null) {
			height = Math.trunc(width * 10 / 16);
		} else {
			width = Math.trunc(height * 16 / 10);
		}

		return new Size(width, height);
	}

	static GetScreenSize(configuration) {
		const width = configuration.Width ?? null;
		const height = configuration.Height ?? null;

		if (width != null && height != null)
			return new Size(width, height);

		return ConfigurationExtensions.GetScreenResolution(configuration);
	}
}
