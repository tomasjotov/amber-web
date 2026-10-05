// Port of Ambermoon.Renderer.OpenGL/AlphaTextureShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// AlphaTextureShader.cs - Shader for textured objects with alpha

import { TextureShader } from './TextureShader.js';

export class AlphaTextureShader extends TextureShader {
	static DefaultAlphaName = 'alpha';

	static AlphaTextureFragmentShader(state) {
		const S = AlphaTextureShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform float ${S.DefaultUsePaletteName};`,
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform sampler2D ${S.DefaultPaletteName};`,
			`uniform float ${S.DefaultColorKeyName};`,
			`uniform float ${S.DefaultPaletteCountName};`,
			`in vec2 varTexCoord;`,
			`flat in float palIndex;`,
			`flat in float maskColIndex;`,
			`flat in float a;`,
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
			`            pixelColor = textureLod(${S.DefaultPaletteName}, vec2((colorIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`        }`,
			`    }`,
			`    else`,
			`    {`,
			`        pixelColor = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f);`,
			`        if (pixelColor.a < 0.5f)`,
			`            discard;`,
			`    }`,
			`    `,
			`    if (maskColIndex > 0.5f)`,
			`        pixelColor = textureLod(${S.DefaultPaletteName}, vec2((maskColIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`    ${S.DefaultFragmentOutColorName} = vec4(pixelColor.rgb, pixelColor.a * a);`,
			`}`
		];
	}

	static AlphaTextureVertexShader(state) {
		const S = AlphaTextureShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec2 ${S.DefaultPositionName};`,
			`in ivec2 ${S.DefaultTexCoordName};`,
			`in uint ${S.DefaultLayerName};`,
			`in uint ${S.DefaultPaletteIndexName};`,
			`in uint ${S.DefaultMaskColorIndexName};`,
			`in uint ${S.DefaultAlphaName};`,
			`uniform uvec2 ${S.DefaultAtlasSizeName};`,
			`uniform float ${S.DefaultZName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`out vec2 varTexCoord;`,
			`flat out float palIndex;`,
			`flat out float maskColIndex;`,
			`flat out float a;`,
			``,
			`void main()`,
			`{`,
			`    vec2 atlasFactor = vec2(1.0f / float(${S.DefaultAtlasSizeName}.x), 1.0f / float(${S.DefaultAtlasSizeName}.y));`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x + 0.49f, ${S.DefaultPositionName}.y + 0.49f);`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    palIndex = float(${S.DefaultPaletteIndexName});`,
			`    a = float(${S.DefaultAlphaName}) / 255.0f;`,
			`    maskColIndex = float(${S.DefaultMaskColorIndexName});`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f, 1.0f);`,
			`}`
		];
	}

	constructor(state) {
		super(state, AlphaTextureShader.AlphaTextureFragmentShader(state), AlphaTextureShader.AlphaTextureVertexShader(state));
	}

	static Create(state) { return new AlphaTextureShader(state); }
}
