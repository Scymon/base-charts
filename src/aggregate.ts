import { isExcludedLabel, normalizeTag } from './labels.ts';
import type { AggregatedChart, BoxFive, CalendarCell, CategoryNote, ChartSettings, RawRow, ScatterPoint } from './types.ts';

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

function noteTitle(row: RawRow): string {
	return row.title?.trim() || row.fileName;
}

function pushNote(notes: CategoryNote[], row: RawRow, y: number): void {
	notes.push({
		name: noteTitle(row),
		path: row.filePath || row.fileName,
		y,
	});
}

export function binCounts(
	values: number[],
	binCount = 16,
	domain?: { min: number; max: number },
): { mid: number; count: number }[] {
	if (values.length === 0) {
		return Array.from({ length: binCount }, (_, index) => ({ mid: index, count: 0 }));
	}
	const min = domain?.min ?? Math.min(...values);
	const max = domain?.max ?? Math.max(...values);
	if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
		return [{ mid: Number.isFinite(min) ? min : 0, count: values.length }];
	}
	const width = (max - min) / binCount;
	const bins = Array.from({ length: binCount }, (_, index) => ({
		mid: min + width * (index + 0.5),
		count: 0,
	}));
	for (const value of values) {
		if (!Number.isFinite(value)) continue;
		const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - min) / width)));
		const bin = bins[index];
		if (bin) bin.count += 1;
	}
	return bins;
}

export function aggregateRows(rows: RawRow[], settings: ChartSettings): AggregatedChart {
	const excluded = excludedSet(settings);
	const buckets = new Map<
		string,
		{ x: string; series: string; values: number[]; y2Values: number[]; notes: CategoryNote[] }
	>();
	const rawPoints: ScatterPoint[] = [];
	const overallValues: number[] = [];
	let numericXCount = 0;

	for (const row of rows) {
		const yMissing = row.y == null;
		if (settings.filterEmptyY && yMissing) {
			continue;
		}

		const xLabels = row.xLabels.length > 0 ? row.xLabels : ['(empty)'];
		const seriesLabels =
			row.seriesLabels.length > 0
				? row.seriesLabels
				: settings.chartType === 'bar-race'
					? [row.fileName]
					: [''];
		const y = row.y ?? 0;

		if (row.xNumeric != null && row.y != null) {
			numericXCount += 1;
			for (const series of seriesLabels) {
				if (series && isExcludedLabel(series, excluded)) continue;
				rawPoints.push({
					x: row.xNumeric,
					y: row.y,
					series: series || 'Value',
					name: noteTitle(row),
					path: row.filePath || row.fileName,
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
					bucket = { x, series, values: [], y2Values: [], notes: [] };
					buckets.set(key, bucket);
				}
				bucket.values.push(settings.aggregation === 'count' ? 1 : y);
				if (settings.y2Property && row.y2 != null && Number.isFinite(row.y2)) {
					bucket.y2Values.push(row.y2);
				}
				pushNote(bucket.notes, row, y);
			}
		}
	}

	const categories: string[] = [];
	const seriesNames: string[] = [];
	for (const bucket of buckets.values()) {
		pushUnique(categories, bucket.x);
		pushUnique(seriesNames, bucket.series || 'Value');
	}

	let names = seriesNames.length > 0 ? seriesNames : ['Value'];
	const valueMap = new Map<string, number>();
	const rawMap = new Map<string, number[]>();
	const y2Map = new Map<string, number>();
	const y2RawMap = new Map<string, number[]>();
	const noteMap = new Map<string, CategoryNote[]>();
	let hasY2 = false;
	for (const bucket of buckets.values()) {
		const series = bucket.series || 'Value';
		const key = `${series}\0${bucket.x}`;
		valueMap.set(key, aggregateNumbers(bucket.values, settings.aggregation));
		rawMap.set(key, bucket.values);
		y2RawMap.set(key, bucket.y2Values);
		if (bucket.y2Values.length > 0) {
			hasY2 = true;
			y2Map.set(key, aggregateNumbers(bucket.y2Values, settings.aggregation));
		}
		noteMap.set(key, bucket.notes);
	}

	const categoryTotals = categories.map((category) => {
		let total = 0;
		for (const series of names) {
			total += valueMap.get(`${series}\0${category}`) ?? 0;
		}
		return { category, total };
	});

	const dateCount = categories.filter((category) => parseChartDate(category)).length;
	const raceByDate =
		settings.chartType === 'bar-race' && dateCount > 0 && dateCount >= categories.length / 2;

	categoryTotals.sort((a, b) => {
		if (raceByDate) {
			const left = parseChartDate(a.category) ?? a.category;
			const right = parseChartDate(b.category) ?? b.category;
			return left.localeCompare(right);
		}
		if (settings.sort === 'label-asc') return a.category.localeCompare(b.category);
		if (settings.sort === 'label-desc') return b.category.localeCompare(a.category);
		if (settings.sort === 'value-asc') return a.total - b.total;
		return b.total - a.total;
	});

	const limited = raceByDate
		? categoryTotals.slice(-Math.max(24, settings.maxCategories))
		: categoryTotals.slice(0, Math.max(1, settings.maxCategories));
	const orderedCategories = limited.map((item) => item.category);
	if (raceByDate && names.length > settings.maxCategories) {
		const lastCategory = orderedCategories[orderedCategories.length - 1];
		names = [...names]
			.sort((left, right) => {
				const lastLeft = lastCategory ? (valueMap.get(`${left}\0${lastCategory}`) ?? 0) : 0;
				const lastRight = lastCategory ? (valueMap.get(`${right}\0${lastCategory}`) ?? 0) : 0;
				return lastRight - lastLeft;
			})
			.slice(0, Math.max(1, settings.maxCategories));
	}
	const values = names.map((series) =>
		orderedCategories.map((category) => valueMap.get(`${series}\0${category}`) ?? 0),
	);
	const rawValues = names.map((series) =>
		orderedCategories.map((category) => rawMap.get(`${series}\0${category}`) ?? []),
	);
	const y2Values = names.map((series) =>
		orderedCategories.map((category) => y2Map.get(`${series}\0${category}`) ?? 0),
	);
	const notes = names.map((series) =>
		orderedCategories.map((category) => noteMap.get(`${series}\0${category}`) ?? []),
	);
	const y2Category = orderedCategories.map((category) => {
		const combined: number[] = [];
		for (const series of names) {
			combined.push(...(y2RawMap.get(`${series}\0${category}`) ?? []));
		}
		return combined.length > 0 ? aggregateNumbers(combined, settings.aggregation) : 0;
	});

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
		y2Values,
		y2Category,
		hasY2,
		notes,
		points,
		overall: overallValues.length > 0 ? aggregateNumbers(overallValues, settings.aggregation) : null,
		calendar,
	};
}
