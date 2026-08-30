import { notesByName, notesForCategory, notesForSeries, resolveClickNotes } from './click.ts';
import { formatAxisTick } from './format.ts';
import type { AggregatedChart, CategoryNote, ChartSettings, ClickPayload, ScatterPoint } from './types.ts';

/** Charts whose marks are often one note (or 1:1). Grouped types stay on the bucket card. */
const POINT_CHART_TYPES = new Set<ChartSettings['chartType']>([
	'scatter',
	'line',
	'line-step',
	'area',
	'area-stacked',
	'bubbles',
	'funnel',
]);

export const TOOLTIP_NOTE_PATH_ATTR = 'data-motion-note-path';

const DUMMY_SERIES = new Set(['', 'Value', 'Y2']);

type TooltipParam = {
	name?: string;
	axisValue?: string;
	seriesName?: string;
	dataType?: string;
	value?: unknown;
	data?: {
		name?: string;
		source?: string;
		target?: string;
		path?: string;
		value?: unknown;
		children?: unknown[];
	};
};

function firstParam(params: unknown): TooltipParam | undefined {
	if (Array.isArray(params)) return params[0] as TooltipParam | undefined;
	return params as TooltipParam | undefined;
}

function categoryFromParams(params: unknown): string {
	const item = firstParam(params);
	if (!item) return '';
	if (typeof item.name === 'string' && item.name) return item.name;
	if (typeof item.axisValue === 'string' && item.axisValue) return item.axisValue;
	if (Array.isArray(item.value) && typeof item.value[0] === 'string') return item.value[0];
	if (typeof item.data?.name === 'string' && item.data.name) return item.data.name;
	if (typeof item.data?.source === 'string' && item.data.source) return item.data.source;
	return '';
}

function seriesFromParams(
	params: unknown,
	data?: AggregatedChart,
	settings?: ChartSettings,
): string | undefined {
	const heat = heatmapCellFromParams(params, data, settings);
	if (heat?.series && !DUMMY_SERIES.has(heat.series)) return heat.series;
	if (Array.isArray(params)) return undefined;
	const item = params as TooltipParam;
	if (item.seriesName && !DUMMY_SERIES.has(item.seriesName) && (!data || data.seriesNames.includes(item.seriesName))) {
		return item.seriesName;
	}
	if (item.seriesName && !DUMMY_SERIES.has(item.seriesName) && !data) return item.seriesName;
	if (item.data?.target && !DUMMY_SERIES.has(item.data.target)) return item.data.target;
	return undefined;
}

function rawAt(data: AggregatedChart, category: string, seriesName?: string): number[] {
	const catIndex = data.categories.indexOf(category);
	if (catIndex < 0) return [];
	const seriesIndex = seriesName ? data.seriesNames.indexOf(seriesName) : -1;
	if (seriesIndex >= 0) return data.rawValues[seriesIndex]?.[catIndex] ?? [];
	return data.seriesNames.flatMap((_, index) => data.rawValues[index]?.[catIndex] ?? []);
}

function aggregatedAt(data: AggregatedChart, category: string, seriesName?: string): number {
	const catIndex = data.categories.indexOf(category);
	if (catIndex < 0) return 0;
	const seriesIndex = seriesName ? data.seriesNames.indexOf(seriesName) : -1;
	if (seriesIndex >= 0) return data.values[seriesIndex]?.[catIndex] ?? 0;
	return data.values.reduce((sum, series) => sum + (series[catIndex] ?? 0), 0);
}

export function propertyLabel(propertyId: string | null | undefined): string {
	if (!propertyId) return '';
	const trimmed = propertyId.trim();
	const slash = trimmed.lastIndexOf('/');
	const tail = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
	const dot = tail.lastIndexOf('.');
	return (dot >= 0 ? tail.slice(dot + 1) : tail).trim();
}

export function displayNoteName(name: string): string {
	return name.replace(/\.md$/i, '');
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function formatDatum(value: unknown): string {
	if (typeof value === 'number' && Number.isFinite(value)) return formatAxisTick(value);
	if (value == null) return '';
	return String(value);
}

function clickPayloadFromParams(
	params: unknown,
	data?: AggregatedChart,
	settings?: ChartSettings,
): ClickPayload {
	const item = firstParam(params);
	return {
		name: categoryFromParams(params) || item?.name || item?.data?.name,
		seriesName: seriesFromParams(params, data, settings),
		dataType: item?.dataType,
		data: item?.data,
	};
}

function notesForTooltip(data: AggregatedChart, params: unknown, settings?: ChartSettings): CategoryNote[] {
	const resolved = resolveClickNotes(data, clickPayloadFromParams(params, data, settings));
	if (resolved.length > 0) return resolved;
	const category = categoryFromParams(params);
	const seriesName = seriesFromParams(params, data, settings);
	const item = firstParam(params);
	const path = typeof item?.data?.path === 'string' ? item.data.path : '';
	if (path) {
		const byPath = notesByName(data, path);
		if (byPath.length > 0) return byPath;
	}
	if (category && data.categories.includes(category)) {
		return notesForCategory(data, category, seriesName);
	}
	if (category && data.seriesNames.includes(category)) {
		return notesForSeries(data, category);
	}
	if (category) return notesByName(data, category);
	return [];
}

/**
 * Heatmap cells are [xIndex, yIndex, cellValue]. Calendar cells are
 * [date, value] (or [x, y, value] on the cartesian fallback). Scatter is
 * [x, y]. Do not reuse scatter parsing for heatmap — that labels the
 * column/row indexes with xProperty/yProperty.
 */
function heatmapCellFromParams(
	params: unknown,
	data?: AggregatedChart,
	settings?: ChartSettings,
): { x?: unknown; y?: number; series?: string } | null {
	if (settings && settings.chartType !== 'heatmap' && settings.chartType !== 'calendar') return null;
	const item = firstParam(params);
	const raw = item?.value ?? item?.data?.value;
	if (!Array.isArray(raw) || raw.length === 0) return null;

	if (settings?.chartType === 'calendar' && typeof raw[0] === 'string') {
		const y = Number(raw[1]);
		return { x: raw[0], y: Number.isFinite(y) ? y : undefined };
	}

	if (raw.length >= 3 && typeof raw[0] === 'number' && typeof raw[1] === 'number') {
		const xIndex = raw[0];
		const yIndex = raw[1];
		const cell = Number(raw[2]);
		const category =
			(typeof item?.name === 'string' && item.name) ||
			(data && Number.isInteger(xIndex) ? data.categories[xIndex] : undefined) ||
			raw[0];
		const named = item?.seriesName && data?.seriesNames.includes(item.seriesName) ? item.seriesName : undefined;
		const series = named ?? (data && Number.isInteger(yIndex) ? data.seriesNames[yIndex] : undefined);
		return {
			x: category,
			y: Number.isFinite(cell) ? cell : undefined,
			series: series && !DUMMY_SERIES.has(series) ? series : undefined,
		};
	}
	return null;
}

function xyFromParams(
	params: unknown,
	settings?: ChartSettings,
	data?: AggregatedChart,
): { x?: unknown; y?: number; series?: string } {
	const heat = heatmapCellFromParams(params, data, settings);
	if (heat) return heat;
	const item = firstParam(params);
	const raw = item?.value ?? item?.data?.value;
	if (Array.isArray(raw)) {
		const y = Number(raw[1] ?? raw[0]);
		return { x: raw[0], y: Number.isFinite(y) ? y : undefined };
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) return { y: raw };
	return {};
}

function findRawPoint(
	data: AggregatedChart,
	params: unknown,
	settings?: ChartSettings,
): ScatterPoint | undefined {
	const item = firstParam(params);
	const name = (typeof item?.name === 'string' && item.name) || item?.data?.name || '';
	const path = typeof item?.data?.path === 'string' ? item.data.path : '';
	const series = seriesFromParams(params, data, settings);
	const { x, y } = xyFromParams(params, settings, data);

	if (path) {
		const hit = data.points.find((point) => point.path === path && (!series || point.series === series || !point.series));
		if (hit) return hit;
	}
	if (name) {
		const named = data.points.filter((point) => point.name === name);
		if (series) {
			const hit = named.find((point) => point.series === series);
			if (hit) return hit;
		}
		const raw = named.find((point) => point.path || typeof point.x === 'number');
		if (raw) return raw;
		if (named.length === 1) return named[0];
	}
	if (typeof x === 'number' && typeof y === 'number') {
		return data.points.find(
			(point) => point.x === x && point.y === y && (!series || point.series === series || !point.series),
		);
	}
	return undefined;
}

function plottedY(
	params: unknown,
	point: ScatterPoint | undefined,
	note: CategoryNote | undefined,
	settings?: ChartSettings,
	data?: AggregatedChart,
): number | undefined {
	const fromParams = xyFromParams(params, settings, data).y;
	if (fromParams != null) return fromParams;
	if (point && Number.isFinite(point.y)) return point.y;
	if (note && Number.isFinite(note.y)) return note.y;
	return undefined;
}

function shouldUseSingleDatumCard(
	data: AggregatedChart,
	settings: ChartSettings,
	params: unknown,
	category: string,
	notes: CategoryNote[],
	point: ScatterPoint | undefined,
): boolean {
	const { x, y } = xyFromParams(params, settings, data);
	const hasPlottedValue = y != null || typeof x === 'number';
	const categoryBucket = data.categories.includes(category);

	if (settings.chartType === 'scatter' && (point || hasPlottedValue)) return true;
	if ((settings.chartType === 'heatmap' || settings.chartType === 'calendar') && notes.length === 1) {
		return true;
	}
	if (POINT_CHART_TYPES.has(settings.chartType) && notes.length === 1) return true;
	if (notes.length === 0 && !categoryBucket && (point || hasPlottedValue)) return true;
	return false;
}

function visibleSeriesName(
	seriesName: string | undefined,
	data: AggregatedChart,
	title: string,
	opts: { allowLoneSeries?: boolean } = {},
): string | undefined {
	if (!seriesName || DUMMY_SERIES.has(seriesName)) return undefined;
	if (seriesName === title) return undefined;
	if (!data.seriesNames.includes(seriesName)) return undefined;
	if (!opts.allowLoneSeries && data.seriesNames.length <= 1) return undefined;
	return seriesName;
}

function wrapTooltip(body: string, path?: string): string {
	const attr = path ? ` ${TOOLTIP_NOTE_PATH_ATTR}="${escapeHtml(path)}"` : '';
	return `<div class="motion-chart-tooltip"${attr}>${body}</div>`;
}

function statLine(text: string): string {
	return `<div class="motion-chart-tooltip-stat">${text}</div>`;
}

function titleLine(text: string): string {
	return `<div class="motion-chart-tooltip-title">${escapeHtml(text)}</div>`;
}

function labeledValue(label: string, value: string): string {
	if (!value) return '';
	if (!label) return statLine(escapeHtml(value));
	return statLine(`${escapeHtml(label)} ${escapeHtml(value)}`);
}

function noteRows(notes: CategoryNote[]): string {
	if (notes.length === 0) return '';
	const rows = notes
		.map((note) => {
			const name = escapeHtml(displayNoteName(note.name));
			const value = escapeHtml(formatAxisTick(note.y));
			const path = note.path ? escapeHtml(note.path) : '';
			const attrs = path
				? ` class="motion-chart-tooltip-note" role="button" ${TOOLTIP_NOTE_PATH_ATTR}="${path}"`
				: ' class="motion-chart-tooltip-note"';
			return `<div${attrs}><span class="motion-chart-tooltip-note-name">${name}</span><span class="motion-chart-tooltip-note-value">${value}</span></div>`;
		})
		.join('');
	return `<div class="motion-chart-tooltip-notes">${rows}</div>`;
}

function formatSingleNoteTooltip(
	note: CategoryNote,
	params: unknown,
	settings: ChartSettings,
	data: AggregatedChart,
	point?: ScatterPoint,
): string {
	const category = categoryFromParams(params);
	const xy = xyFromParams(params, settings, data);
	const yValue = plottedY(params, point, note, settings, data);
	const xValue = point?.x ?? xy.x ?? (data.categories.includes(category) ? category : undefined);
	const seriesName = visibleSeriesName(
		xy.series ?? seriesFromParams(params, data, settings) ?? point?.series,
		data,
		note.name,
		{ allowLoneSeries: true },
	);
	const parts = [titleLine(displayNoteName(note.name))];
	if (seriesName) {
		const seriesLabel = propertyLabel(settings.seriesProperty);
		parts.push(
			settings.chartType === 'heatmap' && seriesLabel
				? labeledValue(seriesLabel, seriesName)
				: statLine(escapeHtml(seriesName)),
		);
	}
	if (xValue != null && xValue !== '') {
		parts.push(labeledValue(propertyLabel(settings.xProperty), formatDatum(xValue)));
	}
	if (yValue != null) {
		parts.push(labeledValue(propertyLabel(settings.yProperty), formatAxisTick(yValue)));
	}
	if (settings.chartType === 'combo' && data.hasY2) {
		const catIndex = data.categories.indexOf(category);
		if (catIndex >= 0) {
			parts.push(labeledValue(propertyLabel(settings.y2Property), formatAxisTick(data.y2Category[catIndex] ?? 0)));
		}
	}
	return wrapTooltip(parts.filter(Boolean).join(''), note.path);
}

function formatGroupTooltip(
	title: string,
	seriesName: string | undefined,
	notes: CategoryNote[],
	raw: number[],
	value: number,
	data: AggregatedChart,
	settings: ChartSettings,
	category: string,
	params?: unknown,
): string {
	const xy = params ? xyFromParams(params, settings, data) : {};
	const visibleSeries = visibleSeriesName(seriesName ?? xy.series, data, title);
	const count = raw.length || notes.length;
	const parts = [titleLine(title || visibleSeries || '')];
	if (settings.chartType === 'heatmap') {
		const xValue = xy.x ?? (data.categories.includes(category) ? category : title);
		if (xValue != null && xValue !== '') {
			parts.push(labeledValue(propertyLabel(settings.xProperty), formatDatum(xValue)));
		}
		if (visibleSeries) {
			parts.push(labeledValue(propertyLabel(settings.seriesProperty), visibleSeries));
		}
		const cell = xy.y ?? value;
		if (cell != null) {
			parts.push(labeledValue(propertyLabel(settings.yProperty), formatAxisTick(cell)));
		}
		parts.push(statLine(`n ${count}`));
	} else {
		if (visibleSeries) parts.push(statLine(escapeHtml(visibleSeries)));
		parts.push(statLine(`n ${count}`));
		if (settings.aggregation !== 'count') {
			parts.push(statLine(`${labelAggregation(settings.aggregation)} ${formatAxisTick(value)}`));
		}
	}
	if (raw.length > 0) {
		const min = Math.min(...raw);
		const max = Math.max(...raw);
		if (min !== max) parts.push(statLine(`${formatAxisTick(min)} – ${formatAxisTick(max)}`));
	}
	if (settings.chartType === 'combo' && data.hasY2) {
		const catIndex = data.categories.indexOf(category);
		const y2 = data.y2Category[catIndex] ?? 0;
		const y2Name = propertyLabel(settings.y2Property);
		parts.push(labeledValue(y2Name, formatAxisTick(y2)));
	}
	parts.push(noteRows(notes));
	return wrapTooltip(parts.filter(Boolean).join(''));
}

export function formatCategoryTooltip(
	params: unknown,
	data: AggregatedChart,
	settings: ChartSettings,
): string {
	const category = categoryFromParams(params);
	const seriesName = seriesFromParams(params, data, settings);
	const notes = notesForTooltip(data, params, settings);
	const point = findRawPoint(data, params, settings);
	if (shouldUseSingleDatumCard(data, settings, params, category, notes, point)) {
		const y = plottedY(params, point, notes[0], settings, data);
		const note = point
			? { name: point.name, path: point.path ?? notes[0]?.path ?? '', y: y ?? point.y }
			: (notes[0] ?? {
					name: category,
					path: firstParam(params)?.data?.path ?? '',
					y: y ?? 0,
				});
		return formatSingleNoteTooltip(note, params, settings, data, point);
	}
	const raw = rawAt(data, category, seriesName);
	const value = aggregatedAt(data, category, seriesName);
	if (notes.length === 0 && raw.length === 0) {
		const y = xyFromParams(params, settings, data).y;
		if (y != null) {
			return formatSingleNoteTooltip(
				{ name: category || point?.name || '', path: firstParam(params)?.data?.path ?? point?.path ?? '', y },
				params,
				settings,
				data,
				point,
			);
		}
		return wrapTooltip(titleLine(category || seriesName || ''));
	}
	return formatGroupTooltip(category, seriesName, notes, raw, value, data, settings, category, params);
}

export function notePathFromTarget(target: EventTarget | null): string | null {
	if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return null;
	const el = (target as Element).closest(`[${TOOLTIP_NOTE_PATH_ATTR}]`);
	const path = el?.getAttribute(TOOLTIP_NOTE_PATH_ATTR);
	return path || null;
}

function labelAggregation(value: string): string {
	if (value === 'count') return 'Count';
	if (value === 'sum') return 'Sum';
	if (value === 'average') return 'Average';
	return 'Median';
}
