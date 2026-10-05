// Port of Ambermoon.Renderer.OpenGL/TextShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// TextShader.cs - Shader for text rendering

import { TextureShader } from './TextureShader.js';

export class TextShader extends TextureShader {
	static DefaultTextColorIndexName = 'textColorIndex';

	// The palette has a size of 32xNumPalettes pixels.
	// Each row represents one palette of 32 colors.
	// So the palette index determines the pixel row.
	// The column is the palette color index from 0 to 31.
	static TextFragmentShader(state) {
		const S = TextShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform float ${S.DefaultUsePaletteName};`,
			`uniform float ${S.DefaultPaletteCountName};`,
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform sampler2D ${S.DefaultPaletteName};`,
			`in vec2 varTexCoord;`,
			`flat in float palIndex;`,
			`flat in float textColIndex;`,
			``,
			`void main()`,
			`{`,
			`    if (${S.DefaultUsePaletteName} > 0.5f)`,
			`    {`,
			`        float alpha = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f).r * 255.0f;`,
			`        if (alpha < 0.5f)`,
			`            discard;`,
			`        else`,
			`            ${S.DefaultFragmentOutColorName} = textureLod(${S.DefaultPaletteName}, vec2((textColIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`    }`,
			`    else`,
			`    {`,
			`        vec4 pixelColor = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f);`,
			`        if (pixelColor.a < 0.5f)`,
			`            discard;`,
			`        else`,
			`        {`,
			`            vec4 textColor = textureLod(${S.DefaultPaletteName}, vec2((textColIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`            ${S.DefaultFragmentOutColorName} = pixelColor * vec4(textColor.rgb, 1.0f);`,
			`        }`,
			`    }`,
			`}`
		];
	}

	static TextVertexShader(state) {
		const S = TextShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec2 ${S.DefaultPositionName};`,
			`in ivec2 ${S.DefaultTexCoordName};`,
			`in uint ${S.DefaultLayerName};`,
			`in uint ${S.DefaultPaletteIndexName};`,
			`in uint ${S.DefaultTextColorIndexName};`,
			`uniform uvec2 ${S.DefaultAtlasSizeName};`,
			`uniform float ${S.DefaultZName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`out vec2 varTexCoord;`,
			`flat out float palIndex;`,
			`flat out float textColIndex;`,
			``,
			`void main()`,
			`{`,
			`    vec2 atlasFactor = vec2(1.0f / float(${S.DefaultAtlasSizeName}.x), 1.0f / float(${S.DefaultAtlasSizeName}.y));`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x + 0.49f, ${S.DefaultPositionName}.y + 0.49f);`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    palIndex = float(${S.DefaultPaletteIndexName});`,
			`    textColIndex = float(${S.DefaultTextColorIndexName});`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f, 1.0f);`,
			`}`
		];
	}

	/**
	 * new TextShader(state),
	 * (protected) new TextShader(state, vertexShaderLines) or
	 * (protected) new TextShader(state, fragmentShaderLines, vertexShaderLines)
	 */
	constructor(state, linesA, linesB) {
		let fragmentShaderLines;
		let vertexShaderLines;

		if (linesA === undefined) {
			fragmentShaderLines = TextShader.TextFragmentShader(state);
			vertexShaderLines = TextShader.TextVertexShader(state);
		} else if (linesB === undefined) {
			fragmentShaderLines = TextShader.TextFragmentShader(state);
			vertexShaderLines = linesA;
		} else {
			fragmentShaderLines = linesA;
			vertexShaderLines = linesB;
		}

		super(state, fragmentShaderLines, vertexShaderLines);
	}

	static Create(state) { return new TextShader(state); }
}
