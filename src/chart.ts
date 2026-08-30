import type {
	CustomSeriesRenderItemAPI,
	CustomSeriesRenderItemReturn,
	EChartsOption,
	SeriesOption,
} from 'echarts';
import { binCounts, boxFive, parseChartDate } from './aggregate.ts';
import { formatAxisTick, formatNumber } from './format.ts';
import { formatCategoryTooltip } from './tooltip.ts';
import type { AggregatedChart, ChartSettings, ChartTheme } from './types.ts';

const CARTESIAN_TYPES = new Set<ChartSettings['chartType']>([
	'bar',
	'bar-horizontal',
	'bar-stacked',
	'bar-percent',
	'combo',
	'lollipop',
	'line',
	'line-step',
	'area',
	'area-stacked',
	'scatter',
	'heatmap',
	'boxplot',
	'dumbbell',
	'ridgeline',
	'waterfall',
	'marimekko',
	'bullet',
	'slope',
	'histogram',
	'violin',
	'bar-race',
]);

const LOG_Y_TYPES = new Set<ChartSettings['chartType']>([
	'bar',
	'bar-horizontal',
	'bar-stacked',
	'combo',
	'lollipop',
	'line',
	'line-step',
	'area',
	'area-stacked',
	'scatter',
	'boxplot',
	'dumbbell',
	'bullet',
	'slope',
	'histogram',
	'violin',
	'bar-race',
]);

const ZOOM_TYPES = new Set<ChartSettings['chartType']>([
	'bar',
	'bar-horizontal',
	'bar-stacked',
	'bar-percent',
	'combo',
	'lollipop',
	'line',
	'line-step',
	'area',
	'area-stacked',
	'boxplot',
	'dumbbell',
	'waterfall',
	'bullet',
	'slope',
	'histogram',
	'violin',
	'bar-race',
]);

export const ZOOM_AFTER = 12;
export const TREEMAP_LABEL_MIN_SHOW = 16;

export function usesCartesianGrid(chartType: ChartSettings['chartType']): boolean {
	return CARTESIAN_TYPES.has(chartType);
}

export function supportsLogY(chartType: ChartSettings['chartType']): boolean {
	return LOG_Y_TYPES.has(chartType);
}

export function logSafeValue(value: number, logY: boolean): number | null {
	if (!logY) return value;
	return value > 0 && Number.isFinite(value) ? value : null;
}

export function shouldApplyLogY(settings: ChartSettings, data: AggregatedChart): boolean {
	if (!settings.logY || !supportsLogY(settings.chartType)) return false;
	const candidates = [
		...data.values.flat(),
		...data.rawValues.flat(2),
		...data.points.map((point) => point.y),
	];
	return candidates.some((value) => value > 0);
}

function animationConfig(reduceMotion: boolean) {
	if (reduceMotion) {
		return {
			animation: false,
			animationDuration: 0,
			animationDurationUpdate: 0,
			animationDelay: 0,
			animationDelayUpdate: 0,
			animationEasing: 'cubicOut' as const,
			animationEasingUpdate: 'cubicOut' as const,
		};
	}
	return {
		animation: true,
		animationDuration: 900,
		animationDurationUpdate: 700,
		animationDelay: (idx: number) => idx * 40,
		animationDelayUpdate: (idx: number) => idx * 24,
		animationEasing: 'cubicOut' as const,
		animationEasingUpdate: 'cubicOut' as const,
	};
}

function motion(reduceMotion: boolean, seriesKey: string) {
	return {
		id: `motion-${seriesKey}`,
		universalTransition: reduceMotion ? false : { enabled: true, seriesKey },
		animationDelay: reduceMotion ? 0 : (idx: number) => idx * 40,
		animationDelayUpdate: reduceMotion ? 0 : (idx: number) => idx * 24,
		emphasis: {
			focus: 'self' as const,
			scale: true,
			itemStyle: {
				shadowBlur: reduceMotion ? 0 : 12,
				shadowColor: 'rgba(0,0,0,0.35)',
			},
		},
	};
}

function axisCommon(theme: ChartTheme, showGrid: boolean) {
	return {
		axisLine: { lineStyle: { color: theme.border } },
		axisTick: { lineStyle: { color: theme.border } },
		axisLabel: { color: theme.muted },
		splitLine: {
			show: showGrid,
			lineStyle: { color: theme.border, opacity: 0.55 },
		},
	};
}

/** Show every category name. interval:'auto' / hideOverlap skips labels on dense category charts. */
function categoryAxisLabel(theme: ChartTheme, placement: 'bottom' | 'left') {
	return {
		color: theme.muted,
		interval: 0,
		hideOverlap: false,
		rotate: placement === 'bottom' ? 45 : 0,
	};
}

/** Reserve space so 45° labels and chrome stay inside the canvas. */
export function categoryAxisPad(categories: string[], placement: 'bottom' | 'left') {
	const longest = categories.reduce((max, label) => Math.max(max, [...String(label)].length), 1);
	const glyph = 7;
	const font = 12;
	if (placement === 'left') {
		return {
			top: 40,
			right: 24,
			bottom: 36,
			left: Math.min(168, Math.max(64, Math.ceil(longest * glyph + 20))),
		};
	}
	const textW = longest * glyph;
	const depth = Math.ceil(textW * Math.SQRT1_2 + font * Math.SQRT1_2 + 20);
	const jut = Math.ceil(font * Math.SQRT1_2 + 18);
	return {
		top: 40,
		right: Math.min(64, Math.max(28, jut)),
		bottom: Math.min(176, Math.max(100, depth)),
		left: 16,
	};
}

function cartesianGrid(
	horizontal: boolean,
	categories: string[],
	extra: { right?: number; bottom?: number; left?: number; top?: number } = {},
) {
	const pad = categoryAxisPad(categories, horizontal ? 'left' : 'bottom');
	return {
		top: extra.top ?? pad.top,
		right: extra.right ?? pad.right,
		bottom: extra.bottom ?? pad.bottom,
		left: extra.left ?? pad.left,
		containLabel: true,
	};
}

export function categoryWindowHint(visible: number, total: number): string | null {
	if (total < ZOOM_AFTER) return null;
	return `${visible} of ${total} categories`;
}

export function treemapLabelLayout(params: { rect?: { width?: number; height?: number } }) {
	const width = params.rect?.width ?? 0;
	const height = params.rect?.height ?? 0;
	if (width < 36 || height < TREEMAP_LABEL_MIN_SHOW) {
		return { fontSize: 0, width: 0, height: 0 };
	}
	return {
		fontSize: height >= 36 && width >= 72 ? 12 : 11,
		width: Math.max(0, width - 8),
	};
}

export function treemapLabelFormatter(
	params: { name?: string; value?: unknown },
	valueFloor: number,
): string {
	const name = String(params.name ?? '');
	const raw = Array.isArray(params.value) ? params.value[0] : params.value;
	const value = Number(raw) || 0;
	if (value >= valueFloor) return `${name}\n${formatNumber(value)}`;
	return name;
}

function labelStyle(theme: ChartTheme, show: boolean) {
	return {
		show,
		color: theme.text,
	};
}

function tooltipBase(theme: ChartTheme) {
	return {
		trigger: 'axis' as const,
		confine: true,
		backgroundColor: theme.panel,
		borderColor: theme.border,
		textStyle: { color: theme.text },
		extraCssText: 'max-width:min(280px,80%);max-height:40%;overflow:auto;',
	};
}

function categoryTooltip(theme: ChartTheme, data: AggregatedChart, settings: ChartSettings, trigger: 'axis' | 'item' = 'axis') {
	return {
		...tooltipBase(theme),
		trigger,
		formatter: (params: unknown) => formatCategoryTooltip(params, data, settings),
	};
}

function namedValues(categories: string[], values: number[]) {
	return categories.map((name, index) => ({ name, value: values[index] ?? 0 }));
}

function namedCategoryData(categories: string[], values: number[], logY: boolean) {
	return categories.map((name, index) => {
		const raw = values[index] ?? 0;
		return { name, value: logSafeValue(raw, logY), raw };
	});
}

function categoryTotals(data: AggregatedChart): number[] {
	return data.categories.map((_, index) =>
		data.values.reduce((sum, series) => sum + (series[index] ?? 0), 0),
	);
}

function valueAxisOption(theme: ChartTheme, showGrid: boolean, logY: boolean, extra: Record<string, unknown> = {}) {
	return {
		type: logY ? ('log' as const) : ('value' as const),
		min: logY ? ('dataMin' as const) : undefined,
		...axisCommon(theme, showGrid),
		axisLabel: {
			color: theme.muted,
			formatter: formatAxisTick,
		},
		...extra,
	};
}

function dataZoomOption(data: AggregatedChart, settings: ChartSettings, horizontal: boolean) {
	if (!ZOOM_TYPES.has(settings.chartType) || data.categories.length < ZOOM_AFTER) {
		return { dataZoom: undefined, windowSize: data.categories.length };
	}
	const windowSize = Math.min(data.categories.length, 16);
	const end = Math.min(100, (windowSize / data.categories.length) * 100);
	const axis = horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 };
	return {
		dataZoom: [
			{
				type: 'inside' as const,
				...axis,
				filterMode: 'filter' as const,
				zoomOnMouseWheel: true,
				moveOnMouseMove: true,
				preventDefaultMouseMove: true,
				start: 0,
				end,
			},
		],
		windowSize,
	};
}

function toPercents(data: AggregatedChart): number[][] {
	const totals = categoryTotals(data);
	return data.values.map((series) =>
		series.map((value, index) => {
			const total = totals[index] ?? 0;
			return total > 0 ? (value / total) * 100 : 0;
		}),
	);
}

export function buildChartOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	extras: { drillName?: string | null } = {},
): EChartsOption {
	const anim = animationConfig(reduceMotion);
	const colors = theme.colors;
	const logY = shouldApplyLogY(settings, data);
	const legend = {
		show:
			settings.showLegend &&
			(data.seriesNames.length > 1 ||
				settings.chartType === 'pie' ||
				settings.chartType === 'doughnut' ||
				settings.chartType === 'rose' ||
				settings.chartType === 'funnel' ||
				settings.chartType === 'sunburst' ||
				settings.chartType === 'waffle' ||
				settings.chartType === 'streamgraph' ||
				settings.chartType === 'icicle' ||
				settings.chartType === 'tree' ||
				settings.chartType === 'parallel' ||
				settings.chartType === 'network' ||
				settings.chartType === 'marimekko' ||
				settings.chartType === 'slope' ||
				settings.chartType === 'histogram' ||
				settings.chartType === 'violin' ||
				(settings.chartType === 'combo' && data.hasY2) ||
				settings.chartType === 'ridgeline'),
		textStyle: { color: theme.muted },
		type: 'scroll' as const,
		top: 0,
		left: 'center',
		width: '86%',
		pageIconColor: theme.muted,
		pageTextStyle: { color: theme.muted },
	};

	if (settings.chartType === 'gauge') {
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			series: [
				{
					type: 'gauge',
					min: 0,
					max: Math.max(data.overall ?? 0, ...data.values.flat(), 1),
					progress: { show: true, width: 14 },
					pointer: { show: true },
					axisLine: { lineStyle: { width: 14 } },
					detail: {
						valueAnimation: !reduceMotion,
						formatter: (value: number) => formatNumber(value),
						color: theme.text,
					},
					title: { color: theme.muted },
					data: [{ value: data.overall ?? 0, name: settings.aggregation }],
					...motion(reduceMotion, 'gauge'),
				},
			],
		};
	}

	if (settings.chartType === 'pie' || settings.chartType === 'doughnut' || settings.chartType === 'rose') {
		const pieData = namedValues(data.categories, categoryTotals(data));
		const rose = settings.chartType === 'rose';
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			series: [
				{
					type: 'pie',
					radius: settings.chartType === 'doughnut' ? ['46%', '72%'] : rose ? ['8%', '72%'] : '68%',
					roseType: rose ? 'area' : undefined,
					animationType: 'expansion',
					animationEasing: 'cubicOut',
					label: {
						...labelStyle(theme, settings.showLabels || rose),
						formatter: '{b}',
					},
					data: pieData,
					...motion(reduceMotion, 'pie'),
				},
			],
		};
	}

	if (settings.chartType === 'treemap' || settings.chartType === 'sunburst') {
		const nested = nestHierarchy(data);
		const totals = categoryTotals(data);
		const max = Math.max(1, ...totals);
		const valueFloor = max * 0.12;
		const nestedLevels = data.seriesNames.length > 1;
		const leafBorder = theme.primary || theme.background;
		if (settings.chartType === 'sunburst') {
			return {
				...anim,
				backgroundColor: theme.background,
				color: colors,
				legend,
				tooltip: categoryTooltip(theme, data, settings, 'item'),
				series: [
					{
						type: 'sunburst',
						radius: ['12%', '78%'],
						data: nested,
						minAngle: 2,
						label: {
							...labelStyle(theme, true),
							minAngle: 8,
							overflow: 'truncate',
							ellipsis: '…',
						},
						itemStyle: { borderColor: leafBorder, borderWidth: 1 },
						...motion(reduceMotion, 'sunburst'),
					},
				],
			};
		}
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			visualMap: {
				type: 'continuous',
				min: 0,
				max,
				show: false,
				inRange: { color: [theme.border, theme.accent] },
			},
			series: [
				{
					type: 'treemap',
					roam: true,
					nodeClick: 'zoomToNode',
					squareRatio: 1,
					leafDepth: nestedLevels ? 2 : 1,
					visualDimension: 0,
					colorMappingBy: 'value',
					left: 4,
					right: 4,
					top: 8,
					bottom: 28,
					breadcrumb: {
						show: true,
						left: 8,
						bottom: 0,
						height: 22,
						itemStyle: {
							color: theme.panel,
							borderColor: theme.border,
							shadowBlur: 0,
							textStyle: { color: theme.text },
						},
						emphasis: {
							itemStyle: {
								color: theme.accent,
								textStyle: { color: theme.text },
							},
						},
					},
					levels: [
						{
							colorMappingBy: 'value',
							itemStyle: { borderColor: leafBorder, borderWidth: 2, gapWidth: 2 },
							upperLabel: {
								show: nestedLevels,
								color: theme.text,
								height: 18,
								overflow: 'truncate',
								ellipsis: '…',
							},
						},
						{
							colorMappingBy: 'value',
							itemStyle: { gapWidth: 1, borderColor: leafBorder, borderWidth: 1 },
						},
					],
					label: {
						...labelStyle(theme, true),
						formatter: (params) => treemapLabelFormatter(params, valueFloor),
						overflow: 'truncate',
						ellipsis: '…',
						fontSize: 11,
					},
					labelLayout: treemapLabelLayout,
					data: nested,
					...motion(reduceMotion, 'treemap'),
				},
			],
		};
	}

	if (settings.chartType === 'funnel') {
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			series: [
				{
					type: 'funnel',
					sort: 'descending',
					label: { ...labelStyle(theme, true), position: 'inside' },
					data: namedValues(data.categories, categoryTotals(data)),
					...motion(reduceMotion, 'funnel'),
				},
			],
		};
	}

	if (settings.chartType === 'radar') {
		const max = Math.max(1, ...data.values.flat());
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			radar: {
				indicator: data.categories.map((name) => ({ name, max })),
				axisName: { color: theme.muted },
				splitLine: { lineStyle: { color: theme.border } },
				splitArea: { areaStyle: { color: ['transparent', 'rgba(127,127,127,0.06)'] } },
			},
			series: [
				{
					type: 'radar',
					data: data.seriesNames.map((name, seriesIndex) => ({
						name,
						value: data.values[seriesIndex] ?? [],
					})),
					...motion(reduceMotion, 'radar'),
				},
			],
		};
	}

	if (settings.chartType === 'bubbles') {
		const totals = categoryTotals(data);
		const max = Math.max(1, ...totals);
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			series: [
				{
					type: 'graph',
					layout: 'force',
					roam: true,
					force: { repulsion: 160, gravity: 0.06, friction: 0.2 },
					data: data.categories.map((name, index) => ({
						name,
						value: totals[index] ?? 0,
						symbolSize: 18 + Math.sqrt((totals[index] ?? 0) / max) * 72,
					})),
					label: { ...labelStyle(theme, true) },
					...motion(reduceMotion, 'bubbles'),
				},
			],
		};
	}

	if (settings.chartType === 'sankey') {
		const targets = data.seriesNames;
		const nodes = [...new Set([...data.categories, ...targets])].map((name) => ({ name }));
		const links: { source: string; target: string; value: number }[] = [];
		data.seriesNames.forEach((series, seriesIndex) => {
			data.categories.forEach((category, index) => {
				const value = data.values[seriesIndex]?.[index] ?? 0;
				if (value <= 0 || category === series) return;
				links.push({ source: category, target: series, value });
			});
		});
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			series: [
				{
					type: 'sankey',
					data: nodes,
					links,
					lineStyle: { color: 'gradient', opacity: 0.35 },
					label: { ...labelStyle(theme, true) },
					...motion(reduceMotion, 'sankey'),
				},
			],
		};
	}

	if (settings.chartType === 'chord') {
		const targets = data.seriesNames;
		const nodes = [...new Set([...data.categories, ...targets])].map((name) => ({ name }));
		const links: { source: string; target: string; value: number }[] = [];
		data.seriesNames.forEach((series, seriesIndex) => {
			data.categories.forEach((category, index) => {
				const value = data.values[seriesIndex]?.[index] ?? 0;
				if (value <= 0 || category === series) return;
				links.push({ source: category, target: series, value });
			});
		});
		const max = Math.max(1, ...links.map((link) => link.value));
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			series: [
				{
					type: 'graph',
					layout: 'circular',
					circular: { rotateLabel: true },
					roam: true,
					data: nodes,
					links: links.map((link) => ({
						...link,
						lineStyle: {
							width: 1 + (link.value / max) * 12,
							curveness: 0.35,
							opacity: 0.45,
							color: 'source',
						},
					})),
					label: { ...labelStyle(theme, true) },
					lineStyle: { color: 'source', curveness: 0.35, opacity: 0.4 },
					...motion(reduceMotion, 'chord'),
				},
			],
		};
	}

	if (settings.chartType === 'streamgraph') {
		const river: [string, number, string][] = data.seriesNames.flatMap((series, seriesIndex) =>
			data.categories.map(
				(category, index): [string, number, string] => [
					category,
					data.values[seriesIndex]?.[index] ?? 0,
					series,
				],
			),
		);
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			singleAxis: {
				type: 'category',
				data: data.categories,
				top: 48,
				bottom: categoryAxisPad(data.categories, 'bottom').bottom,
				left: 24,
				right: 24,
				axisLabel: categoryAxisLabel(theme, 'bottom'),
				axisLine: { lineStyle: { color: theme.border } },
				axisTick: { lineStyle: { color: theme.border } },
			},
			series: [
				{
					type: 'themeRiver',
					data: river,
					label: { show: false },
					...motion(reduceMotion, 'streamgraph'),
				},
			],
		};
	}

	if (settings.chartType === 'bar-polar') {
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			polar: { radius: ['18%', '78%'] },
			angleAxis: {
				type: 'category',
				data: data.categories,
				startAngle: 90,
				axisLabel: { color: theme.muted, interval: 0, hideOverlap: true },
				axisLine: { lineStyle: { color: theme.border } },
			},
			radiusAxis: {
				type: 'value',
				axisLabel: { color: theme.muted, formatter: formatAxisTick },
				splitLine: { lineStyle: { color: theme.border, opacity: 0.45 } },
			},
			series: data.seriesNames.map((name, seriesIndex) => ({
				name,
				type: 'bar',
				coordinateSystem: 'polar',
				stack: data.seriesNames.length > 1 ? 'total' : undefined,
				data: namedValues(data.categories, data.values[seriesIndex] ?? []),
				...motion(reduceMotion, name),
			})),
		};
	}

	if (settings.chartType === 'waffle') {
		const totals = categoryTotals(data);
		const cells = waffleCells(data.categories, totals, colors);
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend: { ...legend, data: data.categories },
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			grid: { top: 40, right: 16, bottom: 16, left: 16, containLabel: false },
			xAxis: { type: 'value', min: -0.5, max: 9.5, show: false },
			yAxis: { type: 'value', min: -0.5, max: 9.5, show: false },
			series: [
				{
					type: 'custom',
					coordinateSystem: 'cartesian2d',
					data: cells,
					encode: { x: 0, y: 1 },
					renderItem: (_params, api) => {
						const x = Number(api.value(0));
						const y = Number(api.value(1));
						const sized = api.size?.([1, 1]);
						const size = Array.isArray(sized) ? sized : [16, 16];
						const gap = 3;
						const point = api.coord([x, y]);
						const width = Math.max(2, Number(size[0] ?? 16) - gap);
						const height = Math.max(2, Number(size[1] ?? 16) - gap);
						return {
							type: 'rect',
							shape: {
								x: (point[0] ?? 0) - width / 2,
								y: (point[1] ?? 0) - height / 2,
								width,
								height,
								r: 2,
							},
							style: {
								fill: api.visual('color') as string,
							},
						};
					},
					...motion(reduceMotion, 'waffle'),
				},
			],
		};
	}

	if (settings.chartType === 'calendar' && data.calendar.length > 0) {
		const dates = data.calendar.map((cell) => cell.date);
		const max = Math.max(1, ...data.calendar.map((cell) => cell.value));
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			visualMap: {
				min: 0,
				max,
				orient: 'horizontal',
				left: 'center',
				bottom: 8,
				inRange: { color: [theme.border, theme.accent] },
				textStyle: { color: theme.muted },
			},
			calendar: {
				top: 48,
				left: 48,
				right: 16,
				bottom: 56,
				range: [dates[0] ?? dates[dates.length - 1] ?? '', dates[dates.length - 1] ?? dates[0] ?? ''],
				itemStyle: { borderColor: theme.background, color: theme.panel },
				splitLine: { lineStyle: { color: theme.border } },
				dayLabel: { color: theme.muted },
				monthLabel: { color: theme.muted },
				yearLabel: { color: theme.text },
			},
			series: [
				{
					type: 'heatmap',
					coordinateSystem: 'calendar',
					data: data.calendar.map((cell) => [cell.date, cell.value]),
					...motion(reduceMotion, 'calendar'),
				},
			],
		};
	}

	if (settings.chartType === 'heatmap' || settings.chartType === 'calendar') {
		const heatData: [number, number, number][] = [];
		data.seriesNames.forEach((_series, y) => {
			data.categories.forEach((_category, x) => {
				heatData.push([x, y, data.values[y]?.[x] ?? 0]);
			});
		});
		const max = Math.max(1, ...heatData.map((item) => item[2]));
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			grid: (() => {
				const xPad = categoryAxisPad(data.categories, 'bottom');
				const yPad = categoryAxisPad(data.seriesNames, 'left');
				return {
					top: 40,
					right: xPad.right,
					bottom: xPad.bottom + 40,
					left: Math.max(yPad.left, 72),
					containLabel: true,
				};
			})(),
			xAxis: {
				type: 'category',
				data: data.categories,
				...axisCommon(theme, false),
				axisLabel: categoryAxisLabel(theme, 'bottom'),
			},
			yAxis: {
				type: 'category',
				data: data.seriesNames,
				...axisCommon(theme, false),
				axisLabel: categoryAxisLabel(theme, 'left'),
			},
			visualMap: {
				min: 0,
				max,
				orient: 'horizontal',
				left: 'center',
				bottom: 0,
				inRange: { color: [theme.border, theme.accent] },
				textStyle: { color: theme.muted },
			},
			series: [
				{
					type: 'heatmap',
					data: heatData,
					label: { ...labelStyle(theme, settings.showLabels) },
					...motion(reduceMotion, 'heatmap'),
				},
			],
		};
	}

	if (settings.chartType === 'boxplot') {
		const zoom = dataZoomOption(data, settings, false);
		const series: SeriesOption[] = data.seriesNames.map((name, seriesIndex) => ({
			name,
			type: 'boxplot',
			data: data.categories.map((category, index) => {
				const raw = (data.rawValues[seriesIndex]?.[index] ?? []).filter((value) => !logY || value > 0);
				const five = boxFive(raw) ?? [0, 0, 0, 0, 0];
				return { name: category, value: five };
			}),
			...motion(reduceMotion, name),
		}));
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: {
				...tooltipBase(theme),
				trigger: 'item',
				formatter: (params: unknown) =>
					`${formatBoxTooltip(params)}<br/>${formatCategoryTooltip(params, data, settings)}`,
			},
			grid: cartesianGrid(false, data.categories),
			dataZoom: zoom.dataZoom,
			xAxis: {
				type: 'category',
				data: data.categories,
				...axisCommon(theme, settings.showGrid),
				axisLabel: categoryAxisLabel(theme, 'bottom'),
			},
			yAxis: valueAxisOption(theme, settings.showGrid, logY),
			series,
		};
	}

	if (settings.chartType === 'dumbbell') {
		const zoom = dataZoomOption(data, settings, false);
		const series: SeriesOption[] = data.seriesNames.map((name, seriesIndex) => ({
			name,
			type: 'custom',
			renderItem: (params, api) => {
				const categoryIndex = api.value(0) as number;
				const min = api.value(1) as number;
				const max = api.value(2) as number;
				const mid = api.value(3) as number;
				const start = api.coord([categoryIndex, min]);
				const end = api.coord([categoryIndex, max]);
				const medianPt = api.coord([categoryIndex, mid]);
				const color = api.visual('color') as string;
				const x1 = start[0] ?? 0;
				const y1 = start[1] ?? 0;
				const x2 = end[0] ?? 0;
				const y2 = end[1] ?? 0;
				const mx = medianPt[0] ?? 0;
				const my = medianPt[1] ?? 0;
				return {
					type: 'group',
					children: [
						{
							type: 'line',
							shape: { x1, y1, x2, y2 },
							style: { stroke: color, lineWidth: 2 },
						},
						{
							type: 'circle',
							shape: { cx: x1, cy: y1, r: 5 },
							style: { fill: color },
						},
						{
							type: 'circle',
							shape: { cx: x2, cy: y2, r: 5 },
							style: { fill: color },
						},
						{
							type: 'rect',
							shape: { x: mx - 5, y: my - 1.5, width: 10, height: 3 },
							style: { fill: theme.text },
						},
					],
				};
			},
			data: data.categories.map((category, index) => {
				const raw = (data.rawValues[seriesIndex]?.[index] ?? []).filter((value) => !logY || value > 0);
				const min = raw.length > 0 ? Math.min(...raw) : 0;
				const max = raw.length > 0 ? Math.max(...raw) : 0;
				const mid = boxFive(raw)?.[2] ?? min;
				return { name: category, value: [index, min, max, mid] };
			}),
			encode: { x: 0, y: [1, 2] },
			...motion(reduceMotion, name),
		}));
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: categoryTooltip(theme, data, settings, 'item'),
			grid: cartesianGrid(false, data.categories),
			dataZoom: zoom.dataZoom,
			xAxis: {
				type: 'category',
				data: data.categories,
				...axisCommon(theme, settings.showGrid),
				axisLabel: categoryAxisLabel(theme, 'bottom'),
			},
			yAxis: valueAxisOption(theme, settings.showGrid, logY),
			series,
		};
	}

	if (settings.chartType === 'ridgeline') {
		const groups =
			data.seriesNames.length > 1
				? data.seriesNames.map((name, seriesIndex) => ({
						name,
						values: (data.rawValues[seriesIndex] ?? []).flat(),
					}))
				: data.categories.map((name, index) => ({
						name,
						values: data.rawValues[0]?.[index] ?? [],
					}));
		const allValues = groups.flatMap((group) => group.values).filter((value) => Number.isFinite(value));
		const domain = allValues.length > 0 ? { min: Math.min(...allValues), max: Math.max(...allValues) } : undefined;
		const series: SeriesOption[] = groups.map((group) => {
			const bins = binCounts(group.values, 16, domain);
			return {
				name: group.name,
				type: 'line',
				smooth: 0.35,
				showSymbol: false,
				areaStyle: { opacity: 0.28 },
				data: bins.map((bin) => [bin.mid, bin.count]),
				...motion(reduceMotion, group.name),
			};
		});
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: { ...tooltipBase(theme), trigger: 'axis' },
			grid: cartesianGrid(false, data.categories, { bottom: 48 }),
			xAxis: {
				type: 'value',
				...axisCommon(theme, settings.showGrid),
			},
			yAxis: {
				type: 'value',
				name: 'Count',
				...axisCommon(theme, settings.showGrid),
			},
			series,
		};
	}

	if (settings.chartType === 'scatter') {
		const zoom = dataZoomOption(data, settings, false);
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			grid: cartesianGrid(false, data.categories),
			dataZoom: zoom.dataZoom,
			xAxis: {
				type: typeof data.points[0]?.x === 'number' ? 'value' : 'category',
				data: typeof data.points[0]?.x === 'number' ? undefined : data.categories,
				...axisCommon(theme, settings.showGrid),
				...(typeof data.points[0]?.x === 'number'
					? {}
					: { axisLabel: categoryAxisLabel(theme, 'bottom') }),
			},
			yAxis: valueAxisOption(theme, settings.showGrid, logY),
			series: data.seriesNames.map((name) => ({
				name,
				type: 'scatter',
				data: data.points
					.filter((point) => point.series === name)
					.filter((point) => logSafeValue(point.y, logY) != null)
					.map((point) => ({
						value: [point.x, point.y],
						name: point.name,
					})),
				...motion(reduceMotion, name),
			})),
		};
	}

	if (settings.chartType === 'waterfall') {
		const totals = categoryTotals(data);
		let running = 0;
		const bases = totals.map((value) => {
			const base = running;
			running += value;
			return base;
		});
		const zoom = dataZoomOption(data, settings, false);
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: categoryTooltip(theme, data, settings),
			grid: cartesianGrid(false, data.categories),
			dataZoom: zoom.dataZoom,
			xAxis: {
				type: 'category',
				data: data.categories,
				...axisCommon(theme, settings.showGrid),
				axisLabel: categoryAxisLabel(theme, 'bottom'),
			},
			yAxis: valueAxisOption(theme, settings.showGrid, false),
			series: [
				{
					type: 'bar',
					stack: 'waterfall',
					silent: true,
					itemStyle: { color: 'transparent', borderColor: 'transparent' },
					emphasis: { disabled: true },
					tooltip: { show: false },
					data: bases,
				},
				{
					type: 'bar',
					stack: 'waterfall',
					data: namedValues(data.categories, totals),
					label: {
						...labelStyle(theme, settings.showLabels),
						position: 'top',
					},
					...motion(reduceMotion, 'waterfall'),
				},
			],
		};
	}

	if (settings.chartType === 'icicle') {
		return icicleOption(data, settings, theme, reduceMotion, anim, colors, legend, extras.drillName);
	}
	if (settings.chartType === 'tree') {
		return treeOption(data, settings, theme, reduceMotion, anim, colors, legend);
	}
	if (settings.chartType === 'parallel') {
		return parallelOption(data, settings, theme, reduceMotion, anim, colors, legend);
	}
	if (settings.chartType === 'network') {
		return networkOption(data, settings, theme, reduceMotion, anim, colors);
	}
	if (settings.chartType === 'marimekko') {
		return marimekkoOption(data, settings, theme, reduceMotion, anim, colors, legend);
	}
	if (settings.chartType === 'bullet') {
		return bulletOption(data, settings, theme, reduceMotion, anim, colors, logY);
	}
	if (settings.chartType === 'slope' && data.seriesNames.length >= 2) {
		return slopeOption(data, settings, theme, reduceMotion, anim, colors, legend, logY);
	}
	if (settings.chartType === 'histogram') {
		return histogramOption(data, settings, theme, reduceMotion, anim, colors, legend, logY);
	}
	if (settings.chartType === 'violin') {
		return violinOption(data, settings, theme, reduceMotion, anim, colors, legend, logY);
	}
	if (settings.chartType === 'bar-race' && hasDateCategories(data.categories)) {
		return barRaceOption(data, settings, theme, reduceMotion, anim, colors, logY);
	}

	const horizontal = settings.chartType === 'bar-horizontal';
	const stacked = settings.chartType === 'bar-stacked';
	const percent = settings.chartType === 'bar-percent';
	const combo = settings.chartType === 'combo';
	const lollipop = settings.chartType === 'lollipop' || settings.chartType === 'slope';
	const stackedArea = settings.chartType === 'area-stacked';
	const stepLine = settings.chartType === 'line-step';
	const zoom = dataZoomOption(data, settings, horizontal);
	const extraRight = combo && data.hasY2 ? 48 : 0;
	const percents = percent ? toPercents(data) : null;
	const categoryAxis = {
		type: 'category' as const,
		data: data.categories,
		...axisCommon(theme, settings.showGrid && !horizontal),
		axisLabel: categoryAxisLabel(theme, horizontal ? 'left' : 'bottom'),
	};
	const valueAxis = percent
		? valueAxisOption(theme, settings.showGrid, false, {
				max: 100,
				axisLabel: {
					color: theme.muted,
					formatter: (value: number) => `${formatAxisTick(Number(value))}%`,
				},
			})
		: valueAxisOption(theme, settings.showGrid, logY);

	const series: SeriesOption[] = [];
	data.seriesNames.forEach((name, seriesIndex) => {
		const seriesValues = percents?.[seriesIndex] ?? data.values[seriesIndex] ?? [];
		const seriesData = namedCategoryData(data.categories, seriesValues, logY && !percent);
		if (
			settings.chartType === 'line' ||
			settings.chartType === 'area' ||
			stackedArea ||
			stepLine
		) {
			series.push({
				name,
				type: 'line',
				data: seriesData,
				stack: stackedArea ? 'total' : undefined,
				step: stepLine ? 'middle' : undefined,
				smooth: stepLine ? 0 : 0.2,
				showSymbol: settings.showLabels,
				areaStyle:
					settings.chartType === 'area' || stackedArea
						? { opacity: stackedArea ? 0.55 : 0.22 }
						: undefined,
				label: labelStyle(theme, settings.showLabels),
				...motion(reduceMotion, name),
			});
			return;
		}
		if (lollipop) {
			series.push({
				name,
				type: 'bar',
				barWidth: 3,
				data: seriesData,
				...motion(reduceMotion, name),
			});
			series.push({
				name,
				type: 'scatter',
				symbolSize: 12,
				data: seriesData,
				label: {
					...labelStyle(theme, settings.showLabels),
					position: horizontal ? 'right' : 'top',
				},
				...motion(reduceMotion, `${name}-dot`),
			});
			return;
		}
		series.push({
			name,
			type: 'bar',
			stack: stacked || percent ? 'total' : undefined,
			data: seriesData,
			label: {
				...labelStyle(theme, settings.showLabels),
				position: horizontal ? 'right' : stacked ? 'inside' : 'top',
			},
			...motion(reduceMotion, name),
		});
	});

	if (combo && data.hasY2) {
		series.push({
			name: 'Y2',
			type: 'line',
			yAxisIndex: 1,
			smooth: 0.2,
			showSymbol: true,
			symbolSize: 8,
			data: namedValues(data.categories, data.y2Category),
			...motion(reduceMotion, 'y2'),
		});
	}

	const yAxes =
		combo && data.hasY2 && !horizontal
			? [
					valueAxis,
					valueAxisOption(theme, false, false, {
						position: 'right',
						alignTicks: true,
						axisLabel: {
							color: colors[1] ?? theme.muted,
							formatter: formatAxisTick,
						},
					}),
				]
			: horizontal
				? categoryAxis
				: valueAxis;

	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend,
		tooltip: categoryTooltip(theme, data, settings),
		grid: cartesianGrid(horizontal, data.categories, {
			right: extraRight || undefined,
		}),
		dataZoom: zoom.dataZoom,
		xAxis: horizontal ? valueAxis : categoryAxis,
		yAxis: yAxes,
		series,
	};
}

interface HierarchyNode {
	name: string;
	value: number;
	children?: HierarchyNode[];
}

function nestHierarchy(data: AggregatedChart): HierarchyNode[] {
	if (data.seriesNames.length > 1) {
		return data.seriesNames.map((series, seriesIndex) => {
			const children = namedValues(data.categories, data.values[seriesIndex] ?? []);
			return {
				name: series,
				value: children.reduce((sum, child) => sum + (child.value ?? 0), 0),
				children,
			};
		});
	}
	return namedValues(data.categories, categoryTotals(data));
}

function findHierarchyNode(nodes: HierarchyNode[], name: string): HierarchyNode | null {
	for (const node of nodes) {
		if (node.name === name) return node;
		if (node.children?.length) {
			const nested = findHierarchyNode(node.children, name);
			if (nested) return nested;
		}
	}
	return null;
}

function drillHierarchy(nodes: HierarchyNode[], rootName?: string | null): HierarchyNode[] {
	if (!rootName) return nodes;
	const found = findHierarchyNode(nodes, rootName);
	if (!found) return nodes;
	return found.children?.length ? found.children : [found];
}

function hierarchyDepth(nodes: HierarchyNode[]): number {
	if (nodes.length === 0) return 1;
	return 1 + Math.max(0, ...nodes.map((node) => (node.children?.length ? hierarchyDepth(node.children) : 0)));
}

export function icicleLabelVisible(width: number, height: number): boolean {
	return width >= 28 && height >= 12;
}

export function icicleLabelLayout(params: { rect?: { width?: number; height?: number } }) {
	const width = params.rect?.width ?? 0;
	const height = params.rect?.height ?? 0;
	if (!icicleLabelVisible(width, height)) {
		return { fontSize: 0, width: 0, height: 0 };
	}
	return {
		fontSize: height >= 22 && width >= 56 ? 12 : 11,
		width: Math.max(0, width - 8),
	};
}

function layoutIcicle(
	nodes: HierarchyNode[],
	x: number,
	y: number,
	width: number,
	height: number,
	remaining: number,
): { name: string; value: number[]; children?: { name: string }[] }[] {
	const levelH = remaining <= 0 ? height : height / remaining;
	const total = nodes.reduce((sum, node) => sum + Math.max(0, node.value), 0) || 1;
	let cursor = x;
	const rects: { name: string; value: number[]; children?: { name: string }[] }[] = [];
	for (const node of nodes) {
		const nodeW = width * (Math.max(0, node.value) / total);
		const children = node.children ?? [];
		rects.push({
			name: node.name,
			value: [cursor, y, nodeW, levelH, node.value],
			children: children.length > 0 ? children.map((child) => ({ name: child.name })) : undefined,
		});
		if (children.length > 0 && remaining > 1) {
			rects.push(...layoutIcicle(children, cursor, y + levelH, nodeW, height - levelH, remaining - 1));
		}
		cursor += nodeW;
	}
	return rects;
}

export function hasDateCategories(categories: string[]): boolean {
	if (categories.length === 0) return false;
	const dated = categories.filter((category) => parseChartDate(category));
	return dated.length >= Math.max(1, Math.ceil(categories.length * 0.5));
}

export function sturgesBinCount(n: number): number {
	if (n <= 1) return 1;
	return Math.min(24, Math.max(5, Math.ceil(Math.log2(n) + 1)));
}

export function marimekkoWidths(data: AggregatedChart): number[] {
	const totals = categoryTotals(data);
	const grand = totals.reduce((sum, value) => sum + Math.max(0, value), 0);
	if (!(grand > 0)) {
		const n = Math.max(1, totals.length);
		return totals.map(() => 1 / n);
	}
	return totals.map((value) => Math.max(0, value) / grand);
}

function categoryRawValues(data: AggregatedChart, index: number): number[] {
	return data.seriesNames.flatMap((_, seriesIndex) => data.rawValues[seriesIndex]?.[index] ?? []);
}

function allRawY(data: AggregatedChart): number[] {
	return data.rawValues.flat(2).filter((value) => Number.isFinite(value));
}

function customRectItem(
	api: CustomSeriesRenderItemAPI,
	theme: ChartTheme,
	label?: string,
): CustomSeriesRenderItemReturn {
	const x = Number(api.value(0));
	const y = Number(api.value(1));
	const w = Number(api.value(2));
	const h = Number(api.value(3));
	const start = api.coord([x, y]);
	const end = api.coord([x + w, y + h]);
	const width = Math.abs((end[0] ?? 0) - (start[0] ?? 0));
	const height = Math.abs((end[1] ?? 0) - (start[1] ?? 0));
	const left = Math.min(start[0] ?? 0, end[0] ?? 0);
	const top = Math.min(start[1] ?? 0, end[1] ?? 0);
	const children: object[] = [
		{
			type: 'rect',
			shape: { x: left, y: top, width, height },
			style: {
				fill: api.visual('color'),
				stroke: theme.background,
				lineWidth: 1,
			},
		},
	];
	if (label && icicleLabelVisible(width, height)) {
		children.push({
			type: 'text',
			style: {
				x: left + 4,
				y: top + height / 2,
				text: label,
				fill: theme.text,
				font: '11px sans-serif',
				textVerticalAlign: 'middle',
				width: Math.max(0, width - 8),
				overflow: 'truncate',
			},
		});
	}
	return { type: 'group', children } as CustomSeriesRenderItemReturn;
}

function icicleOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	legend: object,
	drillName?: string | null,
): EChartsOption {
	const nested = drillHierarchy(nestHierarchy(data), drillName);
	const depth = hierarchyDepth(nested);
	const rects = layoutIcicle(nested, 0, 0, 1, 1, depth);
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend,
		title: drillName
			? { text: drillName, left: 8, top: 0, textStyle: { color: theme.muted, fontSize: 12 } }
			: undefined,
		tooltip: categoryTooltip(theme, data, settings, 'item'),
		grid: { top: drillName ? 28 : 8, right: 8, bottom: 8, left: 8, containLabel: false },
		xAxis: { type: 'value', min: 0, max: 1, show: false },
		yAxis: { type: 'value', min: 0, max: 1, inverse: true, show: false },
		series: [
			{
				type: 'custom',
				coordinateSystem: 'cartesian2d',
				data: rects,
				encode: { x: 0, y: 1 },
				labelLayout: icicleLabelLayout,
				renderItem: (params, api) => customRectItem(api, theme, rects[params.dataIndex]?.name),
				...motion(reduceMotion, 'icicle'),
			},
		],
	};
}

function treeOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	legend: object,
): EChartsOption {
	const nested = nestHierarchy(data);
	const nestedLevels = data.seriesNames.length > 1;
	const roots =
		nested.length === 1
			? nested
			: [
					{
						name: ' ',
						value: nested.reduce((sum, node) => sum + node.value, 0),
						children: nested,
					},
				];
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend,
		tooltip: categoryTooltip(theme, data, settings, 'item'),
		series: [
			{
				type: 'tree',
				data: roots,
				roam: true,
				layout: nestedLevels ? 'orthogonal' : 'radial',
				orient: 'LR',
				symbol: 'emptyCircle',
				symbolSize: 8,
				expandAndCollapse: true,
				initialTreeDepth: 4,
				label: { show: false, color: theme.text },
				leaves: {
					label: {
						show: true,
						position: nestedLevels ? 'right' : 'inside',
						color: theme.text,
						distance: 8,
					},
				},
				lineStyle: { color: theme.border, width: 1.2, curveness: nestedLevels ? 0.4 : 0.5 },
				...motion(reduceMotion, 'tree'),
			},
		],
	};
}

function parallelOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	legend: object,
): EChartsOption {
	const axisNames = data.categories.length > 0 ? data.categories : ['Value'];
	const lineNames = data.seriesNames.length > 0 ? data.seriesNames : ['Value'];
	const lines = lineNames.map((name, seriesIndex) => ({
		name,
		value: axisNames.map((_, index) => data.values[seriesIndex]?.[index] ?? 0),
	}));
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend,
		tooltip: { ...tooltipBase(theme), trigger: 'item' },
		parallel: { left: 72, right: 48, top: 48, bottom: 24 },
		parallelAxis: axisNames.map((name, dim) => ({
			dim,
			name,
			nameLocation: 'end' as const,
			nameGap: 8,
			nameTextStyle: { color: theme.muted, fontSize: 11 },
			axisLine: { lineStyle: { color: theme.border } },
			axisTick: { lineStyle: { color: theme.border } },
			axisLabel: { color: theme.muted, formatter: formatAxisTick },
		})),
		series: [
			{
				type: 'parallel',
				lineStyle: { width: 1.6, opacity: 0.7 },
				data: lines,
				...motion(reduceMotion, 'parallel'),
			},
		],
	};
}

function networkOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
): EChartsOption {
	const targets = data.seriesNames;
	const nodeNames = [...new Set([...data.categories, ...targets])];
	const links: { source: string; target: string; value: number }[] = [];
	data.seriesNames.forEach((series, seriesIndex) => {
		data.categories.forEach((category, index) => {
			const value = data.values[seriesIndex]?.[index] ?? 0;
			if (value <= 0 || category === series) return;
			links.push({ source: category, target: series, value });
		});
	});
	const totals = new Map<string, number>();
	for (const name of nodeNames) totals.set(name, 0);
	for (const link of links) {
		totals.set(link.source, (totals.get(link.source) ?? 0) + link.value);
		totals.set(link.target, (totals.get(link.target) ?? 0) + link.value);
	}
	const max = Math.max(1, ...totals.values(), ...links.map((link) => link.value));
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		tooltip: categoryTooltip(theme, data, settings, 'item'),
		series: [
			{
				type: 'graph',
				layout: 'force',
				roam: true,
				force: { repulsion: 240, edgeLength: [48, 180], gravity: 0.07, friction: 0.2 },
				data: nodeNames.map((name) => ({
					name,
					value: totals.get(name) ?? 0,
					symbolSize: 14 + Math.sqrt((totals.get(name) ?? 0) / max) * 36,
				})),
				links: links.map((link) => ({
					...link,
					lineStyle: {
						width: 1 + (link.value / max) * 10,
						opacity: 0.5,
						color: 'source',
					},
				})),
				label: { ...labelStyle(theme, true) },
				lineStyle: { color: 'source', opacity: 0.45 },
				...motion(reduceMotion, 'network'),
			},
		],
	};
}

function marimekkoOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	legend: object,
): EChartsOption {
	const widths = marimekkoWidths(data);
	const totals = categoryTotals(data);
	const cells: {
		name: string;
		seriesName: string;
		value: number[];
		itemStyle: { color: string };
	}[] = [];
	let x = 0;
	data.categories.forEach((category, index) => {
		const width = widths[index] ?? 0;
		const total = totals[index] ?? 0;
		let y = 0;
		data.seriesNames.forEach((series, seriesIndex) => {
			const amount = data.values[seriesIndex]?.[index] ?? 0;
			const height = total > 0 ? Math.max(0, amount) / total : 0;
			cells.push({
				name: category,
				seriesName: series,
				value: [x, y, width, height, amount],
				itemStyle: { color: colors[seriesIndex % colors.length] ?? theme.accent },
			});
			y += height;
		});
		x += width;
	});
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend,
		tooltip: categoryTooltip(theme, data, settings, 'item'),
		grid: { top: 40, right: 16, bottom: 48, left: 16, containLabel: true },
		xAxis: { type: 'value', min: 0, max: 1, show: false },
		yAxis: { type: 'value', min: 0, max: 1, show: false },
		series: [
			{
				type: 'custom',
				coordinateSystem: 'cartesian2d',
				data: cells,
				encode: { x: 0, y: 1 },
				renderItem: (params, api) =>
					customRectItem(
						api,
						theme,
						settings.showLabels ? cells[params.dataIndex]?.name : undefined,
					),
				...motion(reduceMotion, 'marimekko'),
			},
		],
	};
}

function bulletOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	logY: boolean,
): EChartsOption {
	const zoom = dataZoomOption(data, settings, true);
	const totals = categoryTotals(data);
	const fallback = data.overall ?? 0;
	const targets = data.categories.map((_, index) =>
		data.hasY2 ? (data.y2Category[index] ?? fallback) : fallback,
	);
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		tooltip: categoryTooltip(theme, data, settings),
		grid: cartesianGrid(true, data.categories),
		dataZoom: zoom.dataZoom,
		xAxis: valueAxisOption(theme, settings.showGrid, logY),
		yAxis: {
			type: 'category',
			data: data.categories,
			...axisCommon(theme, false),
			axisLabel: categoryAxisLabel(theme, 'left'),
		},
		series: [
			{
				type: 'bar',
				barWidth: '46%',
				data: namedCategoryData(data.categories, totals, logY),
				label: { ...labelStyle(theme, settings.showLabels), position: 'right' },
				...motion(reduceMotion, 'bullet'),
			},
			{
				name: data.hasY2 ? 'Y2' : settings.aggregation,
				type: 'scatter',
				symbol: 'rect',
				symbolSize: [5, 22],
				itemStyle: { color: theme.text },
				data: data.categories.map((name, index) => ({
					name,
					value: logSafeValue(targets[index] ?? 0, logY),
				})),
				z: 5,
				...motion(reduceMotion, 'bullet-mark'),
			},
		],
	};
}

function slopeOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	legend: object,
	logY: boolean,
): EChartsOption {
	const zoom = dataZoomOption(data, settings, false);
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend,
		tooltip: categoryTooltip(theme, data, settings),
		grid: cartesianGrid(false, data.seriesNames, { bottom: 80 }),
		dataZoom: zoom.dataZoom,
		xAxis: {
			type: 'category',
			data: data.seriesNames,
			...axisCommon(theme, settings.showGrid),
			axisLabel: categoryAxisLabel(theme, 'bottom'),
		},
		yAxis: valueAxisOption(theme, settings.showGrid, logY),
		series: data.categories.map((category, index) => ({
			name: category,
			type: 'line',
			showSymbol: true,
			symbolSize: 10,
			data: data.seriesNames.map((series, seriesIndex) => ({
				name: series,
				value: logSafeValue(data.values[seriesIndex]?.[index] ?? 0, logY),
			})),
			label: labelStyle(theme, settings.showLabels),
			...motion(reduceMotion, category),
		})),
	};
}

function histogramOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	legend: object,
	logY: boolean,
): EChartsOption {
	const facet = data.categories.length >= 2 && data.categories.length <= 6;
	const all = allRawY(data);
	const domain = all.length > 0 ? { min: Math.min(...all), max: Math.max(...all) } : undefined;
	const groups = facet
		? data.categories.map((name, index) => ({ name, values: categoryRawValues(data, index) }))
		: [{ name: data.seriesNames[0] ?? 'Value', values: all }];
	const binCount = sturgesBinCount(Math.max(all.length, 1));
	const series: SeriesOption[] = groups.map((group) => {
		const bins = binCounts(group.values, binCount, domain);
		return {
			name: group.name,
			type: 'bar',
			barMaxWidth: facet ? 18 : 28,
			data: bins.map((bin) => ({
				name: formatNumber(bin.mid),
				value: [bin.mid, logSafeValue(bin.count, logY)],
				rawCount: bin.count,
			})),
			...motion(reduceMotion, group.name),
		};
	});
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend: { ...legend, show: settings.showLegend && facet },
		tooltip: { ...tooltipBase(theme), trigger: 'axis' },
		grid: cartesianGrid(false, data.categories, { bottom: 64 }),
		xAxis: {
			type: 'value',
			...axisCommon(theme, settings.showGrid),
			axisLabel: { color: theme.muted, formatter: formatAxisTick },
		},
		yAxis: valueAxisOption(theme, settings.showGrid, logY, { name: 'Count' }),
		series,
	};
}

function violinOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	legend: object,
	logY: boolean,
): EChartsOption {
	const all = allRawY(data).filter((value) => !logY || value > 0);
	const domain = all.length > 0 ? { min: Math.min(...all), max: Math.max(...all) } : undefined;
	const binCount = sturgesBinCount(Math.max(all.length, 1));
	const groups = data.categories.map((name, index) => ({
		name,
		bins: binCounts(
			categoryRawValues(data, index).filter((value) => !logY || value > 0),
			binCount,
			domain,
		),
	}));
	const maxCount = Math.max(1, ...groups.flatMap((group) => group.bins.map((bin) => bin.count)));
	const yMin = domain?.min ?? 0;
	const yMax = domain?.max ?? 1;
	const binHeight = yMax === yMin ? 1 : (yMax - yMin) / Math.max(1, binCount);
	const series: SeriesOption[] = groups.map((group, index) => ({
		name: group.name,
		type: 'custom',
		coordinateSystem: 'cartesian2d',
		data: group.bins
			.filter((bin) => bin.count > 0)
			.map((bin) => ({
				name: group.name,
				value: [index, bin.mid, bin.count, maxCount, binHeight],
			})),
		encode: { x: 0, y: 1 },
		renderItem: (_params, api) => {
			const categoryIndex = Number(api.value(0));
			const mid = Number(api.value(1));
			const count = Number(api.value(2));
			const peak = Number(api.value(3)) || 1;
			const height = Number(api.value(4)) || 1;
			const half = (count / peak) * 0.42;
			const start = api.coord([categoryIndex - half, mid - height / 2]);
			const end = api.coord([categoryIndex + half, mid + height / 2]);
			return {
				type: 'rect',
				shape: {
					x: Math.min(start[0] ?? 0, end[0] ?? 0),
					y: Math.min(start[1] ?? 0, end[1] ?? 0),
					width: Math.abs((end[0] ?? 0) - (start[0] ?? 0)),
					height: Math.abs((end[1] ?? 0) - (start[1] ?? 0)),
				},
				style: {
					fill: api.visual('color'),
					opacity: 0.72,
					stroke: theme.background,
					lineWidth: 0.5,
				},
			};
		},
		...motion(reduceMotion, group.name),
	}));
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend,
		tooltip: categoryTooltip(theme, data, settings, 'item'),
		grid: cartesianGrid(false, data.categories),
		xAxis: {
			type: 'value',
			min: -0.5,
			max: Math.max(0.5, data.categories.length - 0.5),
			interval: 1,
			...axisCommon(theme, settings.showGrid),
			axisLabel: {
				...categoryAxisLabel(theme, 'bottom'),
				formatter: (value: number) => {
					const index = Math.round(Number(value));
					if (Math.abs(Number(value) - index) > 1e-6) return '';
					return data.categories[index] ?? '';
				},
			},
		},
		yAxis: valueAxisOption(theme, settings.showGrid, logY, { min: yMin, max: yMax }),
		series,
	};
}

function barRaceOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
	anim: object,
	colors: string[],
	logY: boolean,
): EChartsOption {
	const frames = data.categories.map((date, timeIndex) => {
		const items = data.seriesNames
			.map((name, seriesIndex) => ({
				name,
				value: logSafeValue(data.values[seriesIndex]?.[timeIndex] ?? 0, logY),
				raw: data.values[seriesIndex]?.[timeIndex] ?? 0,
			}))
			.sort((left, right) => (left.raw ?? 0) - (right.raw ?? 0));
		return { date, items };
	});
	const first = frames[0]?.items ?? [];
	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		tooltip: categoryTooltip(theme, data, settings),
		timeline: {
			axisType: 'category',
			autoPlay: !reduceMotion,
			rewind: true,
			loop: true,
			playInterval: 1400,
			data: data.categories,
			left: 48,
			right: 48,
			bottom: 8,
			height: 36,
			label: { color: theme.muted },
			lineStyle: { color: theme.border },
			itemStyle: { color: theme.accent },
			controlStyle: { color: theme.muted, borderColor: theme.border },
			checkpointStyle: { color: theme.accent, borderColor: theme.accent },
			progress: { lineStyle: { color: theme.accent } },
		},
		grid: { top: 40, right: 36, bottom: 64, left: 16, containLabel: true },
		xAxis: valueAxisOption(theme, settings.showGrid, logY),
		yAxis: {
			type: 'category',
			data: first.map((item) => item.name),
			...axisCommon(theme, false),
			axisLabel: categoryAxisLabel(theme, 'left'),
		},
		options: frames.map((frame) => ({
			title: {
				text: frame.date,
				left: 12,
				top: 8,
				textStyle: { color: theme.muted, fontSize: 12 },
			},
			yAxis: { data: frame.items.map((item) => item.name) },
			series: [
				{
					type: 'bar',
					id: 'motion-race',
					data: frame.items,
					label: { ...labelStyle(theme, settings.showLabels), position: 'right' },
					universalTransition: reduceMotion ? false : { enabled: true, seriesKey: 'race' },
				},
			],
		})),
	};
}

function waffleCells(categories: string[], totals: number[], colors: string[]) {
	const cols = 10;
	const rows = 10;
	const target = cols * rows;
	const grand = totals.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
	const raw = totals.map((value) => (Math.max(0, value) / grand) * target);
	const counts = raw.map((value) => Math.floor(value));
	let used = counts.reduce((sum, value) => sum + value, 0);
	const remainders = raw
		.map((value, index) => ({ index, rem: value - (counts[index] ?? 0) }))
		.sort((a, b) => b.rem - a.rem);
	for (const item of remainders) {
		if (used >= target) break;
		counts[item.index] = (counts[item.index] ?? 0) + 1;
		used += 1;
	}
	const cells: { name: string; value: [number, number, number]; itemStyle: { color: string } }[] = [];
	let cursor = 0;
	categories.forEach((name, index) => {
		const count = counts[index] ?? 0;
		const color = colors[index % colors.length] ?? colors[0] ?? '#70b8ff';
		const amount = totals[index] ?? 0;
		for (let i = 0; i < count; i += 1) {
			const col = cursor % cols;
			const row = rows - 1 - Math.floor(cursor / cols);
			cells.push({
				name,
				value: [col, row, amount],
				itemStyle: { color },
			});
			cursor += 1;
		}
	});
	return cells;
}

function formatBoxTooltip(params: unknown): string {
	const item = params as { name?: string; seriesName?: string; value?: number[] };
	const value = item.value ?? [];
	const name = item.name ?? '';
	const series = item.seriesName ? `${item.seriesName}<br/>` : '';
	return [
		`${series}<b>${name}</b>`,
		`Max ${formatNumber(value[5] ?? value[4] ?? 0)}`,
		`P75 ${formatNumber(value[4] ?? value[3] ?? 0)}`,
		`Median ${formatNumber(value[3] ?? value[2] ?? 0)}`,
		`P25 ${formatNumber(value[2] ?? value[1] ?? 0)}`,
		`Min ${formatNumber(value[1] ?? value[0] ?? 0)}`,
	].join('<br/>');
}

export { formatNumber };
