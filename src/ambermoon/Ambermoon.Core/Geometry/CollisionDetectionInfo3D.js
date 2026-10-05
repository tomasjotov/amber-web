// Port of Ambermoon.Core/Geometry/CollisionDetectionInfo3D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// CollisionDetectionInfo3D.cs - Collision detection for 3D maps

// ICollisionBody is a pure interface (TestCollision(lastX, lastZ, x, z, bodyRadius, player)) and is not ported.

export class CollisionLine3D {
	constructor() {
		this.X = 0;
		this.Z = 0;
		this.Length = 0;
		this.Horizontal = false;
		this.PlayerCanPass = false;
	}

	TestCollision(lastX, lastZ, x, z, bodyRadius, player) {
		if (player && this.PlayerCanPass)
			return false;

		if (this.Horizontal) {
			if ((z < this.Z) === (lastZ < this.Z) && Math.abs(z - this.Z) >= bodyRadius)
				return false;

			const left = x - bodyRadius;
			const right = x + bodyRadius;

			return (left > this.X && left < this.X + this.Length) ||
				(right > this.X && right < this.X + this.Length);
		} else {
			if ((x < this.X) === (lastX < this.X) && Math.abs(x - this.X) >= bodyRadius)
				return false;

			const top = z + bodyRadius;
			const bottom = z - bodyRadius;

			return (top < this.Z && top > this.Z - this.Length) ||
				(bottom < this.Z && bottom > this.Z - this.Length);
		}
	}
}

export class CollisionSphere3D {
	constructor() {
		this.CenterX = 0;
		this.CenterZ = 0;
		this.Radius = 0;
		this.PlayerCanPass = false;
	}

	TestCollision(lastX, lastZ, x, z, bodyRadius, player) {
		if (player && this.PlayerCanPass)
			return false;

		const xDist = Math.abs(x - this.CenterX) - bodyRadius;
		const zDist = Math.abs(z - this.CenterZ) - bodyRadius;
		const safeDist = this.Radius;

		if (xDist >= safeDist ||
			zDist >= safeDist)
			return false;

		if (xDist <= 0.0 || zDist <= 0.0)
			return true;

		return Math.sqrt(xDist * xDist + zDist * zDist) < safeDist;
	}
}

export class CollisionDetectionInfo3D {
	constructor() {
		this.CollisionBodies = [];
	}

	TestCollision(lastX, lastZ, x, z, bodyRadius, player) {
		return this.CollisionBodies.some(b => b.TestCollision(lastX, lastZ, x, z, bodyRadius, player));
	}
}
