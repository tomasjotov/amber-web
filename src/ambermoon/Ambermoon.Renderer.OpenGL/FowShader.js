// Port of Ambermoon.Renderer.OpenGL/FowShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// FowShader.cs - Shader for the fog of war (light radius in dark 2D maps)

import { ColorShader } from './ColorShader.js';

export class FowShader extends ColorShader {
	static DefaultCenterName = 'center';
	static DefaultRadiusName = 'radius';

	static FowFragmentShader(state) {
		const S = FowShader;
		return [
			S.GetFragmentShaderHeader(state),
			`in vec2 currentPos;`,
			`flat in vec2 fowCenter;`,
			`flat in float fowRadius;`,
			``,
			`void main()`,
			`{`,
			`    vec2 dist = abs(currentPos - fowCenter);`,
			`    float d = sqrt(dist.x * dist.x + dist.y * dist.y);`,
			`    float alpha = d < fowRadius ? 0.0f : 1.0f;`,
			`    ${S.DefaultFragmentOutColorName} = vec4(0, 0, 0, alpha);`,
			`}`
		];
	}

	static FowVertexShader(state) {
		const S = FowShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec2 ${S.DefaultPositionName};`,
			`in uint ${S.DefaultLayerName};`,
			`in vec2 ${S.DefaultCenterName};`,
			`in uint ${S.DefaultRadiusName};`,
			`uniform float ${S.DefaultZName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`out vec2 currentPos;`,
			`flat out vec2 fowCenter;`,
			`flat out float fowRadius;`,
			``,
			`void main()`,
			`{`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x, ${S.DefaultPositionName}.y);`,
			`    fowCenter = vec2(${S.DefaultCenterName}.x, ${S.DefaultCenterName}.y);`,
			`    fowRadius = float(${S.DefaultRadiusName});`,
			`    currentPos = pos;`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos + vec2(0.49f, 0.49f), 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f, 1.0f);`,
			`}`
		];
	}

	/**
	 * new FowShader(state) or (protected) new FowShader(state, fragmentShaderLines, vertexShaderLines)
	 */
	constructor(state, fragmentShaderLines, vertexShaderLines) {
		if (fragmentShaderLines === undefined) {
			fragmentShaderLines = FowShader.FowFragmentShader(state);
			vertexShaderLines = FowShader.FowVertexShader(state);
		}

		super(state, fragmentShaderLines, vertexShaderLines);
	}

	static Create(state) { return new FowShader(state); }
}
