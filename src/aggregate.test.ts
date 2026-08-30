import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateNumbers, aggregateRows, boxFive, median } from './aggregate.ts';
import { DEFAULT_EXCLUDED_TAGS, type ChartSettings, type RawRow } from './types.ts';

const settings = (overrides: Partial<ChartSettings> = {}): ChartSettings => ({
	chartType: 'bar',
	xProperty: 'note.Source',
	yProperty: 'note.Score',
	seriesProperty: null,
	aggregation: 'median',
	filterEmptyY: true,
	sort: 'value-desc',
	showLegend: true,
	showLabels: false,
	showGrid: true,
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
	const shorts: RawRow[] = [
		{ xLabels: ['YouTube'], seriesLabels: [], y: 1200, xNumeric: null, fileName: 'a' },
		{ xLabels: ['YouTube'], seriesLabels: [], y: 800, xNumeric: null, fileName: 'b' },
		{ xLabels: ['TikTok'], seriesLabels: [], y: 4000, xNumeric: null, fileName: 'c' },
		{ xLabels: ['YouTube'], seriesLabels: [], y: null, xNumeric: null, fileName: 'd' },
	];

	it('defaults Score-style data to median, not sum', () => {
		const result = aggregateRows(shorts, settings());
		assert.deepEqual(result.categories, ['TikTok', 'YouTube']);
		assert.equal(result.values[0]?.[0], 4000);
		assert.equal(result.values[0]?.[1], 1000);
		assert.equal(result.overall, 1200);
	});

	it('filters empty Y values by default', () => {
		const counted = aggregateRows(shorts, settings({ aggregation: 'count' }));
		const youtube = counted.categories.indexOf('YouTube');
		assert.equal(counted.values[0]?.[youtube], 2);

		const included = aggregateRows(shorts, settings({ aggregation: 'count', filterEmptyY: false }));
		const youtubeAll = included.categories.indexOf('YouTube');
		assert.equal(included.values[0]?.[youtubeAll], 3);
	});

	it('unnests list labels and excludes junk tags', () => {
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
		const rows: RawRow[] = [
			{ xLabels: ['A'], seriesLabels: ['Main'], y: 10, xNumeric: null, fileName: 'a' },
			{ xLabels: ['B'], seriesLabels: ['Clips'], y: 30, xNumeric: null, fileName: 'b' },
			{ xLabels: ['A'], seriesLabels: ['Clips'], y: 20, xNumeric: null, fileName: 'c' },
		];
		const result = aggregateRows(rows, settings({ aggregation: 'sum', sort: 'label-asc' }));
		assert.deepEqual(result.categories, ['A', 'B']);
		assert.deepEqual([...result.seriesNames].sort(), ['Clips', 'Main']);
		const clips = result.seriesNames.indexOf('Clips');
		const main = result.seriesNames.indexOf('Main');
		assert.equal(result.values[clips]?.[0], 20);
		assert.equal(result.values[main]?.[0], 10);
		assert.equal(result.values[clips]?.[1], 30);
	});

	it('keeps raw Y values per category for boxplot', () => {
		const result = aggregateRows(shorts, settings({ chartType: 'boxplot' }));
		const youtube = result.categories.indexOf('YouTube');
		assert.deepEqual([...(result.rawValues[0]?.[youtube] ?? [])].sort((a, b) => a - b), [800, 1200]);
		assert.deepEqual(boxFive([800, 1200, 4000]), [800, 1000, 1200, 2600, 4000]);
	});
});
