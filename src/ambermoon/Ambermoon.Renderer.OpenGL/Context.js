// Port of Ambermoon.Renderer.OpenGL/Context.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Context.cs - Render context which is capable of rotating the whole screen

import { Exception } from '../../runtime.js';
import { Global } from '../Ambermoon.Core/UI/Global.js';
import { Matrix4 } from './Matrix.js';
import { Rotation } from './Enums.js';

const FovY3D = Math.fround(Math.PI * 0.26);

export class Context {
	constructor(state, width, height, aspect) {
		this.width = -1;
		this.height = -1;
		this.aspect = 1.0;
		this.rotation = Rotation.None;
		this.modelViewMatrix = Matrix4.Identity;
		this.State = state;
		this.aspect = aspect;

		// WebGL2 = OpenGL ES 3.0
		// We need at least OpenGLES 3.0 for instancing and shaders
		if (this.State.OpenGLVersionMajor < 3)
			throw new Exception(`OpenGL ES version 3.0 is required for rendering. Your version is ${this.State.OpenGLVersionMajor}.${this.State.OpenGLVersionMinor}.`);

		const gl = this.State.Gl;

		gl.clearColor(0.0, 0.0, 0.0, 1.0);

		gl.enable(gl.DEPTH_TEST);
		gl.depthRange(0.0, 1.0);
		gl.depthFunc(gl.LEQUAL);
		gl.disable(gl.CULL_FACE);

		gl.disable(gl.BLEND);
		gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ZERO);

		this.State.ProjectionMatrix2D = Matrix4.CreateOrtho2D(0, Global.VirtualScreenWidth, 0, Global.VirtualScreenHeight, 0, 1);

		this.Resize(width, height, aspect);
	}

	Resize(width, height, aspect = null) {
		aspect ??= this.aspect;

		this.State.ProjectionMatrix3D = Matrix4.CreatePerspective(FovY3D, aspect, 0.1, 40.0 * Global.DistancePerBlock); // Max 3D map dimension is 41

		this.State.ClearMatrices();
		this.State.PushModelViewMatrix(Matrix4.Identity);
		this.State.PushProjectionMatrix(this.State.ProjectionMatrix2D);

		this.width = width;
		this.height = height;

		this.SetRotation(this.rotation, true);
	}

	UpdateAspect(aspect) {
		this.aspect = aspect;
		this.Resize(this.width, this.height, aspect);
	}

	SetRotation(rotation, forceUpdate = false) {
		if (forceUpdate || rotation !== this.rotation) {
			this.rotation = rotation;

			this.ApplyMatrix();
		}
	}

	UpdateFullScreenMatrix() {
		this.State.FullScreenProjectionMatrix2D = Matrix4.CreateOrtho2D(0, this.width, 0, this.height, 0, 1);
	}

	ApplyMatrix() {
		this.State.RestoreModelViewMatrix(this.modelViewMatrix);
		this.State.PopModelViewMatrix();

		if (this.rotation === Rotation.None) {
			this.modelViewMatrix = Matrix4.Identity;
		} else {
			let rotationDegree = 0.0;

			switch (this.rotation) {
				case Rotation.Deg90:
					rotationDegree = 90.0;
					break;
				case Rotation.Deg180:
					rotationDegree = 180.0;
					break;
				case Rotation.Deg270:
					rotationDegree = 270.0;
					break;
				default:
					break;
			}

			const x = 0.5 * this.width;
			const y = 0.5 * this.height;

			if (this.rotation !== Rotation.Deg180) { // 90° or 270°
				const factor = this.height / this.width;

				this.modelViewMatrix = Matrix4.op_Multiply(Matrix4.op_Multiply(Matrix4.op_Multiply(
					Matrix4.CreateTranslationMatrix(x, y),
					Matrix4.CreateYRotationMatrix(rotationDegree)),
					Matrix4.CreateScalingMatrix(factor, 1.0 / factor)),
					Matrix4.CreateTranslationMatrix(-x, -y));
			} else { // 180°
				this.modelViewMatrix = Matrix4.op_Multiply(Matrix4.op_Multiply(
					Matrix4.CreateTranslationMatrix(x, y),
					Matrix4.CreateYRotationMatrix(rotationDegree)),
					Matrix4.CreateTranslationMatrix(-x, -y));
			}
		}

		this.State.PushModelViewMatrix(this.modelViewMatrix);
		this.UpdateFullScreenMatrix();
	}
}
