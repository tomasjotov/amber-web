// Port of Ambermoon.Renderer.OpenGL/ScreenShader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ScreenShader.cs - Shader which renders the frame buffer texture to the screen (with filters)

import { Shader } from './Shader.js';
import { ShaderProgram } from './ShaderProgram.js';
import { Matrix4 } from './Matrix.js';
import { GetGLSLVersionLine } from './ColorShader.js';

// Note: The texture has the same size as the whole screen so
// the position is also the texture coordinate!
export class ScreenShader {
	static DefaultFragmentOutColorName = 'outColor';
	static DefaultPositionName = 'position';
	static DefaultModelViewMatrixName = 'mvMat';
	static DefaultProjectionMatrixName = 'projMat';
	static DefaultSamplerName = 'sampler';
	static DefaultResolutionName = 'resolution';
	static DefaultPrimaryModeName = 'primMode';
	static DefaultSecondaryModeName = 'secMode';

	static GetFragmentShaderHeader(state) {
		let header = GetGLSLVersionLine(state);

		header += '\n';
		header += '#ifdef GL_ES\n';
		header += ' precision highp float;\n';
		header += ' precision highp int;\n';
		header += '#endif\n';
		header += '\n';
		header += `out vec4 ${ScreenShader.DefaultFragmentOutColorName};\n`;

		return header;
	}

	static GetVertexShaderHeader(state) {
		return GetGLSLVersionLine(state) + '\n';
	}

	/**
	 * Web port addition: GLSL functions of the "pixel art" filter (GraphicFilter.PixelArt).
	 *
	 * An edge-directed upscaler in the spirit of Hyllian's xBR-lv2 (corner type C, smooth tips) working on the
	 * virtual 320x200 pixel grid of the full resolution 2D frame buffer. It detects diagonal edges (45, 30 and 60 degrees)
	 * in the 5x5 neighborhood of each virtual pixel and replaces the staircase of the edge by an anti-aliased line, so
	 * contours become smooth while flat areas and dithering stay crisp pixel art.
	 * Notes:
	 * - Virtual pixel i is centered at the texture coordinate i/320 (resp. j/200) in the frame buffer.
	 * - Colors are compared in YUV including alpha (transparent areas = 3D view) instead of luma only.
	 * - Virtual pixels which contain finer details than the virtual grid (sub-pixel text, scaled 320x256 layers)
	 *   are passed through unfiltered.
	 */
	static PixelArtScalerFunctions() {
		const S = ScreenShader;
		return [
			`const vec2 virtualSize = vec2(320.0f, 200.0f);`,
			`vec4 cellColor(vec2 cell)`,
			`{`,
			`    return textureLod(${S.DefaultSamplerName}, clamp(cell / virtualSize, vec2(0.0f), vec2(1.0f)), 0.0f);`,
			`}`,
			`// color distance scaled like xBR's luma distance (0..48)`,
			`float cd(vec4 a, vec4 b)`,
			`{`,
			`    vec4 d = a - b;`,
			`    float y = dot(d.rgb, vec3(0.299f, 0.587f, 0.114f));`,
			`    float u = dot(d.rgb, vec3(-0.14713f, -0.28886f, 0.436f));`,
			`    float v = dot(d.rgb, vec3(0.615f, -0.51499f, -0.10001f));`,
			`    return 48.0f * (abs(y) + 0.5f * (abs(u) + abs(v)) + abs(d.a));`,
			`}`,
			`bool xdiff(vec4 a, vec4 b) { return cd(a, b) > 0.05f; }`,
			`bool xeq(vec4 a, vec4 b) { return cd(a, b) <= 15.0f; }`,
			`bool xneq(vec4 a, vec4 b) { return cd(a, b) > 15.0f; }`,
			``,
			`// Evaluates one corner of the virtual pixel. R rotates the canonical (bottom-right) neighborhood.`,
			`// Returns the blend color in rgba and writes the blend factor to m.`,
			`vec4 xbrCorner(vec2 cell, mat2 R, vec2 fp, vec4 e, float scale, out float m)`,
			`{`,
			`    vec4 b  = cellColor(cell + R * vec2( 0.0f, -1.0f));`,
			`    vec4 c  = cellColor(cell + R * vec2( 1.0f, -1.0f));`,
			`    vec4 d  = cellColor(cell + R * vec2(-1.0f,  0.0f));`,
			`    vec4 f  = cellColor(cell + R * vec2( 1.0f,  0.0f));`,
			`    vec4 g  = cellColor(cell + R * vec2(-1.0f,  1.0f));`,
			`    vec4 h  = cellColor(cell + R * vec2( 0.0f,  1.0f));`,
			`    vec4 i  = cellColor(cell + R * vec2( 1.0f,  1.0f));`,
			`    vec4 i4 = cellColor(cell + R * vec2( 2.0f,  1.0f));`,
			`    vec4 i5 = cellColor(cell + R * vec2( 1.0f,  2.0f));`,
			`    vec4 h5 = cellColor(cell + R * vec2( 0.0f,  2.0f));`,
			`    vec4 f4 = cellColor(cell + R * vec2( 2.0f,  0.0f));`,
			`    vec2 q = (fp - 0.5f) * R + 0.5f; // = transpose(R) * (fp - 0.5) + 0.5`,
			`    // Web port: never cut the diagonal connection of e to an (almost) identical i. This keeps checkerboards`,
			`    // (dithering, the dimmed background behind popups) and diagonal lines of e's color intact.`,
			`    // Isolated pixels (all four direct neighbors (almost) equal) are kept as well.`,
			`    bool isolated = cd(b, d) + cd(d, h) + cd(h, f) < 2.0f;`,
			`    bool irlv0 = xdiff(e, f) && xdiff(e, h) && cd(e, i) >= 2.0f && !isolated;`,
			`    bool irlv1 = irlv0 && ((xneq(f, b) && xneq(f, c)) || (xneq(h, d) && xneq(h, g)) ||`,
			`        (xeq(e, i) && ((xneq(f, f4) && xneq(f, i4)) || (xneq(h, h5) && xneq(h, i5)))) || xeq(e, g) || xeq(e, c));`,
			`    bool irlv2l = xdiff(e, g) && xdiff(d, g);`,
			`    bool irlv2u = xdiff(e, c) && xdiff(b, c);`,
			`    float wd1 = cd(e, c) + cd(e, g) + cd(i, h5) + cd(i, f4) + 4.0f * cd(h, f);`,
			`    float wd2 = cd(h, d) + cd(h, i5) + cd(f, i4) + cd(f, b) + 4.0f * cd(e, i);`,
			`    bool edri = wd1 <= wd2 && irlv0;`,
			`    bool edr = wd1 + 0.1f <= wd2 && irlv1;`,
			`    // Web port: the 30/60 degree rules additionally require that the edge continues (f4 = f resp. h5 = h).`,
			`    // This keeps thin structures like font glyphs (e.g. the serifs of an I) from being bent.`,
			`    bool edrL = 2.0f * cd(f, g) <= cd(h, c) && irlv2l && edr && xeq(f, f4);`,
			`    bool edrU = 2.0f * cd(h, c) <= cd(f, g) && irlv2u && edr && xeq(h, h5);`,
			`    float delta = 1.0f / scale;`,
			`    float deltaL = 0.5f / scale;`,
			`    float fx = q.x + q.y;`,
			`    float fxL = 0.5f * q.x + q.y;`,
			`    float fxU = 2.0f * q.x + q.y;`,
			`    float fx45i = clamp((fx + delta - 1.75f) / (2.0f * delta), 0.0f, 1.0f);`,
			`    float fx45 = clamp((fx + delta - 1.5f) / (2.0f * delta), 0.0f, 1.0f);`,
			`    float fx30 = clamp((fxL + deltaL - 1.0f) / (2.0f * deltaL), 0.0f, 1.0f);`,
			`    float fx60 = clamp((fxU + delta - 2.0f) / (2.0f * delta), 0.0f, 1.0f);`,
			`    m = max(max(edrL ? fx30 : 0.0f, edrU ? fx60 : 0.0f), max(edr ? fx45 : 0.0f, edri ? fx45i : 0.0f));`,
			`    return cd(e, f) <= cd(e, h) ? f : h;`,
			`}`,
			``,
			`vec4 pixelArtScale(vec2 texCoord)`,
			`{`,
			`    vec2 p = texCoord * virtualSize + 0.5f;`,
			`    vec2 cell = floor(p);`,
			`    vec2 fp = p - cell;`,
			`    vec4 e = cellColor(cell);`,
			`    // Pass through virtual pixels with sub-pixel details.`,
			`    // Exact frame buffer pixel range of this virtual pixel. The 2D shaders offset all positions by 0.49 virtual pixels`,
			`    // (the y axis is flipped in the frame buffer) and pixels are covered if their center is inside.`,
			`    vec2 res = ${S.DefaultResolutionName};`,
			`    vec2 sc = res / virtualSize;`,
			`    // Pixels whose center is (almost) exactly on a border are ambiguous (rasterizer precision) and skipped.`,
			`    vec2 firstPx = ceil((cell - vec2(0.51f, 0.49f)) * sc - 0.5f + 0.04f);`,
			`    vec2 lastPx = max(firstPx, ceil((cell + vec2(0.49f, 0.51f)) * sc - 0.5f - 0.04f) - 1.0f);`,
			`    vec2 midPx = floor(0.5f * (firstPx + lastPx));`,
			`    float detail = 0.0f;`,
			`    for (int y = 0; y < 3; ++y)`,
			`    {`,
			`        float py = y == 0 ? firstPx.y : y == 1 ? midPx.y : lastPx.y;`,
			`        for (int x = 0; x < 3; ++x)`,
			`        {`,
			`            float px = x == 0 ? firstPx.x : x == 1 ? midPx.x : lastPx.x;`,
			`            detail = max(detail, cd(e, textureLod(${S.DefaultSamplerName}, (vec2(px, py) + 0.5f) / res, 0.0f)));`,
			`        }`,
			`    }`,
			`    if (detail > 0.05f)`,
			`        return textureLod(${S.DefaultSamplerName}, texCoord, 0.0f);`,
			`    float scale = max(1.0f, ${S.DefaultResolutionName}.x / virtualSize.x);`,
			`    float m0, m1, m2, m3;`,
			`    vec4 c0 = xbrCorner(cell, mat2(1.0f, 0.0f, 0.0f, 1.0f), fp, e, scale, m0);`,
			`    vec4 c1 = xbrCorner(cell, mat2(0.0f, -1.0f, 1.0f, 0.0f), fp, e, scale, m1);`,
			`    vec4 c2 = xbrCorner(cell, mat2(-1.0f, 0.0f, 0.0f, -1.0f), fp, e, scale, m2);`,
			`    vec4 c3 = xbrCorner(cell, mat2(0.0f, 1.0f, -1.0f, 0.0f), fp, e, scale, m3);`,
			`    vec4 res1 = mix(mix(e, c0, m0), c2, m2);`,
			`    vec4 res2 = mix(mix(e, c1, m1), c3, m3);`,
			`    return cd(e, res2) >= cd(e, res1) ? res2 : res1;`,
			`}`,
		];
	}

	static ScreenFragmentShader(state) {
		const S = ScreenShader;
		return [
			S.GetFragmentShaderHeader(state),
			`uniform sampler2D ${S.DefaultSamplerName};`,
			`uniform vec2 ${S.DefaultResolutionName};`,
			`uniform float ${S.DefaultPrimaryModeName};`,
			`uniform float ${S.DefaultSecondaryModeName};`,
			`in vec2 varTexCoord;`,
			`const vec2 pixelSize = vec2(1.0f / 320.0f, 1.0f / 200.0f);`,
			``,
			`float gray(vec4 color)`,
			`{`,
			`    return 0.299f * color.r + 0.587f * color.g + 0.114f * color.b;`,
			`}`,
			``,
			`vec4 getColor(vec2 coord)`,
			`{`,
			`    return textureLod(${S.DefaultSamplerName}, max(vec2(0.0f), min(vec2(1.0f), coord)), 0.0f);`,
			`}`,
			`const mat3 yuvMatrix = mat3( 0.299f,    0.587f,    0.114f,`,
			`                            -0.14713f, -0.28886f,  0.436f,`,
			`                             0.615f,   -0.51499f, -0.10001f);`,
			``,
			`float colorDistFactor(vec4 a, vec4 b)`,
			`{`,
			`    vec3 yuvA = yuvMatrix * a.rgb;`,
			`    vec3 yuvB = yuvMatrix * b.rgb;`,
			`    vec3 yuvDist = (yuvB - yuvA) * vec3(1.25f, 1.0f, 1.0f); // weight luminance more than chroma`,
			`    const float normFactor = 0.2807f; // around 1 / (1.25^2 + 1^2 + 1^2)`,
			`    return 1.0f - min(1.0f, 5.5f * normFactor * sqrt(yuvDist.r * yuvDist.r + yuvDist.g * yuvDist.g + yuvDist.b * yuvDist.b));`,
			`}`,
			``,
			`vec4 processColor(vec4 color)`,
			`{`,
			`    if (color.a < 0.9999f)`,
			`        return vec4(color.rgb, sqrt(color.a));`,
			`    else`,
			`        return color;`,
			`}`,
			``,
			`int sameColor(vec4 a, vec4 b)`,
			`{`,
			`    vec4 diff = abs(a - b);`,
			`    if (diff.r < 0.00001f && diff.g < 0.00001f && diff.b < 0.00001f && diff.a < 0.00001f)`,
			`        return 1;`,
			`    return 0;`,
			`}`,
			``,
			...ScreenShader.PixelArtScalerFunctions(),
			``,
			`void main()`,
			`{`,
			`    vec4 color;`,
			`    float a;`,
			`    if (${S.DefaultPrimaryModeName} < 0.5f)`,
			`    {`,
			`        color = getColor(varTexCoord);`,
			`        a = color.a;`,
			`    }`,
			`    else if (${S.DefaultPrimaryModeName} > 2.5f) // web port: edge-directed pixel art scaler (xBR-lv2 style)`,
			`    {`,
			`        color = pixelArtScale(varTexCoord);`,
			`        a = color.a;`,
			`    }`,
			`    else if (${S.DefaultPrimaryModeName} < 1.5f) // new smooth filter`,
			`    {`,
			`        `,
			`        vec2 outPixelSize = 1.0f / ${S.DefaultResolutionName};`,
			`        vec4 color00 = getColor(vec2(varTexCoord.x-pixelSize.x, varTexCoord.y-pixelSize.y));`,
			`        vec4 color10 = getColor(vec2(varTexCoord.x, varTexCoord.y-pixelSize.y));`,
			`        vec4 color20 = getColor(vec2(varTexCoord.x+pixelSize.x, varTexCoord.y-pixelSize.y));`,
			`        vec4 color01 = getColor(vec2(varTexCoord.x-pixelSize.x, varTexCoord.y));`,
			`        vec4 color11 = getColor(varTexCoord);`,
			`        vec4 color21 = getColor(vec2(varTexCoord.x+pixelSize.x, varTexCoord.y));`,
			`        vec4 color02 = getColor(vec2(varTexCoord.x-pixelSize.x, varTexCoord.y+pixelSize.y));`,
			`        vec4 color12 = getColor(vec2(varTexCoord.x, varTexCoord.y+pixelSize.y));`,
			`        vec4 color22 = getColor(vec2(varTexCoord.x+pixelSize.x, varTexCoord.y+pixelSize.y));`,
			`        vec4 ocolor00 = getColor(vec2(varTexCoord.x-outPixelSize.x, varTexCoord.y-outPixelSize.y));`,
			`        vec4 ocolor10 = getColor(vec2(varTexCoord.x, varTexCoord.y-outPixelSize.y));`,
			`        vec4 ocolor20 = getColor(vec2(varTexCoord.x+outPixelSize.x, varTexCoord.y-outPixelSize.y));`,
			`        vec4 ocolor01 = getColor(vec2(varTexCoord.x-outPixelSize.x, varTexCoord.y));`,
			`        vec4 ocolor21 = getColor(vec2(varTexCoord.x+outPixelSize.x, varTexCoord.y));`,
			`        vec4 ocolor02 = getColor(vec2(varTexCoord.x-outPixelSize.x, varTexCoord.y+outPixelSize.y));`,
			`        vec4 ocolor12 = getColor(vec2(varTexCoord.x, varTexCoord.y+outPixelSize.y));`,
			`        vec4 ocolor22 = getColor(vec2(varTexCoord.x+outPixelSize.x, varTexCoord.y+outPixelSize.y));`,
			`        `,
			`        a = color11.a;`,
			`        vec2 offset = fract(varTexCoord * vec2(320.0f, 200.0f));`,
			`        `,
			`        const float smoothFactor = 0.625f;`,
			`        const float mergeFactor = 1.15f;`,
			`        float leftFactor = (1.0f - offset.x);`,
			`        float rightFactor = offset.x;`,
			`        float topFactor = (1.0f - offset.y);`,
			`        float bottomFactor = offset.y;`,
			`        float upperLeftFactor = 0.5f * (leftFactor + topFactor) * (sameColor(color11, ocolor00) == 0 ? mergeFactor : smoothFactor);`,
			`        float upperRightFactor = 0.5f * (rightFactor + topFactor) * (sameColor(color11, ocolor20) == 0 ? mergeFactor : smoothFactor);`,
			`        float lowerLeftFactor = 0.5f * (leftFactor + bottomFactor) * (sameColor(color11, ocolor02) == 0 ? mergeFactor : smoothFactor);`,
			`        float lowerRightFactor = 0.5f * (rightFactor + bottomFactor) * (sameColor(color11, ocolor22) == 0 ? mergeFactor : smoothFactor);`,
			`        leftFactor *= (sameColor(color11, ocolor01) == 0 ? mergeFactor : smoothFactor);`,
			`        rightFactor *= (sameColor(color11, ocolor21) == 0 ? mergeFactor : smoothFactor);`,
			`        topFactor *= (sameColor(color11, ocolor10) == 0 ? mergeFactor : smoothFactor);`,
			`        bottomFactor *= (sameColor(color11, ocolor12) == 0 ? mergeFactor : smoothFactor);`,
			`        `,
			`        float d00 = colorDistFactor(color11, color00);`,
			`        float d10 = colorDistFactor(color11, color10);`,
			`        float d20 = colorDistFactor(color11, color20);`,
			`        float d01 = colorDistFactor(color11, color01);`,
			`        float d21 = colorDistFactor(color11, color21);`,
			`        float d02 = colorDistFactor(color11, color02);`,
			`        float d12 = colorDistFactor(color11, color12);`,
			`        float d22 = colorDistFactor(color11, color22);`,
			`        color00 = mix(color11, color00, d00 * upperLeftFactor);`,
			`        color10 = mix(color11, color10, d10 * topFactor);`,
			`        color20 = mix(color11, color20, d20 * upperRightFactor);`,
			`        color01 = mix(color11, color01, d01 * leftFactor);`,
			`        color21 = mix(color11, color21, d21 * rightFactor);`,
			`        color02 = mix(color11, color02, d02 * lowerLeftFactor);`,
			`        color12 = mix(color11, color12, d12 * bottomFactor);`,
			`        color22 = mix(color11, color22, d22 * lowerRightFactor);`,
			`        `,
			`        color11 = (color00 + color10 + color20 + color01 + color21 + color02 + color12 + color22) / 8.0f;`,
			`        color11 += vec4(0.005f, 0.005f, 0.005f, 0.0f);`,
			`        `,
			`        `,
			`        // Preserve original alpha`,
			`        color = vec4(color11.rgb, a);`,
			`    }`,
			`    else // old blurry filter`,
			`    {`,
			`        vec2 pixelSize = 1.0f / ${S.DefaultResolutionName};`,
			`        vec2 texCoord = varTexCoord - 0.5f * pixelSize;`,
			`        color = getColor(texCoord);`,
			`        a = color.a;`,
			`        color = processColor(color);`,
			`        vec4 right = processColor(getColor(vec2(texCoord.x+pixelSize.x, texCoord.y)));`,
			`        vec4 down = processColor(getColor(vec2(texCoord.x, texCoord.y+pixelSize.y)));`,
			`        vec4 downRight = processColor(getColor(vec2(texCoord.x+pixelSize.x, texCoord.y+pixelSize.y)));`,
			`        vec4 upperColor = mix(color, right, 0.5f);`,
			`        vec4 lowerColor = mix(down, downRight, 0.5f);`,
			`        color = mix(upperColor, lowerColor, 0.5f);`,
			`        color.a = a;`,
			`    }`,
			`    `,
			`    float twoDim = a;`,
			`    if (${S.DefaultSecondaryModeName} > 0.5f && ${S.DefaultSecondaryModeName} < 2.5f && mod(round(gl_FragCoord.y - 0.5f), 2.0f) > 0.5f)`,
			`    {`,
			`        vec3 add = gray(color) < 0.025f ? vec3(0.0f) : vec3(-0.035f);`,
			`        if (twoDim < 0.5f) color.a = 0.125f;`,
			`        else color.rgb += add;`,
			`    }`,
			`    else if (${S.DefaultSecondaryModeName} > 1.5f && ${S.DefaultSecondaryModeName} < 2.5f && mod(round(gl_FragCoord.x - 0.5f), 2.0f) > 0.5f)`,
			`    {`,
			`        vec3 add = gray(color) < 0.025f ? vec3(0.0f) : vec3(-0.035f);`,
			`        if (twoDim < 0.5f) color.a = 0.125f;`,
			`        else color.rgb += add;`,
			`    }`,
			`    else if (${S.DefaultSecondaryModeName} > 1.5f && ${S.DefaultSecondaryModeName} < 2.5f)`,
			`    {`,
			`        if (twoDim > 0.5f)`,
			`            color.rgb += gray(color) < 0.025f ? vec3(0.0f) : vec3(0.075f);`,
			`    }`,
			`    else if (${S.DefaultSecondaryModeName} > 0.5f && ${S.DefaultSecondaryModeName} < 1.5f)`,
			`    {`,
			`        if (twoDim > 0.5f)`,
			`            color.rgb += gray(color) < 0.025f ? vec3(0.0f) : vec3(0.035f);`,
			`    }`,
			`    if (${S.DefaultSecondaryModeName} > 2.5f && ${S.DefaultSecondaryModeName} < 3.5f)`,
			`    {`,
			`        const float b = 1.0f;`,
			`        const float d = 0.9f;`,
			`        vec3 add = gray(color) < 0.025f ? vec3(0.0f) : vec3(0.075f);`,
			`        float m = mod(round(gl_FragCoord.y - 0.5f), 5.0f);`,
			`        if (m < 0.5f)`,
			`        {`,
			`            color.rgb *= vec3(b, d, d);`,
			`            color.rgb += add;`,
			`            if (twoDim < 0.5f) { color.a = 0.15f; }`,
			`            else { color.a *= 0.875f; }`,
			`        }`,
			`        else if (m < 1.5f)`,
			`        {`,
			`            color.rgb *= vec3(d, b, d);`,
			`            color.rgb += add;`,
			`            if (twoDim < 0.5f) { color.a = 0.15f; }`,
			`            else { color.a *= 0.875f; }`,
			`        }`,
			`        else if (m < 2.5f)`,
			`        {`,
			`            color.rgb *= vec3(d, d, b);`,
			`            color.rgb += add;`,
			`            if (twoDim < 0.5f) { color.a = 0.15f; }`,
			`            else { color.a *= 0.875f; }`,
			`        }`,
			`        else if (m < 3.5f)`,
			`        {`,
			`            if (twoDim < 0.5f) { color.a = 0.15f; }`,
			`            else { color.a *= 0.875f; color.rgb *= vec3(0.75f, 0.75f, 0.75f); }`,
			`        }`,
			`    }`,
			`    if (${S.DefaultSecondaryModeName} > 3.5f && ${S.DefaultSecondaryModeName} < 4.5f)`,
			`    {`,
			`        float col = mod(round(gl_FragCoord.x - 0.5f), 6.0f);`,
			`        float row = mod(round(gl_FragCoord.y - 0.5f), 4.0f);`,
			`        float light = 0.1f + mod(round(gl_FragCoord.x - 0.5f), 12.0f) / 96.0f;`,
			`        if ((col < 0.5f && row < 2.5f) || (col > 2.5f && col < 3.5f && !(row > 0.5f && row < 1.5f)))`,
			`        {`,
			`            // magenta`,
			`            if (twoDim < 0.5f) { color = vec4(0.8f, 0.0f, 0.8f, 0.15f); }`,
			`            else color.rgb = mix(color.rgb, vec3(1.0f, 0.0f, 1.0f), light);`,
			`        }`,
			`        else if ((col > 0.5f && col < 1.5f && row < 2.5f) || (col > 3.5f && col < 4.5f && !(row > 0.5f && row < 1.5f)))`,
			`        {`,
			`            // lime`,
			`            if (twoDim < 0.5f) { color = vec4(0.0f, 0.9f, 0.0f, 0.15f); }`,
			`            else color.rgb = mix(color.rgb, vec3(0.0f, 1.0f, 0.0f), light);`,
			`        }`,
			`        else`,
			`        {`,
			`            if (twoDim < 0.5f) { color.a = 0.15f; }`,
			`            else color.rgb = mix(color.rgb, vec3(0.0f, 0.0f, 0.0f), light);`,
			`        }`,
			`        vec3 add = gray(color) < 0.025f ? vec3(0.0f) : vec3(0.075f);`,
			`        color.rgb += light * add;`,
			`    }`,
			`    `,
			`    ${S.DefaultFragmentOutColorName} = color;`,
			`}`
		];
	}

	static ScreenVertexShader(state) {
		const S = ScreenShader;
		return [
			S.GetVertexShaderHeader(state),
			`uniform float ${S.DefaultPrimaryModeName};`,
			`in vec2 ${S.DefaultPositionName};`,
			`uniform mat4 ${S.DefaultProjectionMatrixName};`,
			`uniform mat4 ${S.DefaultModelViewMatrixName};`,
			`uniform vec2 ${S.DefaultResolutionName};`,
			`out vec2 varTexCoord;`,
			`const vec2 endUV = vec2(319.0f / 320.0f, 199.0f / 200.0f);`,
			``,
			`void main()`,
			`{`,
			`    vec2 pos = vec2(${S.DefaultPositionName}.x, ${S.DefaultPositionName}.y);`,
			`    float u = pos.x > 0.5f ? endUV.x : 0.0f;`,
			`    float v = pos.y > 0.5f ? endUV.y : 0.0f;`,
			`    varTexCoord = vec2(u, 1.0f - v);`,
			`    gl_Position = ${S.DefaultProjectionMatrixName} * ${S.DefaultModelViewMatrixName} * vec4(pos, 0.001f, 1.0f);`,
			`}`
		];
	}

	Use(projectionMatrix) {
		if (this.shaderProgram !== ShaderProgram.ActiveProgram)
			this.shaderProgram.Use();

		this.shaderProgram.SetInputMatrix(ScreenShader.DefaultModelViewMatrixName, Matrix4.Identity.ToArray(), true);
		this.shaderProgram.SetInputMatrix(ScreenShader.DefaultProjectionMatrixName, projectionMatrix.ToArray(), true);
	}

	/**
	 * new ScreenShader(state) or (protected) new ScreenShader(state, fragmentShaderLines, vertexShaderLines)
	 */
	constructor(state, fragmentShaderLines, vertexShaderLines) {
		if (fragmentShaderLines === undefined) {
			fragmentShaderLines = ScreenShader.ScreenFragmentShader(state);
			vertexShaderLines = ScreenShader.ScreenVertexShader(state);
		}

		const fragmentShader = new Shader(state, Shader.Type.Fragment, fragmentShaderLines.join('\n'));
		const vertexShader = new Shader(state, Shader.Type.Vertex, vertexShaderLines.join('\n'));

		this.shaderProgram = new ShaderProgram(state, fragmentShader, vertexShader);
	}

	get ShaderProgram() { return this.shaderProgram; }

	SetSampler(textureUnit = 0) {
		this.shaderProgram.SetInput(ScreenShader.DefaultSamplerName, textureUnit);
	}

	SetResolution(resolution) {
		this.shaderProgram.SetInputVector2(ScreenShader.DefaultResolutionName, resolution.Width, resolution.Height);
	}

	/**
	 * Changes the filter modes.
	 * @param primary GraphicFilter: 0: No filter, 1: Smooth, 2: Blur (old), 3: PixelArt (web port, edge-directed scaler)
	 * @param secondary 0: No addition, 1: Vertical lines, 2: Grid, 3: Scan lines
	 */
	SetMode(primary, secondary) {
		this.shaderProgram.SetInput(ScreenShader.DefaultPrimaryModeName, primary);
		this.shaderProgram.SetInput(ScreenShader.DefaultSecondaryModeName, secondary);
	}

	static Create(state) { return new ScreenShader(state); }
}
