// Port of Ambermoon.Renderer.OpenGL/Texture3DShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Texture3DShader.cs - Shader for textured 3D objects

import { ColorShader } from './ColorShader.js';
import { TextureShader } from './TextureShader.js';

// NOTE: This won't support non-palette graphics as it uses the color indices
// for color replacements.
export class Texture3DShader extends ColorShader {
	static DefaultTexCoordName = TextureShader.DefaultTexCoordName;
	static DefaultSamplerName = TextureShader.DefaultSamplerName;
	static DefaultAtlasSizeName = TextureShader.DefaultAtlasSizeName;
	static DefaultTexEndCoordName = 'texEndCoord';
	static DefaultTexSizeName = 'texSize';
	static DefaultPaletteName = TextureShader.DefaultPaletteName;
	static DefaultPaletteIndexName = TextureShader.DefaultPaletteIndexName;
	static DefaultAlphaName = 'alpha';
	static DefaultLightName = 'light';
	static DefaultColorReplaceName = 'palReplace';
	static DefaultUseColorReplaceName = 'useReplace';
	static DefaultSkyColorIndexName = 'skyColorIndex';
	static DefaultSkyReplaceColorName = 'skyColorReplace';
	static DefaultPaletteCountName = TextureShader.DefaultPaletteCountName;
	static DefaultFogColorName = 'fogColor';
	static DefaultFogDistanceName = 'fogDist';
	static DefaultFadeName = 'fade';

	static DefaultEnhancedName = 'enhanced';

	/**
	 * Web port addition: GLSL helpers of the enhanced 3D rendering (shared with the billboard shader).
	 *
	 * The textures are palette indexed, so hardware filtering is not possible. smoothSample() fetches the four
	 * nearest texels, converts each index to its palette color (incl. palette/sky replacements, light and
	 * transparency) and blends the colors ("sharp bilinear": texel borders are anti-aliased over one screen pixel,
	 * so magnified textures stay crisp pixel art while minified textures no longer flicker). For strong minification
	 * four such samples are averaged (rotated grid supersampling).
	 * Requires the uniforms/varyings of the 3D shaders (sampler, palette, palIndex, ...).
	 */
	static DefaultClampName = 'clampTexels';

	static EnhancedFunctions(clampTexels = false) {
		const S = Texture3DShader;
		return [
			`uniform float ${S.DefaultEnhancedName};`,
			`const bool ${S.DefaultClampName} = ${clampTexels ? 'true' : 'false'};`,
			`// mode: 0 = opaque, 1 = color index 0 / transparent palette colors are transparent, 2 = like 0 but sky color is transparent`,
			`vec4 texelColor(vec2 texel, float mode)`,
			`{`,
			`    float colorIndex = texelFetch(${S.DefaultSamplerName}, ivec2(texel), 0).r * 255.0f;`,
			`    vec4 pixelColor = ${S.DefaultUseColorReplaceName} > 0.5f && colorIndex < 15.5f ? ${S.DefaultColorReplaceName}[int(colorIndex + 0.5f)]`,
			`        : textureLod(${S.DefaultPaletteName}, vec2((colorIndex + 0.5f) / 32.0f, (palIndex + 0.5f) / ${S.DefaultPaletteCountName}), 0.0f);`,
			`    if (mode > 0.5f && mode < 1.5f && (colorIndex < 0.5f || pixelColor.a < 0.5f))`,
			`        return vec4(0.0f);`,
			`    if (abs(colorIndex - ${S.DefaultSkyColorIndexName}) < 0.5f)`,
			`        return mode > 1.5f ? vec4(0.0f) : vec4(${S.DefaultSkyReplaceColorName}.rgb, 1.0f);`,
			`    return vec4(max(vec3(0), pixelColor.rgb + vec3(${S.DefaultLightName}) - vec3(1)), 1.0f);`,
			`}`,
			`// tp: texel position (texel centers at integer + 0.5), aa: anti-aliasing width in texels`,
			`vec4 sharpBilinear(vec2 tp, vec2 aa, vec2 start, vec2 size, float mode)`,
			`{`,
			`    tp -= 0.5f;`,
			`    vec2 base = floor(tp);`,
			`    vec2 f = clamp((tp - base - 0.5f) / aa + 0.5f, 0.0f, 1.0f);`,
			`    // Repeating textures (walls, floors) wrap around, billboards are clamped.`,
			`    vec2 t0 = ${S.DefaultClampName} ? clamp(base, start, start + size - 1.0f) + 0.5f : start + mod(base - start, size) + 0.5f;`,
			`    vec2 t1 = ${S.DefaultClampName} ? clamp(base + 1.0f, start, start + size - 1.0f) + 0.5f : start + mod(base + 1.0f - start, size) + 0.5f;`,
			`    vec4 c00 = texelColor(t0, mode);`,
			`    vec4 c10 = texelColor(vec2(t1.x, t0.y), mode);`,
			`    vec4 c01 = texelColor(vec2(t0.x, t1.y), mode);`,
			`    vec4 c11 = texelColor(t1, mode);`,
			`    // c.a is the coverage -> premultiplied blending`,
			`    vec4 top = mix(vec4(c00.rgb * c00.a, c00.a), vec4(c10.rgb * c10.a, c10.a), f.x);`,
			`    vec4 bottom = mix(vec4(c01.rgb * c01.a, c01.a), vec4(c11.rgb * c11.a, c11.a), f.x);`,
			`    return mix(top, bottom, f.y);`,
			`}`,
			`// Returns the premultiplied color (a = coverage).`,
			`vec4 smoothSample(vec2 texCoord, vec2 dx, vec2 dy, vec2 start, vec2 size, float mode)`,
			`{`,
			`    vec2 fw = abs(dx) + abs(dy);`,
			`    if (max(fw.x, fw.y) < 1.5f)`,
			`        return sharpBilinear(texCoord, max(fw, vec2(0.001f)), start, size, mode);`,
			`    vec2 aa = max(0.5f * fw, vec2(0.001f));`,
			`    return 0.25f * (sharpBilinear(texCoord + 0.125f * dx + 0.375f * dy, aa, start, size, mode) +`,
			`        sharpBilinear(texCoord - 0.125f * dx - 0.375f * dy, aa, start, size, mode) +`,
			`        sharpBilinear(texCoord + 0.375f * dx - 0.125f * dy, aa, start, size, mode) +`,
			`        sharpBilinear(texCoord - 0.375f * dx + 0.125f * dy, aa, start, size, mode));`,
			`}`,
			`// Smooth fog curve (the original fog is linear in the distance).`,
			`float fogAmount(float d, float fogDist, float maxFog)`,
			`{`,
			`    float x = d / fogDist;`,
			`    return min(maxFog, 1.0f - exp(-2.6f * x * x));`,
			`}`,
		];
	}

	// The palette has a size of 32xNumPalettes pixels.
	// Each row represents one palette of 32 colors.
	// So the palette index determines the pixel row.
	// The column is the palette color index from 0 to 31.
	static Texture3DFragmentShader(state) {
		const S = Texture3DShader;
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
			`flat in float palIndex;`,
			`flat in vec2 varTextureEndCoord;`,
			`flat in vec2 varTextureSize;`,
			`flat in float alphaEnabled;`,
			`in vec3 modelPos;`,
			...S.EnhancedFunctions(),
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
			`    vec3 normal = cross(dFdx(modelPos), dFdy(modelPos));`,
			`    if (${S.DefaultEnhancedName} > 0.5f)`,
			`    {`,
			`        if (${S.DefaultLightName} < 0.01f)`,
			`            discard;`,
			`        vec2 size = round(varTextureSize * atlas);`,
			`        vec2 start = round(varTextureEndCoord * atlas) - size;`,
			`        vec4 c = smoothSample(texelPos, tdx, tdy, start, size, alphaEnabled);`,
			`        if (c.a < 0.5f)`,
			`            discard;`,
			`        c.rgb /= c.a;`,
			`        // Ambient occlusion like darkening at the bottom and top of walls`,
			`        if (abs(normalize(normal).y) < 0.3f)`,
			`        {`,
			`            float v = mod(texelPos.y - start.y, size.y) / size.y;`,
			`            c.rgb *= 1.0f - 0.32f * smoothstep(0.72f, 1.0f, v) - 0.12f * smoothstep(0.12f, 0.0f, v);`,			`        }`,
			`        ${S.DefaultFragmentOutColorName} = vec4(c.rgb, 1.0f);`,
			`        if (${S.DefaultFogColorName}.a > 0.001f)`,
			`        {`,
			`            float fogFactor = ${S.DefaultFogColorName}.a * fogAmount(dist, ${S.DefaultFogDistanceName}, ${S.DefaultSkyColorIndexName} < 31.5f ? 0.8f : 1.0f);`,
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
			`    if (alphaEnabled > 0.5f && alphaEnabled < 1.5f && (colorIndex < 0.5f || pixelColor.a < 0.5f) || ${S.DefaultLightName} < 0.01f)`,
			`        discard;`,
			`    else if (abs(colorIndex - ${S.DefaultSkyColorIndexName}) < 0.5f)`,
			`    {`,
			`        if (alphaEnabled > 1.5f)`,
			`            discard;`,
			`        else`,
			`            ${S.DefaultFragmentOutColorName} = ${S.DefaultSkyReplaceColorName};`,
			`    }`,
			`    else`,
			`        ${S.DefaultFragmentOutColorName} = vec4(max(vec3(0), pixelColor.rgb + vec3(${S.DefaultLightName}) - vec3(1)), pixelColor.a);`,
			`    `,
			`    if (${S.DefaultFogColorName}.a > 0.001f)`,
			`    {`,
			`        float fogFactor = ${S.DefaultFogColorName}.a * min(${S.DefaultSkyColorIndexName} < 31.5f ? 0.8f : 1.0f, dist / ${S.DefaultFogDistanceName});`,
			`        ${S.DefaultFragmentOutColorName} = ${S.DefaultFragmentOutColorName} * (1.0f - fogFactor) + fogFactor * ${S.DefaultFogColorName};`,
			`    }`,
			`    if (${S.DefaultFadeName} < 0.9999f)`,
			`    {`,
			`        ${S.DefaultFragmentOutColorName} = ${S.DefaultFragmentOutColorName} * ${S.DefaultFadeName};`,
			`    }`,
			`}`
		];
	}

	static Texture3DVertexShader(state) {
		const S = Texture3DShader;
		return [
			S.GetVertexShaderHeader(state),
			`in vec3 ${S.DefaultPositionName};`,
			`in ivec2 ${S.DefaultTexCoordName};`,
			`in ivec2 ${S.DefaultTexEndCoordName};`,
			`in ivec2 ${S.DefaultTexSizeName};`,
			`in uint ${S.DefaultPaletteIndexName};`,
			`in uint ${S.DefaultAlphaName};`,
			`uniform uvec2 ${S.DefaultAtlasSizeName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`out vec2 varTexCoord;`,
			`out float dist;`,
			`flat out float palIndex;`,
			`flat out vec2 varTextureEndCoord;`,
			`flat out vec2 varTextureSize;`,
			`flat out float alphaEnabled;`,
			`out vec3 modelPos;`,
			``,
			`void main()`,
			`{`,
			`    modelPos = ${S.DefaultPositionName};`,
			`    vec2 atlasFactor = vec2(1.0f / float(${S.DefaultAtlasSizeName}.x), 1.0f / float(${S.DefaultAtlasSizeName}.y));`,
			`    varTexCoord = atlasFactor * vec2(${S.DefaultTexCoordName}.x, ${S.DefaultTexCoordName}.y);`,
			`    palIndex = float(${S.DefaultPaletteIndexName});`,
			`    varTextureEndCoord = atlasFactor * vec2(${S.DefaultTexEndCoordName}.x, ${S.DefaultTexEndCoordName}.y);`,
			`    varTextureSize = atlasFactor * vec2(${S.DefaultTexSizeName}.x, ${S.DefaultTexSizeName}.y);`,
			`    alphaEnabled = float(${S.DefaultAlphaName});`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(${S.DefaultPositionName}, 1.0f);`,
			`    dist = gl_Position.z;`,
			`}`
		];
	}

	/**
	 * new Texture3DShader(state) or (protected) new Texture3DShader(state, fragmentShaderLines, vertexShaderLines)
	 */
	constructor(state, fragmentShaderLines, vertexShaderLines) {
		if (fragmentShaderLines === undefined) {
			fragmentShaderLines = Texture3DShader.Texture3DFragmentShader(state);
			vertexShaderLines = Texture3DShader.Texture3DVertexShader(state);
		}

		super(state, fragmentShaderLines, vertexShaderLines);
	}

	UsePalette(use) {
		// Note: This sets the palette sampler uniform like the original code.
		// SetPalette(1) is always called afterwards by the render layer.
		this.shaderProgram.SetInput(Texture3DShader.DefaultPaletteName, use ? 1.0 : 0.0);
	}

	SetSampler(textureUnit = 0) {
		this.shaderProgram.SetInput(Texture3DShader.DefaultSamplerName, textureUnit);
	}

	SetPalette(textureUnit = 1) {
		this.shaderProgram.SetInput(Texture3DShader.DefaultPaletteName, textureUnit);
	}

	SetAtlasSize(width, height) {
		this.shaderProgram.SetInputVector2(Texture3DShader.DefaultAtlasSizeName, width, height);
	}

	SetLight(light) {
		this.shaderProgram.SetInput(Texture3DShader.DefaultLightName, light);
	}

	SetPaletteReplacement(paletteReplacement) {
		if (paletteReplacement == null) {
			this.shaderProgram.SetInput(Texture3DShader.DefaultUseColorReplaceName, 0.0);
		} else {
			this.shaderProgram.SetInputColorArray(Texture3DShader.DefaultColorReplaceName, paletteReplacement.ColorData);
			this.shaderProgram.SetInput(Texture3DShader.DefaultUseColorReplaceName, 1.0);
		}
	}

	SetSkyColorReplacement(skyColor, replaceColor) {
		this.shaderProgram.SetInput(Texture3DShader.DefaultSkyColorIndexName, skyColor == null ? 32.0 : skyColor);
		if (replaceColor != null) {
			this.shaderProgram.SetInputVector4(Texture3DShader.DefaultSkyReplaceColorName, replaceColor.R / 255.0,
				replaceColor.G / 255.0, replaceColor.B / 255.0, replaceColor.A / 255.0);
		}
	}

	SetPaletteCount(count) {
		this.shaderProgram.SetInput(Texture3DShader.DefaultPaletteCountName, count);
	}

	SetFog(fogColor, distance) {
		this.shaderProgram.SetInputVector4(Texture3DShader.DefaultFogColorName, fogColor.R / 255.0,
			fogColor.G / 255.0, fogColor.B / 255.0, fogColor.A / 255.0);
		this.shaderProgram.SetInput(Texture3DShader.DefaultFogDistanceName, distance);
	}

	SetFade(fade) {
		this.shaderProgram.SetInput(Texture3DShader.DefaultFadeName, fade);
	}

	/** Web port: enables the enhanced texture filtering, wall shading and fog curve. */
	SetEnhanced(enhanced) {
		this.shaderProgram.SetInput(Texture3DShader.DefaultEnhancedName, enhanced ? 1.0 : 0.0);
	}

	static Create(state) { return new Texture3DShader(state); }
}
