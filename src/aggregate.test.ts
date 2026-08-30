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
