import { exampleTitles, notesForCategory } from './click.ts';
import { formatNumber } from './format.ts';
import type { AggregatedChart, ChartSettings } from './types.ts';

function categoryFromParams(params: unknown): string {
	if (Array.isArray(params)) {
		const first = params[0] as { name?: string; axisValue?: string } | undefined;
		return String(first?.name ?? first?.axisValue ?? '');
	}
	const item = params as { name?: string; axisValue?: string; value?: unknown };
	if (typeof item.name === 'string' && item.name) return item.name;
	if (typeof item.axisValue === 'string' && item.axisValue) return item.axisValue;
	if (Array.isArray(item.value) && typeof item.value[0] === 'string') return item.value[0];
	return '';
}

function seriesFromParams(params: unknown): string | undefined {
	if (Array.isArray(params)) return undefined;
	const item = params as { seriesName?: string };
	return item.seriesName;
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

export function formatCategoryTooltip(
	params: unknown,
	data: AggregatedChart,
	settings: ChartSettings,
): string {
	const category = categoryFromParams(params);
	const seriesName = seriesFromParams(params);
	const notes = notesForCategory(data, category, seriesName);
	const raw = rawAt(data, category, seriesName);
	const value = aggregatedAt(data, category, seriesName);
	const lines = [`<b>${category || seriesName || ''}</b>`];
	if (seriesName && data.seriesNames.includes(seriesName) && data.seriesNames.length > 1) {
		lines.unshift(seriesName);
	}
	lines.push(`n ${raw.length || notes.length}`);
	lines.push(`${labelAggregation(settings.aggregation)} ${formatNumber(value)}`);
	if (raw.length > 0) {
		const min = Math.min(...raw);
		const max = Math.max(...raw);
		if (min !== max) lines.push(`${formatNumber(min)} – ${formatNumber(max)}`);
	}
	if (settings.chartType === 'combo' && data.hasY2) {
		const catIndex = data.categories.indexOf(category);
		const y2 = data.y2Category[catIndex] ?? 0;
		lines.push(`Y2 ${formatNumber(y2)}`);
	}
	const titles = exampleTitles(notes, 3);
	if (titles.length > 0) lines.push(titles.join(', '));
	return lines.filter(Boolean).join('<br/>');
}

function labelAggregation(value: string): string {
	if (value === 'count') return 'Count';
	if (value === 'sum') return 'Sum';
	if (value === 'average') return 'Average';
	return 'Median';
}
