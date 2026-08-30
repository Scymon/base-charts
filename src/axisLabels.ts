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
		const startIndex = clampIndex(Math.round(startValue), total);
		const endIndex = clampIndex(Math.round(endValue), total);
		return startIndex <= endIndex
			? { startIndex, endIndex }
			: { startIndex: endIndex, endIndex: startIndex };
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
 * Keep first and last labels of the visible window, plus intermediates that
 * still fit. Each collapsed run becomes one gap (a later `...` tick).
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
	const pos = (index: number) => ((index - lo) / Math.max(1, count - 1)) * length;

	const shown: number[] = [lo];
	let last = lo;
	const lastLeft = pos(hi) - spanOf(hi) / 2;
	const gapPad = 6;

	for (let index = lo + 1; index < hi; index += 1) {
		const x = pos(index);
		const half = spanOf(index) / 2;
		const prevRight = pos(last) + spanOf(last) / 2;
		if (x - half >= prevRight + gapPad && x + half + gapPad <= lastLeft) {
			shown.push(index);
			last = index;
		}
	}
	shown.push(hi);

	const gaps: AxisLabelGap[] = [];
	for (let i = 0; i < shown.length - 1; i += 1) {
		const left = shown[i] ?? lo;
		const right = shown[i + 1] ?? hi;
		if (right - left <= 1) continue;
		const skipStart = left + 1;
		const skipEnd = right - 1;
		gaps.push({
			start: skipStart,
			end: skipEnd,
			index: Math.floor((skipStart + skipEnd) / 2),
		});
	}
	return { shown, gaps };
}

export function axisLabelShowsIndex(plan: AxisLabelPlan, index: number): boolean {
	return plan.shown.includes(index);
}

/** Visible labels plus one `...` tick in each collapsed stretch. */
export function axisLabelShowsTick(plan: AxisLabelPlan, index: number): boolean {
	return axisLabelShowsIndex(plan, index) || plan.gaps.some((gap) => gap.index === index);
}

/** Real category name on visibles; `'...'` on the hidden-stretch tick. */
export function formatCategoryAxisTick(plan: AxisLabelPlan, index: number, value: string): string {
	if (plan.gaps.some((gap) => gap.index === index)) return AXIS_ELLIPSIS_LABEL;
	return value;
}

export function gapForTickIndex(plan: AxisLabelPlan, index: number): AxisLabelGap | undefined {
	return plan.gaps.find((gap) => gap.index === index);
}

export function categoryAxisLabelHandlers(
	plan: AxisLabelPlan,
	mapValue?: (value: string | number, index: number) => string,
): {
	interval: (index: number) => boolean;
	formatter: (value: string | number, index: number) => string;
	hideOverlap: false;
	triggerEvent: true;
} {
	return {
		interval: (index: number) => axisLabelShowsTick(plan, index),
		formatter: (value: string | number, index: number) =>
			formatCategoryAxisTick(plan, index, mapValue ? mapValue(value, index) : String(value ?? '')),
		hideOverlap: false,
		triggerEvent: true,
	};
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

export function isAxisComponentEvent(payload: unknown): boolean {
	const type = asRecord(payload)?.componentType;
	return type === 'xAxis' || type === 'yAxis' || type === 'singleAxis';
}

export function axisPlacementFromEvent(payload: unknown): 'bottom' | 'left' | null {
	const type = asRecord(payload)?.componentType;
	if (type === 'yAxis') return 'left';
	if (type === 'xAxis' || type === 'singleAxis') return 'bottom';
	return null;
}

/** Category index for an axis-label event (`dataIndex` / `tickIndex` / raw value). */
export function tickIndexFromAxisEvent(payload: unknown, categories: string[]): number | null {
	const item = asRecord(payload);
	if (!item || categories.length === 0) return null;
	const dataIndex = Number(item.dataIndex ?? item.tickIndex);
	if (Number.isInteger(dataIndex) && dataIndex >= 0 && dataIndex < categories.length) return dataIndex;
	const value = item.value ?? item.name;
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < categories.length) {
		return value;
	}
	if (typeof value === 'string' && value && value !== AXIS_ELLIPSIS_LABEL) {
		const index = categories.indexOf(value);
		if (index >= 0) return index;
	}
	return null;
}

export function axisEllipsisPayload(plan: AxisLabelPlan, index: number): ReturnType<typeof ellipsisClickPayload> | null {
	const gap = gapForTickIndex(plan, index);
	if (!gap) return null;
	return ellipsisClickPayload(gap.start, gap.end);
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

/** Hidden interval for an axis-label event on that stretch’s `...` tick. */
export function resolveAxisEllipsisRange(
	payload: unknown,
	plan: AxisLabelPlan,
	categories: string[],
): { start: number; end: number } | null {
	const direct = resolveEllipsisRange(payload);
	if (direct) return direct;
	if (!isAxisComponentEvent(payload)) return null;
	const index = tickIndexFromAxisEvent(payload, categories);
	if (index == null) return null;
	const gap = gapForTickIndex(plan, index);
	if (!gap) return null;
	return { start: gap.start, end: gap.end };
}

export function skippedLabels(categories: string[], start: number, end: number): string[] {
	if (categories.length === 0) return [];
	const lo = clampIndex(start, categories.length);
	const hi = clampIndex(end, categories.length);
	return categories.slice(lo, hi + 1);
}
