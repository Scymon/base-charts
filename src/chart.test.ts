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

	it('shows every rotated X label on a dense vertical bar chart', () => {
		const urls = [
			'https://x.com/jammles9',
			'https://x.com/alpha',
			'https://x.com/bravo',
			'https://x.com/charlie',
			'https://x.com/delta',
			'https://x.com/tyleraloevera',
			'https://x.com/echo',
			'https://x.com/foxtrot',
			'https://x.com/golf',
			'https://x.com/hotel',
			'https://x.com/JUFUR',
			'https://x.com/india',
		];
		const dense = aggregateRows(
			urls.map((url, index) => ({
				xLabels: [url],
				seriesLabels: [],
				y: 12000 - index * 700,
				xNumeric: null,
				fileName: `short-${index}`,
			})),
			settings(),
		);
		const option = buildChartOption(dense, settings(), theme, false);
		const xAxis = option.xAxis as {
			data?: string[];
			axisLabel?: { interval?: number | string; hideOverlap?: boolean; rotate?: number };
		};
		const grid = option.grid as { bottom?: number };
		assert.equal(xAxis.data?.length, 12);
		assert.equal(xAxis.axisLabel?.interval, 0);
		assert.equal(xAxis.axisLabel?.hideOverlap, false);
		assert.ok((xAxis.axisLabel?.rotate ?? 0) > 0);
		assert.ok((grid.bottom ?? 0) >= 80);
	});

	it('shows every category label on horizontal bar and heatmap axes', () => {
		const horizontal = buildChartOption(data, settings({ chartType: 'bar-horizontal' }), theme, false);
		const yAxis = horizontal.yAxis as {
			axisLabel?: { interval?: number | string; hideOverlap?: boolean; rotate?: number };
		};
		assert.equal(yAxis.axisLabel?.interval, 0);
		assert.equal(yAxis.axisLabel?.hideOverlap, false);
		assert.equal(yAxis.axisLabel?.rotate ?? 0, 0);

		const heat = buildChartOption(data, settings({ chartType: 'heatmap' }), theme, false);
		const heatX = heat.xAxis as { axisLabel?: { interval?: number; hideOverlap?: boolean; rotate?: number } };
		const heatY = heat.yAxis as { axisLabel?: { interval?: number; hideOverlap?: boolean } };
		assert.equal(heatX.axisLabel?.interval, 0);
		assert.equal(heatX.axisLabel?.hideOverlap, false);
		assert.ok((heatX.axisLabel?.rotate ?? 0) > 0);
		assert.equal(heatY.axisLabel?.interval, 0);
		assert.equal(heatY.axisLabel?.hideOverlap, false);
	});
});
