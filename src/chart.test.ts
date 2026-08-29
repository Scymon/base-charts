import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateRows } from './aggregate.ts';
import { buildChartOption } from './chart.ts';
import { DEFAULT_EXCLUDED_TAGS, type ChartSettings, type ChartTheme } from './types.ts';

const theme: ChartTheme = {
	background: 'transparent',
	panel: '#1e1e1e',
	text: '#ddd',
	muted: '#999',
	border: '#333',
	accent: '#70b8ff',
	colors: ['#70b8ff', '#44cf6e'],
};

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

const data = aggregateRows(
	[
		{ xLabels: ['YouTube'], seriesLabels: [], y: 1200, xNumeric: null, fileName: 'a' },
		{ xLabels: ['TikTok'], seriesLabels: [], y: 4000, xNumeric: null, fileName: 'b' },
	],
	settings(),
);

describe('buildChartOption', () => {
	it('builds a bar series that can grow on first render', () => {
		const option = buildChartOption(data, settings(), theme, false);
		assert.equal((option.series as { type: string }[])[0]?.type, 'bar');
		assert.equal(option.animation, true);
		assert.ok((option.animationDuration as number) > 0);
	});

	it('builds pie and line options from the same data', () => {
		const pie = buildChartOption(data, settings({ chartType: 'pie' }), theme, false);
		const line = buildChartOption(data, settings({ chartType: 'line' }), theme, false);
		assert.equal((pie.series as { type: string }[])[0]?.type, 'pie');
		assert.equal((line.series as { type: string }[])[0]?.type, 'line');
	});

	it('disables motion when the user prefers reduced motion', () => {
		const option = buildChartOption(data, settings(), theme, true);
		assert.equal(option.animation, false);
		assert.equal(option.animationDuration, 0);
	});

	it('uses theme text colors instead of hardcoded light-theme ink', () => {
		const option = buildChartOption(data, settings(), theme, false);
		const legend = option.legend as { textStyle?: { color?: string } };
		assert.equal(legend.textStyle?.color, theme.muted);
		assert.equal(option.backgroundColor, 'transparent');
	});
});
