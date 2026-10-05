// Port of Ambermoon.Renderer.OpenGL/TextureShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// TextureShader.cs - Shader for textured objects

import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { ColorShader } from './ColorShader.js';

export class TextureShader extends ColorShader {
	static DefaultUsePaletteName = 'usePalette';
	static DefaultTexCoordName = 'texCoord';
	static DefaultSamplerName = 'sampler';
	static DefaultAtlasSizeName = 'atlasSize';
	static DefaultPaletteName = 'palette';
	static DefaultPaletteIndexName = 'paletteIndex';
	static DefaultColorKeyName = 'colorKeyIndex';
	static DefaultMaskColorIndexName = 'maskColorIndex';
	static DefaultPaletteCountName = 'palCount';

	// The palette has a size of 32xNumPalettes pixels.
	// Each row represents one palette of 32 colors.
	// So the palette index determines the pixel row.
	// The column is the palette color index from 0 to 31.
	static TextureFragmentShader(state) {
		const S = TextureShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform float ${S.DefaultUsePaletteName};`,
			`uniform float ${S.DefaultPaletteCountName};`,
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform sampler2D ${S.DefaultPaletteName};`,
			`uniform float ${S.DefaultColorKeyName};`,
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
			`    if (maskColIndex < 0.5f)`,
			`        ${S.DefaultFragmentOutColorName} = pixelColor;`,
			`    else`,
			`        ${S.DefaultFragmentOutColorName} = textureLod(${S.DefaultPaletteName}, vec2((maskColIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`}`
		];
	}

	static TextureVertexShader(state) {
		const S = TextureShader;
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
			`flat out float maskColIndex;`,
			``,
			`void main()`,
			`{`,
			`    vec2 atlasFactor = vec2(1.0f / float(${S.DefaultAtlasSizeName}.x), 1.0f / float(${S.DefaultAtlasSizeName}.y));`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x + 0.49f, ${S.DefaultPositionName}.y + 0.49f);`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    palIndex = float(${S.DefaultPaletteIndexName});`,
			`    maskColIndex = float(${S.DefaultMaskColorIndexName});`,
			`    float z = 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f;`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, z, 1.0f);`,
			`}`
		];
	}

	/**
	 * new TextureShader(state) or (protected) new TextureShader(state, fragmentShaderLines, vertexShaderLines)
	 */
	constructor(state, fragmentShaderLines, vertexShaderLines) {
		if (fragmentShaderLines === undefined) {
			fragmentShaderLines = TextureShader.TextureFragmentShader(state);
			vertexShaderLines = TextureShader.TextureVertexShader(state);
		}

		super(state, fragmentShaderLines, vertexShaderLines);
	}

	UsePalette(use) {
		this.shaderProgram.SetInput(TextureShader.DefaultUsePaletteName, use ? 1.0 : 0.0);
	}

	SetSampler(textureUnit = 0) {
		this.shaderProgram.SetInput(TextureShader.DefaultSamplerName, textureUnit);
	}

	SetPalette(textureUnit = 1) {
		this.shaderProgram.SetInput(TextureShader.DefaultPaletteName, textureUnit);
	}

	SetAtlasSize(width, height) {
		this.shaderProgram.SetInputVector2(TextureShader.DefaultAtlasSizeName, width, height);
	}

	SetColorKey(colorIndex) {
		if (colorIndex > 31)
			throw new AmbermoonException(ExceptionScope.Render, 'Color index must be in the range 0 to 31.');

		this.shaderProgram.SetInput(TextureShader.DefaultColorKeyName, colorIndex);
	}

	SetPaletteCount(count) {
		this.shaderProgram.SetInput(TextureShader.DefaultPaletteCountName, count);
	}

	static Create(state) { return new TextureShader(state); }
}
