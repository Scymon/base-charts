import type { BasesAllOptions, BasesViewConfig } from 'obsidian';
import { supportsLogY, usesCartesianGrid } from './chart.ts';
import { AGGREGATIONS, CHART_TYPES, DEFAULT_EXCLUDED_TAGS, SORT_MODES, type ChartType } from './types.ts';

const CHART_TYPE_LABELS: Record<ChartType, string> = {
	bar: 'Bar',
	'bar-horizontal': 'Horizontal bar',
	'bar-stacked': 'Stacked bar',
	'bar-percent': 'Percent stacked bar',
	combo: 'Combo',
	lollipop: 'Lollipop',
	line: 'Line',
	'line-step': 'Step line',
	area: 'Area',
	'area-stacked': 'Stacked area',
	pie: 'Pie',
	doughnut: 'Doughnut',
	rose: 'Nightingale',
	scatter: 'Scatter',
	heatmap: 'Heatmap',
	calendar: 'Calendar heatmap',
	boxplot: 'Boxplot',
	dumbbell: 'Dumbbell',
	ridgeline: 'Ridgeline',
	bubbles: 'Packed bubbles',
	radar: 'Radar',
	gauge: 'Gauge',
	treemap: 'Treemap',
	sunburst: 'Sunburst',
	funnel: 'Funnel',
	waterfall: 'Waterfall',
	sankey: 'Sankey',
	chord: 'Chord',
	'bar-polar': 'Polar bar',
	streamgraph: 'Streamgraph',
	waffle: 'Waffle',
	icicle: 'Icicle',
	tree: 'Tree',
	parallel: 'Parallel coordinates',
	network: 'Network',
	marimekko: 'Marimekko',
	bullet: 'Bullet',
	slope: 'Slope',
	histogram: 'Histogram',
	violin: 'Violin',
	'bar-race': 'Bar race',
};

export function viewOptions(config: BasesViewConfig): BasesAllOptions[] {
	const chartType = String(config.get('chartType') ?? 'bar') as ChartType;
	const cartesian = usesCartesianGrid(chartType);
	const showY2 = chartType === 'combo' || chartType === 'bullet';
	const logY = supportsLogY(chartType);

	return [
		{
			type: 'dropdown',
			key: 'chartType',
			displayName: 'Chart type',
			default: 'bar',
			options: Object.fromEntries(CHART_TYPES.map((type) => [type, CHART_TYPE_LABELS[type]])),
		},
		{
			type: 'property',
			key: 'xAxis',
			displayName: 'X-axis',
			placeholder: 'Category or time',
		},
		{
			type: 'property',
			key: 'yAxis',
			displayName: 'Y-axis',
			placeholder: 'Numeric property',
		},
		{
			type: 'property',
			key: 'y2Axis',
			displayName: 'Y2-axis',
			placeholder: 'Second numeric property',
			shouldHide: () => !showY2,
		},
		{
			type: 'dropdown',
			key: 'aggregation',
			displayName: 'Aggregation',
			default: 'median',
			options: Object.fromEntries(AGGREGATIONS.map((item) => [item, labelAggregation(item)])),
		},
		{
			type: 'property',
			key: 'seriesBy',
			displayName: 'Series by',
			placeholder: 'None (single series)',
		},
		{
			type: 'toggle',
			key: 'filterEmptyY',
			displayName: 'Filter empty Y values',
			default: true,
		},
		{
			type: 'dropdown',
			key: 'sort',
			displayName: 'Sort',
			default: 'value-desc',
			options: Object.fromEntries(SORT_MODES.map((item) => [item, labelSort(item)])),
		},
		{
			type: 'slider',
			key: 'maxCategories',
			displayName: 'Max categories',
			default: 30,
			min: 5,
			max: 80,
			step: 1,
		},
		Object.assign(
			{
				type: 'slider' as const,
				key: 'minCategoryNotes',
				displayName: 'Min n',
				default: 1,
				min: 1,
				max: 20,
				step: 1,
			},
			{ placeholder: '1 shows every category. Higher drops groups with fewer notes.' },
		),
		{
			type: 'multitext',
			key: 'excludedTags',
			displayName: 'Exclude tags',
			default: DEFAULT_EXCLUDED_TAGS,
		},
		{
			type: 'group',
			displayName: 'Display',
			items: [
				{
					type: 'toggle',
					key: 'showLegend',
					displayName: 'Legend',
					default: true,
				},
				{
					type: 'toggle',
					key: 'showLabels',
					displayName: 'Data labels',
					default: false,
				},
				{
					type: 'toggle',
					key: 'showGrid',
					displayName: 'Grid',
					default: true,
					shouldHide: () => !cartesian,
				},
				{
					type: 'toggle',
					key: 'logY',
					displayName: 'Log Y',
					default: false,
					shouldHide: () => !logY,
				},
			],
		},
	];
}

function labelAggregation(value: string): string {
	if (value === 'count') return 'Count';
	if (value === 'sum') return 'Sum';
	if (value === 'average') return 'Average';
	return 'Median';
}

function labelSort(value: string): string {
	if (value === 'time-asc') return 'Time (old → new)';
	if (value === 'time-desc') return 'Time (new → old)';
	if (value === 'value-asc') return 'Value (low to high)';
	if (value === 'label-asc') return 'Label (A–Z)';
	if (value === 'label-desc') return 'Label (Z–A)';
	return 'Value (high to low)';
}
