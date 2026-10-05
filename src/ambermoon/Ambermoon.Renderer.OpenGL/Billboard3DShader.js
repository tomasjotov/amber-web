// Port of Ambermoon.Renderer.OpenGL/Billboard3DShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Billboard3DShader.cs - Shader for textured 3D billboards

import { Texture3DShader } from './Texture3DShader.js';

// NOTE: This won't support non-palette graphics as it uses the color indices
// for color replacements.
export class Billboard3DShader extends Texture3DShader {
	static DefaultBillboardCenterName = 'center';
	static DefaultBillboardOrientationName = 'orientation';
	static DefaultExtrudeName = 'extrude';

	static Billboard3DFragmentShader(state) {
		const S = Billboard3DShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform sampler2D ${S.DefaultPaletteName};`,
			`uniform float ${S.DefaultLightName};`,
			`uniform float ${S.DefaultPaletteCountName};`,
			`uniform vec4 ${S.DefaultColorReplaceName}[16];`,
			`uniform float ${S.DefaultUseColorReplaceName};`,
			`uniform float ${S.DefaultSkyColorIndexName};`,
			`uniform vec4 ${S.DefaultSkyReplaceColorName};`,
			`uniform vec4 ${S.DefaultFogColorName};`,
			`uniform float ${S.DefaultFogDistanceName};`,
			`uniform float ${S.DefaultFadeName};`,
			`in vec2 varTexCoord;`,
			`in float dist;`,
			`in float drawY;`,
			`flat in float palIndex;`,
			`flat in vec2 varTextureEndCoord;`,
			`flat in vec2 varTextureSize;`,
			...S.EnhancedFunctions(true),
			``,
			`void main()`,
			`{`,
			`    ${S.DefaultFragmentOutColorName} = vec4(0);`,
			`    vec2 realTexCoord = varTexCoord;`,
			`    if (realTexCoord.x >= varTextureEndCoord.x)`,
			`        realTexCoord.x -= floor((varTextureSize.x + realTexCoord.x - varTextureEndCoord.x) / varTextureSize.x) * varTextureSize.x;`,
			`    if (realTexCoord.y >= varTextureEndCoord.y)`,
			`        realTexCoord.y -= floor((varTextureSize.y + realTexCoord.y - varTextureEndCoord.y) / varTextureSize.y) * varTextureSize.y;`,
			`    // web port: enhanced rendering (derivatives must be computed in uniform control flow)`,
			`    vec2 atlas = vec2(textureSize(${S.DefaultSamplerName}, 0));`,
			`    vec2 texelPos = varTexCoord * atlas;`,
			`    vec2 tdx = dFdx(texelPos);`,
			`    vec2 tdy = dFdy(texelPos);`,
			`    if (${S.DefaultEnhancedName} > 0.5f)`,
			`    {`,
			`        if (${S.DefaultLightName} < 0.01f)`,
			`            discard;`,
			`        vec2 size = round(varTextureSize * atlas);`,
			`        vec2 start = round(varTextureEndCoord * atlas) - size;`,
			`        vec4 c = smoothSample(texelPos, tdx, tdy, start, size, 1.0f);`,
			`        if (c.a < 0.5f)`,
			`            discard;`,
			`        ${S.DefaultFragmentOutColorName} = vec4(c.rgb / c.a, 1.0f);`,
			`        if (${S.DefaultFogColorName}.a > 0.001f)`,
			`        {`,
			`            float maxFog = ${S.DefaultSkyColorIndexName} < 31.5f ? 0.8f : 1.0f;`,
			`            float fogDist = ${S.DefaultSkyColorIndexName} < 31.5f && drawY > 0.0f ? ${S.DefaultFogDistanceName} * (1.0f + 2.5f * drawY) : ${S.DefaultFogDistanceName};`,
			`            float fogFactor = ${S.DefaultFogColorName}.a * fogAmount(dist, fogDist, maxFog);`,
			`            ${S.DefaultFragmentOutColorName} = ${S.DefaultFragmentOutColorName} * (1.0f - fogFactor) + fogFactor * ${S.DefaultFogColorName};`,
			`        }`,
			`        if (${S.DefaultFadeName} < 0.9999f)`,
			`            ${S.DefaultFragmentOutColorName} = ${S.DefaultFragmentOutColorName} * ${S.DefaultFadeName};`,
			`        return;`,
			`    }`,
			`    float colorIndex = textureLod(${S.DefaultSamplerName}, realTexCoord, 0.0f).r * 255.0f;`,
			`    vec4 pixelColor = ${S.DefaultUseColorReplaceName} > 0.5f && colorIndex < 15.5f ? ${S.DefaultColorReplaceName}[int(colorIndex + 0.5f)]`,
			`        : textureLod(${S.DefaultPaletteName}, vec2((colorIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`    `,
			`    `,
			`    if (colorIndex < 0.5f || pixelColor.a < 0.5f || ${S.DefaultLightName} < 0.01f)`,
			`        discard;`,
			`    else if (abs(colorIndex - ${S.DefaultSkyColorIndexName}) < 0.001f)`,
			`        ${S.DefaultFragmentOutColorName} = ${S.DefaultSkyReplaceColorName};`,
			`    else`,
			`        ${S.DefaultFragmentOutColorName} = vec4(pixelColor.rgb + vec3(${S.DefaultLightName}) - vec3(1), pixelColor.a);`,
			`    `,
			`    if (${S.DefaultFogColorName}.a > 0.001f)`,
			`    {`,
			`        float fogFactor = ${S.DefaultFogColorName}.a * (${S.DefaultSkyColorIndexName} < 31.5f && drawY > 0.0f ? min(${S.DefaultSkyColorIndexName} < 31.5f ? 0.8f : 1.0f, dist / (${S.DefaultFogDistanceName} * (1.0f + 2.5f * drawY))) : min(${S.DefaultSkyColorIndexName} < 31.5f ? 0.8f : 1.0f, dist / ${S.DefaultFogDistanceName}));`,
			`        ${S.DefaultFragmentOutColorName} = ${S.DefaultFragmentOutColorName} * (1.0f - fogFactor) + fogFactor * ${S.DefaultFogColorName};`,
			`    }`,
			`    if (${S.DefaultFadeName} < 0.9999f)`,
			`    {`,
			`        ${S.DefaultFragmentOutColorName} = ${S.DefaultFragmentOutColorName} * ${S.DefaultFadeName};`,
			`    }`,
			`}`
		];
	}
	// Note: gl_FragDepth = 0.5 * depth + 0.5 is basically (far-near)/2 * depth + (far+near)/2 with far = 1.0 and near = 0.0 (gl_DepthRange uses 0.0 to 1.0).
	// If the depth range is changed, this formula has to be adjusted accordingly!

	static Billboard3DVertexShader(state) {
		const S = Billboard3DShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec3 ${S.DefaultPositionName};`,
			`in vec3 ${S.DefaultBillboardCenterName};`,
			`in uint ${S.DefaultBillboardOrientationName};`,
			`in ivec2 ${S.DefaultTexCoordName};`,
			`in ivec2 ${S.DefaultTexEndCoordName};`,
			`in ivec2 ${S.DefaultTexSizeName};`,
			`in uint ${S.DefaultPaletteIndexName};`,
			`in float ${S.DefaultExtrudeName};`,
			`uniform uvec2 ${S.DefaultAtlasSizeName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`out vec2 varTexCoord;`,
			`out float dist;`,
			`out float drawY;`,
			`flat out float palIndex;`,
			`flat out vec2 varTextureEndCoord;`,
			`flat out vec2 varTextureSize;`,
			``,
			`void main()`,
			`{`,
			`    vec3 offset = (${S.DefaultPositionName} - ${S.DefaultBillboardCenterName});`,
			`    vec4 localPos = ${S.DefaultModelViewMatrixName} * vec4(${S.DefaultBillboardCenterName}, 1);`,
			`    if (${S.DefaultBillboardOrientationName} == 0u) // normal billboard`,
			`    {`,
			`        localPos += vec4(offset.xy, ${S.DefaultExtrudeName}, 0);`,
			`    }`,
			`    else // floor or ceiling billboard`,
			`    {`,
			`        vec4 rotatedOffset = -1.0f * ${S.DefaultModelViewMatrixName} * vec4(offset.x, 0, offset.y, 0);`,
			`        localPos += vec4(rotatedOffset.x, 0, rotatedOffset.z, 0);`,
			`    }`,
			`    vec2 atlasFactor = vec2(1.0f / float(${S.DefaultAtlasSizeName}.x), 1.0f / float(${S.DefaultAtlasSizeName}.y));`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    palIndex = float(${S.DefaultPaletteIndexName});`,
			`    varTextureEndCoord = atlasFactor * vec2(${S.DefaultTexEndCoordName}.x, ${S.DefaultTexEndCoordName}.y);`,
			`    varTextureSize = atlasFactor * vec2(${S.DefaultTexSizeName}.x, ${S.DefaultTexSizeName}.y);`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * localPos;`,
			`    dist = gl_Position.z;`,
			`    drawY = localPos.y;`,
			`}`
		];
	}

	/**
	 * new Billboard3DShader(state) or (protected) new Billboard3DShader(state, fragmentShaderLines, vertexShaderLines)
	 */
	constructor(state, fragmentShaderLines, vertexShaderLines) {
		if (fragmentShaderLines === undefined) {
			fragmentShaderLines = Billboard3DShader.Billboard3DFragmentShader(state);
			vertexShaderLines = Billboard3DShader.Billboard3DVertexShader(state);
		}

		super(state, fragmentShaderLines, vertexShaderLines);
	}

	static Create(state) { return new Billboard3DShader(state); }
}
