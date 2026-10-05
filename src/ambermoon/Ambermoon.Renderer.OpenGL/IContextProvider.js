// Port of Ambermoon.Renderer.OpenGL/IContextProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
//
// IContextProvider is a pure interface in C# (IGLContextSource + Identifier). In the browser port a
// context provider is any object of the shape
//
//   { gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, Identifier: string }
//
// `gl` is optional if `canvas` is given (then `canvas.getContext('webgl2', ...)` is used),
// `Identifier` is optional (defaults to 'webgl2').
//
// This helper creates such an object from a canvas. Recommended context attributes:
// depth + stencil (the frame buffers use DEPTH24_STENCIL8), no antialiasing, and
// preserveDrawingBuffer is not required (screenshots are read right after rendering).

export function CreateContextProvider(canvas, identifier = 'webgl2', contextAttributes = null) {
	const attributes = contextAttributes ?? {
		alpha: false,
		depth: true,
		stencil: true,
		antialias: false,
		premultipliedAlpha: false,
		preserveDrawingBuffer: false
	};
	const gl = canvas.getContext('webgl2', attributes);

	if (!gl)
		throw new Error('WebGL2 is not supported by this browser.');

	return { gl, canvas, Identifier: identifier };
}
