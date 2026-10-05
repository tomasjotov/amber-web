// Port of Ambermoon.Renderer.OpenGL/SkyShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// SkyShader.cs - Shader for the 3D sky / horizon

import { TextureShader } from './TextureShader.js';

// NOTE: This won't support non-palette graphics as it uses the color indices
// for color replacements.
export class SkyShader extends TextureShader {
	static DefaultLightName = 'light';
	static DefaultColorReplaceName = 'palReplace';
	static DefaultUseColorReplaceName = 'useReplace';

	// The palette has a size of 32xNumPalettes pixels.
	// Each row represents one palette of 32 colors.
	// So the palette index determines the pixel row.
	// The column is the palette color index from 0 to 31.
	static SkyFragmentShader(state) {
		const S = SkyShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform sampler2D ${S.DefaultPaletteName};`,
			`uniform float ${S.DefaultColorKeyName};`,
			`uniform float ${S.DefaultLightName};`,
			`uniform float ${S.DefaultPaletteCountName};`,
			`uniform vec4 ${S.DefaultColorReplaceName}[16];`,
			`uniform float ${S.DefaultUseColorReplaceName};`,
			`in vec2 varTexCoord;`,
			`flat in float palIndex;`,
			``,
			`void main()`,
			`{`,
			`    float colorIndex = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f).r * 255.0f;`,
			`    `,
			`    if (colorIndex < 0.5f || ${S.DefaultLightName} < 0.01f)`,
			`        discard;`,
			`    else`,
			`    {`,
			`        vec4 pixelColor = ${S.DefaultUseColorReplaceName} > 0.5f && colorIndex < 15.5f ? ${S.DefaultColorReplaceName}[int(colorIndex + 0.5f)]`,
			`            : textureLod(${S.DefaultPaletteName}, vec2((colorIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`        ${S.DefaultFragmentOutColorName} = vec4(max(vec3(0), pixelColor.rgb + vec3(${S.DefaultLightName}) - 1.0f), pixelColor.a);`,
			`    }`,
			`}`
		];
	}

	static SkyVertexShader(state) {
		const S = SkyShader;
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
			`    int index = int(mod(float(gl_VertexID), 4.0f));`,
			`    float dx = index == 0 || index == 3 ? -0.49f : 0.49f;`,
			`    float dy = index < 2 ? -0.49f : 0.49f;`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x + dx, ${S.DefaultPositionName}.y + dy);`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    palIndex = float(${S.DefaultPaletteIndexName});`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f, 1.0f);`,
			`}`
		];
	}

	constructor(state) {
		super(state, SkyShader.SkyFragmentShader(state), SkyShader.SkyVertexShader(state));
	}

	SetLight(light) {
		this.shaderProgram.SetInput(SkyShader.DefaultLightName, light);
	}

	SetPaletteReplacement(paletteReplacement) {
		if (paletteReplacement == null) {
			this.shaderProgram.SetInput(SkyShader.DefaultUseColorReplaceName, 0.0);
		} else {
			this.shaderProgram.SetInputColorArray(SkyShader.DefaultColorReplaceName, paletteReplacement.ColorData);
			this.shaderProgram.SetInput(SkyShader.DefaultUseColorReplaceName, 1.0);
		}
	}

	static Create(state) { return new SkyShader(state); }
}
