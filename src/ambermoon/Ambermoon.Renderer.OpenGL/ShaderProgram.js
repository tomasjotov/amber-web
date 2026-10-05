// Port of Ambermoon.Renderer.OpenGL/ShaderProgram.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ShaderProgram.cs - Shader program
//
// WebGL notes:
// - There is no glProgramUniform* in WebGL2, so the "old version" path (use program, set uniform,
//   restore program) is always used (the C# code also uses it for OpenGL < 4.1).
// - The C# overloads SetInput(name, bool/float/double/int/uint) and SetInputVector2/3/4 for
//   float/int/uint can't be distinguished by JS numbers. Instead the type of the active uniform
//   (queried once after linking) selects uniform1f/uniform1i/uniform1ui etc.
// - Attributes which are not active in the shader (location -1) are skipped instead of producing
//   GL errors (the C# code passes -1 as uint to GL which just raises an ignored GL error).

import { Exception, InvalidOperationException } from '../../runtime.js';
import { Shader } from './Shader.js';
import { GLType } from './BufferObject.js';

// WebGL uniform types
const UniformType = Object.freeze({
	Float: 0x1406,
	FloatVec2: 0x8B50,
	FloatVec3: 0x8B51,
	FloatVec4: 0x8B52,
	Int: 0x1404,
	IntVec2: 0x8B53,
	IntVec3: 0x8B54,
	IntVec4: 0x8B55,
	Bool: 0x8B56,
	BoolVec2: 0x8B57,
	BoolVec3: 0x8B58,
	BoolVec4: 0x8B59,
	UnsignedInt: 0x1405,
	UnsignedIntVec2: 0x8DC6,
	UnsignedIntVec3: 0x8DC7,
	UnsignedIntVec4: 0x8DC8
});

const NoUniform = Object.freeze({ location: null, type: 0, size: 0 });

export class ShaderProgram {
	static ActiveProgram = null;

	/**
	 * new ShaderProgram(state) or new ShaderProgram(state, fragmentShader, vertexShader)
	 */
	constructor(state, fragmentShader, vertexShader) {
		this.state = null;
		this.fragmentShader = null;
		this.vertexShader = null;
		this.disposed = false;
		this.ProgramIndex = null;
		this.Loaded = false;
		this.Linked = false;
		this.uniforms = new Map();

		this.state = state;

		this.Create();

		if (arguments.length >= 3) {
			this.AttachShader(fragmentShader);
			this.AttachShader(vertexShader);

			this.Link(false);
		}
	}

	Create() {
		this.ProgramIndex = this.state.Gl.createProgram();
	}

	AttachShader(shader) {
		if (shader == null)
			return;

		const gl = this.state.Gl;

		if (shader.ShaderType === Shader.Type.Fragment) {
			if (this.fragmentShader === shader)
				return;

			if (this.fragmentShader != null)
				gl.detachShader(this.ProgramIndex, this.fragmentShader.ShaderIndex);

			this.fragmentShader = shader;
			gl.attachShader(this.ProgramIndex, shader.ShaderIndex);
		} else if (shader.ShaderType === Shader.Type.Vertex) {
			if (this.vertexShader === shader)
				return;

			if (this.vertexShader != null)
				gl.detachShader(this.ProgramIndex, this.vertexShader.ShaderIndex);

			this.vertexShader = shader;
			gl.attachShader(this.ProgramIndex, shader.ShaderIndex);
		}

		this.Linked = false;
		this.Loaded = this.fragmentShader != null && this.vertexShader != null;
	}

	Link(detachShaders) {
		const gl = this.state.Gl;

		if (!this.Linked) {
			if (!this.Loaded)
				throw new InvalidOperationException('ShaderProgram.Link: Shader program was not loaded.');

			gl.linkProgram(this.ProgramIndex);

			// Note: The C# code throws on any non-empty info log. WebGL implementations may
			// report warnings on success, so only a failed link status throws here.
			if (!gl.getProgramParameter(this.ProgramIndex, gl.LINK_STATUS)) {
				const infoLog = gl.getProgramInfoLog(this.ProgramIndex);
				throw new Exception((infoLog ?? '').trim() || 'Unknown link error'); // TODO: throw specialized exception?
			}

			this.Linked = true;
			this.QueryUniforms();
		}

		if (detachShaders) {
			if (this.fragmentShader != null) {
				gl.detachShader(this.ProgramIndex, this.fragmentShader.ShaderIndex);
				this.fragmentShader = null;
			}

			if (this.vertexShader != null) {
				gl.detachShader(this.ProgramIndex, this.vertexShader.ShaderIndex);
				this.vertexShader = null;
			}

			this.Loaded = false;
		}
	}

	/** Collects all active uniforms with their types (WebGL specific). */
	QueryUniforms() {
		const gl = this.state.Gl;
		const count = gl.getProgramParameter(this.ProgramIndex, gl.ACTIVE_UNIFORMS);

		this.uniforms.clear();

		for (let i = 0; i < count; ++i) {
			const info = gl.getActiveUniform(this.ProgramIndex, i);

			if (!info)
				continue;

			const name = info.name.endsWith('[0]') ? info.name.substring(0, info.name.length - 3) : info.name;
			const location = gl.getUniformLocation(this.ProgramIndex, name);

			this.uniforms.set(name, { location, type: info.type, size: info.size });
		}
	}

	Use() {
		if (!this.Linked)
			throw new InvalidOperationException('ShaderProgram.Use: Shader program was not linked.');

		this.state.Gl.useProgram(this.ProgramIndex);
		ShaderProgram.ActiveProgram = this;
	}

	/** Returns the attribute location (or -1 if the attribute is not active). */
	BindInputBuffer(name, buffer) {
		if (ShaderProgram.ActiveProgram !== this)
			throw new InvalidOperationException('ShaderProgram.SetInputBuffer: Shader program is not active.');

		const gl = this.state.Gl;
		const location = this.GetLocation(name, true);

		buffer.Bind();

		if (location < 0)
			return location;

		gl.enableVertexAttribArray(location);

		const type = buffer.constructor.Type;

		if (type === GLType.Float)
			gl.vertexAttribPointer(location, buffer.Dimension, type, buffer.Normalized, 0, 0);
		else
			gl.vertexAttribIPointer(location, buffer.Dimension, type, 0, 0);

		return location;
	}

	UnbindInputBuffer(location) {
		if (location < 0)
			return;

		this.state.Gl.disableVertexAttribArray(location);
	}

	/** Attribute: returns the location number. Uniform: returns { location, type, size }. */
	GetLocation(name, preferAttribute = false) {
		if (preferAttribute)
			return this.state.Gl.getAttribLocation(this.ProgramIndex, name);

		return this.uniforms.get(name) ?? NoUniform;
	}

	get UseNormalUniform() {
		// WebGL has no glProgramUniform* functions
		return true;
	}

	CallUniform(oldVersion, newVersion) {
		if (this.UseNormalUniform) {
			const activeProgram = ShaderProgram.ActiveProgram;
			this.Use();
			oldVersion?.();
			if (activeProgram !== ShaderProgram.ActiveProgram) {
				if (activeProgram == null)
					this.state.Gl.useProgram(null);
				else
					activeProgram.Use();
				ShaderProgram.ActiveProgram = activeProgram;
			}
		} else
			newVersion?.();
	}

	SetInputMatrix(name, matrix, transpose) {
		const gl = this.state.Gl;
		const uniform = this.GetLocation(name);

		switch (matrix.length) {
			case 4: // 2x2
				this.CallUniform(() => gl.uniformMatrix2fv(uniform.location, transpose, matrix), null);
				break;
			case 9: // 3x3
				this.CallUniform(() => gl.uniformMatrix3fv(uniform.location, transpose, matrix), null);
				break;
			case 16: // 4x4
				this.CallUniform(() => gl.uniformMatrix4fv(uniform.location, transpose, matrix), null);
				break;
			default:
				throw new InvalidOperationException('ShaderProgram.SetInputMatrix: Unsupported matrix dimensions. Valid are 2x2, 3x3 or 4x4.');
		}
	}

	/** SetInput(name, bool | float | double | int | uint) */
	SetInput(name, value) {
		const gl = this.state.Gl;
		const uniform = this.GetLocation(name);

		if (typeof value === 'boolean')
			value = value ? 1 : 0;

		if (uniform.location == null)
			return; // not active (glUniform with location -1 is ignored by OpenGL as well)

		this.CallUniform(() => {
			switch (uniform.type) {
				case UniformType.Float:
					gl.uniform1f(uniform.location, value);
					break;
				case UniformType.UnsignedInt:
					gl.uniform1ui(uniform.location, value >>> 0);
					break;
				default: // int, bool, samplers
					gl.uniform1i(uniform.location, Math.trunc(value));
					break;
			}
		}, null);
	}

	SetInputColorArray(name, array) {
		const gl = this.state.Gl;
		const uniform = this.GetLocation(name);
		const normalizedArray = new Float32Array(array.length);

		for (let i = 0; i < array.length; ++i)
			normalizedArray[i] = array[i] / 255.0;

		if (uniform.location == null)
			return;

		this.CallUniform(() => gl.uniform4fv(uniform.location, normalizedArray), null);
	}

	setVector(name, values) {
		const gl = this.state.Gl;
		const uniform = this.GetLocation(name);

		if (uniform.location == null)
			return;

		this.CallUniform(() => {
			const location = uniform.location;

			switch (uniform.type) {
				case UniformType.FloatVec2:
					gl.uniform2f(location, values[0], values[1]);
					break;
				case UniformType.FloatVec3:
					gl.uniform3f(location, values[0], values[1], values[2]);
					break;
				case UniformType.FloatVec4:
					gl.uniform4f(location, values[0], values[1], values[2], values[3]);
					break;
				case UniformType.UnsignedIntVec2:
					gl.uniform2ui(location, values[0] >>> 0, values[1] >>> 0);
					break;
				case UniformType.UnsignedIntVec3:
					gl.uniform3ui(location, values[0] >>> 0, values[1] >>> 0, values[2] >>> 0);
					break;
				case UniformType.UnsignedIntVec4:
					gl.uniform4ui(location, values[0] >>> 0, values[1] >>> 0, values[2] >>> 0, values[3] >>> 0);
					break;
				case UniformType.IntVec2:
				case UniformType.BoolVec2:
					gl.uniform2i(location, Math.trunc(values[0]), Math.trunc(values[1]));
					break;
				case UniformType.IntVec3:
				case UniformType.BoolVec3:
					gl.uniform3i(location, Math.trunc(values[0]), Math.trunc(values[1]), Math.trunc(values[2]));
					break;
				case UniformType.IntVec4:
				case UniformType.BoolVec4:
					gl.uniform4i(location, Math.trunc(values[0]), Math.trunc(values[1]), Math.trunc(values[2]), Math.trunc(values[3]));
					break;
				default:
					break; // type mismatch -> ignored like a GL error
			}
		}, null);
	}

	/** SetInputVector2(name, x, y) for float, int and uint vectors */
	SetInputVector2(name, x, y) {
		this.setVector(name, [x, y]);
	}

	/** SetInputVector3(name, x, y, z) for float, int and uint vectors */
	SetInputVector3(name, x, y, z) {
		this.setVector(name, [x, y, z]);
	}

	/** SetInputVector4(name, x, y, z, w) for float, int and uint vectors */
	SetInputVector4(name, x, y, z, w) {
		this.setVector(name, [x, y, z, w]);
	}

	Dispose() {
		if (!this.disposed) {
			if (this.ProgramIndex != null) {
				if (ShaderProgram.ActiveProgram === this) {
					this.state.Gl.useProgram(null);
					ShaderProgram.ActiveProgram = null;
				}

				this.state.Gl.deleteProgram(this.ProgramIndex);
				this.ProgramIndex = null;
			}

			this.disposed = true;
		}
	}
}
