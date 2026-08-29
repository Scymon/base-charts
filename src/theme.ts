import type { ChartTheme } from './types.ts';

const COLOR_VARS = [
	'--color-blue',
	'--color-cyan',
	'--color-green',
	'--color-yellow',
	'--color-orange',
	'--color-red',
	'--color-purple',
	'--color-pink',
];

const FALLBACK_COLORS = [
	'#70b8ff',
	'#53dfdd',
	'#44cf6e',
	'#e0de71',
	'#f78a4a',
	'#fb464c',
	'#a882ff',
	'#fa99d6',
];

function cssVar(el: HTMLElement, name: string, fallback: string): string {
	const value = getComputedStyle(el).getPropertyValue(name).trim();
	return value || fallback;
}

export function readChartTheme(el: HTMLElement): ChartTheme {
	const colors = COLOR_VARS.map((name, index) => cssVar(el, name, FALLBACK_COLORS[index] ?? '#70b8ff'));
	const accent = cssVar(el, '--interactive-accent', colors[0] ?? '#70b8ff');
	if (!colors.includes(accent)) colors.unshift(accent);

	return {
		background: 'transparent',
		panel: cssVar(el, '--background-secondary', '#1e1e1e'),
		text: cssVar(el, '--text-normal', '#dcddde'),
		muted: cssVar(el, '--text-muted', '#999'),
		border: cssVar(el, '--background-modifier-border', '#333'),
		accent,
		colors,
	};
}

export function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
