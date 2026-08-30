export const VIEW_TYPE = 'motion-chart';

export const CHART_TYPES = [
	'bar',
	'bar-horizontal',
	'bar-stacked',
	'line',
	'area',
	'pie',
	'doughnut',
	'rose',
	'scatter',
	'heatmap',
	'calendar',
	'boxplot',
	'bubbles',
	'radar',
	'gauge',
	'treemap',
	'sunburst',
	'funnel',
	'waterfall',
	'sankey',
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export const AGGREGATIONS = ['count', 'sum', 'average', 'median'] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const SORT_MODES = ['value-desc', 'value-asc', 'label-asc', 'label-desc'] as const;
export type SortMode = (typeof SORT_MODES)[number];

export const DEFAULT_EXCLUDED_TAGS = [
	'viral',
	'viral-video',
	'the-quartering',
	'jeremy-hambly',
	'quartering-live',
];

export interface ChartSettings {
	chartType: ChartType;
	xProperty: string | null;
	yProperty: string | null;
	seriesProperty: string | null;
	aggregation: Aggregation;
	filterEmptyY: boolean;
	sort: SortMode;
	showLegend: boolean;
	showLabels: boolean;
	showGrid: boolean;
	excludedTags: string[];
	maxCategories: number;
}

export interface RawRow {
	xLabels: string[];
	seriesLabels: string[];
	y: number | null;
	xNumeric: number | null;
	fileName: string;
}

export interface ScatterPoint {
	x: number | string;
	y: number;
	series: string;
	name: string;
}

export type BoxFive = [number, number, number, number, number];

export interface CalendarCell {
	date: string;
	value: number;
}

export interface AggregatedChart {
	categories: string[];
	seriesNames: string[];
	values: number[][];
	rawValues: number[][][];
	points: ScatterPoint[];
	overall: number | null;
	calendar: CalendarCell[];
}

export interface ChartTheme {
	background: string;
	panel: string;
	text: string;
	muted: string;
	border: string;
	accent: string;
	colors: string[];
}
