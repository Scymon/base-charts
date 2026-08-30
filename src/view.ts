import {
	BasesView,
	parsePropertyId,
	type BasesPropertyId,
	type QueryController,
} from 'obsidian';
import * as echarts from 'echarts/core';
import {
	BarChart,
	BoxplotChart,
	CustomChart,
	FunnelChart,
	GaugeChart,
	GraphChart,
	HeatmapChart,
	LineChart,
	PieChart,
	RadarChart,
	SankeyChart,
	ScatterChart,
	SunburstChart,
	TreemapChart,
} from 'echarts/charts';
import {
	BrushComponent,
	CalendarComponent,
	DataZoomComponent,
	DataZoomInsideComponent,
	DataZoomSliderComponent,
	GridComponent,
	LegendComponent,
	RadarComponent,
	TooltipComponent,
	VisualMapComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import { aggregateRows } from './aggregate.ts';
import { buildChartOption } from './chart.ts';
import { pickOpenNote, resolveClickNotes } from './click.ts';
import { prefersReducedMotion, readChartTheme } from './theme.ts';
import {
	AGGREGATIONS,
	CHART_TYPES,
	DEFAULT_EXCLUDED_TAGS,
	SORT_MODES,
	VIEW_TYPE,
	type AggregatedChart,
	type CategoryNote,
	type ChartSettings,
	type ClickPayload,
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
	BoxplotChart,
	CustomChart,
	GraphChart,
	SunburstChart,
	SankeyChart,
	GridComponent,
	TooltipComponent,
	LegendComponent,
	VisualMapComponent,
	RadarComponent,
	CalendarComponent,
	DataZoomComponent,
	DataZoomInsideComponent,
	DataZoomSliderComponent,
	BrushComponent,
	LabelLayout,
	UniversalTransition,
	CanvasRenderer,
]);

export class MotionChartView extends BasesView {
	readonly type = VIEW_TYPE;
	private readonly rootEl: HTMLElement;
	private readonly chartEl: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly notesEl: HTMLElement;
	private chart: echarts.ECharts | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private defaultsApplied = false;
	private lastData: AggregatedChart | null = null;
	private clickBound = false;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.rootEl = parentEl.createDiv('motion-chart-view');
		this.emptyEl = this.rootEl.createDiv({ cls: 'motion-chart-empty' });
		this.chartEl = this.rootEl.createDiv({ cls: 'motion-chart-canvas' });
		this.notesEl = this.rootEl.createDiv({ cls: 'motion-chart-notes' });
		this.notesEl.hide();
	}

	onload(): void {
		this.ensureChart();
		this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
		this.resizeObserver.observe(this.rootEl);
		this.register(() => this.resizeObserver?.disconnect());
		this.registerEvent(this.app.workspace.on('css-change', () => this.render()));
		this.registerDomEvent(document, 'pointerdown', (event) => {
			if (!this.notesEl.contains(event.target as Node)) this.hideNotes();
		});
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
		this.lastData = aggregated;
		const hasValues =
			aggregated.categories.length > 0 &&
			(settings.aggregation === 'count' ||
				aggregated.overall != null ||
				aggregated.values.flat().some((value) => value !== 0));

		if (!settings.yProperty && settings.aggregation !== 'count') {
			this.showEmpty('Pick a numeric Y-axis in the view settings.');
			return;
		}
		if (!settings.xProperty && settings.chartType !== 'gauge') {
			this.showEmpty('Pick an X-axis property such as a category, list, or date.');
			return;
		}
		if (settings.chartType === 'calendar' && aggregated.calendar.length === 0) {
			this.showEmpty('Calendar heatmap needs a date X-axis such as a date property or file.ctime.');
			return;
		}
		if (!hasValues) {
			this.showEmpty('No data to chart. Filter empty numeric values, or turn off “Filter empty Y values”.');
			return;
		}

		this.emptyEl.hide();
		this.chartEl.show();
		const theme = readChartTheme(this.rootEl);
		const option = buildChartOption(aggregated, settings, theme, prefersReducedMotion());
		this.ensureChart().setOption(option, {
			replaceMerge: ['series', 'xAxis', 'yAxis', 'radar', 'calendar', 'visualMap', 'dataZoom'],
		});
		this.chart?.resize();
	}

	private ensureChart(): echarts.ECharts {
		if (!this.chart) {
			this.chart = echarts.init(this.chartEl, undefined, { renderer: 'canvas' });
		}
		if (!this.clickBound && this.chart) {
			this.clickBound = true;
			this.chart.on('click', (params) => this.onChartClick(params as ClickPayload));
		}
		return this.chart;
	}

	private onChartClick(payload: ClickPayload): void {
		if (!this.lastData) return;
		const notes = resolveClickNotes(this.lastData, payload);
		const top = pickOpenNote(notes);
		if (!top) return;
		void this.openNote(top);
		if (notes.length > 1) this.showNotes(notes);
		else this.hideNotes();
	}

	private async openNote(note: CategoryNote): Promise<void> {
		if (!note.path) return;
		await this.app.workspace.openLinkText(note.path, '', false);
	}

	private showNotes(notes: CategoryNote[]): void {
		this.notesEl.empty();
		this.notesEl.createDiv({ cls: 'motion-chart-notes-title', text: `${notes.length} notes` });
		const list = this.notesEl.createDiv({ cls: 'motion-chart-notes-list' });
		for (const note of notes.slice(0, 12)) {
			const button = list.createEl('button', { cls: 'motion-chart-notes-item', text: note.name });
			button.addEventListener('click', (event) => {
				event.preventDefault();
				void this.openNote(note);
			});
		}
		this.notesEl.show();
	}

	private hideNotes(): void {
		this.notesEl.hide();
		this.notesEl.empty();
	}

	private showEmpty(message: string): void {
		this.chartEl.hide();
		this.notesEl.hide();
		this.emptyEl.show();
		this.emptyEl.setText(message);
	}

	private readSettings(): ChartSettings {
		const config = this.config;
		return {
			chartType: asEnum(config.get('chartType'), CHART_TYPES, 'bar'),
			xProperty: config.getAsPropertyId('xAxis'),
			yProperty: config.getAsPropertyId('yAxis'),
			y2Property: config.getAsPropertyId('y2Axis'),
			seriesProperty: config.getAsPropertyId('seriesBy'),
			aggregation: asEnum(config.get('aggregation'), AGGREGATIONS, 'median'),
			filterEmptyY: asBool(config.get('filterEmptyY'), true),
			sort: asEnum(config.get('sort'), SORT_MODES, 'value-desc'),
			showLegend: asBool(config.get('showLegend'), true),
			showLabels: asBool(config.get('showLabels'), false),
			showGrid: asBool(config.get('showGrid'), true),
			logY: asBool(config.get('logY'), false),
			excludedTags: parseExcludedTags(config.get('excludedTags'), DEFAULT_EXCLUDED_TAGS),
			maxCategories: asNumberSetting(config.get('maxCategories'), 30),
		};
	}

	private collectRows(settings: ChartSettings): RawRow[] {
		if (!this.data) return [];
		const xId = settings.xProperty as BasesPropertyId | null;
		const yId = settings.yProperty as BasesPropertyId | null;
		const y2Id = settings.y2Property as BasesPropertyId | null;
		const seriesId = settings.seriesProperty as BasesPropertyId | null;
		const titleId = findProperty(this.allProperties, ['title']);
		const rows: RawRow[] = [];

		for (const entry of this.data.data) {
			const xValue = xId ? entry.getValue(xId) : null;
			const yValue = yId ? entry.getValue(yId) : null;
			const y2Value = y2Id ? entry.getValue(y2Id) : null;
			const seriesValue = seriesId ? entry.getValue(seriesId) : null;
			const titleValue = titleId ? entry.getValue(titleId) : null;
			const title = titleValue?.toString().trim();
			rows.push({
				xLabels: categoryLabels(xValue),
				seriesLabels: seriesId ? categoryLabels(seriesValue) : [],
				y: asNumber(yValue),
				y2: asNumber(y2Value),
				xNumeric: asNumber(xValue),
				fileName: entry.file.basename,
				filePath: entry.file.path,
				title: title || entry.file.basename,
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
