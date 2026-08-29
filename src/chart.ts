import type { EChartsOption, SeriesOption } from 'echarts';
import type { AggregatedChart, ChartSettings, ChartTheme } from './types.ts';

const POLAR_TYPES = new Set(['pie', 'doughnut', 'radar', 'gauge', 'treemap', 'funnel']);

export function usesCartesianGrid(chartType: ChartSettings['chartType']): boolean {
	return !POLAR_TYPES.has(chartType);
}

function animationConfig(reduceMotion: boolean) {
	return {
		animation: !reduceMotion,
		animationDuration: reduceMotion ? 0 : 700,
		animationDurationUpdate: reduceMotion ? 0 : 500,
		animationEasing: 'cubicOut' as const,
		animationEasingUpdate: 'cubicOut' as const,
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
		rotate: placement === 'bottom' ? 40 : 0,
	};
}

function cartesianGrid(horizontal: boolean) {
	return horizontal
		? { top: 40, right: 24, bottom: 32, left: 28, containLabel: true }
		: { top: 40, right: 16, bottom: 88, left: 16, containLabel: true };
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
				settings.chartType === 'funnel'),
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
				},
			],
		};
	}

	if (settings.chartType === 'pie' || settings.chartType === 'doughnut') {
		const pieData = data.categories.map((name, index) => ({
			name,
			value: data.values.reduce((sum, series) => sum + (series[index] ?? 0), 0),
		}));
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			legend,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			series: [
				{
					type: 'pie',
					radius: settings.chartType === 'doughnut' ? ['46%', '72%'] : '68%',
					animationType: 'expansion',
					animationEasing: 'cubicOut',
					label: {
						...labelStyle(theme, settings.showLabels),
						formatter: '{b}: {d}%',
					},
					data: pieData,
				},
			],
		};
	}

	if (settings.chartType === 'treemap') {
		return {
			...anim,
			backgroundColor: theme.background,
			color: colors,
			tooltip: { ...tooltipBase(theme), trigger: 'item' },
			series: [
				{
					type: 'treemap',
					roam: false,
					nodeClick: false,
					breadcrumb: { show: false },
					label: { ...labelStyle(theme, true) },
					data: data.categories.map((name, index) => ({
						name,
						value: data.values.reduce((sum, series) => sum + (series[index] ?? 0), 0),
					})),
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
					data: data.categories.map((name, index) => ({
						name,
						value: data.values.reduce((sum, series) => sum + (series[index] ?? 0), 0),
					})),
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
				},
			],
		};
	}

	if (settings.chartType === 'heatmap') {
		const heatData: [number, number, number][] = [];
		data.seriesNames.forEach((series, y) => {
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
			grid: { top: 40, right: 24, bottom: 96, left: 72, containLabel: true },
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
					emphasis: { itemStyle: { shadowBlur: 8 } },
				},
			],
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
			})),
		};
	}

	const horizontal = settings.chartType === 'bar-horizontal';
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
		const seriesData = data.values[seriesIndex] ?? [];
		if (settings.chartType === 'line' || settings.chartType === 'area') {
			return {
				name,
				type: 'line',
				data: seriesData,
				smooth: 0.2,
				showSymbol: settings.showLabels,
				areaStyle: settings.chartType === 'area' ? { opacity: 0.22 } : undefined,
				label: labelStyle(theme, settings.showLabels),
				emphasis: { focus: 'series' },
			};
		}
		return {
			name,
			type: 'bar',
			data: seriesData,
			label: {
				...labelStyle(theme, settings.showLabels),
				position: horizontal ? 'right' : 'top',
			},
			emphasis: { focus: 'series' },
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

export function formatNumber(value: number): string {
	if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(1);
}
