// Port of Ambermoon.Data.Common/CharacterValue.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Event } from '../../runtime.js';

export class CharacterValue {
	constructor(other = null) {
		this._currentValue = 0;
		this._maxValue = 0;
		this._bonusValue = 0;
		this._storedValue = 0;
		/** PropertyChanged event: handlers get (sender, { PropertyName }) */
		this.PropertyChanged = new Event();

		if (other) {
			this._currentValue = other._currentValue;
			this._maxValue = other._maxValue;
			this._bonusValue = other._bonusValue;
			this._storedValue = other._storedValue;
		}
	}

	/// <summary>
	/// Current value without bonus.
	/// While exhausted this will be the exhausted value
	/// (half the previous value) and the actual value
	/// is stored temporarily in <see cref="StoredValue"/>.
	/// </summary>
	get CurrentValue() { return this._currentValue; }
	set CurrentValue(value) { this.SetField('_currentValue', value, 'CurrentValue'); }

	/// <summary>
	/// Maximum value for the character.
	/// </summary>
	get MaxValue() { return this._maxValue; }
	set MaxValue(value) { this.SetField('_maxValue', value, 'MaxValue'); }

	/// <summary>
	/// Bonus from equipment.
	/// </summary>
	get BonusValue() { return this._bonusValue; }
	set BonusValue(value) { this.SetField('_bonusValue', value, 'BonusValue'); } // can be negative if item is cursed

	/// <summary>
	/// This stores the actual value while exhaustion is active.
	/// </summary>
	get StoredValue() { return this._storedValue; }
	set StoredValue(value) { this.SetField('_storedValue', value, 'StoredValue'); }

	get TotalCurrentValue() { return Math.max(0, this.CurrentValue + this.BonusValue); }
	get TotalMaxValue() { return Math.max(0, this.MaxValue + this.BonusValue); }

	OnPropertyChanged(propertyName = null) {
		this.PropertyChanged.invoke(this, { PropertyName: propertyName });
	}

	/** C#: SetField(ref field, value, [CallerMemberName] propertyName). Here the field is given by name. */
	SetField(fieldName, value, propertyName = null) {
		if (this[fieldName] === value)
			return false;
		this[fieldName] = value;
		this.OnPropertyChanged(propertyName);
		return true;
	}

	Equals(other) {
		if (other == null) return false;
		if (this === other) return true;
		if (!(other instanceof CharacterValue) || other.constructor !== this.constructor) return false;

		return this._currentValue === other._currentValue &&
			this._maxValue === other._maxValue &&
			this._bonusValue === other._bonusValue &&
			this._storedValue === other._storedValue;
	}

	GetHashCode() {
		let hashCode = 0;

		hashCode ^= this._currentValue | 0;
		hashCode ^= this._maxValue | 0;
		hashCode ^= this._bonusValue | 0;
		hashCode ^= this._storedValue | 0;

		return hashCode;
	}

	static op_Equality(left, right) {
		// C#: object.Equals(left, right)
		if (left === right) return true;
		if (left == null || right == null) return false;
		return left.Equals(right);
	}

	static op_Inequality(left, right) {
		return !CharacterValue.op_Equality(left, right);
	}
}

/**
 * CharacterValueCollection<TType> is an Array subclass (see PORTING.md), so it is indexed with [].
 * Constructor overloads:
 *  - new CharacterValueCollection(otherCollection) -> deep copy
 *  - new CharacterValueCollection(size) -> size new CharacterValue objects
 *  - new CharacterValueCollection(...values) -> the given values
 */
export class CharacterValueCollection extends Array {
	// Array methods like map/filter should return plain arrays.
	static get [Symbol.species]() { return Array; }

	constructor(...args) {
		super();

		if (args.length === 1 && args[0] instanceof CharacterValueCollection) {
			const other = args[0];

			for (let i = 0; i < other.length; ++i)
				this.push(new CharacterValue(other[i]));
		} else if (args.length === 1 && typeof args[0] === 'number') {
			const size = args[0];

			for (let i = 0; i < size; ++i)
				this.push(new CharacterValue());
		} else {
			// params CharacterValue[] values (also accept a single array argument)
			const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;

			for (const value of values)
				this.push(value);
		}
	}

	get Length() { return this.length; }

	Equals(other) {
		if (other == null) return false;
		if (this === other) return true;
		if (!(other instanceof CharacterValueCollection)) return false;
		if (this.length !== other.length) return false;

		for (let i = 0; i < this.length; i++) {
			if (!this[i].Equals(other[i]))
				return false;
		}

		return true;
	}

	GetHashCode() {
		let hashCode = 0;

		for (let i = 0; i < this.length; i++) {
			hashCode ^= this[i].GetHashCode();
		}

		return hashCode;
	}

	static op_Equality(left, right) {
		if (left === right) return true;
		if (left == null || right == null) return false;
		return left.Equals(right);
	}

	static op_Inequality(left, right) {
		return !CharacterValueCollection.op_Equality(left, right);
	}
}
