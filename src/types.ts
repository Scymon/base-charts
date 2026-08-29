export const VIEW_TYPE = 'motion-chart';

export const CHART_TYPES = [
	'bar',
	'bar-horizontal',
	'line',
	'area',
	'pie',
	'doughnut',
	'scatter',
	'heatmap',
	'radar',
	'gauge',
	'treemap',
	'funnel',
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

export interface AggregatedChart {
	categories: string[];
	seriesNames: string[];
	values: number[][];
	points: ScatterPoint[];
	overall: number | null;
}

export interface ChartTheme {
	background: string;
	text: string;
	muted: string;
	border: string;
	accent: string;
	colors: string[];
}
