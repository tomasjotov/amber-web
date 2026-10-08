// Page shell shared by ambermoon.html and amberstar-am.html (and the look of amberstar/index.html):
// loading screen with progress bar, styled error display and the presentation around the game canvas.
import { Presentation, isMuted } from './presentation.js';

export { isMuted };

const Emblems = {
	moon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="aw-moon" cx="35%" cy="35%" r="75%"><stop offset="0" stop-color="#fff1bf"/><stop offset=".55" stop-color="#e3b45a"/><stop offset="1" stop-color="#7a5418"/></radialGradient></defs><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1"/><path fill="url(#aw-moon)" d="M40 9a24 24 0 1 0 15 36A20 20 0 1 1 40 9z"/><circle cx="49" cy="17" r="1.6" fill="#fff1bf"/><circle cx="54" cy="27" r="1" fill="#fff1bf" opacity=".7"/></svg>',
	star: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="aw-star" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff1bf"/><stop offset=".55" stop-color="#e3b45a"/><stop offset="1" stop-color="#7a5418"/></radialGradient></defs><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1"/><path fill="url(#aw-star)" d="M32 6l6.5 18.5L58 26l-15.5 11.5L48 57 32 45.5 16 57l5.5-19.5L6 26l19.5-1.5z"/></svg>',
};

const el = (tag, className, text) => {
	const e = document.createElement(tag);
	if (className)
		e.className = className;
	if (text != null)
		e.textContent = text;
	return e;
};

/** Waits until the browser had a chance to paint (also works in throttled/background tabs). */
export const nextPaint = () => new Promise(resolve => {
	let done = false;
	const finish = () => {
		if (!done) {
			done = true;
			resolve();
		}
	};
	requestAnimationFrame(() => setTimeout(finish, 0));
	setTimeout(finish, 100);
});

/** Loading screen (works without a presentation, e.g. for amberstar/index.html). */
export class Loader {
	constructor({ title, subtitle = '', badge = 'THALION', emblem = 'moon', backHref = 'index.html', hint = '' } = {}) {
		const root = this.element = el('div', 'aw-loader');
		root.setAttribute('role', 'status');
		const back = el('a', 'aw-back-link', '‹ Game selection');
		back.href = backHref;
		const emblemElement = el('div', 'aw-emblem');
		emblemElement.innerHTML = Emblems[emblem] ?? Emblems.moon;
		const progress = this.progressElement = el('div', 'aw-progress');
		progress.setAttribute('role', 'progressbar');
		progress.setAttribute('aria-valuemin', '0');
		progress.setAttribute('aria-valuemax', '100');
		this.fill = el('div', 'aw-progress-fill');
		progress.append(this.fill);
		const status = this.statusElement = el('div', 'aw-status');
		this.statusText = el('span', '', 'Loading');
		this.percentText = el('span', 'aw-percent', '');
		status.append(this.statusText, this.percentText);
		root.append(back, emblemElement, el('div', 'aw-badge', badge), el('h1', 'aw-title', title), el('div', 'aw-subtitle', subtitle), progress, status);
		if (hint) {
			const hintElement = el('div', 'aw-loader-hint');
			hintElement.innerHTML = hint;
			root.append(hintElement);
		}
		document.body.append(root);
		this.value = 0;
	}

	/** fraction: 0..1 or null (indeterminate) */
	set(fraction, text) {
		if (text != null)
			this.statusText.textContent = text;
		const indeterminate = fraction == null;
		this.progressElement.classList.toggle('aw-indeterminate', indeterminate);
		if (!indeterminate) {
			this.value = Math.max(this.value, Math.min(1, fraction));
			const percent = Math.round(this.value * 100);
			this.fill.style.width = `${percent}%`;
			this.percentText.textContent = `${percent}%`;
			this.progressElement.setAttribute('aria-valuenow', String(percent));
		} else
			this.percentText.textContent = '';
	}

	done() {
		this.set(1);
		this.element.classList.add('aw-done');
		setTimeout(() => this.element.remove(), 1200);
	}

	failed(text = 'Start failed') {
		this.statusText.textContent = text;
		this.percentText.textContent = '';
		this.progressElement.classList.remove('aw-indeterminate');
		this.fill.style.background = 'linear-gradient(90deg, #5a1a10, #b8452a)';
	}
}

/** Styled error display. Fatal errors are centered, runtime errors appear as a dismissable card. */
export class ErrorDisplay {
	constructor({ backHref = 'index.html' } = {}) {
		const root = this.element = el('div', 'aw-error');
		root.hidden = true;
		root.setAttribute('role', 'alert');
		this.heading = el('h2', '', 'Something went wrong');
		this.countElement = el('span', 'aw-count');
		this.heading.append(this.countElement);
		this.message = el('p');
		this.details = el('pre');
		const actions = el('div', 'aw-actions');
		const copy = el('button', '', 'Copy details');
		copy.type = 'button';
		copy.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(this.details.textContent);
				copy.textContent = 'Copied';
				setTimeout(() => copy.textContent = 'Copy details', 1500);
			} catch {
				// ignore
			}
		});
		const reload = el('button', '', 'Reload');
		reload.type = 'button';
		reload.addEventListener('click', () => location.reload());
		const back = el('a', '', 'Game selection');
		back.href = backHref;
		this.dismiss = el('button', '', 'Dismiss');
		this.dismiss.type = 'button';
		this.dismiss.addEventListener('click', () => { this.element.hidden = true; });
		actions.append(copy, back, reload, this.dismiss);
		root.append(this.heading, this.message, this.details, actions);
		document.body.append(root);
		this.count = 0;
	}

	show(error, fatal = false) {
		console.error(error);
		this.count++;
		const text = error?.stack ?? String(error?.message ?? error);
		if (this.details.textContent.length < 20000)
			this.details.textContent = (this.details.textContent ? this.details.textContent + '\n\n' : '') + text;
		this.message.textContent = fatal
			? 'The game could not be started.'
			: 'An error occurred in the game. It may continue to run, but things might not work as expected.';
		this.heading.firstChild.textContent = fatal ? 'The game could not start' : 'Something went wrong';
		this.countElement.textContent = this.count > 1 ? `(${this.count} errors)` : '';
		this.element.classList.toggle('aw-fatal', fatal);
		this.dismiss.hidden = fatal;
		this.element.hidden = false;
	}
}

/**
 * Creates loader, error display and presentation for an Ambermoon host page.
 * Returns { canvas, loader, presentation, progress(fraction, text), hostStatus(text), error(e), fail(e), attach(host), ready() }
 */
export function createShell({ title, subtitle, emblem = 'moon', badge = 'THALION · 1993', backHref = 'index.html' }) {
	const canvas = document.getElementById('game') ?? document.body.appendChild(el('canvas'));
	canvas.id = 'game';
	const loader = new Loader({ title, subtitle, emblem, badge, backHref,
		hint: '<kbd>F11</kbd> fullscreen &nbsp;·&nbsp; display settings: move the mouse to the top right corner' });
	const errors = new ErrorDisplay({ backHref });
	let host = null;
	const presentation = new Presentation({
		canvas,
		managed: true,
		backHref,
		onMuteChanged: muted => host?.setMuted?.(muted),
	});
	const error = e => errors.show(e, false);
	window.addEventListener('error', e => error(e.error ?? e.message));
	window.addEventListener('unhandledrejection', e => error(e.reason));

	// Status texts of AmbermoonHost.start mapped to the progress bar
	const hostSteps = [
		[/resources/i, 0.78, 'Loading resources'],
		[/game data/i, 0.84, 'Reading game data'],
		[/convert/i, 0.9, 'Converting game data'],
		[/start/i, 0.96, 'Preparing graphics'],
	];

	return {
		canvas,
		loader,
		presentation,
		progress: (fraction, text) => loader.set(fraction, text),
		hostStatus: text => {
			const step = hostSteps.find(([pattern]) => pattern.test(text));
			loader.set(step?.[1] ?? null, step?.[2] ?? text.replace(/\s*\.\.\.$|…$/, ''));
		},
		error,
		fail: e => {
			loader.failed();
			errors.show(e, true);
		},
		attach: h => {
			host = h;
			h.addRenderListener?.(c => presentation.sample(c));
		},
		ready: async () => {
			await nextPaint();
			await nextPaint();
			presentation.reveal();
			loader.done();
			canvas.focus({ preventScroll: true });
		},
	};
}
