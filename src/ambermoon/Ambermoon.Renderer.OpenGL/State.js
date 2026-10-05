// Port of Ambermoon.Renderer.OpenGL/State.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// State.cs - OpenGL state (WebGL2 in the browser port)

import { Exception, Stack } from '../../runtime.js';
import { Matrix4 } from './Matrix.js';

const contextIdentifiers = new WeakMap();
let nextContextIdentifier = 1;

/**
 * Returns the WebGL2 context of a context provider.
 * A context provider is { gl, canvas, Identifier } (see IContextProvider.js).
 */
function getGl(contextProvider) {
	if (contextProvider?.gl)
		return contextProvider.gl;

	if (contextProvider?.canvas) {
		const gl = contextProvider.canvas.getContext('webgl2', {
			alpha: false,
			depth: true,
			stencil: true,
			antialias: false,
			premultipliedAlpha: false
		});

		if (gl) {
			contextProvider.gl = gl;
			return gl;
		}
	}

	throw new Exception('OpenGL is not supported or the version could not be determined.');
}

function getContextIdentifier(contextProvider, gl) {
	if (contextProvider.Identifier != null)
		return contextProvider.Identifier;

	let identifier = contextIdentifiers.get(gl);

	if (identifier == null) {
		identifier = `webgl2-${nextContextIdentifier++}`;
		contextIdentifiers.set(gl, identifier);
	}

	return identifier;
}

export class State {
	/**
	 * @param contextProvider { gl: WebGL2RenderingContext, canvas?: HTMLCanvasElement, Identifier?: string }
	 */
	constructor(contextProvider) {
		this.OpenGLVersionMajor = 0;
		this.OpenGLVersionMinor = 0;
		this.Embedded = false;
		this.GLSLVersionMajor = 0;
		this.GLSLVersionMinor = 0;
		this.Gl = null;

		this.projectionMatrixStack = new Stack();
		this.modelViewMatrixStack = new Stack();
		this.ProjectionMatrix2D = Matrix4.Identity;
		this.ProjectionMatrix3D = Matrix4.Identity;
		this.FullScreenProjectionMatrix2D = Matrix4.Identity;

		this.Gl = getGl(contextProvider);
		this.contextIdentifier = getContextIdentifier(contextProvider, this.Gl);

		const gl = this.Gl;
		let openGLVersion = String(gl.getParameter(gl.VERSION) ?? '').trimStart();
		let webGL = false;

		// WebGL: "WebGL 2.0 (OpenGL ES 3.0 Chromium)". WebGL 2.0 is OpenGL ES 3.0.
		if (openGLVersion.startsWith('WebGL')) {
			webGL = true;
			this.Embedded = true;
			openGLVersion = openGLVersion.substring(5).trimStart();
		}

		if (openGLVersion.startsWith('OpenGL'))
			openGLVersion = openGLVersion.substring(6).trimStart();

		if (openGLVersion.startsWith('ES')) {
			this.Embedded = true;
			openGLVersion = openGLVersion.substring(2).trimStart();
		}

		const versionRegex = /^([0-9]+)\.([0-9]+)/;

		let match = versionRegex.exec(openGLVersion);

		if (!match) {
			throw new Exception('OpenGL is not supported or the version could not be determined.');
		}

		this.OpenGLVersionMajor = parseInt(match[1], 10);
		this.OpenGLVersionMinor = parseInt(match[2], 10);

		if (webGL) {
			// WebGL 1.0 = OpenGL ES 2.0, WebGL 2.0 = OpenGL ES 3.0
			this.OpenGLVersionMajor += 1;
			this.OpenGLVersionMinor = 0;
		}

		if (this.OpenGLVersionMajor >= 2 || this.Embedded) { // glsl is supported since OpenGL 2.0
			let glslVersion = String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? '').trimStart();

			while (true) {
				if (glslVersion.startsWith('WebGL'))
					glslVersion = glslVersion.substring(5).trimStart();
				else if (glslVersion.startsWith('OpenGL'))
					glslVersion = glslVersion.substring(6).trimStart();
				else if (glslVersion.startsWith('ES'))
					glslVersion = glslVersion.substring(2).trimStart();
				else if (glslVersion.startsWith('GLSL'))
					glslVersion = glslVersion.substring(4).trimStart();
				else
					break;
			}

			match = versionRegex.exec(glslVersion);

			if (match) {
				this.GLSLVersionMajor = parseInt(match[1], 10);
				this.GLSLVersionMinor = parseInt(match[2], 10);
			}

			if (webGL && this.GLSLVersionMajor < 3 && this.OpenGLVersionMajor >= 3) {
				// WebGL2 always supports GLSL ES 3.00
				this.GLSLVersionMajor = 3;
				this.GLSLVersionMinor = 0;
			}
		}
	}

	PushProjectionMatrix(matrix) {
		this.projectionMatrixStack.Push(matrix);
	}

	PushModelViewMatrix(matrix) {
		this.modelViewMatrixStack.Push(matrix);
	}

	PopProjectionMatrix() {
		return this.projectionMatrixStack.Pop();
	}

	PopModelViewMatrix() {
		return this.modelViewMatrixStack.Pop();
	}

	RestoreProjectionMatrix(matrix) {
		if (this.projectionMatrixStack.Contains(matrix)) {
			while (this.CurrentProjectionMatrix !== matrix)
				this.projectionMatrixStack.Pop();
		} else
			this.PushProjectionMatrix(matrix);
	}

	RestoreModelViewMatrix(matrix) {
		if (this.modelViewMatrixStack.Contains(matrix)) {
			while (this.CurrentModelViewMatrix !== matrix)
				this.modelViewMatrixStack.Pop();
		} else
			this.PushModelViewMatrix(matrix);
	}

	ClearMatrices() {
		this.projectionMatrixStack.Clear();
		this.modelViewMatrixStack.Clear();
	}

	Equals(other) {
		if (!(other instanceof State))
			return false;

		return this.contextIdentifier === other.contextIdentifier &&
			this.OpenGLVersionMajor === other.OpenGLVersionMajor &&
			this.OpenGLVersionMinor === other.OpenGLVersionMinor &&
			this.GLSLVersionMajor === other.GLSLVersionMajor &&
			this.GLSLVersionMinor === other.GLSLVersionMinor;
	}

	/** Value key (used by ValueMap like the C# GetHashCode/Equals pair). */
	toString() {
		return `${this.contextIdentifier}|${this.OpenGLVersionMajor}.${this.OpenGLVersionMinor}|${this.GLSLVersionMajor}.${this.GLSLVersionMinor}`;
	}

	GetHashCode() {
		const s = this.toString();
		let hash = 17;

		for (let i = 0; i < s.length; ++i)
			hash = (Math.imul(hash, 31) + s.charCodeAt(i)) | 0;

		return hash;
	}

	get CurrentProjectionMatrix() { return (this.projectionMatrixStack.Count === 0) ? null : this.projectionMatrixStack.Peek(); }
	get CurrentModelViewMatrix() { return (this.modelViewMatrixStack.Count === 0) ? null : this.modelViewMatrixStack.Peek(); }
}
