// Port of Ambermoon.Renderer.OpenGL/ImageShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ImageShader.cs - Shader for non-palette images

import { TextureShader } from './TextureShader.js';
import { AlphaTextureShader } from './AlphaTextureShader.js';

export class ImageShader extends TextureShader {
	static get DefaultAlphaName() { return AlphaTextureShader.DefaultAlphaName; }

	static ImageFragmentShader(state) {
		const S = ImageShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`in vec2 varTexCoord;`,
			`flat in float a;`,
			``,
			`void main()`,
			`{`,
			`    vec4 color = textureLod(${S.DefaultSamplerName}, varTexCoord, 0.0f);`,
			`    `,
			`    if (color.a < 0.001f)`,
			`        discard;`,
			`    `,
			`    ${S.DefaultFragmentOutColorName} = vec4(color.rgb, color.a * a);`,
			`}`
		];
	}

	static ImageVertexShader(state) {
		const S = ImageShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec2 ${S.DefaultPositionName};`,
			`in ivec2 ${S.DefaultTexCoordName};`,
			`in uint ${S.DefaultLayerName};`,
			`in uint ${S.DefaultAlphaName};`,
			`uniform float ${S.DefaultZName};`,
			`uniform uvec2 ${S.DefaultAtlasSizeName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`out vec2 varTexCoord;`,
			`flat out float a;`,
			``,
			`void main()`,
			`{`,
			`    vec2 atlasFactor = vec2(1.0f / float(${S.DefaultAtlasSizeName}.x), 1.0f / float(${S.DefaultAtlasSizeName}.y));`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x, ${S.DefaultPositionName}.y);`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    float z = 1.0f - ${S.DefaultZName} - float(${S.DefaultLayerName}) * 0.00001f;`,
			`    a = float(${S.DefaultAlphaName}) / 255.0f;`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, z, 1.0f);`,
			`}`
		];
	}

	constructor(state) {
		super(state, ImageShader.ImageFragmentShader(state), ImageShader.ImageVertexShader(state));
	}

	static Create(state) { return new ImageShader(state); }
}
