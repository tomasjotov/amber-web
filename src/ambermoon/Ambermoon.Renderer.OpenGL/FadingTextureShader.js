// Port of Ambermoon.Renderer.OpenGL/FadingTextureShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// FadingTextureShader.cs - Shader for textured objects with palette fading

import { TextureShader } from './TextureShader.js';

export class FadingTextureShader extends TextureShader {
	static DefaultPaletteFadingSourceName = 'paletteFadingSrc';
	static DefaultPaletteFadingDestinationName = 'paletteFadingDst';
	static DefaultPaletteFadingSourceFactorName = 'paletteFadingSrcFactor';

	static FadingTextureFragmentShader(state) {
		const S = FadingTextureShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform float ${S.DefaultUsePaletteName};`,
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform sampler2D ${S.DefaultPaletteName};`,
			`uniform float ${S.DefaultColorKeyName};`,
			`uniform float ${S.DefaultPaletteCountName};`,
			`uniform float ${S.DefaultPaletteFadingSourceName};`,
			`uniform float ${S.DefaultPaletteFadingDestinationName};`,
			`uniform float ${S.DefaultPaletteFadingSourceFactorName};`,
			`in vec2 varTexCoord;`,
			`flat in float palIndex;`,
			`flat in float maskColIndex;`,
			``,
			`void main()`,
			`{`,
			`    vec4 pixelColor = vec4(0);`,
			`    if (${S.DefaultUsePaletteName} > 0.5f)`,
			`    {`,
			`        float colorIndex = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f).r * 255.0f;`,
			`        `,
			`        if (colorIndex < 0.5f)`,
			`            discard;`,
			`        else`,
			`        {`,
			`            if (colorIndex >= 31.5f)`,
			`                colorIndex = 0.0f;`,
			`            if (colorIndex < 15.5f && ${S.DefaultPaletteFadingSourceName} > 0.5f)`,
			`            {`,
			`                vec4 srcPixelColor = textureLod(${S.DefaultPaletteName}, vec2((colorIndex + 16.5f) / 32.0f, (${S.DefaultPaletteFadingSourceName} - 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`                vec4 dstPixelColor = textureLod(${S.DefaultPaletteName}, vec2((colorIndex + 0.5f) / 32.0f, (${S.DefaultPaletteFadingDestinationName} - 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`                pixelColor = mix(dstPixelColor, srcPixelColor, ${S.DefaultPaletteFadingSourceFactorName});`,
			`            }`,
			`            else`,
			`            {`,
			`                pixelColor = textureLod(${S.DefaultPaletteName}, vec2((colorIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`            }`,
			`        }`,
			`    }`,
			`    else`,
			`    {`,
			`        pixelColor = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f);`,
			`        if (pixelColor.a < 0.5f)`,
			`            discard;`,
			`    }`,
			`    `,
			`    if (maskColIndex < 0.5f)`,
			`        ${S.DefaultFragmentOutColorName} = pixelColor;`,
			`    else`,
			`        ${S.DefaultFragmentOutColorName} = textureLod(${S.DefaultPaletteName}, vec2((maskColIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`}`
		];
	}

	SetPaletteFading(paletteFading) {
		const S = FadingTextureShader;

		if (paletteFading == null) {
			this.shaderProgram.SetInput(S.DefaultPaletteFadingSourceName, 0.0);
			this.shaderProgram.SetInput(S.DefaultPaletteFadingDestinationName, 0.0);
			this.shaderProgram.SetInput(S.DefaultPaletteFadingSourceFactorName, 0.0);
		} else {
			this.shaderProgram.SetInput(S.DefaultPaletteFadingSourceName, paletteFading.SourcePalette + 1.0);
			this.shaderProgram.SetInput(S.DefaultPaletteFadingDestinationName, paletteFading.DestinationPalette + 1.0);
			this.shaderProgram.SetInput(S.DefaultPaletteFadingSourceFactorName, paletteFading.SourceFactor);
		}
	}

	constructor(state) {
		super(state, FadingTextureShader.FadingTextureFragmentShader(state), TextureShader.TextureVertexShader(state));
	}

	static Create(state) { return new FadingTextureShader(state); }
}
