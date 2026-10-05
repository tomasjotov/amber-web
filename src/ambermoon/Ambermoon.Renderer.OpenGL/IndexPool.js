// Port of Ambermoon.Renderer.OpenGL/IndexPool.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// IndexPool.cs - Pool of indices which handles index reusing

import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';

const IntMaxValue = 2147483647;

/** Minimal doubly linked list (System.Collections.Generic.LinkedList<int>) */
class LinkedList {
	constructor() {
		this.First = null;
		this.Last = null;
		this.Count = 0;
	}

	AddLast(value) {
		const node = { Value: value, Previous: this.Last, Next: null };

		if (this.Last)
			this.Last.Next = node;
		else
			this.First = node;

		this.Last = node;
		++this.Count;

		return node;
	}

	Remove(node) {
		if (node.Previous)
			node.Previous.Next = node.Next;
		else
			this.First = node.Next;

		if (node.Next)
			node.Next.Previous = node.Previous;
		else
			this.Last = node.Previous;

		node.Previous = null;
		node.Next = null;
		--this.Count;
	}

	RemoveLast() {
		if (this.Last)
			this.Remove(this.Last);
	}
}

export class IndexPool {
	constructor() {
		this.releasedIndices = new LinkedList();
		this.releasedIndexNodesByIndex = new Map();
		this.firstFree = 0;
	}

	/** AssignNextFreeIndex(out bool reused) -> returns [index, reused] */
	AssignNextFreeIndex() {
		if (this.releasedIndices.Count !== 0) {
			const index = this.releasedIndices.Last.Value;

			this.releasedIndices.RemoveLast();
			this.releasedIndexNodesByIndex.delete(index);

			return [index, true];
		}

		if (this.firstFree === IntMaxValue) {
			throw new AmbermoonException(ExceptionScope.Render, 'No free index available.');
		}

		return [this.firstFree++, false];
	}

	UnassignIndex(index) {
		if (this.releasedIndexNodesByIndex.has(index))
			return;

		this.releasedIndexNodesByIndex.set(index, this.releasedIndices.AddLast(index));
	}

	AssignIndex(index) {
		const indexNode = this.releasedIndexNodesByIndex.get(index);

		if (indexNode !== undefined) {
			this.releasedIndices.Remove(indexNode);
			this.releasedIndexNodesByIndex.delete(index);
			return true;
		}

		if (index === this.firstFree)
			++this.firstFree;

		return false;
	}
}
