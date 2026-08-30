import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateNumbers, aggregateRows, boxFive, median } from './aggregate.ts';
import { DEFAULT_EXCLUDED_TAGS, type ChartSettings, type RawRow } from './types.ts';

const settings = (overrides: Partial<ChartSettings> = {}): ChartSettings => ({
	chartType: 'bar',
	xProperty: 'note.status',
	yProperty: 'note.amount',
	y2Property: null,
	seriesProperty: null,
	aggregation: 'median',
	filterEmptyY: true,
	sort: 'value-desc',
	showLegend: true,
	showLabels: false,
	showGrid: true,
	logY: false,
	excludedTags: DEFAULT_EXCLUDED_TAGS,
	maxCategories: 30,
	...overrides,
});

describe('median', () => {
	it('returns 0 for an empty list', () => {
		assert.equal(median([]), 0);
	});

	it('returns the middle value for an odd-length list', () => {
		assert.equal(median([9, 1, 5]), 5);
	});

	it('averages the two middle values for an even-length list', () => {
		assert.equal(median([1, 2, 3, 100]), 2.5);
	});
});

describe('aggregateNumbers', () => {
	it('supports count, sum, average, and median', () => {
		const values = [2, 4, 100];
		assert.equal(aggregateNumbers(values, 'count'), 3);
		assert.equal(aggregateNumbers(values, 'sum'), 106);
		assert.equal(aggregateNumbers(values, 'average'), 106 / 3);
		assert.equal(aggregateNumbers(values, 'median'), 4);
	});
});

describe('aggregateRows', () => {
	const rows: RawRow[] = [
		{ xLabels: ['alpha'], seriesLabels: [], y: 1200, xNumeric: null, fileName: 'a', filePath: 'a.md' },
		{ xLabels: ['alpha'], seriesLabels: [], y: 800, xNumeric: null, fileName: 'b', filePath: 'b.md' },
		{ xLabels: ['beta'], seriesLabels: [], y: 4000, xNumeric: null, fileName: 'c', filePath: 'c.md' },
		{ xLabels: ['alpha'], seriesLabels: [], y: null, xNumeric: null, fileName: 'd', filePath: 'd.md' },
	];

	it('defaults numeric data to median, not sum', () => {
		const result = aggregateRows(rows, settings());
		assert.deepEqual(result.categories, ['beta', 'alpha']);
		assert.equal(result.values[0]?.[0], 4000);
		assert.equal(result.values[0]?.[1], 1000);
		assert.equal(result.overall, 1200);
	});

	it('filters empty Y values by default', () => {
		const counted = aggregateRows(rows, settings({ aggregation: 'count' }));
		const alpha = counted.categories.indexOf('alpha');
		assert.equal(counted.values[0]?.[alpha], 2);

		const included = aggregateRows(rows, settings({ aggregation: 'count', filterEmptyY: false }));
		const alphaAll = included.categories.indexOf('alpha');
		assert.equal(included.values[0]?.[alphaAll], 3);
	});

	it('unnests list labels and excludes configured junk labels', () => {
		const tagged: RawRow[] = [
			{ xLabels: ['cooking', 'viral', 'viral-video'], seriesLabels: [], y: 900, xNumeric: null, fileName: 'one' },
			{ xLabels: ['cooking', 'comedy'], seriesLabels: [], y: 300, xNumeric: null, fileName: 'two' },
			{ xLabels: ['the-quartering'], seriesLabels: [], y: 9999, xNumeric: null, fileName: 'three' },
		];
		const result = aggregateRows(tagged, settings({ aggregation: 'average', sort: 'label-asc' }));
		assert.deepEqual(result.categories, ['comedy', 'cooking']);
		assert.equal(result.values[0]?.[0], 300);
		assert.equal(result.values[0]?.[1], 600);
	});

	it('splits series and sorts by label', () => {
		const split: RawRow[] = [
			{ xLabels: ['A'], seriesLabels: ['Main'], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['B'], seriesLabels: ['Alt'], y: 30, xNumeric: null, fileName: 'b' },
			{ xLabels: ['A'], seriesLabels: ['Alt'], y: 20, xNumeric: null, fileName: 'c' },
		];
		const result = aggregateRows(split, settings({ aggregation: 'sum', sort: 'label-asc' }));
		assert.deepEqual(result.categories, ['A', 'B']);
		assert.deepEqual([...result.seriesNames].sort(), ['Alt', 'Main']);
		const alt = result.seriesNames.indexOf('Alt');
		const main = result.seriesNames.indexOf('Main');
		assert.equal(result.values[alt]?.[0], 20);
		assert.equal(result.values[main]?.[0], 10);
		assert.equal(result.values[alt]?.[1], 30);
	});

	it('keeps raw Y values per category for boxplot', () => {
		const result = aggregateRows(rows, settings({ chartType: 'boxplot' }));
		const alpha = result.categories.indexOf('alpha');
		assert.deepEqual([...(result.rawValues[0]?.[alpha] ?? [])].sort((a, b) => a - b), [800, 1200]);
		assert.deepEqual(boxFive([800, 1200, 4000]), [800, 1000, 1200, 2600, 4000]);
	});

	it('aggregates an optional Y2 property without filtering the row', () => {
		const dual: RawRow[] = [
			{ xLabels: ['alpha'], seriesLabels: [], y: 100, y2: 0.04, xNumeric: null, fileName: 'a', filePath: 'a.md' },
			{ xLabels: ['alpha'], seriesLabels: [], y: 300, y2: 0.08, xNumeric: null, fileName: 'b', filePath: 'b.md' },
			{ xLabels: ['beta'], seriesLabels: [], y: 900, y2: null, xNumeric: null, fileName: 'c', filePath: 'c.md' },
		];
		const result = aggregateRows(dual, settings({ y2Property: 'note.rate' }));
		const alpha = result.categories.indexOf('alpha');
		assert.equal(result.hasY2, true);
		assert.equal(result.y2Category[alpha], 0.06);
		assert.equal(result.notes[0]?.[alpha]?.length, 2);
		assert.equal(result.notes[0]?.[alpha]?.[0]?.path, 'a.md');
	});

	it('skips empty series-by labels instead of inventing a Value series', () => {
		const mixed: RawRow[] = [
			{ xLabels: ['alpha'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['beta'], seriesLabels: [], y: 20, xNumeric: null, fileName: 'b' },
			{ xLabels: ['alpha'], seriesLabels: ['west'], y: 30, xNumeric: null, fileName: 'c' },
			{ xLabels: ['gamma'], seriesLabels: ['  '], y: 40, xNumeric: null, fileName: 'd' },
		];
		const result = aggregateRows(mixed, settings({ seriesProperty: 'note.group', aggregation: 'sum' }));
		assert.deepEqual([...result.seriesNames].sort(), ['east', 'west']);
		assert.equal(result.seriesNames.includes('Value'), false);
		assert.equal(result.categories.includes('beta'), false);
		assert.equal(result.categories.includes('gamma'), false);
		assert.ok(result.categories.includes('alpha'));
	});

	it('does not label a single unnamed series as Value when series-by is unset', () => {
		const result = aggregateRows(rows, settings());
		assert.equal(result.values.length, 1);
		assert.equal(result.seriesNames.includes('Value'), false);
	});

	it('keeps a real category named value that came from xLabels', () => {
		const tagged: RawRow[] = [
			{ xLabels: ['value'], seriesLabels: [], y: 12, xNumeric: null, fileName: 'one' },
			{ xLabels: ['topic'], seriesLabels: [], y: 8, xNumeric: null, fileName: 'two' },
		];
		const result = aggregateRows(tagged, settings({ aggregation: 'sum', sort: 'label-asc' }));
		assert.ok(result.categories.includes('value'));
		assert.equal(result.seriesNames.includes('Value'), false);
		const index = result.categories.indexOf('value');
		assert.equal(result.values[0]?.[index], 12);
	});

	it('orders ISO weeks by Time old → new even when Y is highest first', () => {
		const weeks: RawRow[] = [
			{ xLabels: ['2026-W32'], seriesLabels: ['Main'], y: 900, xNumeric: null, fileName: 'a' },
			{ xLabels: ['2026-W16'], seriesLabels: ['Main'], y: 100, xNumeric: null, fileName: 'b' },
			{ xLabels: ['2026-W35'], seriesLabels: ['Main'], y: 400, xNumeric: null, fileName: 'c' },
			{ xLabels: ['2026-W33'], seriesLabels: ['Main'], y: 200, xNumeric: null, fileName: 'd' },
		];
		const result = aggregateRows(weeks, settings({ chartType: 'area-stacked', aggregation: 'sum', sort: 'time-asc' }));
		const populated = result.categories.filter((_, index) => (result.values[0]?.[index] ?? 0) > 0);
		assert.deepEqual(populated, ['2026-W16', '2026-W32', '2026-W33', '2026-W35']);
		assert.ok(result.categories.indexOf('2026-W16') < result.categories.indexOf('2026-W32'));
		assert.ok(result.categories.indexOf('2026-W32') < result.categories.indexOf('2026-W33'));
	});

	it('Label A–Z keeps zero-padded ISO weeks in calendar order', () => {
		const weeks: RawRow[] = [
			{ xLabels: ['2026-W32'], seriesLabels: [], y: 900, xNumeric: null, fileName: 'a' },
			{ xLabels: ['2026-W16'], seriesLabels: [], y: 100, xNumeric: null, fileName: 'b' },
			{ xLabels: ['2026-W35'], seriesLabels: [], y: 400, xNumeric: null, fileName: 'c' },
		];
		const result = aggregateRows(weeks, settings({ sort: 'label-asc', aggregation: 'sum' }));
		const populated = result.categories.filter((_, index) => (result.values[0]?.[index] ?? 0) > 0);
		assert.deepEqual(populated, ['2026-W16', '2026-W32', '2026-W35']);
	});

	it('still sorts tag charts by value high to low', () => {
		const tagged: RawRow[] = [
			{ xLabels: ['cooking'], seriesLabels: [], y: 100, xNumeric: null, fileName: 'a' },
			{ xLabels: ['comedy'], seriesLabels: [], y: 500, xNumeric: null, fileName: 'b' },
		];
		const result = aggregateRows(tagged, settings({ sort: 'value-desc', aggregation: 'sum' }));
		assert.deepEqual(result.categories, ['comedy', 'cooking']);
	});

	it('fills missing weeks on a time axis so empty periods stay on the calendar', () => {
		const weeks: RawRow[] = [
			{ xLabels: ['2026-W01'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['2026-W10'], seriesLabels: ['east'], y: 20, xNumeric: null, fileName: 'b' },
			{ xLabels: ['2026-W10'], seriesLabels: ['west'], y: 5, xNumeric: null, fileName: 'c' },
		];
		const result = aggregateRows(
			weeks,
			settings({ chartType: 'area-stacked', aggregation: 'sum', sort: 'time-asc', filterEmptyY: true }),
		);
		assert.equal(result.categories.length, 10);
		assert.deepEqual(result.categories.slice(0, 3), ['2026-W01', '2026-W02', '2026-W03']);
		assert.equal(result.categories[9], '2026-W10');
		const east = result.seriesNames.indexOf('east');
		assert.equal(result.values[east]?.[0], 10);
		assert.equal(result.values[east]?.[1], 0);
		assert.equal(result.values[east]?.[9], 20);
		assert.deepEqual(result.notes[east]?.[1], []);
	});

	it('does not drop a time axis with maxCategories; empty weeks are 0 on the real label', () => {
		const weeks: RawRow[] = [
			{ xLabels: ['2026-W10'], seriesLabels: [], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['2026-W12'], seriesLabels: [], y: 999, xNumeric: null, fileName: 'b' },
			{ xLabels: ['2026-W20'], seriesLabels: [], y: 5, xNumeric: null, fileName: 'c' },
			{ xLabels: ['2026-W21'], seriesLabels: [], y: 7, xNumeric: null, fileName: 'd' },
			{ xLabels: [], seriesLabels: [], y: 3, xNumeric: null, fileName: 'orphan' },
			{ xLabels: ['(empty)'], seriesLabels: [], y: 4, xNumeric: null, fileName: 'placeholder' },
		];
		const result = aggregateRows(
			weeks,
			settings({ chartType: 'line', aggregation: 'sum', sort: 'time-asc', maxCategories: 2 }),
		);
		assert.ok(result.categories.includes('2026-W10'));
		assert.ok(result.categories.includes('2026-W12'));
		assert.ok(result.categories.includes('2026-W20'));
		assert.ok(result.categories.includes('2026-W21'));
		assert.ok(result.categories.includes('2026-W11'));
		assert.equal(result.categories.includes('(empty)'), false);
		assert.equal(result.values[0]?.[result.categories.indexOf('2026-W11')], 0);
		assert.ok(result.categories.length >= 12);
	});

	it('sorts unpadded calendar days by timestamp on Time new → old', () => {
		const days: RawRow[] = [
			{ xLabels: ['2026-8-9'], seriesLabels: [], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['2026-8-28'], seriesLabels: [], y: 20, xNumeric: null, fileName: 'b' },
			{ xLabels: ['2026-8-3'], seriesLabels: [], y: 30, xNumeric: null, fileName: 'c' },
			{ xLabels: ['2026-8-10'], seriesLabels: [], y: 40, xNumeric: null, fileName: 'd' },
		];
		const result = aggregateRows(
			days,
			settings({ chartType: 'area', aggregation: 'sum', sort: 'time-desc', maxCategories: 80 }),
		);
		const populated = result.categories.filter((_, index) => (result.values[0]?.[index] ?? 0) > 0);
		assert.deepEqual(populated, ['2026-8-28', '2026-8-10', '2026-8-9', '2026-8-3']);
		assert.equal(result.categories.includes('(empty)'), false);
	});

	it('does not treat gggg-mm-D triples as a time axis', () => {
		const bogus: RawRow[] = [
			{ xLabels: ['2026-55-16'], seriesLabels: [], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['2026-45-5'], seriesLabels: [], y: 20, xNumeric: null, fileName: 'b' },
			{ xLabels: ['2026-45-28'], seriesLabels: [], y: 30, xNumeric: null, fileName: 'c' },
		];
		const result = aggregateRows(
			bogus,
			settings({ chartType: 'area', aggregation: 'sum', sort: 'time-desc', maxCategories: 80 }),
		);
		assert.equal(result.categories.includes('2026-02-01'), false);
		assert.ok(result.categories.length <= 3);
		assert.deepEqual([...result.categories].sort(), ['2026-45-28', '2026-45-5', '2026-55-16']);
	});

	it('still caps tag charts with maxCategories', () => {
		const tagged: RawRow[] = Array.from({ length: 8 }, (_, index) => ({
			xLabels: [`topic-${index}`],
			seriesLabels: [],
			y: 100 - index,
			xNumeric: null,
			fileName: `n-${index}`,
		}));
		const result = aggregateRows(tagged, settings({ sort: 'value-desc', maxCategories: 3 }));
		assert.deepEqual(result.categories, ['topic-0', 'topic-1', 'topic-2']);
	});

	it('does not stretch a time axis to W52 when the last real week is W35', () => {
		const now = Date.UTC(2026, 7, 30);
		const weeks: RawRow[] = [
			{ xLabels: ['2026-W22'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['2026-W35'], seriesLabels: ['east'], y: 20, xNumeric: null, fileName: 'b' },
			{ xLabels: ['2026-W52'], seriesLabels: ['east'], y: 1, xNumeric: null, fileName: 'stray' },
		];
		const result = aggregateRows(
			weeks,
			settings({ chartType: 'area-stacked', aggregation: 'sum', sort: 'time-asc' }),
			{ nowMs: now },
		);
		assert.equal(result.categories[0], '2026-W22');
		assert.equal(result.categories[result.categories.length - 1], '2026-W35');
		assert.equal(result.categories.includes('2026-W36'), false);
		assert.equal(result.categories.includes('2026-W52'), false);
		assert.equal(result.categories.includes('(empty)'), false);
		assert.ok(result.categories.includes('2026-W28'));
	});

	it('does not invent empty weeks on sankey', () => {
		const weeks: RawRow[] = [
			{ xLabels: ['2026-W01'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['2026-W10'], seriesLabels: ['east'], y: 20, xNumeric: null, fileName: 'b' },
		];
		const result = aggregateRows(weeks, settings({ chartType: 'sankey', aggregation: 'sum', sort: 'time-asc' }));
		assert.deepEqual(result.categories, ['2026-W01', '2026-W10']);
	});

	it('uses file names as bar-race contestants when series-by is empty', () => {
		const dated: RawRow[] = [
			{ xLabels: ['2024-01-01'], seriesLabels: [], y: 10, xNumeric: null, fileName: 'north' },
			{ xLabels: ['2024-02-01'], seriesLabels: [], y: 20, xNumeric: null, fileName: 'south' },
			{ xLabels: ['2024-02-01'], seriesLabels: [], y: 8, xNumeric: null, fileName: 'north' },
		];
		const result = aggregateRows(dated, settings({ chartType: 'bar-race', aggregation: 'sum' }));
		assert.ok(result.seriesNames.includes('north'));
		assert.ok(result.seriesNames.includes('south'));
		assert.deepEqual(result.categories, ['2024-01-01', '2024-02-01']);
	});
});
