// Port of Ambermoon.Common/Exception.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Exception, enumName } from '../../runtime.js';

export const ExceptionScope = Object.freeze({
	Application: 0,
	Data: 1,
	Render: 2
});

export class AmbermoonException extends Exception {
	/** new AmbermoonException(scope, message) or new AmbermoonException(scope, message, innerException) */
	constructor(scope, message, innerException = null) {
		super(`[${enumName(ExceptionScope, scope)}] ${message}`, innerException);
		this.Scope = scope;
	}
}
