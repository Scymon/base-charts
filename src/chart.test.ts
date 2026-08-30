import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateRows } from './aggregate.ts';
import { buildChartOption, logSafeValue } from './chart.ts';
import { pickOpenNote, resolveClickNotes } from './click.ts';
import { DEFAULT_EXCLUDED_TAGS, type ChartSettings, type ChartTheme, type RawRow } from './types.ts';

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
	xProperty: 'note.topic',
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

const rows: RawRow[] = [
	{ xLabels: ['alpha'], seriesLabels: [], y: 1200, y2: 0.03, xNumeric: null, fileName: 'north', filePath: 'notes/north.md' },
	{ xLabels: ['beta'], seriesLabels: [], y: 4000, y2: 0.08, xNumeric: null, fileName: 'south', filePath: 'notes/south.md' },
];

const data = aggregateRows(rows, settings());

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
		const series = (option.series as { universalTransition?: unknown; animationDelay?: unknown }[])[0];
		assert.equal(option.animation, false);
		assert.equal(option.animationDuration, 0);
		assert.equal(option.animationDelay, 0);
		assert.equal(series?.universalTransition, false);
	});

	it('staggers enter and enables universal transition when motion is allowed', () => {
		const option = buildChartOption(data, settings(), theme, false);
		const series = (option.series as { universalTransition?: { enabled?: boolean }; animationDelay?: (idx: number) => number }[])[0];
		assert.equal(option.animation, true);
		assert.ok((option.animationDuration as number) >= 900);
		assert.equal(typeof series?.animationDelay, 'function');
		assert.equal(series?.animationDelay?.(2), 80);
		assert.equal(series?.universalTransition?.enabled, true);
	});

	it('builds a boxplot from raw per-note Y values, not a median of medians', () => {
		const raw = aggregateRows(
			[
				{ xLabels: ['topic-a'], seriesLabels: [], y: 100, xNumeric: null, fileName: 'low' },
				{ xLabels: ['topic-a'], seriesLabels: [], y: 200, xNumeric: null, fileName: 'mid' },
				{ xLabels: ['topic-a'], seriesLabels: [], y: 300, xNumeric: null, fileName: 'high' },
				{ xLabels: ['topic-a'], seriesLabels: [], y: 4000, xNumeric: null, fileName: 'outlier' },
			],
			settings({ chartType: 'boxplot', aggregation: 'median' }),
		);
		const option = buildChartOption(raw, settings({ chartType: 'boxplot' }), theme, false);
		const series = (option.series as { type: string; data: { value: number[] }[] }[])[0];
		assert.equal(series?.type, 'boxplot');
		const five = series?.data[0]?.value ?? [];
		assert.equal(five[0], 100);
		assert.equal(five[2], 250);
		assert.equal(five[4], 4000);
		assert.notEqual(five[4], 250);
	});

	it('builds stacked bar and nightingale options', () => {
		const stacked = buildChartOption(data, settings({ chartType: 'bar-stacked' }), theme, false);
		const rose = buildChartOption(data, settings({ chartType: 'rose' }), theme, false);
		assert.equal((stacked.series as { stack?: string }[])[0]?.stack, 'total');
		assert.equal((rose.series as { roseType?: string }[])[0]?.roseType, 'area');
	});

	it('shows every rotated X label on cartesian charts', () => {
		const option = buildChartOption(data, settings(), theme, false);
		const xAxis = option.xAxis as { axisLabel?: { interval?: number; hideOverlap?: boolean; rotate?: number } };
		assert.equal(xAxis.axisLabel?.interval, 0);
		assert.equal(xAxis.axisLabel?.hideOverlap, false);
		assert.ok((xAxis.axisLabel?.rotate ?? 0) > 0);
	});

	it('uses theme text colors instead of hardcoded light-theme ink', () => {
		const option = buildChartOption(data, settings(), theme, false);
		const legend = option.legend as { textStyle?: { color?: string } };
		assert.equal(legend.textStyle?.color, theme.muted);
		assert.equal(option.backgroundColor, 'transparent');
	});

	it('shows every rotated X label on a dense vertical bar chart', () => {
		const labels = [
			'source-jammles9',
			'source-alpha',
			'source-bravo',
			'source-charlie',
			'source-delta',
			'source-echo-long',
			'source-echo',
			'source-foxtrot',
			'source-golf',
			'source-hotel',
			'source-india-long',
			'source-india',
		];
		const dense = aggregateRows(
			labels.map((label, index) => ({
				xLabels: [label],
				seriesLabels: [],
				y: 12000 - index * 700,
				xNumeric: null,
				fileName: `note-${index}`,
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
		assert.ok((grid.bottom ?? 0) >= 100);
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

	it('uses a log Y axis on bar charts and does not crash on zero', () => {
		const withZero = aggregateRows(
			[
				{ xLabels: ['alpha'], seriesLabels: [], y: 0, xNumeric: null, fileName: 'zero', filePath: 'zero.md' },
				{ xLabels: ['beta'], seriesLabels: [], y: 10000, xNumeric: null, fileName: 'high', filePath: 'high.md' },
			],
			settings({ logY: true }),
		);
		assert.equal(logSafeValue(0, true), null);
		assert.equal(logSafeValue(10000, true), 10000);
		const option = buildChartOption(withZero, settings({ logY: true }), theme, false);
		const yAxis = option.yAxis as { type?: string };
		assert.equal(yAxis.type, 'log');
		const seriesData = (option.series as { data: { name: string; value: number | null; raw?: number }[] }[])[0]?.data ?? [];
		const zeroPoint = seriesData.find((item) => item.name === 'alpha');
		assert.equal(zeroPoint?.value, null);
		assert.equal(zeroPoint?.raw, 0);
	});

	it('builds combo with a Y2 line and a second axis', () => {
		const dual = aggregateRows(rows, settings({ chartType: 'combo', y2Property: 'note.rate' }));
		const option = buildChartOption(dual, settings({ chartType: 'combo', y2Property: 'note.rate' }), theme, false);
		const series = option.series as { type: string; yAxisIndex?: number; name?: string }[];
		assert.equal(series[0]?.type, 'bar');
		assert.equal(series.some((item) => item.type === 'line' && item.yAxisIndex === 1), true);
		assert.ok(Array.isArray(option.yAxis));
		assert.equal((option.yAxis as unknown[]).length, 2);
	});

	it('degrades combo without Y2 to a normal bar', () => {
		const option = buildChartOption(data, settings({ chartType: 'combo' }), theme, false);
		const series = option.series as { type: string }[];
		assert.equal(series.length, 1);
		assert.equal(series[0]?.type, 'bar');
		assert.equal(Array.isArray(option.yAxis), false);
	});

	it('tooltip names the category, count, and example notes', () => {
		const option = buildChartOption(data, settings(), theme, false);
		const formatter = (option.tooltip as { formatter?: (params: unknown) => string }).formatter;
		assert.equal(typeof formatter, 'function');
		const html = formatter?.({ name: 'beta' }) ?? '';
		assert.match(html, /beta/);
		assert.match(html, /n /);
		assert.match(html, /south/);
	});

	it('maps a clicked category back to at least one file', () => {
		const mapped = resolveClickNotes(data, { name: 'beta' });
		assert.ok(mapped.length >= 1);
		assert.equal(mapped[0]?.path, 'notes/south.md');
		assert.equal(pickOpenNote(mapped)?.path, 'notes/south.md');
	});

	it('builds lollipop, dumbbell, and chord options', () => {
		const lollipop = buildChartOption(data, settings({ chartType: 'lollipop' }), theme, false);
		const dumbbell = buildChartOption(data, settings({ chartType: 'dumbbell' }), theme, false);
		const chord = buildChartOption(
			aggregateRows(
				[
					{ xLabels: ['alpha'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
					{ xLabels: ['beta'], seriesLabels: ['west'], y: 20, xNumeric: null, fileName: 'b' },
				],
				settings({ chartType: 'chord' }),
			),
			settings({ chartType: 'chord' }),
			theme,
			false,
		);
		const lollipopTypes = (lollipop.series as { type: string }[]).map((item) => item.type);
		assert.ok(lollipopTypes.includes('bar'));
		assert.ok(lollipopTypes.includes('scatter'));
		assert.equal((dumbbell.series as { type: string }[])[0]?.type, 'custom');
		assert.equal((chord.series as { type: string; layout?: string }[])[0]?.type, 'graph');
		assert.equal((chord.series as { layout?: string }[])[0]?.layout, 'circular');
	});

	it('keeps sankey as a sankey series with flow links', () => {
		const sankey = buildChartOption(
			aggregateRows(
				[
					{ xLabels: ['alpha'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
					{ xLabels: ['beta'], seriesLabels: ['west'], y: 20, xNumeric: null, fileName: 'b' },
				],
				settings({ chartType: 'sankey' }),
			),
			settings({ chartType: 'sankey' }),
			theme,
			false,
		);
		const series = (sankey.series as { type: string; links?: { source: string; target: string }[] }[])[0];
		assert.equal(series?.type, 'sankey');
		assert.ok((series?.links?.length ?? 0) > 0);
	});

	it('adds dataZoom on dense cartesian charts and skips zoom animation when reduced', () => {
		const labels = Array.from({ length: 20 }, (_, index) => `topic-${index}`);
		const dense = aggregateRows(
			labels.map((label, index) => ({
				xLabels: [label],
				seriesLabels: [],
				y: 1000 + index,
				xNumeric: null,
				fileName: `note-${index}`,
			})),
			settings({ maxCategories: 40 }),
		);
		const moving = buildChartOption(dense, settings({ maxCategories: 40 }), theme, false);
		const still = buildChartOption(dense, settings({ maxCategories: 40 }), theme, true);
		const zooms = moving.dataZoom as { type?: string; animation?: boolean }[];
		assert.ok(Array.isArray(zooms));
		assert.ok(zooms.some((item) => item.type === 'inside'));
		assert.ok(zooms.some((item) => item.type === 'slider'));
		assert.equal(still.animation, false);
		const stillSlider = (still.dataZoom as { type?: string; animation?: boolean }[]).find((item) => item.type === 'slider');
		assert.equal(stillSlider?.animation, false);
	});
});
