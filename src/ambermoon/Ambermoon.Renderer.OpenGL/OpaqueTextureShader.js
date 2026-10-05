// Port of Ambermoon.Renderer.OpenGL/OpaqueTextureShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// OpaqueTextureShader.cs - Shader for opaque textured objects

import { TextureShader } from './TextureShader.js';

export class OpaqueTextureShader extends TextureShader {
	static OpaqueTextureFragmentShader(state) {
		const S = OpaqueTextureShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform float ${S.DefaultUsePaletteName};`,
			`uniform float ${S.DefaultPaletteCountName};`,
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform sampler2D ${S.DefaultPaletteName};`,
			`in vec2 varTexCoord;`,
			`flat in float palIndex;`,
			``,
			`void main()`,
			`{`,
			`    vec4 pixelColor;`,
			`    if (${S.DefaultUsePaletteName} > 0.5f)`,
			`    {`,
			`        float colorIndex = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f).r * 255.0f;`,
			`        pixelColor = textureLod(${S.DefaultPaletteName}, vec2((colorIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`    }`,
			`    else`,
			`    {`,
			`        pixelColor = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f);`,
			`    }`,
			`    `,
			`    ${S.DefaultFragmentOutColorName} = pixelColor;`,
			`}`
		];
	}

	static OpaqueTextureVertexShader(state) {
		const S = OpaqueTextureShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec2 ${S.DefaultPositionName};`,
			`in ivec2 ${S.DefaultTexCoordName};`,
			`in uint ${S.DefaultLayerName};`,
			`in uint ${S.DefaultPaletteIndexName};`,
			`in uint ${S.DefaultMaskColorIndexName};`,
			`uniform uvec2 ${S.DefaultAtlasSizeName};`,
			`uniform float ${S.DefaultZName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`out vec2 varTexCoord;`,
			`flat out float palIndex;`,
			``,
			`void main()`,
			`{`,
			`    vec2 atlasFactor = vec2(1.0f / float(${S.DefaultAtlasSizeName}.x), 1.0f / float(${S.DefaultAtlasSizeName}.y));`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x + 0.49f, ${S.DefaultPositionName}.y + 0.49f);`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    palIndex = float(${S.DefaultPaletteIndexName});`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f, 1.0f);`,
			`}`
		];
	}

	constructor(state) {
		super(state, OpaqueTextureShader.OpaqueTextureFragmentShader(state), OpaqueTextureShader.OpaqueTextureVertexShader(state));
	}

	static Create(state) { return new OpaqueTextureShader(state); }
}
