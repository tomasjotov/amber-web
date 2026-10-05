// Smoke test for the WebGL2 port of Ambermoon.Renderer.OpenGL.
// Every step imports its modules dynamically so that a missing/broken module only fails that step.
//
// Steps:
//  1. State (WebGL2 context + version detection)
//  2. Compile and link all shader programs
//  3. Low-level drawing: ColorShader + VertexArrayObject + buffers (one red quad)
//  4. Mid-level: TextureAtlasBuilder + palette texture + RenderLayer + Sprite + ColoredRect
//  5. High-level: RenderView with an empty texture atlas manager and a dummy palette + screenshot

const R = '../src/ambermoon/Ambermoon.Renderer.OpenGL/';
const logElement = document.getElementById('log');
const canvas = document.getElementById('canvas');
const results = [];

function log(text, cls = 'info') {
	const span = document.createElement('span');
	span.className = cls;
	span.textContent = text + '\n';
	logElement.appendChild(span);
	(cls === 'fail' ? console.error : console.log)(text);
}

async function step(name, fn) {
	try {
		const info = await fn();
		results.push([name, true]);
		log(`[OK]   ${name}${info ? ' - ' + info : ''}`, 'ok');
		return true;
	} catch (e) {
		results.push([name, false]);
		log(`[FAIL] ${name}: ${e?.stack ?? e}`, 'fail');
		return false;
	}
}

/** Reads one pixel at canvas coordinates (x, y from the top). */
function readPixel(gl, x, y) {
	const data = new Uint8Array(4);
	gl.readPixels(x, gl.drawingBufferHeight - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
	return Array.from(data);
}

function expectColor(actual, expected, what, tolerance = 8) {
	for (let i = 0; i < 3; ++i) {
		if (Math.abs(actual[i] - expected[i]) > tolerance)
			throw new Error(`${what}: expected rgb(${expected.join(',')}) but got rgba(${actual.join(',')})`);
	}
}

function checkGlError(gl, what) {
	const error = gl.getError();
	if (error !== gl.NO_ERROR)
		throw new Error(`${what}: GL error 0x${error.toString(16)}`);
}

/** Dummy 32 color palette (RGBA): index 0 black, 1 green, 2 red, 3 blue, rest gray ramp */
function createPaletteGraphic() {
	const data = new Uint8Array(32 * 4);
	for (let i = 0; i < 32; ++i) {
		data[i * 4 + 0] = i * 8;
		data[i * 4 + 1] = i * 8;
		data[i * 4 + 2] = i * 8;
		data[i * 4 + 3] = 255;
	}
	data.set([0, 0, 0, 255], 0);
	data.set([0, 255, 0, 255], 4);
	data.set([255, 0, 0, 255], 8);
	data.set([0, 0, 255, 255], 12);
	return { Width: 32, Height: 1, Data: data, IndexedGraphic: false };
}

/** Indexed 16x16 graphic: color index 1 with a transparent (index 0) border */
function createIndexedGraphic(colorIndex = 1) {
	const data = new Uint8Array(16 * 16);
	for (let y = 1; y < 15; ++y)
		for (let x = 1; x < 15; ++x)
			data[x + y * 16] = colorIndex;
	return { Width: 16, Height: 16, Data: data, IndexedGraphic: true };
}

async function main() {
	let state = null;
	let contextProvider = null;

	await step('Create WebGL2 context provider', async () => {
		const { CreateContextProvider } = await import(R + 'IContextProvider.js');
		contextProvider = CreateContextProvider(canvas, 'renderer-test');
		return contextProvider.gl.getParameter(contextProvider.gl.VERSION);
	});

	if (!contextProvider)
		return;

	await step('State', async () => {
		const { State } = await import(R + 'State.js');
		state = new State(contextProvider);
		return `OpenGL ES ${state.OpenGLVersionMajor}.${state.OpenGLVersionMinor}, GLSL ${state.GLSLVersionMajor}.${state.GLSLVersionMinor}, embedded=${state.Embedded}`;
	});

	if (!state)
		return;

	const gl = state.Gl;

	// 2. Shaders
	const shaderModules = [
		'ColorShader', 'TextureShader', 'OpaqueTextureShader', 'AlphaTextureShader', 'FadingTextureShader',
		'TextShader', 'SubPixelTextShader', 'ImageShader', 'SkyShader', 'FowShader',
		'Texture3DShader', 'Billboard3DShader', 'ScreenShader', 'EffectShader'
	];

	for (const name of shaderModules) {
		await step(`Shader ${name}`, async () => {
			const module = await import(R + name + '.js');
			const shader = module[name].Create(state);
			const program = shader.ShaderProgram;
			if (!program.Linked)
				throw new Error('not linked');
			return `${program.uniforms.size} active uniforms`;
		});
	}

	// 3. Low-level drawing
	await step('Low-level colored quad (ColorShader + VAO + buffers)', async () => {
		const { Matrix4 } = await import(R + 'Matrix.js');
		const { ColorShader } = await import(R + 'ColorShader.js');
		const { VertexArrayObject } = await import(R + 'VertexArrayObject.js');
		const { FloatPositionBuffer } = await import(R + 'FloatPositionBuffer.js');
		const { ColorBuffer } = await import(R + 'ColorBuffer.js');
		const { ByteBuffer } = await import(R + 'ByteBuffer.js');
		const { IndexBuffer } = await import(R + 'IndexBuffer.js');

		state.ClearMatrices();
		state.PushModelViewMatrix(Matrix4.Identity);
		state.PushProjectionMatrix(Matrix4.CreateOrtho2D(0, 320, 0, 200, 0, 1));

		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.disable(gl.BLEND);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		const shader = ColorShader.Create(state);
		const vao = new VertexArrayObject(state, shader.ShaderProgram);
		const positionBuffer = new FloatPositionBuffer(state, false);
		const colorBuffer = new ColorBuffer(state, true);
		const layerBuffer = new ByteBuffer(state, true);
		const indexBuffer = new IndexBuffer(state);

		vao.AddBuffer(ColorShader.DefaultPositionName, positionBuffer);
		vao.AddBuffer(ColorShader.DefaultColorName, colorBuffer);
		vao.AddBuffer(ColorShader.DefaultLayerName, layerBuffer);
		vao.AddBuffer('index', indexBuffer);

		const [x, y, w, h] = [20, 20, 40, 30];
		const index = positionBuffer.Add(x, y);
		positionBuffer.Add(x + w, y, index + 1);
		positionBuffer.Add(x + w, y + h, index + 2);
		positionBuffer.Add(x, y + h, index + 3);
		indexBuffer.InsertQuad(Math.trunc(index / 4));

		const red = { R: 255, G: 0, B: 0, A: 255 };
		for (let i = 0; i < 4; ++i) {
			colorBuffer.Add(red, index + i);
			layerBuffer.Add(0, index + i);
		}

		shader.Use();
		shader.UpdateMatrices(state);
		shader.SetZ(0.5);

		vao.Bind();
		gl.drawElements(gl.TRIANGLES, Math.trunc(positionBuffer.Size / 4) * 3, gl.UNSIGNED_INT, 0);
		vao.Unbind();
		checkGlError(gl, 'draw');

		expectColor(readPixel(gl, 2 * (x + w / 2), 2 * (y + h / 2)), [255, 0, 0], 'inside quad');
		expectColor(readPixel(gl, 2 * (x + w + 10), 2 * (y + h / 2)), [0, 0, 0], 'outside quad');

		vao.Dispose();
		positionBuffer.Dispose();
		colorBuffer.Dispose();
		layerBuffer.Dispose();
		indexBuffer.Dispose();
		return 'red quad verified';
	});

	// 4. Mid-level drawing
	await step('TextureAtlas + palette + RenderLayer + Sprite + ColoredRect', async () => {
		const { Matrix4 } = await import(R + 'Matrix.js');
		const { TextureAtlasBuilder } = await import(R + 'TextureAtlas.js');
		const { RenderLayer } = await import(R + 'RenderLayer.js');
		const { Sprite, SpriteFactory } = await import(R + 'Sprite.js');
		const { ColoredRect } = await import(R + 'ColoredRect.js');
		const { Rect } = await import('../src/ambermoon/Ambermoon.Common/Rect.js');
		const { Layer } = await import('../src/ambermoon/Ambermoon.Core/Render/Layer.js');

		state.ClearMatrices();
		state.PushModelViewMatrix(Matrix4.Identity);
		state.PushProjectionMatrix(Matrix4.CreateOrtho2D(0, 320, 0, 200, 0, 1));

		const atlasBuilder = new TextureAtlasBuilder(state);
		atlasBuilder.AddTexture(0, createIndexedGraphic(1));
		atlasBuilder.AddTexture(1, createIndexedGraphic(2));
		const atlas = atlasBuilder.Create(1);

		const paletteBuilder = new TextureAtlasBuilder(state);
		paletteBuilder.AddTexture(0, createPaletteGraphic());
		const palette = paletteBuilder.CreateUnpacked(32, 4).Texture;

		const layer = new RenderLayer(state, Layer.UI, atlas.Texture, palette);
		layer.Visible = true;

		const virtualScreen = new Rect(0, 0, 320, 200);
		const sprite = new Sprite(16, 16, 0, 0, virtualScreen);
		sprite.TextureAtlasOffset = atlas.GetOffset(0);
		sprite.Layer = layer;
		sprite.X = 100;
		sprite.Y = 50;
		sprite.PaletteIndex = 0;
		sprite.Visible = true;

		const sprite2 = new SpriteFactory(virtualScreen).Create(16, 16, true, 1);
		sprite2.TextureAtlasOffset = atlas.GetOffset(1);
		sprite2.Layer = layer;
		sprite2.X = 130;
		sprite2.Y = 50;
		sprite2.Visible = true;

		const rect = new ColoredRect(30, 20, { R: 0, G: 0, B: 255, A: 255 }, 0, virtualScreen);
		rect.Layer = layer;
		rect.X = 200;
		rect.Y = 100;
		rect.Visible = true;

		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.disable(gl.BLEND);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		layer.Render();
		checkGlError(gl, 'layer render');

		expectColor(readPixel(gl, 2 * 108, 2 * 58), [0, 255, 0], 'sprite 1 (palette color 1)');
		expectColor(readPixel(gl, 2 * 138, 2 * 58), [255, 0, 0], 'sprite 2 (palette color 2)');
		expectColor(readPixel(gl, 2 * 100, 2 * 50), [0, 0, 0], 'sprite 1 transparent border');
		expectColor(readPixel(gl, 2 * 215, 2 * 110), [0, 0, 255], 'colored rect');

		// Move + hide
		sprite.X = 10;
		rect.Visible = false;
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		layer.Render();
		expectColor(readPixel(gl, 2 * 18, 2 * 58), [0, 255, 0], 'moved sprite');
		expectColor(readPixel(gl, 2 * 215, 2 * 110), [0, 0, 0], 'hidden colored rect');

		sprite.Delete();
		sprite2.Delete();
		rect.Delete();
		layer.Dispose();
		palette.Dispose();
		return 'sprites and colored rect verified';
	});

	// 5. High-level: RenderView
	await step('RenderView (empty atlases) + ColoredRect + screenshot', async () => {
		const { RenderView } = await import(R + 'RenderView.js');
		const { Size } = await import('../src/ambermoon/Ambermoon.Common/Size.js');
		const { Layer } = await import('../src/ambermoon/Ambermoon.Core/Render/Layer.js');
		const { TextureAtlasManager } = await import('../src/ambermoon/Ambermoon.Core/Render/TextureAtlasManager.js');

		const paletteProvider = { Palettes: new Map([[1, createPaletteGraphic()]]) };
		const useFrameBuffer = { value: true };
		const useEffects = { value: true };
		const renderView = new RenderView(contextProvider, paletteProvider, () => TextureAtlasManager.CreateEmpty(),
			canvas.width, canvas.height, new Size(canvas.width, canvas.height), useFrameBuffer, useEffects,
			() => ({ Key: 0, Value: 0 }), () => 0, []);

		const rect = renderView.ColoredRectFactory.Create(50, 40, { R: 255, G: 255, B: 0, A: 255 }, 0);
		rect.Layer = renderView.GetLayer(Layer.UI);
		rect.X = 50;
		rect.Y = 60;
		rect.Visible = true;

		let screenshot = null;
		renderView.TakeScreenshot((width, height, data) => screenshot = { width, height, data });
		renderView.Render(null);
		checkGlError(gl, 'render view');

		expectColor(readPixel(gl, 2 * 75, 2 * 80), [255, 255, 0], 'colored rect via RenderView');

		if (!screenshot)
			throw new Error('no screenshot');
		if (screenshot.data.length !== screenshot.width * screenshot.height * 3)
			throw new Error('invalid screenshot size');

		return `frame buffer: ${useFrameBuffer.value}, effects: ${useEffects.value}, screenshot ${screenshot.width}x${screenshot.height}`;
	});

	// 6. GameRenderView: text and 3D
	await step('GameRenderView: RenderText + Surface3D (3D wall) + Camera3D', async () => {
		const { GameRenderView } = await import(R + 'RenderView.js');
		const { Size } = await import('../src/ambermoon/Ambermoon.Common/Size.js');
		const { Rect } = await import('../src/ambermoon/Ambermoon.Common/Rect.js');
		const { Layer } = await import('../src/ambermoon/Ambermoon.Core/Render/Layer.js');
		const { SurfaceType, WallOrientation } = await import('../src/ambermoon/Ambermoon.Core/Render/ISurface3D.js');
		const { TextureAtlasManager } = await import('../src/ambermoon/Ambermoon.Core/Render/TextureAtlasManager.js');

		const glyph = { Width: 6, Height: 7, Data: new Uint8Array(6 * 7).fill(1), IndexedGraphic: true };
		const wall = { Width: 16, Height: 16, Data: new Uint8Array(16 * 16).fill(3), IndexedGraphic: true };
		let textureAtlasManager = null;

		const paletteProvider = { Palettes: new Map([[1, createPaletteGraphic()]]) };
		const renderView = new GameRenderView(contextProvider, null, paletteProvider, null, null, () => {
			textureAtlasManager = TextureAtlasManager.CreateEmpty();
			textureAtlasManager.AddTexture(Layer.Text, 0, glyph);
			textureAtlasManager.AddTexture(Layer.Map3D, 0, wall);
			return textureAtlasManager;
		}, canvas.width, canvas.height, new Size(canvas.width, canvas.height), true, false,
			() => ({ Key: 0, Value: 0 }), () => 0, []);

		// Text
		renderView.RenderTextFactory.GlyphTextureMapping = new Map([[0, textureAtlasManager.GetOrCreate(Layer.Text).GetOffset(0)]]);
		const text = { Lines: [new Uint8Array([0, 0, 0])], GlyphIndices: new Uint8Array([0, 0, 0]), LineCount: 1, MaxLineSize: 3 };
		const renderText = renderView.RenderTextFactory.Create(0, renderView.GetLayer(Layer.Text), text, 2, false, new Rect(10, 160, 100, 20));
		renderText.Visible = true;

		// 3D
		renderView.ShowLayer(Layer.Map3D, true);
		renderView.ShowLayer(Layer.Map3DCeiling, true);
		renderView.ShowLayer(Layer.Billboards3D, true);
		renderView.SetLight(1.0);
		renderView.Set3DFade(1.0);
		renderView.SetSkyColorReplacement(null, null);
		renderView.Camera3D.SetPosition(0, 0);
		const surface = renderView.Surface3DFactory.Create(SurfaceType.Wall, 1, 1, 16, 16, 16, 16, false, 1, 0.0, WallOrientation.Rotated180);
		surface.TextureAtlasOffset = textureAtlasManager.GetOrCreate(Layer.Map3D).GetOffset(0);
		surface.Layer = renderView.GetLayer(Layer.Map3D);
		surface.X = 0.5;
		surface.Y = 0.5;
		surface.Z = -2.0;
		surface.Visible = true;

		renderView.Render(null);
		checkGlError(gl, 'game render view');

		expectColor(readPixel(gl, 2 * 12, 2 * 163), [255, 0, 0], 'text glyph (text color 2)');
		// Center of the 3D view (Global.Map3DViewX/Y = 32/49, size 144x144)
		expectColor(readPixel(gl, 2 * (32 + 72), 2 * (49 + 72)), [0, 0, 255], '3D wall (palette color 3)');

		return 'text and 3D wall verified';
	});

	const failed = results.filter(r => !r[1]).length;
	log(`\n${results.length - failed}/${results.length} steps passed`, failed ? 'fail' : 'ok');
}

main().catch(e => log(`Unexpected error: ${e?.stack ?? e}`, 'fail'));
