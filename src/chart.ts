import type { EChartsOption, SeriesOption } from 'echarts';
import { boxFive } from './aggregate.ts';
import type { AggregatedChart, ChartSettings, ChartTheme } from './types.ts';

const CARTESIAN_TYPES = new Set<ChartSettings['chartType']>([
	'bar',
	'bar-horizontal',
	'bar-stacked',
	'line',
	'area',
	'scatter',
	'heatmap',
	'boxplot',
	'waterfall',
]);

export function usesCartesianGrid(chartType: ChartSettings['chartType']): boolean {
	return CARTESIAN_TYPES.has(chartType);
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

/** Show every category name. interval:'auto' / hideOverlap skips labels on dense Source charts. */
function categoryAxisLabel(theme: ChartTheme, placement: 'bottom' | 'left') {
	return {
		color: theme.muted,
		interval: 0,
		hideOverlap: false,
		rotate: placement === 'bottom' ? 45 : 0,
	};
}

function cartesianGrid(horizontal: boolean) {
	return horizontal
		? { top: 40, right: 24, bottom: 32, left: 28, containLabel: true }
		: { top: 40, right: 24, bottom: 120, left: 16, containLabel: true };
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
		backgroundColor: theme.panel,
		borderColor: theme.border,
		textStyle: { color: theme.text },
	};
}

function namedValues(categories: string[], values: number[]) {
	return categories.map((name, index) => ({ name, value: values[index] ?? 0 }));
}

function categoryTotals(data: AggregatedChart): number[] {
	return data.categories.map((_, index) =>
		data.values.reduce((sum, series) => sum + (series[index] ?? 0), 0),
	);
}

export function buildChartOption(
	data: AggregatedChart,
	settings: ChartSettings,
	theme: ChartTheme,
	reduceMotion: boolean,
): EChartsOption {
	const anim = animationConfig(reduceMotion);
	const colors = theme.colors;
	const legend = {
		show:
			settings.showLegend &&
			(data.seriesNames.length > 1 ||
				settings.chartType === 'pie' ||
				settings.chartType === 'doughnut' ||
				settings.chartType === 'rose' ||
				settings.chartType === 'funnel' ||
				settings.chartType === 'sunburst'),
		textStyle: { color: theme.muted },
		type: 'scroll' as const,
		top: 0,
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
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
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
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			series: [
				settings.chartType === 'sunburst'
					? {
							type: 'sunburst',
							radius: ['12%', '78%'],
							data: nested,
							label: { ...labelStyle(theme, true), minAngle: 4 },
							itemStyle: { borderColor: theme.background, borderWidth: 1 },
							...motion(reduceMotion, 'sunburst'),
						}
					: {
							type: 'treemap',
							roam: false,
							nodeClick: false,
							breadcrumb: { show: false },
							left: 8,
							right: 8,
							top: 8,
							bottom: 8,
							levels: [
								{
									itemStyle: { borderColor: theme.background, borderWidth: 3, gapWidth: 3 },
									upperLabel: { show: data.seriesNames.length > 1, color: theme.text },
								},
								{ itemStyle: { gapWidth: 1, borderColor: theme.background } },
							],
							label: { ...labelStyle(theme, true), formatter: '{b}\n{c}' },
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
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
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
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
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
			grid: { top: 40, right: 24, bottom: 120, left: 72, containLabel: true },
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
		const series: SeriesOption[] = data.seriesNames.map((name, seriesIndex) => ({
			name,
			type: 'boxplot',
			data: data.categories.map((category, index) => {
				const raw = data.rawValues[seriesIndex]?.[index] ?? [];
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
				formatter: (params: unknown) => formatBoxTooltip(params),
			},
			grid: cartesianGrid(false),
			xAxis: {
				type: 'category',
				data: data.categories,
				...axisCommon(theme, settings.showGrid),
				axisLabel: categoryAxisLabel(theme, 'bottom'),
			},
			yAxis: {
				type: 'value',
				...axisCommon(theme, settings.showGrid),
			},
			series,
		};
	}

	if (settings.chartType === 'scatter') {
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			grid: cartesianGrid(false),
			xAxis: {
				type: typeof data.points[0]?.x === 'number' ? 'value' : 'category',
				data: typeof data.points[0]?.x === 'number' ? undefined : data.categories,
				...axisCommon(theme, settings.showGrid),
				...(typeof data.points[0]?.x === 'number'
					? {}
					: { axisLabel: categoryAxisLabel(theme, 'bottom') }),
			},
			yAxis: {
				type: 'value',
				...axisCommon(theme, settings.showGrid),
			},
			series: data.seriesNames.map((name) => ({
				name,
				type: 'scatter',
				data: data.points
					.filter((point) => point.series === name)
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
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: tooltipBase(theme),
			grid: cartesianGrid(false),
			xAxis: {
				type: 'category',
				data: data.categories,
				...axisCommon(theme, settings.showGrid),
				axisLabel: categoryAxisLabel(theme, 'bottom'),
			},
			yAxis: {
				type: 'value',
				...axisCommon(theme, settings.showGrid),
			},
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

	const horizontal = settings.chartType === 'bar-horizontal';
	const stacked = settings.chartType === 'bar-stacked';
	const categoryAxis = {
		type: 'category' as const,
		data: data.categories,
		...axisCommon(theme, settings.showGrid && !horizontal),
		axisLabel: categoryAxisLabel(theme, horizontal ? 'left' : 'bottom'),
	};
	const valueAxis = {
		type: 'value' as const,
		...axisCommon(theme, settings.showGrid),
	};

	const series: SeriesOption[] = data.seriesNames.map((name, seriesIndex) => {
		const seriesData = namedValues(data.categories, data.values[seriesIndex] ?? []);
		if (settings.chartType === 'line' || settings.chartType === 'area') {
			return {
				name,
				type: 'line',
				data: seriesData,
				smooth: 0.2,
				showSymbol: settings.showLabels,
				areaStyle: settings.chartType === 'area' ? { opacity: 0.22 } : undefined,
				label: labelStyle(theme, settings.showLabels),
				...motion(reduceMotion, name),
			};
		}
		return {
			name,
			type: 'bar',
			stack: stacked ? 'total' : undefined,
			data: seriesData,
			label: {
				...labelStyle(theme, settings.showLabels),
				position: horizontal ? 'right' : stacked ? 'inside' : 'top',
			},
			...motion(reduceMotion, name),
		};
	});

	return {
		...anim,
		backgroundColor: theme.background,
		color: colors,
		legend,
		tooltip: tooltipBase(theme),
		grid: cartesianGrid(horizontal),
		xAxis: horizontal ? valueAxis : categoryAxis,
		yAxis: horizontal ? categoryAxis : valueAxis,
		series,
	};
}

function nestHierarchy(data: AggregatedChart) {
	if (data.seriesNames.length > 1) {
		return data.seriesNames.map((series, seriesIndex) => ({
			name: series,
			children: namedValues(data.categories, data.values[seriesIndex] ?? []),
		}));
	}
	return namedValues(data.categories, categoryTotals(data));
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

export function formatNumber(value: number): string {
	if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(1);
}
