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
	ThemeRiverChart,
	TreemapChart,
	TreeChart,
	ParallelChart,
} from 'echarts/charts';
import {
	BrushComponent,
	CalendarComponent,
	DataZoomComponent,
	DataZoomInsideComponent,
	DataZoomSliderComponent,
	GridComponent,
	LegendComponent,
	ParallelComponent,
	PolarComponent,
	RadarComponent,
	SingleAxisComponent,
	TimelineComponent,
	TitleComponent,
	TooltipComponent,
	VisualMapComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import { aggregateRows } from './aggregate.ts';
import {
	buildChartOption,
	categoryWindowHint,
	CHART_OPTION_REPLACE_MERGE,
	initialCategoryWindow,
	shouldResetChart,
	SLIDER_EDGE,
	SLIDER_END,
	SLIDER_HEIGHT,
	SLIDER_START,
	usesCartesianGrid,
	ZOOM_AFTER,
} from './chart.ts';
import {
	axisPlacementFromEvent,
	categoryAxisLabelHandlers,
	dataZoomRangeForIndices,
	isAxisComponentEvent,
	planCategoryAxisTicks,
	resolveAxisEllipsisRange,
	visibleIndexRange,
	type AxisLabelPlan,
} from './axisLabels.ts';
import { inferUnspecifiedSort } from './time.ts';
import { pickOpenNote, resolveClickNotes, shouldOpenNotesOnClick } from './click.ts';
import { formatSkippedLabelsTooltip, notePathFromTarget } from './tooltip.ts';
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
	ThemeRiverChart,
	TreeChart,
	ParallelChart,
	PolarComponent,
	ParallelComponent,
	TimelineComponent,
	TitleComponent,
	SingleAxisComponent,
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
	private readonly hintEl: HTMLElement;
	private readonly ellipsisTipEl: HTMLElement;
	private chart: echarts.ECharts | null = null;
	private ellipsisSyncing = false;
	private resizeObserver: ResizeObserver | null = null;
	private defaultsApplied = false;
	private timeSortApplied = false;
	private lastData: AggregatedChart | null = null;
	private clickBound = false;
	private drillName: string | null = null;
	private lastChartType: ChartSettings['chartType'] | null = null;
	private categoryAxisPlans: {
		placement: 'bottom' | 'left';
		labels: string[];
		property: string | null;
		plan: AxisLabelPlan;
	}[] = [];

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.rootEl = parentEl.createDiv('motion-chart-view');
		this.emptyEl = this.rootEl.createDiv({ cls: 'motion-chart-empty' });
		this.chartEl = this.rootEl.createDiv({ cls: 'motion-chart-canvas' });
		this.hintEl = this.rootEl.createDiv({ cls: 'motion-chart-hint' });
		this.notesEl = this.rootEl.createDiv({ cls: 'motion-chart-notes' });
		this.ellipsisTipEl = this.rootEl.createDiv({ cls: 'motion-chart-ellipsis-tip' });
		this.hintEl.hide();
		this.notesEl.hide();
		this.ellipsisTipEl.hide();
	}

	onload(): void {
		this.ensureChart();
		this.resizeObserver = new ResizeObserver(() => {
			if (!this.chart) return;
			this.syncChartSize(this.chart);
			this.syncCategoryEllipsis();
		});
		this.resizeObserver.observe(this.rootEl);
		this.resizeObserver.observe(this.chartEl);
		this.register(() => this.resizeObserver?.disconnect());
		this.registerEvent(this.app.workspace.on('css-change', () => this.render()));
		this.registerDomEvent(document, 'pointerdown', (event) => {
			if (!this.notesEl.contains(event.target as Node)) this.hideNotes();
		});
		this.registerDomEvent(
			this.rootEl,
			'click',
			(event) => {
				const path = notePathFromTarget(event.target);
				if (!path) return;
				event.preventDefault();
				event.stopPropagation();
				const named = this.lastData?.notes.flat(2).find((note) => note.path === path);
				void this.openNote(named ?? { name: '', path, y: 0 });
			},
			true,
		);
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
		if (!this.config.getAsPropertyId('xAxis')) {
			const x = fileNameProperty(this.allProperties);
			if (x) this.config.set('xAxis', x);
		}
	}

	private applyDefaultTimeSort(rows: RawRow[]): void {
		if (this.timeSortApplied) return;
		this.timeSortApplied = true;
		const labels = rows.flatMap((row) => row.xLabels);
		const inferred = inferUnspecifiedSort(this.config.get('sort'), labels);
		if (inferred !== this.config.get('sort')) {
			this.config.set('sort', inferred);
		}
	}

	private render(): void {
		let settings = this.readSettings();
		const resetChart = shouldResetChart(this.lastChartType, settings.chartType);
		if (this.lastChartType !== settings.chartType) {
			this.drillName = null;
			this.lastChartType = settings.chartType;
		}
		const rows = this.collectRows(settings);
		this.applyDefaultTimeSort(rows);
		settings = this.readSettings();
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
		try {
			const theme = readChartTheme(this.rootEl);
			const option = buildChartOption(aggregated, settings, theme, prefersReducedMotion(), {
				drillName: this.drillName,
			});
			const chart = this.ensureChart();
			this.syncChartSize(chart);
			if (resetChart) chart.clear();
			chart.setOption(option, {
				replaceMerge: [...CHART_OPTION_REPLACE_MERGE],
			});
			this.syncSliderChrome(option);
			this.syncChartSize(chart);
			this.syncCategoryEllipsis();
		} catch {
			this.showEmpty('Could not draw this chart. Check the axis settings, or try another chart type.');
			return;
		}
		this.updateHint(aggregated, settings);
	}

	/** Skip 0×0 resizes while the canvas is display:none so a later show() is not stuck blank. */
	private syncChartSize(chart: echarts.ECharts): void {
		const width = this.chartEl.clientWidth;
		const height = this.chartEl.clientHeight;
		if (width > 0 && height > 0) {
			chart.resize({ width, height });
		}
	}

	private updateHint(data: AggregatedChart, settings: ChartSettings): void {
		const total = data.categories.length;
		const visible = initialCategoryWindow(data.categories, settings.maxCategories);
		const text = categoryWindowHint(visible, total);
		if (!text) {
			this.hintEl.hide();
			this.hintEl.setText('');
			return;
		}
		this.hintEl.setText(text);
		this.hintEl.show();
	}

	private ensureChart(): echarts.ECharts {
		if (!this.chart) {
			this.chart = echarts.init(this.chartEl, undefined, { renderer: 'canvas' });
		}
		if (!this.clickBound && this.chart) {
			this.clickBound = true;
			this.chart.on('click', (params) => this.onChartClick(params as ClickPayload));
			this.chart.on('mouseover', (params) => {
				const range = this.resolveViewEllipsis(params);
				if (!range) return;
				const axis = this.axisPlanForEvent(params);
				this.showEllipsisTip(
					range.start,
					range.end,
					axis?.labels ?? this.lastData?.categories ?? [],
					axis?.property ?? this.readSettings().xProperty,
					eventPixel(params),
				);
			});
			this.chart.on('mouseout', (params) => {
				if (this.resolveViewEllipsis(params)) this.hideEllipsisTip();
			});
			this.chart.getZr().on('click', (event) => {
				if (!event.target) {
					this.hideNotes();
					this.hideEllipsisTip();
					if (this.drillName) {
						this.drillName = null;
						this.render();
					}
				}
			});
			this.chart.on('datazoom', (raw) => {
				const ev = raw as { start?: number; end?: number; batch?: { start?: number; end?: number }[] };
				const start = ev.start ?? ev.batch?.[0]?.start ?? 0;
				const end = ev.end ?? ev.batch?.[0]?.end ?? 100;
				const total = this.lastData?.categories.length ?? 0;
				if (total < ZOOM_AFTER) return;
				const shown = Math.max(1, Math.round(((end - start) / 100) * total));
				const text = categoryWindowHint(shown, total);
				if (text) {
					this.hintEl.setText(text);
					this.hintEl.show();
				} else {
					this.hintEl.hide();
					this.hintEl.setText('');
				}
				this.syncCategoryEllipsis();
			});
		}
		return this.chart;
	}

	private onChartClick(payload: ClickPayload): void {
		const range = this.resolveViewEllipsis(payload);
		if (range) {
			this.hideEllipsisTip();
			this.zoomToCategoryRange(range.start, range.end, this.lastData?.categories.length ?? 0);
			return;
		}
		if (isAxisComponentEvent(payload)) return;
		if (!this.lastData) return;
		if (this.readSettings().chartType === 'icicle' && !shouldOpenNotesOnClick(payload)) {
			this.drillName = payload.name ?? payload.data?.name ?? null;
			this.render();
			return;
		}
		if (!shouldOpenNotesOnClick(payload)) return;
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

	private categoryAxesForChart(
		settings: ChartSettings,
		data: AggregatedChart,
	): { placement: 'bottom' | 'left'; labels: string[]; property: string | null }[] {
		const type = settings.chartType;
		if (type === 'heatmap') {
			return [
				{ placement: 'bottom', labels: data.categories, property: settings.xProperty },
				{ placement: 'left', labels: data.seriesNames, property: settings.seriesProperty },
			];
		}
		if (type === 'bar-horizontal' || type === 'bullet') {
			return [{ placement: 'left', labels: data.categories, property: settings.xProperty }];
		}
		if (type === 'slope' && data.seriesNames.length >= 2) {
			return [{ placement: 'bottom', labels: data.seriesNames, property: settings.seriesProperty }];
		}
		if (type === 'scatter' && typeof data.points[0]?.x === 'number') return [];
		if (!usesCartesianGrid(type)) return [];
		if (
			type === 'ridgeline' ||
			type === 'histogram' ||
			type === 'waffle' ||
			type === 'icicle' ||
			type === 'marimekko'
		) {
			return [];
		}
		return [{ placement: 'bottom', labels: data.categories, property: settings.xProperty }];
	}

	private resolveViewEllipsis(payload: unknown): { start: number; end: number } | null {
		for (const axis of this.axisPlansForEvent(payload)) {
			const range = resolveAxisEllipsisRange(payload, axis.plan, axis.labels);
			if (range) return range;
		}
		return null;
	}

	private axisPlanForEvent(payload: unknown): (typeof this.categoryAxisPlans)[number] | undefined {
		return this.axisPlansForEvent(payload)[0];
	}

	private axisPlansForEvent(payload: unknown): typeof this.categoryAxisPlans {
		const placement = axisPlacementFromEvent(payload);
		if (!placement) return this.categoryAxisPlans;
		return this.categoryAxisPlans.filter((axis) => axis.placement === placement);
	}

	private syncCategoryEllipsis(): void {
		const chart = this.chart;
		const data = this.lastData;
		if (!chart || !data || this.ellipsisSyncing) return;
		const settings = this.readSettings();
		const axes = this.categoryAxesForChart(settings, data);
		if (axes.length === 0) {
			this.categoryAxisPlans = [];
			this.hideEllipsisTip();
			return;
		}
		this.ellipsisSyncing = true;
		try {
			const option = chart.getOption() as {
				dataZoom?: unknown;
				xAxis?: unknown;
				yAxis?: unknown;
			};
			const xAxes = asOptionList(option.xAxis);
			const yAxes = asOptionList(option.yAxis);
			let xLabel: ReturnType<typeof categoryAxisLabelHandlers> | undefined;
			let yLabel: ReturnType<typeof categoryAxisLabelHandlers> | undefined;
			this.categoryAxisPlans = [];

			for (const axis of axes) {
				const zoom = readZoomWindow(option, axis.placement, axis.labels.length);
				const length = measureCategoryAxisLength(chart, axis.placement, zoom.startIndex, zoom.endIndex);
				const plan = planCategoryAxisTicks(axis.labels, length, {
					placement: axis.placement,
					rotate: axis.placement === 'bottom' ? 45 : 0,
					visibleStart: zoom.startIndex,
					visibleEnd: zoom.endIndex,
				});
				this.categoryAxisPlans.push({ ...axis, plan });
				const handlers = categoryAxisLabelHandlers(plan);
				if (axis.placement === 'bottom') xLabel = handlers;
				else yLabel = handlers;
			}

			const next: Record<string, unknown> = {};
			if (xLabel) {
				next.xAxis =
					xAxes.length > 1
						? xAxes.map((_, index) => (index === 0 ? { axisLabel: xLabel } : {}))
						: { axisLabel: xLabel };
			}
			if (yLabel) {
				next.yAxis =
					yAxes.length > 1
						? yAxes.map((_, index) => (index === 0 ? { axisLabel: yLabel } : {}))
						: { axisLabel: yLabel };
			}
			if (Object.keys(next).length > 0) {
				chart.setOption(next, { lazyUpdate: true });
			}
		} finally {
			this.ellipsisSyncing = false;
		}
	}

	private zoomToCategoryRange(start: number, end: number, total: number): void {
		if (!this.chart || total <= 0) return;
		const option = this.chart.getOption() as { dataZoom?: unknown };
		const zooms = asOptionList(option.dataZoom);
		if (zooms.length === 0) return;
		const zoom = dataZoomRangeForIndices(start, end, total);
		this.chart.dispatchAction({
			type: 'dataZoom',
			startValue: zoom.startValue,
			endValue: zoom.endValue,
			start: zoom.start,
			end: zoom.end,
		});
	}

	private showEllipsisTip(
		start: number,
		end: number,
		labels: string[],
		property: string | null,
		pos?: { x: number; y: number },
	): void {
		const settings = this.readSettings();
		const skipped = labels.slice(Math.max(0, start), Math.min(labels.length, end + 1));
		this.ellipsisTipEl.innerHTML = formatSkippedLabelsTooltip(skipped, settings, property);
		if (pos) {
			const left = Math.min(Math.max(8, pos.x + this.chartEl.offsetLeft + 12), Math.max(8, this.rootEl.clientWidth - 200));
			const top = Math.min(Math.max(8, pos.y + this.chartEl.offsetTop + 18), Math.max(8, this.rootEl.clientHeight - 80));
			this.ellipsisTipEl.style.left = `${left}px`;
			this.ellipsisTipEl.style.top = `${top}px`;
		}
		this.ellipsisTipEl.show();
	}

	private hideEllipsisTip(): void {
		this.ellipsisTipEl.hide();
		this.ellipsisTipEl.empty();
	}

	private syncSliderChrome(option: { dataZoom?: unknown }): void {
		const zooms = option.dataZoom;
		const slider = Array.isArray(zooms)
			? zooms.find((item) => item && typeof item === 'object' && (item as { type?: string }).type === 'slider')
			: null;
		const hasSlider = Boolean(slider);
		const vertical = Boolean(
			slider && typeof slider === 'object' && (slider as { yAxisIndex?: number }).yAxisIndex != null,
		);
		this.chartEl.classList.toggle('motion-chart-has-slider', hasSlider && !vertical);
		this.chartEl.classList.toggle('motion-chart-has-slider-vertical', hasSlider && vertical);
		this.chartEl.style.setProperty('--motion-slider-start', `${SLIDER_START}px`);
		this.chartEl.style.setProperty('--motion-slider-end', `${SLIDER_END}px`);
		this.chartEl.style.setProperty('--motion-slider-mid', `${SLIDER_EDGE + SLIDER_HEIGHT / 2}px`);
	}

	private showEmpty(message: string): void {
		this.chart?.clear();
		this.chartEl.classList.remove('motion-chart-has-slider', 'motion-chart-has-slider-vertical');
		this.chartEl.hide();
		this.notesEl.hide();
		this.hintEl.hide();
		this.hideEllipsisTip();
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
			minCategoryNotes: Math.max(1, Math.floor(asNumberSetting(config.get('minCategoryNotes'), 1))),
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

function asOptionList<T>(value: T | T[] | undefined | null): T[] {
	if (value == null) return [];
	return Array.isArray(value) ? [...value] : [value];
}

function readZoomWindow(
	option: { dataZoom?: unknown },
	placement: 'bottom' | 'left',
	total: number,
): { startIndex: number; endIndex: number } {
	const zooms = asOptionList(
		option.dataZoom as
			| {
					start?: number;
					end?: number;
					startValue?: unknown;
					endValue?: unknown;
					xAxisIndex?: number;
					yAxisIndex?: number;
			  }
			| {
					start?: number;
					end?: number;
					startValue?: unknown;
					endValue?: unknown;
					xAxisIndex?: number;
					yAxisIndex?: number;
			  }[]
			| undefined,
	);
	const zoom =
		zooms.find((item) => (placement === 'left' ? item.yAxisIndex != null : item.xAxisIndex != null)) ??
		zooms[0];
	return visibleIndexRange(zoom, total);
}

function pixelNumber(raw: number | number[] | undefined, axis: 0 | 1): number {
	if (typeof raw === 'number') return raw;
	if (Array.isArray(raw)) return Number(raw[axis]);
	return Number.NaN;
}

function measureCategoryAxisLength(
	chart: echarts.ECharts,
	placement: 'bottom' | 'left',
	startIndex: number,
	endIndex: number,
): number {
	try {
		if (placement === 'left') {
			const a = pixelNumber(chart.convertToPixel({ yAxisIndex: 0 }, startIndex) as number | number[], 1);
			const b = pixelNumber(chart.convertToPixel({ yAxisIndex: 0 }, endIndex) as number | number[], 1);
			if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) > 1) return Math.abs(b - a);
		} else {
			const a = pixelNumber(chart.convertToPixel({ xAxisIndex: 0 }, startIndex) as number | number[], 0);
			const b = pixelNumber(chart.convertToPixel({ xAxisIndex: 0 }, endIndex) as number | number[], 0);
			if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) > 1) return Math.abs(b - a);
		}
	} catch {
		/* use fallback */
	}
	const rect = mainGridRect(chart);
	if (rect) return placement === 'left' ? rect.height : rect.width;
	return 720;
}

function mainGridRect(
	chart: echarts.ECharts,
): { x: number; y: number; width: number; height: number } | null {
	try {
		const model = (
			chart as unknown as {
				getModel?: () => {
					getComponent: (
						name: string,
						index: number,
					) => { coordinateSystem?: { getRect?: () => { x: number; y: number; width: number; height: number } } };
				};
			}
		).getModel?.();
		const rect = model?.getComponent('grid', 0)?.coordinateSystem?.getRect?.();
		if (rect && rect.width > 1 && rect.height > 1) return rect;
	} catch {
		/* fall through */
	}
	return null;
}

function eventPixel(payload: unknown): { x: number; y: number } | undefined {
	const item = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
	const ev = item?.event && typeof item.event === 'object' ? (item.event as Record<string, unknown>) : item;
	const x = Number(ev?.offsetX);
	const y = Number(ev?.offsetY);
	if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
	const native = ev?.event && typeof ev.event === 'object' ? (ev.event as Record<string, unknown>) : null;
	const nx = Number(native?.offsetX);
	const ny = Number(native?.offsetY);
	if (Number.isFinite(nx) && Number.isFinite(ny)) return { x: nx, y: ny };
	return undefined;
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
