// Port of Ambermoon.Renderer.OpenGL/SubPixelTextShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// SubPixelTextShader.cs - Shader for sub-pixel text rendering

import { TextShader } from './TextShader.js';

export class SubPixelTextShader extends TextShader {
	static TextVertexShader(state) {
		const S = SubPixelTextShader;
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
			`    vec2 pos = vec2(${S.DefaultPositionName}.x, ${S.DefaultPositionName}.y);`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    palIndex = float(${S.DefaultPaletteIndexName});`,
			`    textColIndex = float(${S.DefaultTextColorIndexName});`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f, 1.0f);`,
			`}`
		];
	}

	constructor(state) {
		super(state, SubPixelTextShader.TextVertexShader(state));
	}

	static Create(state) { return new SubPixelTextShader(state); }
}
