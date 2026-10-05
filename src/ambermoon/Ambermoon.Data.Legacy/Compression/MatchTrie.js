// Port of Ambermoon.Data.Legacy/Compression/MatchTrie.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';

function addChild(children, key, node) {
	if (children.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	children.set(key, node);
}

class Node {
	constructor() {
		this.Parent = null;
		this.Key = 0;
		this.LastMatchOffset = 0;
	}

	GetChild(symbol) {
		throw new Error('abstract');
	}
}

class BranchNode extends Node {
	constructor() {
		super();
		this.Children = new Map();
	}

	GetChild(symbol) {
		return this.Children.get(symbol) ?? null;
	}
}

class LeafNode extends Node {
	constructor() {
		super();
		this.Offset = 0;
		this.Length = 0;
	}

	GetChild(symbol) {
		return null;
	}

	GetLeafMatchLength(sequence, offset, length) {
		let i;
		const compareLength = Math.min(length, this.Length);

		for (i = 0; i < compareLength; ++i) {
			if (sequence[offset + i] !== sequence[this.Offset + i])
				break;
		}

		return i;
	}

	Truncate(sequence, length) {
		this.Key = sequence[this.Offset + length];
		this.Offset += length + 1;
		this.Length -= length + 1;
	}
}

/**
 * This is a modified trie. It only stores 1 byte literal (key)
 * in each branch node but the leaf nodes may contain a whole
 * byte array (theoretically up to 17 bytes). Each node also contains a
 * last match offset which is updated if a node is visit again.
 *
 * An additional dictionary keeps track of nodes that are no longer
 * valid due to leaving the match window. Those nodes are removed
 * after each adding so that they won't be considered any longer.
 */
export class MatchTrie {
	constructor(maxMatchOffset) {
		this.rootNode = new BranchNode();
		// SortedDictionary<int, Node>: map + sorted key list
		this.matchNodes = new Map();
		this.matchNodeKeys = [];
		this.maxMatchOffset = maxMatchOffset === undefined ? (1 << 12) - 1 : maxMatchOffset;
	}

	addMatchNode(offset, node) {
		if (this.matchNodes.has(offset))
			throw new ArgumentException('An item with the same key has already been added.');
		this.matchNodes.set(offset, node);
		const keys = this.matchNodeKeys;
		if (keys.length === 0 || keys[keys.length - 1] < offset) {
			keys.push(offset);
		} else {
			let lo = 0;
			let hi = keys.length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (keys[mid] < offset)
					lo = mid + 1;
				else
					hi = mid;
			}
			keys.splice(lo, 0, offset);
		}
	}

	/**
	 * Add a new sequence (mostly 18 bytes as this is the max match length for LOB).
	 * It can be shorter (down to 3) at the end of a stream.
	 *
	 * Note: Length should never exceed 18 (and never be smaller than 3) but we won't
	 * check it here each time to keep performance higher.
	 */
	Add(sequence, offset, length) {
		let node = this.rootNode;

		for (let i = 0; i < length; ++i) {
			const child = node.GetChild(sequence[offset + i]);

			if (child != null) {
				// found a child, proceed inside the trie
				if (child instanceof BranchNode)
					child.LastMatchOffset = offset;
				node = child;
			} else {
				// no child found

				if (node instanceof LeafNode) {
					const leaf = node;
					// split the leaf
					const matchLength = leaf.GetLeafMatchLength(sequence, offset + i, length - i);

					if (matchLength === length - i) { // full match, update last match offset only
						leaf.LastMatchOffset = offset;
					} else {
						let parent = leaf.Parent;
						let n;

						// transform the leaf node into a branch node and create two child leaf nodes
						let newBranchNode = new BranchNode();
						newBranchNode.Parent = parent;
						newBranchNode.Key = leaf.Key;
						newBranchNode.LastMatchOffset = offset;

						parent.Children.set(newBranchNode.Key, newBranchNode);
						parent = newBranchNode;

						for (n = 0; n < matchLength; ++n) {
							newBranchNode = new BranchNode();
							newBranchNode.Parent = parent;
							newBranchNode.Key = sequence[leaf.Offset + n];
							newBranchNode.LastMatchOffset = offset;

							addChild(parent.Children, newBranchNode.Key, newBranchNode);
							parent = newBranchNode;
						}

						const newLeaf = new LeafNode();
						newLeaf.Parent = parent;
						newLeaf.Key = sequence[offset + i + n];
						newLeaf.Offset = offset + i + n + 1;
						newLeaf.Length = length - i - n - 1;
						newLeaf.LastMatchOffset = offset;

						addChild(parent.Children, newLeaf.Key, newLeaf);

						leaf.Truncate(sequence, matchLength);
						leaf.Parent = parent;

						parent.Children.set(leaf.Key, leaf);

						node = newLeaf;
					}
				} else if (node instanceof BranchNode) { // branch node, but the key is not there yet
					const branch = node;
					// add new leaf
					const newLeaf = new LeafNode();
					newLeaf.Parent = branch;
					newLeaf.Key = sequence[offset + i];
					newLeaf.Offset = offset + i + 1;
					newLeaf.Length = length - i - 1;
					newLeaf.LastMatchOffset = offset;

					addChild(branch.Children, newLeaf.Key, newLeaf);
					node = newLeaf;
				}

				break;
			}
		}

		this.addMatchNode(offset, node);

		// Remove nodes that are too far away
		const firstOffset = offset - this.maxMatchOffset + 1; // we check match before adding new sequences so add 1 to the first offset here
		const keys = this.matchNodeKeys;
		let removeCount = 0;

		while (removeCount < keys.length && keys[removeCount] < firstOffset) {
			const key = keys[removeCount];
			this.Remove(this.matchNodes.get(key), firstOffset);
			this.matchNodes.delete(key);
			++removeCount;
		}

		if (removeCount !== 0)
			keys.splice(0, removeCount);
	}

	Remove(node, firstOffset) {
		do {
			if (node.LastMatchOffset < firstOffset)
				node.Parent.Children.delete(node.Key);
			else
				break;

			node = node.Parent;
		} while (node !== this.rootNode);
	}

	/**
	 * Gets the longest match.
	 * Key = Offset
	 * Value = Length
	 * Returns { Key, Value } (KeyValuePair).
	 */
	GetLongestMatch(sequence, searchOffset, maxLength) {
		let node = this.rootNode;
		let i;

		for (i = 0; i < maxLength; ++i) {
			const child = node.GetChild(sequence[searchOffset + i]);

			if (child == null)
				break;

			node = child;
		}

		if (node === this.rootNode)
			return { Key: -1, Value: 0 };

		// node now contains the node with the longest match
		if (node instanceof LeafNode) {
			const leaf = node;
			const parentMatchLength = i;

			return {
				Key: leaf.LastMatchOffset,
				Value: Math.min(maxLength, parentMatchLength + leaf.GetLeafMatchLength(sequence, searchOffset + parentMatchLength, maxLength - parentMatchLength))
			};
		} else {
			return { Key: node.LastMatchOffset, Value: i };
		}
	}
}
