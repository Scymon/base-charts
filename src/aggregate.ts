import { isExcludedLabel, normalizeTag } from './labels.ts';
import type { AggregatedChart, BoxFive, CalendarCell, ChartSettings, RawRow, ScatterPoint } from './types.ts';

export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
	}
	return sorted[mid] ?? 0;
}

export function aggregateNumbers(values: number[], aggregation: ChartSettings['aggregation']): number {
	if (aggregation === 'count') return values.length;
	if (values.length === 0) return 0;
	if (aggregation === 'sum') return values.reduce((sum, value) => sum + value, 0);
	if (aggregation === 'average') {
		return values.reduce((sum, value) => sum + value, 0) / values.length;
	}
	return median(values);
}

export function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0] ?? 0;
	const index = (sorted.length - 1) * p;
	const low = Math.floor(index);
	const high = Math.ceil(index);
	const weight = index - low;
	return (sorted[low] ?? 0) * (1 - weight) + (sorted[high] ?? 0) * weight;
}

/** min / p25 / median / p75 / max from the raw values in one category. */
export function boxFive(values: number[]): BoxFive | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return [
		sorted[0] ?? 0,
		percentile(sorted, 0.25),
		median(sorted),
		percentile(sorted, 0.75),
		sorted[sorted.length - 1] ?? 0,
	];
}

export function parseChartDate(label: string): string | null {
	const iso = label.match(/^(\d{4}-\d{2}-\d{2})/);
	if (iso?.[1]) return iso[1];
	const parsed = Date.parse(label);
	if (!Number.isFinite(parsed)) return null;
	const date = new Date(parsed);
	if (Number.isNaN(date.getTime())) return null;
	const year = date.getUTCFullYear();
	if (year < 1990 || year > 2100) return null;
	return date.toISOString().slice(0, 10);
}

function excludedSet(settings: ChartSettings): Set<string> {
	return new Set(settings.excludedTags.map((tag) => normalizeTag(tag).toLowerCase()));
}

function pushUnique(list: string[], value: string): void {
	if (!list.includes(value)) list.push(value);
}

export function aggregateRows(rows: RawRow[], settings: ChartSettings): AggregatedChart {
	const excluded = excludedSet(settings);
	const buckets = new Map<string, { x: string; series: string; values: number[] }>();
	const rawPoints: ScatterPoint[] = [];
	const overallValues: number[] = [];
	let numericXCount = 0;

	for (const row of rows) {
		const yMissing = row.y == null;
		if (settings.filterEmptyY && yMissing) {
			continue;
		}

		const xLabels = row.xLabels.length > 0 ? row.xLabels : ['(empty)'];
		const seriesLabels = row.seriesLabels.length > 0 ? row.seriesLabels : [''];
		const y = row.y ?? 0;

		if (row.xNumeric != null && row.y != null) {
			numericXCount += 1;
			for (const series of seriesLabels) {
				if (series && isExcludedLabel(series, excluded)) continue;
				rawPoints.push({
					x: row.xNumeric,
					y: row.y,
					series: series || 'Value',
					name: row.fileName,
				});
			}
		}

		if (!yMissing || settings.aggregation === 'count') {
			overallValues.push(settings.aggregation === 'count' ? 1 : y);
		}

		for (const x of xLabels) {
			if (isExcludedLabel(x, excluded)) continue;
			for (const series of seriesLabels) {
				if (series && isExcludedLabel(series, excluded)) continue;
				const key = `${series}\0${x}`;
				let bucket = buckets.get(key);
				if (!bucket) {
					bucket = { x, series, values: [] };
					buckets.set(key, bucket);
				}
				bucket.values.push(settings.aggregation === 'count' ? 1 : y);
			}
		}
	}

	const categories: string[] = [];
	const seriesNames: string[] = [];
	for (const bucket of buckets.values()) {
		pushUnique(categories, bucket.x);
		pushUnique(seriesNames, bucket.series || 'Value');
	}

	const names = seriesNames.length > 0 ? seriesNames : ['Value'];
	const valueMap = new Map<string, number>();
	const rawMap = new Map<string, number[]>();
	for (const bucket of buckets.values()) {
		const series = bucket.series || 'Value';
		const key = `${series}\0${bucket.x}`;
		valueMap.set(key, aggregateNumbers(bucket.values, settings.aggregation));
		rawMap.set(key, bucket.values);
	}

	const categoryTotals = categories.map((category) => {
		let total = 0;
		for (const series of names) {
			total += valueMap.get(`${series}\0${category}`) ?? 0;
		}
		return { category, total };
	});

	categoryTotals.sort((a, b) => {
		if (settings.sort === 'label-asc') return a.category.localeCompare(b.category);
		if (settings.sort === 'label-desc') return b.category.localeCompare(a.category);
		if (settings.sort === 'value-asc') return a.total - b.total;
		return b.total - a.total;
	});

	const limited = categoryTotals.slice(0, Math.max(1, settings.maxCategories));
	const orderedCategories = limited.map((item) => item.category);
	const values = names.map((series) =>
		orderedCategories.map((category) => valueMap.get(`${series}\0${category}`) ?? 0),
	);
	const rawValues = names.map((series) =>
		orderedCategories.map((category) => rawMap.get(`${series}\0${category}`) ?? []),
	);

	const useRawScatter = settings.chartType === 'scatter' && numericXCount > 0;
	const points = useRawScatter
		? rawPoints
		: orderedCategories.flatMap((category, index) =>
			names.map((series, seriesIndex) => ({
				x: category,
				y: values[seriesIndex]?.[index] ?? 0,
				series,
				name: category,
			})),
		);

	const calendarBuckets = new Map<string, number[]>();
	for (const category of orderedCategories) {
		const date = parseChartDate(category);
		if (!date) continue;
		const combined: number[] = [];
		for (const series of names) {
			combined.push(...(rawMap.get(`${series}\0${category}`) ?? []));
		}
		const existing = calendarBuckets.get(date) ?? [];
		existing.push(...combined);
		calendarBuckets.set(date, existing);
	}
	const calendar: CalendarCell[] = [...calendarBuckets.entries()]
		.map(([date, cellValues]) => ({
			date,
			value: aggregateNumbers(cellValues, settings.aggregation),
		}))
		.sort((a, b) => a.date.localeCompare(b.date));

	return {
		categories: orderedCategories,
		seriesNames: names,
		values,
		rawValues,
		points,
		overall: overallValues.length > 0 ? aggregateNumbers(overallValues, settings.aggregation) : null,
		calendar,
	};
}
