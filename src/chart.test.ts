import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { aggregateRows } from './aggregate.ts';
import {
	buildChartOption,
	categoryWindowHint,
	chartCoordFamily,
	CHART_OPTION_REPLACE_MERGE,
	colorAlpha,
	hasDateCategories,
	initialCategoryWindow,
	icicleLabelVisible,
	SLIDER_HANDLE_ICON,
	SLIDER_HANDLE_SIZE,
	SLIDER_HEIGHT,
	logSafeValue,
	marimekkoWidths,
	shouldApplyLogY,
	shouldResetChart,
	sturgesBinCount,
	treemapLabelFormatter,
	treemapLabelLayout,
	usesCartesianGrid,
} from './chart.ts';
import { pickOpenNote, resolveClickNotes, shouldOpenNotesOnClick } from './click.ts';
import { CHART_TYPES, DEFAULT_EXCLUDED_TAGS, type ChartSettings, type ChartTheme, type RawRow } from './types.ts';

const theme: ChartTheme = {
	background: 'transparent',
	primary: '#1e1e1e',
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
		assert.equal(logSafeValue(-4, true), null);
		assert.equal(logSafeValue(10000, true), 10000);
		assert.equal(shouldApplyLogY(settings({ logY: true }), withZero), true);
		const option = buildChartOption(withZero, settings({ logY: true }), theme, false);
		const yAxis = option.yAxis as { type?: string };
		assert.equal(yAxis.type, 'log');
		const seriesData = (option.series as { data: { name: string; value: number | null; raw?: number }[] }[])[0]?.data ?? [];
		const zeroPoint = seriesData.find((item) => item.name === 'alpha');
		assert.equal(zeroPoint?.value, null);
		assert.equal(zeroPoint?.raw, 0);
		const highPoint = seriesData.find((item) => item.name === 'beta');
		assert.equal(highPoint?.value, 10000);
	});

	it('does not apply log Y when every value is non-positive, so bars still have heights', () => {
		const allNonPositive = aggregateRows(
			[
				{ xLabels: ['alpha'], seriesLabels: [], y: 0, xNumeric: null, fileName: 'zero' },
				{ xLabels: ['beta'], seriesLabels: [], y: -3, xNumeric: null, fileName: 'neg' },
			],
			settings({ logY: true }),
		);
		assert.equal(shouldApplyLogY(settings({ logY: true }), allNonPositive), false);
		const option = buildChartOption(allNonPositive, settings({ logY: true }), theme, false);
		const yAxis = option.yAxis as { type?: string };
		assert.equal(yAxis.type, 'value');
		const seriesData = (option.series as { data: { value: number | null }[] }[])[0]?.data ?? [];
		assert.ok(seriesData.length > 0);
		assert.ok(seriesData.every((item) => item.value != null));
	});

	it('omits a dummy Value series from heatmap and sunburst when some series-by labels are empty', () => {
		const mixed = aggregateRows(
			[
				{ xLabels: ['alpha'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
				{ xLabels: ['beta'], seriesLabels: [], y: 20, xNumeric: null, fileName: 'b' },
				{ xLabels: ['alpha'], seriesLabels: ['west'], y: 30, xNumeric: null, fileName: 'c' },
			],
			settings({ seriesProperty: 'note.group', aggregation: 'sum' }),
		);
		assert.deepEqual([...mixed.seriesNames].sort(), ['east', 'west']);
		assert.equal(mixed.seriesNames.includes('Value'), false);

		const heat = buildChartOption(mixed, settings({ chartType: 'heatmap' }), theme, false);
		const heatY = (heat.yAxis as { data?: string[] }).data ?? [];
		assert.deepEqual([...heatY].sort(), ['east', 'west']);
		assert.equal(heatY.includes('Value'), false);

		const sun = buildChartOption(mixed, settings({ chartType: 'sunburst' }), theme, false);
		const nodes = (sun.series as { data?: { name?: string; children?: { name?: string }[] }[] }[])[0]?.data ?? [];
		const names = nodes.flatMap((node) => [node.name, ...(node.children?.map((child) => child.name) ?? [])]);
		assert.equal(names.includes('Value'), false);
		assert.ok(names.includes('east'));
		assert.ok(names.includes('west'));
	});

	it('does not name the lone heatmap row or sunburst ring Value when series-by is unset', () => {
		const heat = buildChartOption(data, settings({ chartType: 'heatmap' }), theme, false);
		const heatY = (heat.yAxis as { data?: string[] }).data ?? [];
		assert.equal(heatY.includes('Value'), false);
		assert.equal(heatY.length, 1);

		const sun = buildChartOption(data, settings({ chartType: 'sunburst' }), theme, false);
		const nodes = (sun.series as { data?: { name?: string }[] }[])[0]?.data ?? [];
		assert.equal(nodes.some((node) => node.name === 'Value'), false);
		assert.ok(nodes.some((node) => node.name === 'alpha'));
	});

	it('still charts a real x-axis category named value', () => {
		const tagged = aggregateRows(
			[
				{ xLabels: ['value'], seriesLabels: [], y: 12, xNumeric: null, fileName: 'one' },
				{ xLabels: ['topic'], seriesLabels: [], y: 8, xNumeric: null, fileName: 'two' },
			],
			settings({ aggregation: 'sum' }),
		);
		assert.ok(tagged.categories.includes('value'));
		const heat = buildChartOption(tagged, settings({ chartType: 'heatmap' }), theme, false);
		const heatX = (heat.xAxis as { data?: string[] }).data ?? [];
		assert.ok(heatX.includes('value'));
		assert.equal(((heat.yAxis as { data?: string[] }).data ?? []).includes('Value'), false);
		const sun = buildChartOption(tagged, settings({ chartType: 'sunburst' }), theme, false);
		const nodes = (sun.series as { data?: { name?: string }[] }[])[0]?.data ?? [];
		assert.ok(nodes.some((node) => node.name === 'value'));
		assert.equal(nodes.some((node) => node.name === 'Value'), false);
	});

	it('always includes grid on cartesian bar-family charts', () => {
		const types = ['bar', 'bar-horizontal', 'bar-stacked', 'bar-percent', 'combo', 'lollipop'] as const;
		for (const chartType of types) {
			assert.equal(usesCartesianGrid(chartType), true, chartType);
			const option = buildChartOption(data, settings({ chartType }), theme, false);
			assert.ok(option.grid, `${chartType} should include grid`);
			assert.equal(typeof option.grid, 'object');
		}
		assert.ok(CHART_OPTION_REPLACE_MERGE.includes('grid'));
		assert.ok(CHART_OPTION_REPLACE_MERGE.includes('tooltip'));
		assert.ok(CHART_OPTION_REPLACE_MERGE.includes('legend'));
	});

	it('does not let a scatter Likes formatter leak onto a heatmap tags tooltip', () => {
		const heatRows: RawRow[] = [
			{
				xLabels: ['alligator-gar'],
				seriesLabels: ['Jeremy Hambly'],
				y: 4158,
				xNumeric: 9,
				fileName: 'gar',
				filePath: 'notes/gar.md',
			},
			{
				xLabels: ['other-tag'],
				seriesLabels: ['Other'],
				y: 10,
				xNumeric: 1,
				fileName: 'other',
				filePath: 'notes/other.md',
			},
		];
		const scatterSettings = settings({
			chartType: 'scatter',
			xProperty: 'note.Likes',
			yProperty: 'note.Score',
		});
		const heatSettings = settings({
			chartType: 'heatmap',
			xProperty: 'note.tags',
			yProperty: 'note.Score',
			seriesProperty: 'note.Channel',
			aggregation: 'sum',
		});
		const scatterData = aggregateRows(heatRows, scatterSettings);
		const heatData = aggregateRows(heatRows, heatSettings);
		const scatter = buildChartOption(scatterData, scatterSettings, theme, false);
		const heat = buildChartOption(heatData, heatSettings, theme, false);
		const scatterFmt = (scatter.tooltip as { formatter?: (params: unknown) => string }).formatter;
		const heatFmt = (heat.tooltip as { formatter?: (params: unknown) => string }).formatter;
		assert.equal(typeof scatterFmt, 'function');
		assert.equal(typeof heatFmt, 'function');
		assert.notEqual(scatterFmt, heatFmt);

		const xIndex = heatData.categories.indexOf('alligator-gar');
		const yIndex = heatData.seriesNames.indexOf('Jeremy Hambly');
		const scatterHtml =
			scatterFmt?.({
				name: 'gar',
				value: [9, 4158],
				data: { name: 'gar', path: 'notes/gar.md' },
			}) ?? '';
		assert.match(scatterHtml, /Likes/);

		const heatHtml =
			heatFmt?.({
				value: [xIndex, yIndex, 4158],
				name: 'alligator-gar',
				seriesName: 'Jeremy Hambly',
			}) ?? '';
		assert.equal(heatHtml.includes('Likes'), false);
		assert.match(heatHtml, /alligator-gar/);
		assert.match(heatHtml, /tags alligator-gar/);
		assert.match(heatHtml, /Score 4158/);
		assert.match(heatHtml, /Channel Jeremy Hambly/);
		assert.equal(heatHtml.includes('9.0'), false);
		assert.equal(heatHtml.includes('Likes 9'), false);
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

	it('tooltip names the category, count, and every note in the bucket', () => {
		const option = buildChartOption(data, settings(), theme, false);
		const tooltip = option.tooltip as {
			formatter?: (params: unknown) => string;
			enterable?: boolean;
			extraCssText?: string;
		};
		assert.equal(typeof tooltip.formatter, 'function');
		assert.equal(tooltip.enterable, true);
		assert.equal(tooltip.extraCssText?.includes('max-height:40%'), false);
		const html = tooltip.formatter?.({ name: 'beta' }) ?? '';
		assert.match(html, /motion-chart-tooltip/);
		assert.match(html, /beta/);
		assert.match(html, /n /);
		assert.match(html, /south/);
		assert.match(html, /data-motion-note-path="notes\/south.md"/);
		assert.match(html, /4000/);
	});

	it('boxplot and scatter hover use the same file-list tooltip, not a dummy Value series', () => {
		const grouped = aggregateRows(
			[
				{ xLabels: ['fatigue'], seriesLabels: [], y: 100, xNumeric: null, fileName: 'low', filePath: 'low.md' },
				{ xLabels: ['fatigue'], seriesLabels: [], y: 4000, xNumeric: null, fileName: 'high', filePath: 'high.md' },
			],
			settings({ chartType: 'boxplot' }),
		);
		const box = buildChartOption(grouped, settings({ chartType: 'boxplot' }), theme, false);
		const boxHtml = (box.tooltip as { formatter?: (params: unknown) => string }).formatter?.({ name: 'fatigue' }) ?? '';
		assert.match(boxHtml, /low/);
		assert.match(boxHtml, /high/);
		assert.match(boxHtml, /n 2/);
		assert.equal(boxHtml.includes('Value'), false);

		const scatter = buildChartOption(
			aggregateRows(
				[
					{ xLabels: ['a'], seriesLabels: [], y: 42, xNumeric: 3, fileName: 'north', filePath: 'north.md' },
					{ xLabels: ['b'], seriesLabels: [], y: 7, xNumeric: 9, fileName: 'south', filePath: 'south.md' },
				],
				settings({ chartType: 'scatter' }),
			),
			settings({ chartType: 'scatter', xProperty: 'note.day', yProperty: 'note.amount' }),
			theme,
			false,
		);
		const scatterHtml =
			(scatter.tooltip as { formatter?: (params: unknown) => string }).formatter?.({
				name: 'north',
				value: [3, 42],
				data: { name: 'north', path: 'north.md' },
			}) ?? '';
		assert.match(scatterHtml, /north/);
		assert.match(scatterHtml, /amount 42/);
		assert.equal(scatterHtml.includes('south'), false);
		assert.equal(scatterHtml.includes('Value'), false);
		assert.equal(scatterHtml.includes('n 0'), false);
		assert.equal(scatterHtml.includes('Median 0'), false);
	});

	it('maps a clicked category back to at least one file', () => {
		const mapped = resolveClickNotes(data, { name: 'beta' });
		assert.ok(mapped.length >= 1);
		assert.equal(mapped[0]?.path, 'notes/south.md');
		assert.equal(pickOpenNote(mapped)?.path, 'notes/south.md');
	});

	it('maps a scatter point title back to its file when the X bucket was capped', () => {
		const rows = [
			...Array.from({ length: 12 }, (_, index) => ({
				xLabels: [`topic-${index}`],
				seriesLabels: ['Other'],
				y: 90_000 - index,
				xNumeric: index,
				fileName: `other-${index}`,
				filePath: `notes/other-${index}.md`,
			})),
			{
				xLabels: ['rare-tag'],
				seriesLabels: ['Jeremy Hambly'],
				y: 650_000,
				xNumeric: 42,
				fileName: 'Would You Be Creeped Out By This!',
				filePath: 'notes/creeped.md',
				title: 'Would You Be Creeped Out By This!',
			},
		];
		const scatterData = aggregateRows(
			rows,
			settings({ chartType: 'scatter', seriesProperty: 'note.channel', maxCategories: 5 }),
		);
		const mapped = resolveClickNotes(scatterData, { name: 'Would You Be Creeped Out By This!' });
		assert.equal(mapped[0]?.path, 'notes/creeped.md');
		assert.equal(pickOpenNote(mapped)?.path, 'notes/creeped.md');
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

	it('adds inside + pill slider dataZoom on dense cartesian charts', () => {
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
		const zooms = moving.dataZoom as {
			type?: string;
			height?: number;
			handleIcon?: string;
			handleSize?: string | number;
			fillerColor?: string;
			handleStyle?: { color?: string };
			emphasis?: { handleStyle?: { color?: string }; moveHandleStyle?: { color?: string } };
			yAxisIndex?: number;
			dataBackground?: {
				lineStyle?: { width?: number; color?: string };
				areaStyle?: { color?: unknown; opacity?: number };
			};
			selectedDataBackground?: {
				lineStyle?: { width?: number; color?: string };
				areaStyle?: { color?: unknown; opacity?: number };
			};
			showDetail?: boolean;
			brushSelect?: boolean;
		}[];
		assert.ok(Array.isArray(zooms));
		assert.ok(zooms.some((item) => item.type === 'inside'));
		const slider = zooms.find((item) => item.type === 'slider');
		assert.ok(slider);
		assert.equal(slider?.handleIcon, SLIDER_HANDLE_ICON);
		assert.match(slider?.handleIcon ?? '', /A50,50|circle/i);
		assert.equal(slider?.handleIcon?.includes('L8,20'), false);
		assert.equal(slider?.handleSize, SLIDER_HANDLE_SIZE);
		assert.equal(typeof slider?.handleSize, 'number');
		assert.ok((slider?.handleSize as number) >= 10 && (slider?.handleSize as number) <= 12);
		assert.notEqual(slider?.handleSize, '100%');
		assert.ok((slider?.height ?? 0) >= 10 && (slider?.height ?? 0) <= 12);
		assert.equal(slider?.height, SLIDER_HEIGHT);
		assert.ok(SLIDER_HEIGHT < 18);
		assert.equal(slider?.showDetail, false);
		assert.equal(slider?.brushSelect, false);
		assert.equal(slider?.dataBackground?.lineStyle?.width, 1);
		assert.equal(slider?.selectedDataBackground?.lineStyle?.width, 1);
		assert.equal(slider?.dataBackground?.lineStyle?.color, colorAlpha(theme.text, 0.28));
		assert.equal(slider?.selectedDataBackground?.lineStyle?.color, slider?.dataBackground?.lineStyle?.color);
		assert.equal(slider?.dataBackground?.areaStyle?.color, 'transparent');
		assert.equal(slider?.dataBackground?.areaStyle?.opacity, 0);
		assert.equal(slider?.selectedDataBackground?.areaStyle?.color, 'transparent');
		assert.equal(slider?.selectedDataBackground?.areaStyle?.opacity, 0);
		assert.equal(slider?.fillerColor, colorAlpha(theme.accent, 0.08));
		assert.equal(slider?.handleStyle?.color, colorAlpha(theme.accent, 0.28));
		assert.equal(slider?.emphasis?.handleStyle?.color, theme.accent);
		assert.equal(slider?.emphasis?.moveHandleStyle?.color, theme.accent);
		assert.equal((slider?.handleStyle?.color ?? '').includes('0.9'), false);
		assert.equal((slider?.handleStyle?.color ?? '').includes('0.78'), false);
		assert.notEqual(slider?.handleStyle?.color, theme.accent);

		const sideways = buildChartOption(
			dense,
			settings({ chartType: 'bar-horizontal', maxCategories: 40 }),
			theme,
			false,
		);
		const ySlider = (sideways.dataZoom as { type?: string; handleIcon?: string; yAxisIndex?: number; width?: number }[]).find(
			(item) => item.type === 'slider',
		);
		assert.ok(ySlider);
		assert.equal(ySlider?.handleIcon, SLIDER_HANDLE_ICON);
		assert.equal(ySlider?.yAxisIndex, 0);
		assert.equal(ySlider?.width, SLIDER_HEIGHT);
		const grid = moving.grid as { bottom?: number; containLabel?: boolean };
		assert.ok((grid.bottom ?? 0) >= 100 + 36);
		assert.equal(grid.containLabel, true);
		assert.equal(still.animation, false);
		assert.equal(categoryWindowHint(16, 20), '16 of 20 categories');
		assert.equal(categoryWindowHint(8, 8), null);
		assert.equal(categoryWindowHint(33, 33), null);
	});

	it('builds a finished treemap with roam, breadcrumb, and label overflow handling', () => {
		const option = buildChartOption(data, settings({ chartType: 'treemap' }), theme, false);
		const series = (option.series as {
			type?: string;
			roam?: boolean | string;
			nodeClick?: string | boolean;
			squareRatio?: number;
			leafDepth?: number;
			colorMappingBy?: string;
			breadcrumb?: { show?: boolean };
			label?: { overflow?: string; formatter?: unknown };
			labelLayout?: unknown;
			levels?: { upperLabel?: { show?: boolean } }[];
		}[])[0];
		assert.equal(series?.type, 'treemap');
		assert.equal(series?.roam, true);
		assert.equal(series?.nodeClick, 'zoomToNode');
		assert.equal(series?.squareRatio, 1);
		assert.equal(series?.leafDepth, 1);
		assert.equal(series?.colorMappingBy, 'value');
		assert.equal(series?.breadcrumb?.show, true);
		assert.equal(series?.label?.overflow, 'truncate');
		assert.equal(typeof series?.label?.formatter, 'function');
		assert.equal(typeof series?.labelLayout, 'function');
		assert.ok(option.visualMap);
		assert.equal(option.animation, true);
		const tiny = treemapLabelLayout({ rect: { width: 12, height: 10 } });
		assert.equal(tiny.fontSize, 0);
		const clipped = treemapLabelLayout({ rect: { width: 40, height: 20 }, text: 'travel' });
		assert.equal(clipped.fontSize, 0);
		const roomy = treemapLabelLayout({ rect: { width: 120, height: 48 }, text: 'comedy' });
		assert.ok((roomy.fontSize ?? 0) >= 11);
		assert.equal(treemapLabelFormatter({ name: 'alpha', value: 10 }, 100), 'alpha');
		assert.match(treemapLabelFormatter({ name: 'beta', value: 4000 }, 100), /beta/);
		assert.match(treemapLabelFormatter({ name: 'beta', value: 4000 }, 100), /4\.0k|4000/);
	});

	it('shows upper labels when series-by nests treemap children', () => {
		const nested = aggregateRows(
			[
				{ xLabels: ['alpha'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
				{ xLabels: ['beta'], seriesLabels: ['west'], y: 20, xNumeric: null, fileName: 'b' },
			],
			settings({ chartType: 'treemap' }),
		);
		const option = buildChartOption(nested, settings({ chartType: 'treemap' }), theme, false);
		const series = (option.series as {
			leafDepth?: number;
			levels?: { upperLabel?: { show?: boolean } }[];
		}[])[0];
		assert.equal(series?.leafDepth, 2);
		assert.equal(series?.levels?.[0]?.upperLabel?.show, true);
	});

	it('gives sunburst a min-angle and overflow pass', () => {
		const option = buildChartOption(data, settings({ chartType: 'sunburst' }), theme, false);
		const series = (option.series as { label?: { minAngle?: number; overflow?: string } }[])[0];
		assert.ok((series?.label?.minAngle ?? 0) >= 4);
		assert.equal(series?.label?.overflow, 'truncate');
	});

	it('adds the new chart types and they produce options', () => {
		const added = ['area-stacked', 'bar-percent', 'line-step', 'bar-polar', 'streamgraph', 'waffle'] as const;
		for (const type of added) {
			assert.ok(CHART_TYPES.includes(type));
			const option = buildChartOption(data, settings({ chartType: type }), theme, false);
			assert.ok(Array.isArray(option.series));
			assert.ok(((option.series as unknown[]) ?? []).length > 0);
		}
		const stackedArea = buildChartOption(data, settings({ chartType: 'area-stacked' }), theme, false);
		assert.equal((stackedArea.series as { type?: string; stack?: string; areaStyle?: unknown }[])[0]?.type, 'line');
		assert.equal((stackedArea.series as { stack?: string }[])[0]?.stack, 'total');
		assert.ok((stackedArea.series as { areaStyle?: unknown }[])[0]?.areaStyle);

		const percent = buildChartOption(
			aggregateRows(
				[
					{ xLabels: ['alpha'], seriesLabels: ['east'], y: 25, xNumeric: null, fileName: 'a' },
					{ xLabels: ['alpha'], seriesLabels: ['west'], y: 75, xNumeric: null, fileName: 'b' },
				],
				settings({ chartType: 'bar-percent' }),
			),
			settings({ chartType: 'bar-percent' }),
			theme,
			false,
		);
		assert.equal((percent.series as { type?: string; stack?: string }[])[0]?.type, 'bar');
		assert.equal((percent.series as { stack?: string }[])[0]?.stack, 'total');
		assert.equal((percent.yAxis as { max?: number }).max, 100);

		const step = buildChartOption(data, settings({ chartType: 'line-step' }), theme, false);
		assert.equal((step.series as { type?: string; step?: string }[])[0]?.type, 'line');
		assert.equal((step.series as { step?: string }[])[0]?.step, 'middle');

		const polar = buildChartOption(data, settings({ chartType: 'bar-polar' }), theme, false);
		assert.equal((polar.series as { coordinateSystem?: string }[])[0]?.coordinateSystem, 'polar');

		const stream = buildChartOption(data, settings({ chartType: 'streamgraph' }), theme, false);
		assert.equal((stream.series as { type?: string }[])[0]?.type, 'themeRiver');

		const waffle = buildChartOption(data, settings({ chartType: 'waffle' }), theme, false);
		assert.equal((waffle.series as { type?: string }[])[0]?.type, 'custom');
		assert.ok(((waffle.series as { data?: unknown[] }[])[0]?.data?.length ?? 0) > 0);
	});

	it('still disables animation on new types when reduced motion is on', () => {
		const option = buildChartOption(data, settings({ chartType: 'waffle' }), theme, true);
		assert.equal(option.animation, false);
		assert.equal(option.animationDuration, 0);
	});

	it('keeps combo tick format, log Y, and category interval settings', () => {
		const dual = aggregateRows(rows, settings({ chartType: 'combo', y2Property: 'note.rate' }));
		const combo = buildChartOption(dual, settings({ chartType: 'combo', y2Property: 'note.rate' }), theme, false);
		const axes = combo.yAxis as { axisLabel?: { formatter?: unknown } }[];
		assert.equal(typeof axes[0]?.axisLabel?.formatter, 'function');
		assert.equal(typeof axes[1]?.axisLabel?.formatter, 'function');
		const bar = buildChartOption(data, settings(), theme, false);
		const xAxis = bar.xAxis as { axisLabel?: { interval?: number; hideOverlap?: boolean } };
		assert.equal(xAxis.axisLabel?.interval, 0);
		assert.equal(xAxis.axisLabel?.hideOverlap, false);
	});

	it('opens notes on a treemap leaf but not an un-modified parent zoom click', () => {
		assert.equal(shouldOpenNotesOnClick({ name: 'alpha', data: { name: 'alpha' } }), true);
		assert.equal(
			shouldOpenNotesOnClick({ name: 'east', data: { name: 'east', children: [{ name: 'alpha' }] } }),
			false,
		);
		assert.equal(
			shouldOpenNotesOnClick({
				name: 'east',
				data: { name: 'east', children: [{ name: 'alpha' }] },
				event: { event: { ctrlKey: true, metaKey: false, altKey: false } },
			}),
			true,
		);
	});

	it('adds leftover chart types and they produce options', () => {
		const added = [
			'icicle',
			'tree',
			'parallel',
			'network',
			'marimekko',
			'bullet',
			'slope',
			'histogram',
			'violin',
			'bar-race',
		] as const;
		for (const type of added) {
			assert.ok(CHART_TYPES.includes(type));
			const option = buildChartOption(data, settings({ chartType: type }), theme, false);
			assert.ok(Array.isArray(option.series) || Array.isArray(option.options));
			const series = (option.series as unknown[]) ?? [];
			const framed = (option.options as { series?: unknown[] }[] | undefined) ?? [];
			assert.ok(series.length > 0 || framed.some((frame) => (frame.series?.length ?? 0) > 0));
		}
	});

	it('builds icicle from the same hierarchy and hides labels on thin rects', () => {
		const option = buildChartOption(data, settings({ chartType: 'icicle' }), theme, false);
		const series = (option.series as { type?: string; labelLayout?: unknown; data?: unknown[] }[])[0];
		assert.equal(series?.type, 'custom');
		assert.equal(typeof series?.labelLayout, 'function');
		assert.ok((series?.data?.length ?? 0) > 0);
		assert.equal(icicleLabelVisible(12, 40), false);
		assert.equal(icicleLabelVisible(80, 8), false);
		assert.equal(icicleLabelVisible(80, 20), true);
	});

	it('builds a roaming tree with leaf labels', () => {
		const option = buildChartOption(data, settings({ chartType: 'tree' }), theme, false);
		const series = (option.series as {
			type?: string;
			roam?: boolean;
			leaves?: { label?: { show?: boolean } };
		})[0];
		assert.equal(series?.type, 'tree');
		assert.equal(series?.roam, true);
		assert.equal(series?.leaves?.label?.show, true);
	});

	it('builds parallel coordinates with one series without crashing', () => {
		const option = buildChartOption(data, settings({ chartType: 'parallel' }), theme, false);
		assert.ok(Array.isArray(option.parallelAxis));
		assert.equal((option.parallelAxis as unknown[]).length, data.categories.length);
		assert.equal((option.series as { type?: string }[])[0]?.type, 'parallel');
		assert.equal((option.series as { data?: unknown[] }[])[0]?.data?.length, 1);
	});

	it('builds a network force graph with real X to series-by links', () => {
		const flow = aggregateRows(
			[
				{ xLabels: ['alpha'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
				{ xLabels: ['beta'], seriesLabels: ['west'], y: 20, xNumeric: null, fileName: 'b' },
			],
			settings({ chartType: 'network' }),
		);
		const option = buildChartOption(flow, settings({ chartType: 'network' }), theme, false);
		const series = (option.series as {
			type?: string;
			layout?: string;
			links?: { source: string; target: string }[];
		})[0];
		assert.equal(series?.type, 'graph');
		assert.equal(series?.layout, 'force');
		assert.ok((series?.links?.length ?? 0) > 0);
		assert.ok(series?.links?.some((link) => link.source === 'alpha' && link.target === 'east'));
		const bubbles = buildChartOption(flow, settings({ chartType: 'bubbles' }), theme, false);
		assert.equal((bubbles.series as { links?: unknown[] }[])[0]?.links?.length ?? 0, 0);
	});

	it('builds marimekko widths that sum to the full plot', () => {
		const split = aggregateRows(
			[
				{ xLabels: ['alpha'], seriesLabels: ['east'], y: 25, xNumeric: null, fileName: 'a' },
				{ xLabels: ['alpha'], seriesLabels: ['west'], y: 25, xNumeric: null, fileName: 'b' },
				{ xLabels: ['beta'], seriesLabels: ['east'], y: 50, xNumeric: null, fileName: 'c' },
			],
			settings({ chartType: 'marimekko', aggregation: 'sum' }),
		);
		const widths = marimekkoWidths(split);
		assert.ok(widths.length >= 2);
		assert.ok(Math.abs(widths.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
		const option = buildChartOption(split, settings({ chartType: 'marimekko' }), theme, false);
		assert.equal((option.series as { type?: string }[])[0]?.type, 'custom');
	});

	it('builds a bullet bar with a Y2 target, or the overall Y mark when Y2 is empty', () => {
		const dual = aggregateRows(rows, settings({ chartType: 'bullet', y2Property: 'note.rate' }));
		const withTarget = buildChartOption(
			dual,
			settings({ chartType: 'bullet', y2Property: 'note.rate' }),
			theme,
			false,
		);
		const series = withTarget.series as { type?: string; name?: string }[];
		assert.equal(series[0]?.type, 'bar');
		assert.equal(series[1]?.type, 'scatter');
		const plain = buildChartOption(data, settings({ chartType: 'bullet' }), theme, false);
		assert.equal((plain.series as { name?: string }[])[1]?.name, 'median');
	});

	it('degrades slope to lollipop when there are fewer than two series', () => {
		const option = buildChartOption(data, settings({ chartType: 'slope' }), theme, false);
		const types = (option.series as { type?: string }[]).map((item) => item.type);
		assert.ok(types.includes('bar'));
		assert.ok(types.includes('scatter'));
		const split = aggregateRows(
			[
				{ xLabels: ['alpha'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
				{ xLabels: ['alpha'], seriesLabels: ['west'], y: 30, xNumeric: null, fileName: 'b' },
				{ xLabels: ['beta'], seriesLabels: ['east'], y: 20, xNumeric: null, fileName: 'c' },
				{ xLabels: ['beta'], seriesLabels: ['west'], y: 5, xNumeric: null, fileName: 'd' },
			],
			settings({ chartType: 'slope' }),
		);
		const slope = buildChartOption(split, settings({ chartType: 'slope' }), theme, false);
		assert.equal((slope.series as { type?: string }[])[0]?.type, 'line');
		assert.ok(((slope.series as unknown[]) ?? []).length >= 2);
	});

	it('bins raw Y values for histogram and violin, not aggregated medians', () => {
		const rawRows = [
			{ xLabels: ['topic-a'], seriesLabels: [], y: 100, xNumeric: null, fileName: 'low' },
			{ xLabels: ['topic-a'], seriesLabels: [], y: 200, xNumeric: null, fileName: 'mid' },
			{ xLabels: ['topic-a'], seriesLabels: [], y: 300, xNumeric: null, fileName: 'high' },
			{ xLabels: ['topic-a'], seriesLabels: [], y: 4000, xNumeric: null, fileName: 'outlier' },
		];
		const raw = aggregateRows(rawRows, settings({ chartType: 'histogram', aggregation: 'median' }));
		assert.equal(raw.values[0]?.[0], 250);
		const histogram = buildChartOption(raw, settings({ chartType: 'histogram' }), theme, false);
		const histData = (histogram.series as { type?: string; data?: { value?: number[] }[] }[])[0];
		assert.equal(histData?.type, 'bar');
		const mids = (histData?.data ?? []).map((item) => Number(item.value?.[0] ?? 0));
		assert.ok(Math.max(...mids) > 250);
		assert.ok(Math.max(...mids) >= 300);
		assert.ok(sturgesBinCount(4) >= 3);

		const violin = buildChartOption(
			aggregateRows(rawRows, settings({ chartType: 'violin', aggregation: 'median' })),
			settings({ chartType: 'violin' }),
			theme,
			false,
		);
		const violinSeries = (violin.series as { type?: string; data?: { bins?: { mid: number; count: number }[] }[] }[])[0];
		assert.equal(violinSeries?.type, 'custom');
		const bins = violinSeries?.data?.[0]?.bins ?? [];
		assert.ok(bins.some((bin) => bin.mid > 250 && bin.count > 0));
		assert.ok(bins.reduce((sum, bin) => sum + bin.count, 0) === 4);
	});

	it('keeps every time category on the axis and windows the recent slice with a slider', () => {
		const weeks = Array.from({ length: 33 }, (_, index) => {
			const week = index + 1;
			return {
				xLabels: [`2026-W${String(week).padStart(2, '0')}`],
				seriesLabels: ['east'],
				y: 33 - index,
				xNumeric: null,
				fileName: `note-${week}`,
			};
		});
		const stacked = aggregateRows(
			weeks,
			settings({ chartType: 'area-stacked', aggregation: 'sum', sort: 'time-asc', maxCategories: 12 }),
		);
		assert.ok(stacked.categories.length >= 33);
		assert.equal(stacked.categories[0], '2026-W01');
		assert.equal(stacked.categories.includes('(empty)'), false);
		assert.equal(hasDateCategories(stacked.categories), true);
		assert.equal(initialCategoryWindow(stacked.categories, 12), 12);
		const option = buildChartOption(
			stacked,
			settings({ chartType: 'area-stacked', sort: 'time-asc', maxCategories: 12 }),
			theme,
			false,
		);
		const zooms = option.dataZoom as { type?: string; start?: number; end?: number }[] | undefined;
		assert.ok(Array.isArray(zooms));
		assert.ok(zooms.some((item) => item.type === 'inside'));
		assert.ok(zooms.some((item) => item.type === 'slider'));
		for (const zoom of zooms ?? []) {
			assert.ok((zoom.start ?? 0) > 0);
			assert.equal(zoom.end, 100);
		}
		const xAxis = option.xAxis as { data?: string[] };
		assert.equal(xAxis.data?.length, stacked.categories.length);
		assert.equal(xAxis.data?.includes('(empty)'), false);
		assert.equal(categoryWindowHint(12, stacked.categories.length), '12 of 33 categories');
	});

	it('puts a bottom slider on a dense calendar-day area chart', () => {
		const now = Date.UTC(2026, 7, 30);
		const days = Array.from({ length: 36 }, (_, index) => {
			const date = new Date(Date.UTC(2026, 5, 1 + index));
			const label = date.toISOString().slice(0, 10);
			return {
				xLabels: [label],
				seriesLabels: [],
				y: 10 + index,
				xNumeric: null,
				fileName: `note-${label}`,
			};
		});
		const data = aggregateRows(
			days,
			settings({ chartType: 'area', aggregation: 'median', sort: 'time-desc', maxCategories: 36 }),
			{ nowMs: now },
		);
		assert.equal(data.categories.length, 36);
		assert.equal(data.categories[0], '2026-07-06');
		assert.equal(data.categories[35], '2026-06-01');
		const option = buildChartOption(
			data,
			settings({ chartType: 'area', sort: 'time-desc', maxCategories: 36 }),
			theme,
			false,
		);
		const zooms = option.dataZoom as { type?: string }[] | undefined;
		assert.ok(Array.isArray(zooms));
		assert.ok(zooms.some((item) => item.type === 'inside'));
		assert.ok(zooms.some((item) => item.type === 'slider'));
		const grid = option.grid as { bottom?: number };
		assert.ok((grid.bottom ?? 0) >= 100);
	});

	it('keeps the 16-category zoom window on dense tag charts', () => {
		const labels = Array.from({ length: 20 }, (_, index) => `topic-${index}`);
		assert.equal(initialCategoryWindow(labels), 16);
		assert.equal(hasDateCategories(labels), false);
	});

	it('degrades bar race to a ranked bar when X is not dates', () => {
		assert.equal(hasDateCategories(['alpha', 'beta']), false);
		const option = buildChartOption(data, settings({ chartType: 'bar-race' }), theme, false);
		assert.equal(option.timeline, undefined);
		assert.equal((option.series as { type?: string }[])[0]?.type, 'bar');
	});

	it('plays a bar race when X parses as dates', () => {
		const dated = aggregateRows(
			[
				{ xLabels: ['2024-01-01'], seriesLabels: ['east'], y: 10, xNumeric: null, fileName: 'a' },
				{ xLabels: ['2024-02-01'], seriesLabels: ['east'], y: 30, xNumeric: null, fileName: 'b' },
				{ xLabels: ['2024-01-01'], seriesLabels: ['west'], y: 20, xNumeric: null, fileName: 'c' },
				{ xLabels: ['2024-02-01'], seriesLabels: ['west'], y: 12, xNumeric: null, fileName: 'd' },
			],
			settings({ chartType: 'bar-race', aggregation: 'sum' }),
		);
		assert.equal(hasDateCategories(dated.categories), true);
		const option = buildChartOption(dated, settings({ chartType: 'bar-race' }), theme, false);
		assert.ok(option.timeline);
		assert.equal((option.timeline as { autoPlay?: boolean }).autoPlay, true);
		assert.equal((option.options as unknown[] | undefined)?.length, dated.categories.length);
		const still = buildChartOption(dated, settings({ chartType: 'bar-race' }), theme, true);
		assert.equal(still.animation, false);
		assert.equal((still.timeline as { autoPlay?: boolean }).autoPlay, false);
	});

	it('resets the echarts instance when the coordinate family changes', () => {
		assert.equal(shouldResetChart(null, 'bar'), false);
		assert.equal(shouldResetChart('bar', 'bar'), false);
		assert.equal(shouldResetChart('bar', 'bar-horizontal'), false);
		assert.equal(shouldResetChart('bar', 'bar-stacked'), false);
		assert.equal(shouldResetChart('bar', 'bar-percent'), false);
		assert.equal(shouldResetChart('bar', 'combo'), false);
		assert.equal(shouldResetChart('bar', 'lollipop'), false);
		assert.equal(shouldResetChart('bar', 'line'), false);
		assert.equal(shouldResetChart('pie', 'doughnut'), false);
		assert.equal(shouldResetChart('pie', 'bar'), true);
		assert.equal(shouldResetChart('rose', 'bar-horizontal'), true);
		assert.equal(shouldResetChart('sankey', 'bar'), true);
		assert.equal(shouldResetChart('treemap', 'bar-stacked'), true);
		assert.equal(shouldResetChart('calendar', 'combo'), true);
		assert.equal(shouldResetChart('bar-polar', 'bar'), true);
		assert.equal(shouldResetChart('streamgraph', 'lollipop'), true);
		assert.equal(shouldResetChart('radar', 'bar'), true);
		assert.equal(chartCoordFamily('waffle'), 'cartesian');
		assert.equal(chartCoordFamily('icicle'), 'cartesian');
		assert.equal(shouldResetChart('waffle', 'bar'), false);
	});

	it('still disables animation on leftover types when reduced motion is on', () => {
		for (const type of ['icicle', 'network', 'histogram', 'violin', 'marimekko'] as const) {
			const option = buildChartOption(data, settings({ chartType: type }), theme, true);
			assert.equal(option.animation, false);
			assert.equal(option.animationDuration, 0);
		}
	});
});

describe('chart chrome css', () => {
	it('clips the view and canvas so the pane never gets a native scrollbar', () => {
		const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8');
		assert.match(css, /\.motion-chart-view\s*\{[^}]*overflow:\s*hidden/s);
		assert.match(css, /\.motion-chart-canvas\s*\{[^}]*overflow:\s*hidden/s);
		assert.match(css, /\.motion-chart-view\s*\{[^}]*width:\s*100%/s);
		assert.match(css, /\.motion-chart-canvas\s*\{[^}]*width:\s*100%/s);
		assert.match(css, /\.motion-chart-canvas\s*\{[^}]*height:\s*100%/s);
		assert.match(css, /\.motion-chart-view\s*\{[^}]*box-sizing:\s*border-box/s);
		assert.match(css, /\.motion-chart-canvas\s*\{[^}]*box-sizing:\s*border-box/s);
		assert.match(css, /\.motion-chart-tooltip-notes\s*\{[^}]*max-height:\s*280px/s);
		assert.match(css, /\.motion-chart-tooltip-note-name\s*\{[^}]*word-break:\s*break-word/s);
		assert.match(css, /\.motion-chart-has-slider::after/);
		assert.match(css, /\.motion-chart-has-slider-vertical::after/);
		assert.match(css, /pointer-events:\s*none/);
		assert.match(css, /color-mix\(in srgb, var\(--text-muted, #888\) 18%, transparent\)/);
		assert.equal(css.includes('42%'), false);
	});
});
