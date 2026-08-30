/** Click / hover payload for a collapsed category-axis run. */
export const AXIS_ELLIPSIS = 'axis-ellipsis';
export const AXIS_ELLIPSIS_LABEL = '...';

/** Fallback plot width when the chart has not measured yet. */
export const DEFAULT_AXIS_LENGTH = 720;

export interface AxisLabelGap {
	/** First skipped category index (inclusive). */
	start: number;
	/** Last skipped category index (inclusive). */
	end: number;
	/** Category index where the `...` tick sits. */
	index: number;
}

export interface AxisLabelPlan {
	shown: number[];
	gaps: AxisLabelGap[];
}

export interface PlanCategoryAxisTicksOptions {
	placement?: 'bottom' | 'left';
	rotate?: number;
	visibleStart?: number;
	visibleEnd?: number;
	fontSize?: number;
	glyphWidth?: number;
}

const DEFAULT_FONT = 12;
const DEFAULT_GLYPH = 7;
const LABEL_PAD = 8;

export function clampIndex(index: number, total: number): number {
	if (total <= 0) return 0;
	return Math.max(0, Math.min(total - 1, index));
}

export function visibleIndexRange(
	zoom: { start?: number; end?: number; startValue?: unknown; endValue?: unknown } | undefined,
	total: number,
): { startIndex: number; endIndex: number } {
	if (total <= 0) return { startIndex: 0, endIndex: 0 };
	if (!zoom) return { startIndex: 0, endIndex: total - 1 };

	const startValue = Number(zoom.startValue);
	const endValue = Number(zoom.endValue);
	if (Number.isFinite(startValue) && Number.isFinite(endValue)) {
		const startIndex = clampIndex(Math.floor(Math.min(startValue, endValue)), total);
		const endIndex = clampIndex(Math.ceil(Math.max(startValue, endValue)), total);
		return { startIndex, endIndex };
	}

	const startPct = Number(zoom.start ?? 0);
	const endPct = Number(zoom.end ?? 100);
	const startIndex = clampIndex(Math.floor((startPct / 100) * total), total);
	const endIndex = clampIndex(Math.ceil((endPct / 100) * total) - 1, total);
	return startIndex <= endIndex
		? { startIndex, endIndex }
		: { startIndex: endIndex, endIndex: startIndex };
}

/** Pixel span a label occupies along the category axis. */
export function labelAxisSpan(
	label: string,
	placement: 'bottom' | 'left' = 'bottom',
	rotate = placement === 'bottom' ? 45 : 0,
	fontSize = DEFAULT_FONT,
	glyphWidth = DEFAULT_GLYPH,
): number {
	const chars = Math.max(1, [...String(label)].length);
	const textW = chars * glyphWidth;
	if (placement === 'left') return fontSize + LABEL_PAD;
	if (rotate) {
		const rad = (Math.abs(rotate) * Math.PI) / 180;
		const pitch = fontSize * Math.cos(rad) + 10;
		const projected = textW * Math.cos(rad) * 0.25;
		return Math.max(18, pitch + projected);
	}
	return textW + LABEL_PAD;
}

/**
 * Evenly spaced indices from `lo` to `hi` inclusive. Always keeps the ends.
 * Used so category ticks skip on a regular cadence instead of greedy packing.
 */
export function evenCategoryIndices(lo: number, hi: number, count: number): number[] {
	if (hi <= lo) return [lo];
	const span = hi - lo + 1;
	const n = Math.max(2, Math.min(span, Math.floor(count)));
	if (n >= span) return Array.from({ length: span }, (_, index) => lo + index);

	const shown: number[] = [];
	for (let step = 0; step < n; step += 1) {
		const index = lo + Math.round((step * (hi - lo)) / (n - 1));
		if (shown.at(-1) !== index) shown.push(index);
	}
	if (shown[0] !== lo) shown.unshift(lo);
	if (shown.at(-1) !== hi) shown.push(hi);
	return shown;
}

/** One `...` gap for every collapsed run between consecutive shown labels. */
export function gapsBetweenShown(shown: number[]): AxisLabelGap[] {
	const gaps: AxisLabelGap[] = [];
	for (let i = 0; i < shown.length - 1; i += 1) {
		const left = shown[i];
		const right = shown[i + 1];
		if (left == null || right == null || right - left <= 1) continue;
		const start = left + 1;
		const end = right - 1;
		gaps.push({
			start,
			end,
			index: Math.floor((start + end) / 2),
		});
	}
	return gaps;
}

/**
 * Keep first and last labels of the visible window, plus a regular cadence of
 * intermediates that still fit. Each collapsed run becomes one gap (`...`).
 */
export function planCategoryAxisTicks(
	categories: string[],
	axisLengthPx: number,
	options: PlanCategoryAxisTicksOptions = {},
): AxisLabelPlan {
	const total = categories.length;
	if (total === 0) return { shown: [], gaps: [] };

	const placement = options.placement ?? 'bottom';
	const rotate = options.rotate ?? (placement === 'bottom' ? 45 : 0);
	const fontSize = options.fontSize ?? DEFAULT_FONT;
	const glyphWidth = options.glyphWidth ?? DEFAULT_GLYPH;
	const start = clampIndex(options.visibleStart ?? 0, total);
	const end = clampIndex(options.visibleEnd ?? total - 1, total);
	const lo = Math.min(start, end);
	const hi = Math.max(start, end);
	if (lo === hi) return { shown: [lo], gaps: [] };

	const spanOf = (index: number) =>
		labelAxisSpan(categories[index] ?? '', placement, rotate, fontSize, glyphWidth);
	const count = hi - lo + 1;
	const length = Number.isFinite(axisLengthPx) && axisLengthPx > 0 ? axisLengthPx : DEFAULT_AXIS_LENGTH;

	let pitch = 0;
	for (let index = lo; index <= hi; index += 1) {
		pitch = Math.max(pitch, spanOf(index));
	}
	pitch += 6;

	const maxLabels = Math.max(2, Math.min(count, Math.floor(length / pitch) + 1));
	const shown = evenCategoryIndices(lo, hi, maxLabels);
	return { shown, gaps: gapsBetweenShown(shown) };
}

export function axisLabelShowsIndex(plan: AxisLabelPlan, index: number): boolean {
	return plan.shown.includes(index);
}

export function dataZoomRangeForIndices(
	startIndex: number,
	endIndex: number,
	total: number,
): { start: number; end: number; startValue: number; endValue: number } {
	const n = Math.max(1, total);
	const startValue = clampIndex(Math.min(startIndex, endIndex), n);
	const endValue = clampIndex(Math.max(startIndex, endIndex), n);
	return {
		startValue,
		endValue,
		start: (startValue / n) * 100,
		end: ((endValue + 1) / n) * 100,
	};
}

export function ellipsisClickPayload(start: number, end: number): {
	name: string;
	dataType: typeof AXIS_ELLIPSIS;
	data: { name: string; kind: typeof AXIS_ELLIPSIS; skipStart: number; skipEnd: number };
} {
	return {
		name: AXIS_ELLIPSIS_LABEL,
		dataType: AXIS_ELLIPSIS,
		data: {
			name: AXIS_ELLIPSIS_LABEL,
			kind: AXIS_ELLIPSIS,
			skipStart: start,
			skipEnd: end,
		},
	};
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Resolve a click/hover payload to the skipped category index range. */
export function resolveEllipsisRange(payload: unknown): { start: number; end: number } | null {
	const item = asRecord(payload);
	if (!item) return null;
	const data = asRecord(item.data) ?? item;
	const start = Number(data.skipStart ?? item.skipStart);
	const end = Number(data.skipEnd ?? item.skipEnd);
	if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;

	const kind = item.dataType ?? data.kind ?? data.name ?? item.name;
	const marked =
		kind === AXIS_ELLIPSIS ||
		kind === AXIS_ELLIPSIS_LABEL ||
		item.name === AXIS_ELLIPSIS_LABEL ||
		data.name === AXIS_ELLIPSIS_LABEL;
	if (!marked && data.skipStart == null && item.skipStart == null) return null;
	if (!marked) return null;
	return { start, end };
}

/** Axis-pixel offset for a gap’s `...`, in the visual middle of the skipped run. */
export function ellipsisAxisOffset(
	gap: AxisLabelGap,
	startIndex: number,
	endIndex: number,
	axisLengthPx: number,
): number {
	const length = Number.isFinite(axisLengthPx) && axisLengthPx > 0 ? axisLengthPx : DEFAULT_AXIS_LENGTH;
	const span = Math.max(1, endIndex - startIndex);
	const mid = (gap.start + gap.end) / 2;
	const t = (mid - startIndex) / span;
	return Math.max(0, Math.min(length, t * length));
}

export function skippedLabels(categories: string[], start: number, end: number): string[] {
	if (categories.length === 0) return [];
	const lo = clampIndex(start, categories.length);
	const hi = clampIndex(end, categories.length);
	return categories.slice(lo, hi + 1);
}
