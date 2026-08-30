import type { BasesAllOptions, BasesViewConfig } from 'obsidian';
import { usesCartesianGrid } from './chart.ts';
import { AGGREGATIONS, CHART_TYPES, DEFAULT_EXCLUDED_TAGS, SORT_MODES, type ChartType } from './types.ts';

const CHART_TYPE_LABELS: Record<ChartType, string> = {
	bar: 'Bar',
	'bar-horizontal': 'Horizontal bar',
	'bar-stacked': 'Stacked bar',
	line: 'Line',
	area: 'Area',
	pie: 'Pie',
	doughnut: 'Doughnut',
	rose: 'Nightingale',
	scatter: 'Scatter',
	heatmap: 'Heatmap',
	calendar: 'Calendar heatmap',
	boxplot: 'Boxplot',
	bubbles: 'Packed bubbles',
	radar: 'Radar',
	gauge: 'Gauge',
	treemap: 'Treemap',
	sunburst: 'Sunburst',
	funnel: 'Funnel',
	waterfall: 'Waterfall',
	sankey: 'Sankey',
};

export function viewOptions(config: BasesViewConfig): BasesAllOptions[] {
	const chartType = (String(config.get('chartType') ?? 'bar') as ChartType);
	const cartesian = usesCartesianGrid(chartType);

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
	if (value === 'value-asc') return 'Value (low to high)';
	if (value === 'label-asc') return 'Label (A–Z)';
	if (value === 'label-desc') return 'Label (Z–A)';
	return 'Value (high to low)';
}
