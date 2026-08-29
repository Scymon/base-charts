import {
	BasesView,
	parsePropertyId,
	type BasesPropertyId,
	type QueryController,
} from 'obsidian';
import * as echarts from 'echarts/core';
import {
	BarChart,
	FunnelChart,
	GaugeChart,
	HeatmapChart,
	LineChart,
	PieChart,
	RadarChart,
	ScatterChart,
	TreemapChart,
} from 'echarts/charts';
import {
	GridComponent,
	LegendComponent,
	RadarComponent,
	TooltipComponent,
	VisualMapComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import { aggregateRows } from './aggregate.ts';
import { buildChartOption } from './chart.ts';
import { prefersReducedMotion, readChartTheme } from './theme.ts';
import {
	AGGREGATIONS,
	CHART_TYPES,
	DEFAULT_EXCLUDED_TAGS,
	SORT_MODES,
	VIEW_TYPE,
	type ChartSettings,
	type RawRow,
} from './types.ts';
import { parseExcludedTags } from './labels.ts';
import { asNumber, categoryLabels } from './values.ts';

echarts.use([
	BarChart,
	LineChart,
	PieChart,
	ScatterChart,
	HeatmapChart,
	RadarChart,
	GaugeChart,
	TreemapChart,
	FunnelChart,
	GridComponent,
	TooltipComponent,
	LegendComponent,
	VisualMapComponent,
	RadarComponent,
	LabelLayout,
	CanvasRenderer,
]);

export class MotionChartView extends BasesView {
	readonly type = VIEW_TYPE;
	private readonly rootEl: HTMLElement;
	private readonly chartEl: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private chart: echarts.ECharts | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private defaultsApplied = false;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.rootEl = parentEl.createDiv('motion-chart-view');
		this.emptyEl = this.rootEl.createDiv({ cls: 'motion-chart-empty' });
		this.chartEl = this.rootEl.createDiv({ cls: 'motion-chart-canvas' });
	}

	onload(): void {
		this.ensureChart();
		this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
		this.resizeObserver.observe(this.rootEl);
		this.register(() => this.resizeObserver?.disconnect());
		this.registerEvent(this.app.workspace.on('css-change', () => this.render()));
	}

	onunload(): void {
		this.chart?.dispose();
		this.chart = null;
	}

	onDataUpdated(): void {
		this.applyDefaultAxes();
		this.render();
	}

	private applyDefaultAxes(): void {
		if (this.defaultsApplied) return;
		this.defaultsApplied = true;
		if (!this.config.getAsPropertyId('yAxis')) {
			const score = findProperty(this.allProperties, ['Score']);
			if (score) this.config.set('yAxis', score);
		}
		if (!this.config.getAsPropertyId('xAxis')) {
			const x = findProperty(this.allProperties, ['Source', 'topic', 'tags']) ?? fileNameProperty(this.allProperties);
			if (x) this.config.set('xAxis', x);
		}
	}

	private render(): void {
		const settings = this.readSettings();
		const rows = this.collectRows(settings);
		const aggregated = aggregateRows(rows, settings);
		const hasValues =
			aggregated.categories.length > 0 &&
			(settings.aggregation === 'count' ||
				aggregated.overall != null ||
				aggregated.values.flat().some((value) => value !== 0));

		if (!settings.yProperty && settings.aggregation !== 'count') {
			this.showEmpty('Pick a numeric Y-axis in the view settings. For Shorts, use Score with median or average.');
			return;
		}
		if (!settings.xProperty && settings.chartType !== 'gauge') {
			this.showEmpty('Pick an X-axis property such as Source, topic, or tags.');
			return;
		}
		if (!hasValues) {
			this.showEmpty('No data to chart. Filter Score not empty, or turn off “Filter empty Y values”.');
			return;
		}

		this.emptyEl.hide();
		this.chartEl.show();
		const theme = readChartTheme(this.rootEl);
		const option = buildChartOption(aggregated, settings, theme, prefersReducedMotion());
		this.ensureChart().setOption(option, { notMerge: true });
		this.chart?.resize();
	}

	private ensureChart(): echarts.ECharts {
		if (!this.chart) {
			this.chart = echarts.init(this.chartEl, undefined, { renderer: 'canvas' });
		}
		return this.chart;
	}

	private showEmpty(message: string): void {
		this.chartEl.hide();
		this.emptyEl.show();
		this.emptyEl.setText(message);
	}

	private readSettings(): ChartSettings {
		const config = this.config;
		return {
			chartType: asEnum(config.get('chartType'), CHART_TYPES, 'bar'),
			xProperty: config.getAsPropertyId('xAxis'),
			yProperty: config.getAsPropertyId('yAxis'),
			seriesProperty: config.getAsPropertyId('seriesBy'),
			aggregation: asEnum(config.get('aggregation'), AGGREGATIONS, 'median'),
			filterEmptyY: asBool(config.get('filterEmptyY'), true),
			sort: asEnum(config.get('sort'), SORT_MODES, 'value-desc'),
			showLegend: asBool(config.get('showLegend'), true),
			showLabels: asBool(config.get('showLabels'), false),
			showGrid: asBool(config.get('showGrid'), true),
			excludedTags: parseExcludedTags(config.get('excludedTags'), DEFAULT_EXCLUDED_TAGS),
			maxCategories: asNumberSetting(config.get('maxCategories'), 30),
		};
	}

	private collectRows(settings: ChartSettings): RawRow[] {
		if (!this.data) return [];
		const xId = settings.xProperty as BasesPropertyId | null;
		const yId = settings.yProperty as BasesPropertyId | null;
		const seriesId = settings.seriesProperty as BasesPropertyId | null;
		const rows: RawRow[] = [];

		for (const entry of this.data.data) {
			const xValue = xId ? entry.getValue(xId) : null;
			const yValue = yId ? entry.getValue(yId) : null;
			const seriesValue = seriesId ? entry.getValue(seriesId) : null;
			rows.push({
				xLabels: categoryLabels(xValue),
				seriesLabels: seriesId ? categoryLabels(seriesValue) : [],
				y: asNumber(yValue),
				xNumeric: asNumber(xValue),
				fileName: entry.file.basename,
			});
		}
		return rows;
	}
}

function findProperty(ids: BasesPropertyId[], names: string[]): BasesPropertyId | null {
	const wanted = names.map((name) => name.toLowerCase());
	for (const id of ids) {
		const { name } = parsePropertyId(id);
		if (wanted.includes(name.toLowerCase())) return id;
	}
	return null;
}

function fileNameProperty(ids: BasesPropertyId[]): BasesPropertyId | null {
	return ids.find((id) => id === 'file.name') ?? null;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
	if (value == null || value === '') return fallback;
	if (typeof value === 'boolean') return value;
	if (value === 'false' || value === '0') return false;
	return Boolean(value);
}

function asNumberSetting(value: unknown, fallback: number): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}
