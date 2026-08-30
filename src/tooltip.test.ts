import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateRows } from './aggregate.ts';
import { ellipsisClickPayload } from './axisLabels.ts';
import { formatCategoryTooltip, formatSkippedLabelsTooltip, notePathFromTarget, propertyLabel } from './tooltip.ts';
import { DEFAULT_EXCLUDED_TAGS, type AggregatedChart, type ChartSettings, type RawRow } from './types.ts';

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
		assert.match(html, /data-motion-note-path="notes\/north.md"/);
		assert.equal(html.includes('motion-chart-tooltip-notes'), false);
		assert.equal(html.includes('south'), false);
		assert.equal(html.includes('Value'), false);
		assert.equal(html.includes('Score'), false);
		assert.equal(html.includes('n 0'), false);
		assert.equal(html.includes('Median 0'), false);
	});

	it('uses the scatter point X/Y when the note is missing from aggregated buckets', () => {
		const rows: RawRow[] = [
			...Array.from({ length: 12 }, (_, index) => ({
				xLabels: [`topic-${index}`],
				seriesLabels: ['Other'],
				y: 90_000 - index,
				xNumeric: index,
				fileName: `other-${index}`,
				filePath: `notes/other-${index}.md`,
			})),
			{
				xLabels: ['rare-tag'],
				seriesLabels: ['Jeremy Hambly'],
				y: 650_000,
				xNumeric: 42,
				fileName: 'Would You Be Creeped Out By This!',
				filePath: 'notes/creeped.md',
				title: 'Would You Be Creeped Out By This!',
			},
		];
		const chartSettings = settings({
			chartType: 'scatter',
			xProperty: 'note.day',
			yProperty: 'note.amount',
			seriesProperty: 'note.channel',
			aggregation: 'median',
			maxCategories: 5,
		});
		const data = aggregateRows(rows, chartSettings);
		const html = formatCategoryTooltip(
			{
				name: 'Would You Be Creeped Out By This!',
				seriesName: 'Jeremy Hambly',
				value: [42, 650_000],
				data: { name: 'Would You Be Creeped Out By This!', path: 'notes/creeped.md' },
			},
			data,
			chartSettings,
		);
		assert.match(html, /Would You Be Creeped Out By This!/);
		assert.match(html, /Jeremy Hambly/);
		assert.match(html, /day 42/);
		assert.match(html, /amount 650\.0k/);
		assert.match(html, /data-motion-note-path="notes\/creeped.md"/);
		assert.equal(html.includes('n 0'), false);
		assert.equal(html.includes('Median 0'), false);
		assert.equal(html.includes('n '), false);
		assert.equal(html.includes('Median '), false);
		assert.equal(html.includes('Score'), false);
		assert.equal(html.includes('Channel'), false);
	});

	it('keeps a grouped card for a line/bubble category with several notes', () => {
		const rows: RawRow[] = [
			{ xLabels: ['funny'], seriesLabels: [], y: 10, xNumeric: null, fileName: 'a', filePath: 'a.md' },
			{ xLabels: ['funny'], seriesLabels: [], y: 40, xNumeric: null, fileName: 'b', filePath: 'b.md' },
		];
		const line = formatCategoryTooltip(
			{ name: 'funny', value: 25 },
			aggregateRows(rows, settings({ chartType: 'line', aggregation: 'median' })),
			settings({ chartType: 'line', aggregation: 'median' }),
		);
		assert.match(line, /n 2/);
		assert.match(line, /Median 25/);
		assert.match(line, />a</);
		assert.match(line, />b</);

		const bubbles = formatCategoryTooltip(
			{ name: 'funny' },
			aggregateRows(rows, settings({ chartType: 'bubbles', aggregation: 'sum' })),
			settings({ chartType: 'bubbles', aggregation: 'sum' }),
		);
		assert.match(bubbles, /n 2/);
		assert.match(bubbles, /Sum 50/);
	});

	it('uses a single-note card for a 1:1 line or funnel mark', () => {
		const rows: RawRow[] = [
			{ xLabels: ['solo'], seriesLabels: [], y: 88, xNumeric: null, fileName: 'only', filePath: 'notes/only.md' },
		];
		const chartSettings = settings({ chartType: 'line', xProperty: 'file.name', yProperty: 'note.amount' });
		const html = formatCategoryTooltip(
			{ name: 'solo', value: 88 },
			aggregateRows(rows, chartSettings),
			chartSettings,
		);
		assert.match(html, /only/);
		assert.match(html, /name solo|amount 88/);
		assert.match(html, /amount 88/);
		assert.equal(html.includes('n 1'), false);
		assert.equal(html.includes('n 0'), false);
		assert.equal(html.includes('Median 0'), false);
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

	it('reads a heatmap cell as category + series + cell value, not scatter indexes', () => {
		const categories = Array.from({ length: 10 }, (_, index) => (index === 9 ? 'alligator-gar' : `tag-${index}`));
		const empty = () => Array.from({ length: 10 }, () => 0);
		const emptyRaw = () => Array.from({ length: 10 }, () => [] as number[]);
		const emptyNotes = () => Array.from({ length: 10 }, () => [] as AggregatedChart['notes'][number][number]);
		const data: AggregatedChart = {
			categories,
			seriesNames: ['Other Channel', 'Jeremy Hambly'],
			values: [empty(), categories.map((name) => (name === 'alligator-gar' ? 4158 : 0))],
			rawValues: [emptyRaw(), categories.map((name) => (name === 'alligator-gar' ? [4158] : []))],
			y2Values: [empty(), empty()],
			y2Category: empty(),
			hasY2: false,
			notes: [
				emptyNotes(),
				categories.map((name) =>
					name === 'alligator-gar' ? [{ name: 'gar-clip', path: 'notes/gar.md', y: 4158 }] : [],
				),
			],
			points: [],
			overall: 4158,
			calendar: [],
		};
		const chartSettings = settings({
			chartType: 'heatmap',
			xProperty: 'note.tags',
			yProperty: 'note.Score',
			seriesProperty: 'note.Channel',
			aggregation: 'sum',
		});
		const html = formatCategoryTooltip(
			{ value: [9, 1, 4158], name: 'alligator-gar', seriesName: 'Jeremy Hambly' },
			data,
			chartSettings,
		);
		assert.match(html, /alligator-gar/);
		assert.match(html, /Jeremy Hambly/);
		assert.match(html, /Score 4158/);
		assert.match(html, /tags alligator-gar/);
		assert.match(html, /Channel Jeremy Hambly/);
		assert.equal(html.includes('9.0'), false);
		assert.equal(html.includes('tags 9'), false);
		assert.equal(html.includes('Score 1.0'), false);
		assert.equal(html.includes('1.0'), false);
		assert.equal(html.includes('Likes'), false);
		assert.equal(html.includes('Shorts'), false);

		const grouped: AggregatedChart = {
			...data,
			rawValues: [emptyRaw(), categories.map((name) => (name === 'alligator-gar' ? [2000, 2158] : []))],
			notes: [
				emptyNotes(),
				categories.map((name) =>
					name === 'alligator-gar'
						? [
								{ name: 'gar-a', path: 'notes/a.md', y: 2158 },
								{ name: 'gar-b', path: 'notes/b.md', y: 2000 },
							]
						: [],
				),
			],
		};
		const groupHtml = formatCategoryTooltip(
			{ value: [9, 1, 4158], name: 'alligator-gar', seriesName: 'Jeremy Hambly' },
			grouped,
			chartSettings,
		);
		assert.match(groupHtml, /gar-a/);
		assert.match(groupHtml, /gar-b/);
		assert.match(groupHtml, /Score 4158/);
		assert.match(groupHtml, /alligator-gar/);
		assert.match(groupHtml, /Channel Jeremy Hambly/);
		assert.equal(groupHtml.includes('9.0'), false);
		assert.equal(groupHtml.includes('Score 1.0'), false);
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

describe('formatSkippedLabelsTooltip', () => {
	it('lists the skipped category names with tooltip chrome, not hardcoded vault fields', () => {
		const labels = Array.from({ length: 12 }, (_, index) => `topic-${index}`);
		const rows: RawRow[] = labels.map((label, index) => ({
			xLabels: [label],
			seriesLabels: [],
			y: 10 + index,
			xNumeric: null,
			fileName: `note-${index}`,
		}));
		const data = aggregateRows(rows, settings());
		const first = data.categories[2] ?? '';
		const last = data.categories[8] ?? '';
		assert.ok(first && last);
		const html = formatCategoryTooltip(ellipsisClickPayload(2, 8), data, settings());
		assert.match(html, /motion-chart-tooltip/);
		assert.match(html, /motion-chart-tooltip-title/);
		assert.match(html, /topic/);
		assert.match(html, /n 7/);
		assert.match(html, new RegExp(first));
		assert.match(html, new RegExp(last));
		assert.equal(html.includes('Score'), false);
		assert.equal(html.includes('tags'), false);
		assert.equal(html.includes('Shorts'), false);
		assert.equal(html.includes('Channel'), false);
	});

	it('caps a huge skipped run to first/last plus count', () => {
		const labels = Array.from({ length: 400 }, (_, index) => `day-${index}`);
		const html = formatSkippedLabelsTooltip(labels, settings({ xProperty: 'note.published' }));
		assert.match(html, /published/);
		assert.match(html, /n 400/);
		assert.match(html, /day-0/);
		assert.match(html, /day-399/);
		assert.equal(html.includes('day-200'), false);
		assert.ok((html.match(/motion-chart-tooltip-note"/g) ?? []).length < 40);
		assert.equal(html.includes('Score'), false);
	});
});

describe('notePathFromTarget', () => {
	it('returns null without a DOM node', () => {
		assert.equal(notePathFromTarget(null), null);
		assert.equal(notePathFromTarget({} as EventTarget), null);
	});
});
