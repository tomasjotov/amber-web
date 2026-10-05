// Port of Ambermoon.Renderer.OpenGL/EffectShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// EffectShader.cs - Shader for screen effects (grayscale, sepia)

import { ScreenShader } from './ScreenShader.js';

// Note: The texture has the same size as the whole screen so
// the position is also the texture coordinate!
export class EffectShader extends ScreenShader {
	static EffectFragmentShader(state) {
		const S = EffectShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform vec2 ${S.DefaultResolutionName};`,
			`uniform float ${S.DefaultPrimaryModeName};`,
			`in vec2 varTexCoord;`,
			``,
			`float gray(vec4 color)`,
			`{`,
			`    return 0.299f * color.r + 0.587f * color.g + 0.114f * color.b;`,
			`}`,
			``,
			`vec4 getColor(vec2 coord)`,
			`{`,
			`    return textureLod(${S.DefaultSamplerName}, coord, 0.0f);`,
			`}`,
			``,
			`void main()`,
			`{`,
			`    vec4 color = getColor(varTexCoord);`,
			`    if (${S.DefaultPrimaryModeName} > 0.5f && ${S.DefaultPrimaryModeName} < 1.5f) // grayscale mode`,
			`    {`,
			`        float g = gray(color);`,
			`        color = vec4(g, g, g, color.a);`,
			`    }`,
			`    else if (${S.DefaultPrimaryModeName} > 1.5f && ${S.DefaultPrimaryModeName} < 2.5f) // sepia mode`,
			`    {`,
			`        float r = (color.r * 0.393f) + (color.g * 0.769f) + (color.b * 0.189f);`,
			`        float g = (color.r * 0.349f) + (color.g * 0.686f) + (color.b * 0.168f);`,
			`        float b = (color.r * 0.272f) + (color.g * 0.534f) + (color.b * 0.131f);`,
			`        color = vec4(r, g, b, color.a);`,
			`    }`,
			`    ${S.DefaultFragmentOutColorName} = color;`,
			`}`
		];
	}

	static EffectVertexShader(state) {
		const S = EffectShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec2 ${S.DefaultPositionName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`uniform vec2 ${S.DefaultResolutionName};`,
			`out vec2 varTexCoord;`,
			``,
			`void main()`,
			`{`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x, ${S.DefaultPositionName}.y);`,
			`    varTexCoord = vec2(pos.x / ${S.DefaultResolutionName}.x, (${S.DefaultResolutionName}.y - pos.y) / ${S.DefaultResolutionName}.y);`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, 0.001f, 1.0f);`,
			`}`
		];
	}

	constructor(state) {
		super(state, EffectShader.EffectFragmentShader(state), EffectShader.EffectVertexShader(state));
	}

	/** SetMode(int mode) - note: the base class has SetMode(primary, secondary) */
	SetMode(primary, secondary) {
		if (arguments.length >= 2) {
			super.SetMode(primary, secondary);
			return;
		}

		this.shaderProgram.SetInput(EffectShader.DefaultPrimaryModeName, primary);
	}

	static Create(state) { return new EffectShader(state); }
}
