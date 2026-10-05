// Port of Ambermoon.Renderer.OpenGL/Shader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Shader.cs - Shader

import { Exception, isNullOrWhiteSpace } from '../../runtime.js';

export class Shader {
	static Type = Object.freeze({
		Fragment: 0,
		Vertex: 1
	});

	constructor(state, type, code) {
		this.code = '';
		this.disposed = false;
		this.state = null;
		this.ShaderType = Shader.Type.Fragment;
		this.ShaderIndex = null;

		this.state = state;
		this.ShaderType = type;
		this.code = code;

		this.Create();
	}

	Create() {
		const gl = this.state.Gl;

		this.ShaderIndex = gl.createShader((this.ShaderType === Shader.Type.Fragment) ?
			gl.FRAGMENT_SHADER :
			gl.VERTEX_SHADER);

		gl.shaderSource(this.ShaderIndex, this.code);
		gl.compileShader(this.ShaderIndex);

		const compileStatus = gl.getShaderParameter(this.ShaderIndex, gl.COMPILE_STATUS);

		if (!compileStatus) {
			const infoLog = gl.getShaderInfoLog(this.ShaderIndex);

			// TODO: throw specialized exception?
			if (!isNullOrWhiteSpace(infoLog)) {
				throw new Exception(infoLog.trim());
			} else {
				throw new Exception(gl.isContextLost() ? 'WebGL context lost' : 'Unknown error');
			}
		}
	}

	AttachToProgram(program) {
		program.AttachShader(this);
	}

	Dispose() {
		if (!this.disposed) {
			if (this.ShaderIndex != null) {
				this.state.Gl.deleteShader(this.ShaderIndex);
				this.ShaderIndex = null;
			}

			this.disposed = true;
		}
	}
}

export const Shader_Type = Shader.Type;
