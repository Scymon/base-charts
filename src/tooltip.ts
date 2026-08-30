import { notesByName, notesForCategory, notesForSeries, resolveClickNotes } from './click.ts';
import { formatAxisTick } from './format.ts';
import type { AggregatedChart, CategoryNote, ChartSettings, ClickPayload } from './types.ts';

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

function seriesFromParams(params: unknown): string | undefined {
	if (Array.isArray(params)) return undefined;
	const item = params as TooltipParam;
	if (item.seriesName && !DUMMY_SERIES.has(item.seriesName)) return item.seriesName;
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

function clickPayloadFromParams(params: unknown): ClickPayload {
	const item = firstParam(params);
	return {
		name: categoryFromParams(params) || item?.name || item?.data?.name,
		seriesName: seriesFromParams(params),
		dataType: item?.dataType,
		data: item?.data,
	};
}

function notesForTooltip(data: AggregatedChart, params: unknown): CategoryNote[] {
	const resolved = resolveClickNotes(data, clickPayloadFromParams(params));
	if (resolved.length > 0) return resolved;
	const category = categoryFromParams(params);
	const seriesName = seriesFromParams(params);
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

function isSingleDatumMark(
	data: AggregatedChart,
	settings: ChartSettings,
	params: unknown,
	category: string,
	notes: CategoryNote[],
): boolean {
	if (notes.length !== 1) return false;
	if (settings.chartType === 'scatter') {
		const numeric = data.points.some((point) => typeof point.x === 'number');
		if (numeric) return true;
	}
	return !data.categories.includes(category) && !data.seriesNames.includes(category);
}

function visibleSeriesName(
	seriesName: string | undefined,
	data: AggregatedChart,
	title: string,
): string | undefined {
	if (!seriesName || DUMMY_SERIES.has(seriesName)) return undefined;
	if (seriesName === title) return undefined;
	if (!data.seriesNames.includes(seriesName)) return undefined;
	if (data.seriesNames.length <= 1) return undefined;
	return seriesName;
}

function wrapTooltip(body: string): string {
	return `<div class="motion-chart-tooltip">${body}</div>`;
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
): string {
	const item = firstParam(params);
	const rawValue = item?.value ?? item?.data?.value;
	const xValue = Array.isArray(rawValue) ? rawValue[0] : undefined;
	const yValue = note.y;
	const seriesName = visibleSeriesName(seriesFromParams(params), data, note.name);
	const parts = [titleLine(displayNoteName(note.name))];
	if (seriesName) parts.push(statLine(escapeHtml(seriesName)));
	if (xValue != null && xValue !== '') {
		parts.push(labeledValue(propertyLabel(settings.xProperty), formatDatum(xValue)));
	}
	parts.push(labeledValue(propertyLabel(settings.yProperty), formatAxisTick(yValue)));
	return wrapTooltip(parts.filter(Boolean).join(''));
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
): string {
	const visibleSeries = visibleSeriesName(seriesName, data, title);
	const count = raw.length || notes.length;
	const parts = [titleLine(title || visibleSeries || '')];
	if (visibleSeries) parts.push(statLine(escapeHtml(visibleSeries)));
	parts.push(statLine(`n ${count}`));
	if (settings.aggregation !== 'count') {
		parts.push(statLine(`${labelAggregation(settings.aggregation)} ${formatAxisTick(value)}`));
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
	const seriesName = seriesFromParams(params);
	const notes = notesForTooltip(data, params);
	if (isSingleDatumMark(data, settings, params, category, notes) && notes[0]) {
		return formatSingleNoteTooltip(notes[0], params, settings, data);
	}
	const raw = rawAt(data, category, seriesName);
	const value = aggregatedAt(data, category, seriesName);
	return formatGroupTooltip(category, seriesName, notes, raw, value, data, settings, category);
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
