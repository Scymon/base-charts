export const VIEW_TYPE = 'motion-chart';

export const CHART_TYPES = [
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
	'pie',
	'doughnut',
	'rose',
	'scatter',
	'heatmap',
	'calendar',
	'boxplot',
	'dumbbell',
	'ridgeline',
	'bubbles',
	'radar',
	'gauge',
	'treemap',
	'sunburst',
	'funnel',
	'waterfall',
	'sankey',
	'chord',
	'bar-polar',
	'streamgraph',
	'waffle',
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

export type ChartType = (typeof CHART_TYPES)[number];

export const AGGREGATIONS = ['count', 'sum', 'average', 'median'] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const SORT_MODES = ['time-asc', 'time-desc', 'value-desc', 'value-asc', 'label-asc', 'label-desc'] as const;
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
	y2Property: string | null;
	seriesProperty: string | null;
	aggregation: Aggregation;
	filterEmptyY: boolean;
	sort: SortMode;
	showLegend: boolean;
	showLabels: boolean;
	showGrid: boolean;
	logY: boolean;
	excludedTags: string[];
	maxCategories: number;
	/** Distinct notes required in an X category. 1 keeps every category (no sift). */
	minCategoryNotes: number;
}

export interface RawRow {
	xLabels: string[];
	seriesLabels: string[];
	y: number | null;
	y2?: number | null;
	xNumeric: number | null;
	fileName: string;
	filePath?: string;
	title?: string;
}

export interface CategoryNote {
	name: string;
	path: string;
	y: number;
}

export interface ScatterPoint {
	x: number | string;
	y: number;
	series: string;
	name: string;
	path?: string;
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
	y2Values: number[][];
	y2Category: number[];
	hasY2: boolean;
	notes: CategoryNote[][][];
	points: ScatterPoint[];
	overall: number | null;
	calendar: CalendarCell[];
}

export interface ChartTheme {
	background: string;
	primary: string;
	panel: string;
	text: string;
	muted: string;
	border: string;
	accent: string;
	colors: string[];
}

export interface ClickPayload {
	name?: string;
	seriesName?: string;
	dataType?: string;
	treePathInfo?: { name?: string }[];
	event?: { event?: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } };
	data?: {
		name?: string;
		source?: string;
		target?: string;
		path?: string;
		children?: unknown[];
		kind?: string;
		skipStart?: number;
		skipEnd?: number;
	};
}
