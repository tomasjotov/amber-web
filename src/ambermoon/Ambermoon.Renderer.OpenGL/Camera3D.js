// Port of Ambermoon.Renderer.OpenGL/Camera3D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Camera3D.cs - 3D camera

import { Event } from '../../runtime.js';
import { Matrix4 } from './Matrix.js';

const AngleFactor = Math.PI / 180.0;
const QuarterTurnAngle = 0.5 * Math.PI;

/** The C# event only adds a handler if it is not already registered. */
class TurnedEvent extends Event {
	add(handler) {
		if (!this.handlers.includes(handler))
			super.add(handler);
	}
}

export class Camera3D {
	constructor(state) {
		this.state = state;
		this.rotationMatrix = new Matrix4(Matrix4.Identity);
		this.translateMatrix = new Matrix4(Matrix4.Identity);
		this.currentAngle = 0.0;
		this.currentAngleCos = 0.0;
		this.currentAngleSin = -1.0;
		// The perpendicular value is -90° rotation (= turn left by a quarter)
		this.currentPerpendicularAngleCos = -1.0;
		this.currentPerpendicularAngleSin = 0.0;
		this.X = 0.0;
		this.Y = 0.0;
		this.Z = 0.0;
		this.GroundY = 0.0;
		/** event Action<float> Turned: Turned.add(handler), Turned.remove(handler) */
		this.Turned = new TurnedEvent();

		this.currentMatrix = new Matrix4(Matrix4.Identity);
	}

	get Angle() { return this.currentAngle; }

	/**
	 * The out parameters x and z are returned: GetForwardPosition(distance, noX, noZ) -> [x, z].
	 * For convenience the C# parameter order (distance, x, z, noX, noZ) is accepted as well
	 * (the x and z arguments are ignored then).
	 */
	GetForwardPosition(distance, noX, noZ) {
		if (arguments.length >= 5) {
			noX = arguments[3];
			noZ = arguments[4];
		}

		const x = noX ? this.X : this.X - Math.fround(this.currentAngleCos) * distance;
		const z = noZ ? this.Z : this.Z - Math.fround(this.currentAngleSin) * distance;
		return [Math.fround(x), Math.fround(z)];
	}

	/** GetBackwardPosition(distance, noX, noZ) -> [x, z] (see GetForwardPosition) */
	GetBackwardPosition(distance, noX, noZ) {
		if (arguments.length >= 5) {
			noX = arguments[3];
			noZ = arguments[4];
		}

		const x = noX ? this.X : this.X + Math.fround(this.currentAngleCos) * distance;
		const z = noZ ? this.Z : this.Z + Math.fround(this.currentAngleSin) * distance;
		return [Math.fround(x), Math.fround(z)];
	}

	/** GetLeftPosition(distance, noX, noZ) -> [x, z] (see GetForwardPosition) */
	GetLeftPosition(distance, noX, noZ) {
		if (arguments.length >= 5) {
			noX = arguments[3];
			noZ = arguments[4];
		}

		const x = noX ? this.X : this.X - Math.fround(this.currentPerpendicularAngleCos) * distance;
		const z = noZ ? this.Z : this.Z - Math.fround(this.currentPerpendicularAngleSin) * distance;
		return [Math.fround(x), Math.fround(z)];
	}

	/** GetRightPosition(distance, noX, noZ) -> [x, z] (see GetForwardPosition) */
	GetRightPosition(distance, noX, noZ) {
		if (arguments.length >= 5) {
			noX = arguments[3];
			noZ = arguments[4];
		}

		const x = noX ? this.X : this.X + Math.fround(this.currentPerpendicularAngleCos) * distance;
		const z = noZ ? this.Z : this.Z + Math.fround(this.currentPerpendicularAngleSin) * distance;
		return [Math.fround(x), Math.fround(z)];
	}

	Activate() {
		this.state.RestoreModelViewMatrix(Matrix4.Identity);
		this.state.PushModelViewMatrix(this.currentMatrix);
	}

	UpdateMatrix() {
		this.currentMatrix.Reset();
		this.currentMatrix.Multiply(this.rotationMatrix);
		this.currentMatrix.Multiply(this.translateMatrix);
	}

	Move(x, y, z) {
		this.X = Math.fround(this.X + x);
		this.Y = Math.fround(this.Y + y);
		this.Z = Math.fround(this.Z + z);
		this.translateMatrix = Matrix4.CreateTranslationMatrix(this.X, this.Y, this.Z);
		this.UpdateMatrix();
	}

	Rotate(angle) {
		this.rotationMatrix = Matrix4.CreateZRotationMatrix(angle);
		this.UpdateMatrix();
	}

	LevitateDown(distance) {
		this.Move(0.0, distance, 0.0);
	}

	LevitateUp(distance) {
		this.Move(0.0, -distance, 0.0);
	}

	MoveBackward(distance, noX, noZ) {
		this.Move(noX ? 0.0 : Math.fround(this.currentAngleCos) * distance, 0.0, noZ ? 0.0 : Math.fround(this.currentAngleSin) * distance);
	}

	MoveForward(distance, noX, noZ) {
		this.Move(noX ? 0.0 : -Math.fround(this.currentAngleCos) * distance, 0.0, noZ ? 0.0 : -Math.fround(this.currentAngleSin) * distance);
	}

	MoveLeft(distance, noX, noZ) {
		this.Move(noX ? 0.0 : -Math.fround(this.currentPerpendicularAngleCos) * distance, 0.0, noZ ? 0.0 : -Math.fround(this.currentPerpendicularAngleSin) * distance);
	}

	MoveRight(distance, noX, noZ) {
		this.Move(noX ? 0.0 : Math.fround(this.currentPerpendicularAngleCos) * distance, 0.0, noZ ? 0.0 : Math.fround(this.currentPerpendicularAngleSin) * distance);
	}

	UpdatePosition() {
		this.Y = this.GroundY;
		this.translateMatrix = Matrix4.CreateTranslationMatrix(this.X, this.Y, this.Z);
		this.TurnTowards(this.currentAngle);
		this.UpdateMatrix();
	}

	/**
	 * Sets the camera position. Note that x is negated.
	 */
	SetPosition(x, z, y = null) {
		this.X = Math.fround(-x);
		this.Y = Math.fround(y ?? this.GroundY);
		this.Z = Math.fround(z);
		this.translateMatrix = Matrix4.CreateTranslationMatrix(this.X, this.Y, this.Z);
		this.UpdateMatrix();
	}

	TurnLeft(angle) {
		this.TurnTowards(this.currentAngle - angle);
	}

	TurnRight(angle) {
		this.TurnTowards(this.currentAngle + angle);
	}

	TurnTowards(angle) {
		angle = Math.fround(angle);

		while (angle < 0.0)
			angle = Math.fround(angle + 360.0);
		while (angle >= 360.0)
			angle = Math.fround(angle - 360.0);

		this.currentAngle = angle;
		const radiant = AngleFactor * (this.currentAngle - 90.0);
		this.currentAngleCos = Math.cos(radiant);
		this.currentAngleSin = Math.sin(radiant);
		this.currentPerpendicularAngleCos = Math.cos(radiant - QuarterTurnAngle);
		this.currentPerpendicularAngleSin = Math.sin(radiant - QuarterTurnAngle);
		this.Rotate(this.currentAngle);

		this.Turned.invoke(this.currentAngle);
	}
}
