import type { AggregatedChart, ChartType } from './types.ts';

const CATEGORY_LEGEND_TYPES = new Set<ChartType>([
	'pie',
	'doughnut',
	'rose',
	'funnel',
	'waffle',
	'violin',
]);

const HIERARCHY_TYPES = new Set<ChartType>(['sunburst', 'icicle', 'tree']);

/** Legend names whose ECharts color index matches `option.color`. */
export function legendColorNames(chartType: ChartType, data: AggregatedChart): string[] {
	if (CATEGORY_LEGEND_TYPES.has(chartType)) return data.categories;
	if (chartType === 'histogram') {
		const facet = data.categories.length >= 2 && data.categories.length <= 6;
		return facet ? data.categories : data.seriesNames;
	}
	if (chartType === 'ridgeline' && namedCount(data.seriesNames) <= 1) {
		return data.categories;
	}
	if (HIERARCHY_TYPES.has(chartType) && namedCount(data.seriesNames) <= 1) {
		return data.categories;
	}
	if (chartType === 'combo' && data.hasY2) {
		return [...data.seriesNames, 'Y2'];
	}
	return data.seriesNames;
}

export function applySeriesColorOverrides(
	palette: string[],
	names: string[],
	overrides?: Record<string, string>,
): string[] {
	if (!overrides || Object.keys(overrides).length === 0) return palette;
	const length = Math.max(palette.length, names.length);
	return Array.from({ length }, (_, index) => {
		const name = names[index];
		const override = name ? overrides[name] : undefined;
		return override || palette[index % palette.length] || palette[0] || '#70b8ff';
	});
}

export function parseSeriesColors(value: unknown): Record<string, string> {
	if (value == null || value === '') return {};
	let raw: unknown = value;
	if (typeof value === 'string') {
		try {
			raw = JSON.parse(value);
		} catch {
			return {};
		}
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: Record<string, string> = {};
	for (const [key, color] of Object.entries(raw as Record<string, unknown>)) {
		const name = key.trim();
		const hex = normalizeCssColor(color);
		if (name && hex) out[name] = hex;
	}
	return out;
}

export function normalizeCssColor(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	return normalizeHexColor(value.trim()) ?? cssColorLiteral(value.trim());
}

export function normalizeHexColor(value: string): string | null {
	const short = /^#([0-9a-fA-F]{3})$/.exec(value);
	if (short?.[1]) {
		const [r, g, b] = short[1];
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
	if (rgb) {
		const hex = (part: string | undefined) =>
			Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0');
		return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
	}
	return null;
}

export function toColorInputValue(color: string): string {
	return normalizeHexColor(color) ?? '#70b8ff';
}

export function legendNameFromChartEvent(payload: unknown, orderedNames: string[]): string | null {
	if (!payload || typeof payload !== 'object') return null;
	const item = payload as Record<string, unknown>;
	if (item.componentType !== 'legend') return null;
	const name = typeof item.name === 'string' ? item.name : '';
	return name && orderedNames.includes(name) ? name : null;
}

/** Walk a ZRender hover target to the legend item ECharts stamped with `__legendDataIndex`. */
export function legendNameFromZrTarget(target: unknown, orderedNames: string[]): string | null {
	const known = new Set(orderedNames.filter((name) => name.trim() !== ''));
	let current: unknown = target;
	let confirmedLegend = false;
	let found: string | null = null;
	while (current && typeof current === 'object') {
		const rec = current as Record<string, unknown>;
		const info = rec.__ecComponentInfo;
		if (info && typeof info === 'object' && (info as { mainType?: string }).mainType === 'legend') {
			confirmedLegend = true;
		}
		const index = rec.__legendDataIndex;
		if (typeof index === 'number') {
			confirmedLegend = true;
			if (!found) {
				const byIndex = orderedNames[index];
				if (byIndex && known.has(byIndex)) found = byIndex;
			}
		}
		if (!found) {
			const style = rec.style && typeof rec.style === 'object' ? (rec.style as { text?: unknown }).text : undefined;
			for (const value of [rec.name, rec.anid, style]) {
				if (typeof value === 'string' && known.has(value)) {
					found = value;
					break;
				}
			}
		}
		current = rec.parent;
	}
	return confirmedLegend ? found : null;
}

export function nativeMouseEventFromChartEvent(payload: unknown): MouseEvent | null {
	if (!payload || typeof payload !== 'object') return null;
	const item = payload as { event?: { event?: unknown } | unknown };
	const inner = item.event && typeof item.event === 'object' ? (item.event as { event?: unknown }).event : item.event;
	return inner instanceof MouseEvent ? inner : null;
}

/** The legend item group ECharts stamps with `__legendDataIndex`, else the hover target. */
export function legendItemGroupFromZrTarget(
	target: unknown,
	orderedNames: string[],
	seriesName: string,
): unknown | null {
	let current: unknown = target;
	let group: unknown = null;
	while (current && typeof current === 'object') {
		const rec = current as Record<string, unknown>;
		if (typeof rec.__legendDataIndex === 'number' && orderedNames[rec.__legendDataIndex] === seriesName) {
			group = current;
		}
		current = rec.parent;
	}
	if (group) return group;
	return legendNameFromZrTarget(target, orderedNames) === seriesName ? target : null;
}

/** Chart-local box of a ZRender element (canvas pixels, not the viewport). */
export function zrElementChartRect(el: unknown): { x: number; y: number; width: number; height: number } | null {
	if (!el || typeof el !== 'object') return null;
	const node = el as {
		getBoundingRect?: () => { x: number; y: number; width: number; height: number };
		transformCoordToGlobal?: (x: number, y: number) => number[] | { x: number; y: number };
	};
	const local = node.getBoundingRect?.();
	if (!local || local.width <= 0 || local.height <= 0) return null;
	const map = (x: number, y: number): { x: number; y: number } | null => {
		if (typeof node.transformCoordToGlobal !== 'function') return { x, y };
		const out = node.transformCoordToGlobal(x, y);
		if (Array.isArray(out)) {
			const px = Number(out[0]);
			const py = Number(out[1]);
			return Number.isFinite(px) && Number.isFinite(py) ? { x: px, y: py } : null;
		}
		if (out && typeof out === 'object') {
			const px = Number(out.x);
			const py = Number(out.y);
			return Number.isFinite(px) && Number.isFinite(py) ? { x: px, y: py } : null;
		}
		return null;
	};
	const tl = map(local.x, local.y);
	const br = map(local.x + local.width, local.y + local.height);
	if (!tl || !br) return null;
	return {
		x: Math.min(tl.x, br.x),
		y: Math.min(tl.y, br.y),
		width: Math.abs(br.x - tl.x),
		height: Math.abs(br.y - tl.y),
	};
}

export type ColorPopoverPoint = { x: number; y: number };
export type ColorPopoverRect = { x: number; y: number; width: number; height: number };
export type ColorPopoverSize = { width: number; height: number };
export type HsvColor = { h: number; s: number; v: number };

const POPOVER_GAP = 6;
const POPOVER_INSET = 8;

/** Place the on-screen color popover under the legend item (else the pointer). */
export function colorPopoverPosition(
	pointer: ColorPopoverPoint | null | undefined,
	item: ColorPopoverRect | null | undefined,
	fallback: ColorPopoverPoint,
	size: ColorPopoverSize,
	viewport: ColorPopoverSize,
): { left: number; top: number } {
	const width = Math.max(1, size.width);
	const height = Math.max(1, size.height);
	let left: number;
	let top: number;
	if (isFiniteRect(item)) {
		left = item.x;
		top = item.y + item.height + POPOVER_GAP;
		const fitsBelow = top + height <= viewport.height - POPOVER_INSET;
		const fitsAbove = item.y - POPOVER_GAP - height >= POPOVER_INSET;
		if (!fitsBelow && fitsAbove) top = item.y - POPOVER_GAP - height;
	} else {
		const origin = isFinitePoint(pointer) ? pointer : fallback;
		left = origin.x;
		top = origin.y + POPOVER_GAP;
	}
	const maxLeft = Math.max(POPOVER_INSET, viewport.width - width - POPOVER_INSET);
	const maxTop = Math.max(POPOVER_INSET, viewport.height - height - POPOVER_INSET);
	return {
		left: Math.min(Math.max(POPOVER_INSET, left), maxLeft),
		top: Math.min(Math.max(POPOVER_INSET, top), maxTop),
	};
}

export function hexToHsv(color: string): HsvColor {
	const hex = toColorInputValue(color);
	const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
	const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
	const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	let h = 0;
	if (delta !== 0) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
	const hue = ((h % 360) + 360) % 360;
	const sat = clamp01(s);
	const val = clamp01(v);
	const chroma = val * sat;
	const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = val - chroma;
	let r = 0;
	let g = 0;
	let b = 0;
	if (hue < 60) {
		r = chroma;
		g = x;
	} else if (hue < 120) {
		r = x;
		g = chroma;
	} else if (hue < 180) {
		g = chroma;
		b = x;
	} else if (hue < 240) {
		g = x;
		b = chroma;
	} else if (hue < 300) {
		r = x;
		b = chroma;
	} else {
		r = chroma;
		b = x;
	}
	const byte = (channel: number) => Math.round((channel + m) * 255).toString(16).padStart(2, '0');
	return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function isFinitePoint(point: ColorPopoverPoint | null | undefined): point is ColorPopoverPoint {
	return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function isFiniteRect(rect: ColorPopoverRect | null | undefined): rect is ColorPopoverRect {
	return Boolean(
		rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && rect.width > 0 && rect.height > 0,
	);
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function namedCount(names: string[]): number {
	return names.filter((name) => name.trim() !== '').length;
}

function cssColorLiteral(value: string): string | null {
	if (/^(rgb|hsl)a?\(/i.test(value)) return value;
	return null;
}
