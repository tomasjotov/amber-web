// Port of Ambermoon.net/ResourceProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Task.Run is replaced by a deferred (macrotask) execution, so handlers attached to ResultReady
// right after GetResource returns are called. The provider may also return a Promise (async loading in the browser);
// then ResultReady is invoked with the resolved value.
import { Event } from '../../runtime.js';

export class ResourceProviderPromise {
	constructor() {
		this.ResultReady = new Event();
	}

	OnProvideResult(result) {
		this.ResultReady.invoke(result);
	}
}

class InternalResourceProviderPromise extends ResourceProviderPromise {
	constructor(provider) {
		super();

		setTimeout(async () => {
			// Like an unobserved faulted Task in C#, exceptions do not propagate (but they are logged here).
			try {
				const result = await provider();
				this.OnProvideResult(result);
			} catch (error) {
				console.error(error);
			}
		}, 0);
	}
}

export class ResourceProvider {
	static GetResource(provider) {
		return new InternalResourceProviderPromise(provider);
	}
}
