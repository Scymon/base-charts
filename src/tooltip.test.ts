import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateRows } from './aggregate.ts';
import { formatCategoryTooltip, notePathFromTarget, propertyLabel } from './tooltip.ts';
import { DEFAULT_EXCLUDED_TAGS, type ChartSettings, type RawRow } from './types.ts';

const settings = (overrides: Partial<ChartSettings> = {}): ChartSettings => ({
	chartType: 'bar',
	xProperty: 'note.topic',
	yProperty: 'note.amount',
	y2Property: null,
	seriesProperty: null,
	aggregation: 'sum',
	filterEmptyY: true,
	sort: 'value-desc',
	showLegend: true,
	showLabels: false,
	showGrid: true,
	logY: false,
	excludedTags: DEFAULT_EXCLUDED_TAGS,
	maxCategories: 80,
	...overrides,
});

describe('propertyLabel', () => {
	it('uses the configured property name, not a hardcoded vault field', () => {
		assert.equal(propertyLabel('note.amount'), 'amount');
		assert.equal(propertyLabel('formula.like-rate'), 'like-rate');
		assert.equal(propertyLabel(null), '');
	});
});

describe('formatCategoryTooltip', () => {
	it('lists every note in a grouped bucket with Y values, sorted descending', () => {
		const rows: RawRow[] = [
			{ xLabels: ['fatigue'], seriesLabels: [], y: 4_621, xNumeric: null, fileName: 'low', filePath: 'notes/low.md' },
			{
				xLabels: ['fatigue'],
				seriesLabels: [],
				y: 2_500_000,
				xNumeric: null,
				fileName: 'How Are These People So Stupid, The Fa',
				filePath: 'notes/how.md',
			},
			{ xLabels: ['fatigue'], seriesLabels: [], y: 12_000, xNumeric: null, fileName: 'mid', filePath: 'notes/mid.md' },
		];
		const data = aggregateRows(rows, settings());
		const html = formatCategoryTooltip({ name: 'fatigue' }, data, settings());
		assert.match(html, /motion-chart-tooltip-title/);
		assert.match(html, /fatigue/);
		assert.match(html, /n 3/);
		assert.match(html, /Sum 2\.5M/);
		assert.match(html, /4621 – 2\.5M/);
		assert.match(html, /How Are These People So Stupid, The Fa/);
		assert.match(html, /motion-chart-tooltip-notes/);
		assert.match(html, /data-motion-note-path="notes\/how.md"/);
		assert.match(html, /data-motion-note-path="notes\/mid.md"/);
		assert.match(html, /data-motion-note-path="notes\/low.md"/);
		const howAt = html.indexOf('How Are These People');
		const midAt = html.indexOf('>mid<');
		const lowAt = html.indexOf('>low<');
		assert.ok(howAt > 0 && midAt > howAt && lowAt > midAt);
		assert.equal(html.includes('Score'), false);
		assert.equal(html.includes('Shorts'), false);
		assert.equal(html.includes('Value'), false);
	});

	it('keeps every row when the bucket is larger than 50', () => {
		const rows: RawRow[] = Array.from({ length: 61 }, (_, index) => ({
			xLabels: ['bucket'],
			seriesLabels: [],
			y: 1000 + index,
			xNumeric: null,
			fileName: `note-${index}`,
			filePath: `notes/note-${index}.md`,
		}));
		const data = aggregateRows(rows, settings());
		const html = formatCategoryTooltip({ name: 'bucket' }, data, settings());
		assert.equal((html.match(/motion-chart-tooltip-note"/g) ?? []).length, 61);
		assert.match(html, /note-0/);
		assert.match(html, /note-60/);
		assert.match(html, /n 61/);
	});

	it('uses the configured aggregation label instead of inventing field names', () => {
		const rows: RawRow[] = [
			{ xLabels: ['alpha'], seriesLabels: [], y: 10, xNumeric: null, fileName: 'a', filePath: 'a.md' },
			{ xLabels: ['alpha'], seriesLabels: [], y: 30, xNumeric: null, fileName: 'b', filePath: 'b.md' },
		];
		const median = aggregateRows(rows, settings({ aggregation: 'median' }));
		const html = formatCategoryTooltip({ name: 'alpha' }, median, settings({ aggregation: 'median' }));
		assert.match(html, /Median 20/);
		assert.equal(html.includes('Score'), false);
		assert.equal(html.includes('Channel'), false);
	});

	it('shows a single-note card for a numeric scatter point using configured field names', () => {
		const rows: RawRow[] = [
			{ xLabels: ['2024'], seriesLabels: [], y: 42, xNumeric: 12, fileName: 'north', filePath: 'notes/north.md' },
			{ xLabels: ['2024'], seriesLabels: [], y: 7, xNumeric: 4, fileName: 'south', filePath: 'notes/south.md' },
		];
		const chartSettings = settings({ chartType: 'scatter', xProperty: 'note.day', yProperty: 'note.amount' });
		const data = aggregateRows(rows, chartSettings);
		const html = formatCategoryTooltip(
			{ name: 'north', value: [12, 42], data: { name: 'north', path: 'notes/north.md' } },
			data,
			chartSettings,
		);
		assert.match(html, /north/);
		assert.match(html, /day 12/);
		assert.match(html, /amount 42/);
		assert.equal(html.includes('motion-chart-tooltip-notes'), false);
		assert.equal(html.includes('south'), false);
		assert.equal(html.includes('Value'), false);
		assert.equal(html.includes('Score'), false);
	});

	it('still lists group files for a categorical scatter / bar mark with one series', () => {
		const rows: RawRow[] = [
			{ xLabels: ['alpha'], seriesLabels: [], y: 10, xNumeric: null, fileName: 'a', filePath: 'a.md' },
			{ xLabels: ['alpha'], seriesLabels: [], y: 40, xNumeric: null, fileName: 'b', filePath: 'b.md' },
		];
		const data = aggregateRows(rows, settings());
		const html = formatCategoryTooltip({ name: 'alpha' }, data, settings());
		assert.match(html, />a</);
		assert.match(html, />b</);
		assert.match(html, /n 2/);
	});

	it('does not invent a Value series heading when series-by is unset', () => {
		const rows: RawRow[] = [
			{ xLabels: ['alpha'], seriesLabels: [], y: 10, xNumeric: null, fileName: 'a', filePath: 'a.md' },
			{ xLabels: ['alpha'], seriesLabels: [], y: 20, xNumeric: null, fileName: 'b', filePath: 'b.md' },
		];
		const data = aggregateRows(rows, settings());
		const html = formatCategoryTooltip({ name: 'alpha', seriesName: 'Value' }, data, settings());
		assert.equal(html.includes('Value'), false);
		assert.match(html, /n 2/);
	});

	it('uses the configured Y2 field name on combo tooltips', () => {
		const rows: RawRow[] = [
			{ xLabels: ['alpha'], seriesLabels: [], y: 100, y2: 0.04, xNumeric: null, fileName: 'a', filePath: 'a.md' },
			{ xLabels: ['alpha'], seriesLabels: [], y: 300, y2: 0.08, xNumeric: null, fileName: 'b', filePath: 'b.md' },
		];
		const chartSettings = settings({
			chartType: 'combo',
			y2Property: 'note.rate',
			aggregation: 'average',
		});
		const data = aggregateRows(rows, chartSettings);
		const html = formatCategoryTooltip({ name: 'alpha' }, data, chartSettings);
		assert.match(html, /rate /);
		assert.equal(html.includes('Y2 '), false);
		assert.equal(html.includes('like-rate'), false);
	});

	it('escapes note titles so they cannot break the tooltip HTML', () => {
		const rows: RawRow[] = [
			{
				xLabels: ['alpha'],
				seriesLabels: [],
				y: 10,
				xNumeric: null,
				fileName: 'A <b>bold</b> & "quoted"',
				filePath: 'notes/x.md',
			},
			{ xLabels: ['alpha'], seriesLabels: [], y: 20, xNumeric: null, fileName: 'other', filePath: 'notes/y.md' },
		];
		const data = aggregateRows(rows, settings());
		const html = formatCategoryTooltip({ name: 'alpha' }, data, settings());
		assert.match(html, /A &lt;b&gt;bold&lt;\/b&gt; &amp; &quot;quoted&quot;/);
		assert.equal(html.includes('<b>bold</b>'), false);
	});
});

describe('notePathFromTarget', () => {
	it('returns null without a DOM node', () => {
		assert.equal(notePathFromTarget(null), null);
		assert.equal(notePathFromTarget({} as EventTarget), null);
	});
});
