// Port of Ambermoon.Renderer.OpenGL/ColorShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ColorShader.cs - Shader for colored objects
//
// WebGL2: the shaders use the GLES variant of the C# code (#version 300 es).

import { Shader } from './Shader.js';
import { ShaderProgram } from './ShaderProgram.js';

/** "#version 300 es" for GLSL ES 3.00 (C#: $"#version {major}{minor:00} es") */
export function GetGLSLVersionLine(state) {
	const major = state.GLSLVersionMajor || 3;
	const minor = state.GLSLVersionMinor || 0;
	return `#version ${major}${String(minor).padStart(2, '0')} es\n`;
}

export class ColorShader {
	static DefaultFragmentOutColorName = 'outColor';
	static DefaultPositionName = 'position';
	static DefaultModelViewMatrixName = 'mvMat';
	static DefaultProjectionMatrixName = 'projMat';
	static DefaultColorName = 'color';
	static DefaultZName = 'z';
	static DefaultLayerName = 'layer';

	static GetFragmentShaderHeader(state) {
		let header = GetGLSLVersionLine(state);

		header += '\n';
		header += '#ifdef GL_ES\n';
		header += ' precision highp float;\n';
		header += ' precision highp int;\n';
		header += '#endif\n';
		header += '\n';
		header += `out vec4 ${ColorShader.DefaultFragmentOutColorName};\n`;

		return header;
	}

	static GetVertexShaderHeader(state) {
		return GetGLSLVersionLine(state) + '\n';
	}

	static ColorFragmentShader(state) {
		const S = ColorShader;
		return [
			S.GetFragmentShaderHeader(state),
			`flat in vec4 pixelColor;`,
			``,
			`void main()`,
			`{`,
			`    ${S.DefaultFragmentOutColorName} = pixelColor;`,
			`}`
		];
	}

	static ColorVertexShader(state) {
		const S = ColorShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec2 ${S.DefaultPositionName};`,
			`in uint ${S.DefaultLayerName};`,
			`in uvec4 ${S.DefaultColorName};`,
			`uniform float ${S.DefaultZName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`flat out vec4 pixelColor;`,
			``,
			`void main()`,
			`{`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x + 0.49f, ${S.DefaultPositionName}.y + 0.49f);`,
			`    pixelColor = vec4(float(${S.DefaultColorName}.r) / 255.0f, float(${S.DefaultColorName}.g) / 255.0f, float(${S.DefaultColorName}.b) / 255.0f, float(${S.DefaultColorName}.a) / 255.0f);`,
			`    `,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f, 1.0f);`,
			`}`
		];
	}

	UpdateMatrices(state) {
		this.shaderProgram.SetInputMatrix(ColorShader.DefaultModelViewMatrixName, state.CurrentModelViewMatrix.ToArray(), true);
		this.shaderProgram.SetInputMatrix(ColorShader.DefaultProjectionMatrixName, state.CurrentProjectionMatrix.ToArray(), true);
	}

	Use() {
		if (this.shaderProgram !== ShaderProgram.ActiveProgram)
			this.shaderProgram.Use();
	}

	/**
	 * new ColorShader(state) or (protected) new ColorShader(state, fragmentShaderLines, vertexShaderLines)
	 */
	constructor(state, fragmentShaderLines, vertexShaderLines) {
		if (fragmentShaderLines === undefined) {
			fragmentShaderLines = ColorShader.ColorFragmentShader(state);
			vertexShaderLines = ColorShader.ColorVertexShader(state);
		}

		const fragmentShader = new Shader(state, Shader.Type.Fragment, fragmentShaderLines.join('\n'));
		const vertexShader = new Shader(state, Shader.Type.Vertex, vertexShaderLines.join('\n'));

		this.shaderProgram = new ShaderProgram(state, fragmentShader, vertexShader);

		this.State = state;
	}

	get ShaderProgram() { return this.shaderProgram; }

	SetZ(z) {
		this.shaderProgram.SetInput(ColorShader.DefaultZName, z);
	}

	static Create(state) { return new ColorShader(state); }
}
