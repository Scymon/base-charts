import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateRows } from './aggregate.ts';
import {
	applySeriesColorOverrides,
	legendColorNames,
	legendNameFromChartEvent,
	legendNameFromZrTarget,
	parseSeriesColors,
	toColorInputValue,
} from './seriesColors.ts';
import { DEFAULT_EXCLUDED_TAGS, type ChartSettings, type RawRow } from './types.ts';

const settings = (overrides: Partial<ChartSettings> = {}): ChartSettings => ({
	chartType: 'bar',
	xProperty: 'note.topic',
	yProperty: 'note.amount',
	y2Property: null,
	seriesProperty: null,
	aggregation: 'sum',
	filterEmptyY: true,
	sort: 'value-desc',
	showLegend: true,
	showLabels: false,
	showGrid: true,
	logY: false,
	excludedTags: DEFAULT_EXCLUDED_TAGS,
	maxCategories: 30,
	minCategoryNotes: 1,
	...overrides,
});

const splitRows: RawRow[] = [
	{ xLabels: ['alpha'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
	{ xLabels: ['alpha'], seriesLabels: ['west'], y: 20, xNumeric: null, fileName: 'b' },
	{ xLabels: ['beta'], seriesLabels: ['east'], y: 30, xNumeric: null, fileName: 'c' },
	{ xLabels: ['beta'], seriesLabels: ['west'], y: 40, xNumeric: null, fileName: 'd' },
];

describe('parseSeriesColors', () => {
	it('reads a map, JSON string, or empty input', () => {
		assert.deepEqual(parseSeriesColors({ East: '#Ff00Aa' }), { East: '#ff00aa' });
		assert.deepEqual(parseSeriesColors('{"west":"#00ff00"}'), { west: '#00ff00' });
		assert.deepEqual(parseSeriesColors({ east: 'rgb(16, 32, 48)' }), { east: '#102030' });
		assert.deepEqual(parseSeriesColors(null), {});
		assert.deepEqual(parseSeriesColors(''), {});
		assert.deepEqual(parseSeriesColors('nope'), {});
		assert.deepEqual(parseSeriesColors(['#ff0000']), {});
	});

	it('drops blank keys and non-colors', () => {
		assert.deepEqual(parseSeriesColors({ '  ': '#ff0000', east: 'nope', west: '#0f0' }), {
			west: '#00ff00',
		});
	});
});

describe('applySeriesColorOverrides', () => {
	it('overrides named series and leaves the rest on the theme palette', () => {
		const palette = ['#111111', '#222222', '#333333'];
		const next = applySeriesColorOverrides(palette, ['east', 'west', 'north'], { west: '#ff00aa' });
		assert.equal(next[0], '#111111');
		assert.equal(next[1], '#ff00aa');
		assert.equal(next[2], '#333333');
	});

	it('returns the theme palette unchanged when nothing is overridden', () => {
		const palette = ['#111111', '#222222'];
		assert.equal(applySeriesColorOverrides(palette, ['east'], {}), palette);
		assert.equal(applySeriesColorOverrides(palette, ['east']), palette);
	});
});

describe('legendColorNames', () => {
	it('uses series names for stacked area and categories for pie', () => {
		const data = aggregateRows(splitRows, settings({ seriesProperty: 'note.group' }));
		assert.deepEqual(legendColorNames('area-stacked', data).sort(), ['east', 'west']);
		assert.deepEqual(legendColorNames('pie', data), data.categories);
		assert.deepEqual(legendColorNames('bar', data).sort(), ['east', 'west']);
	});

	it('appends Y2 on combo when a second metric exists', () => {
		const data = aggregateRows(
			splitRows.map((row) => ({ ...row, y2: 0.1 })),
			settings({ chartType: 'combo', y2Property: 'note.rate', seriesProperty: 'note.group' }),
		);
		assert.ok(data.hasY2);
		assert.deepEqual(legendColorNames('combo', data), [...data.seriesNames, 'Y2']);
	});
});

describe('legend hit targets', () => {
	it('reads a legend item from the zrender parent chain', () => {
		const hit = {
			style: { fill: 'transparent' },
			parent: {
				__legendDataIndex: 1,
				parent: { __ecComponentInfo: { mainType: 'legend', index: 0 } },
			},
		};
		assert.equal(legendNameFromZrTarget(hit, ['east', 'west']), 'west');
	});

	it('ignores chart text that happens to match a series name', () => {
		const label = { style: { text: 'west' }, parent: { name: 'series' } };
		assert.equal(legendNameFromZrTarget(label, ['east', 'west']), null);
	});

	it('accepts an ECharts contextmenu payload on the legend', () => {
		assert.equal(
			legendNameFromChartEvent({ componentType: 'legend', name: 'west' }, ['east', 'west']),
			'west',
		);
		assert.equal(legendNameFromChartEvent({ componentType: 'series', name: 'west' }, ['east', 'west']), null);
		assert.equal(legendNameFromChartEvent({ componentType: 'legend', name: 'other' }, ['east', 'west']), null);
	});
});

describe('toColorInputValue', () => {
	it('normalizes hex for input[type=color]', () => {
		assert.equal(toColorInputValue('#0F0'), '#00ff00');
		assert.equal(toColorInputValue('not-a-color'), '#70b8ff');
	});
});
