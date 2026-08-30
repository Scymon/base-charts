import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	compareTimeLabels,
	fillTimeCategories,
	formatIsoWeek,
	hasTimeCategories,
	inferUnspecifiedSort,
	isoWeeksInYear,
	parseChartDate,
	parseChartTime,
} from './time.ts';

describe('parseChartTime', () => {
	it('parses ISO weeks, including formula-style [W]', () => {
		const week = parseChartTime('2026-W32');
		assert.equal(week?.kind, 'week');
		assert.equal(week?.label, '2026-W32');
		assert.equal(parseChartTime('2026-[W]09')?.label, '2026-W09');
		assert.equal(parseChartTime('2026-W9')?.label, '2026-W09');
		assert.equal(parseChartDate('2026-W32'), null);
	});

	it('parses months and days', () => {
		assert.equal(parseChartTime('2026-08')?.kind, 'month');
		assert.equal(parseChartTime('2026-08-30')?.kind, 'day');
		assert.equal(parseChartDate('2026-08-30'), '2026-08-30');
		assert.equal(parseChartDate('2026-08'), '2026-08-01');
	});

	it('ignores plain numbers and non-dates', () => {
		assert.equal(parseChartTime('2026'), null);
		assert.equal(parseChartTime('alpha'), null);
		assert.equal(parseChartTime('12.5'), null);
	});
});

describe('hasTimeCategories', () => {
	it('detects a majority of week or month labels', () => {
		assert.equal(hasTimeCategories(['2026-W16', '2026-W32', '2026-W35']), true);
		assert.equal(hasTimeCategories(['2026-01', '2026-02', '2026-03']), true);
		assert.equal(hasTimeCategories(['cooking', 'comedy', '2026-W32']), false);
		assert.equal(hasTimeCategories(['alpha', 'beta']), false);
	});
});

describe('compareTimeLabels', () => {
	it('orders ISO weeks by calendar time, not by Y or locale tricks', () => {
		assert.ok(compareTimeLabels('2026-W16', '2026-W32') < 0);
		assert.ok(compareTimeLabels('2026-W35', '2026-W33') > 0);
		assert.ok(compareTimeLabels('2025-W52', '2026-W01') < 0);
		assert.ok(compareTimeLabels('2026-W9', '2026-W10') < 0);
	});
});

describe('fillTimeCategories', () => {
	it('inserts missing ISO weeks so W01 is not next to W10', () => {
		const filled = fillTimeCategories(['2026-W10', '2026-W01']);
		assert.deepEqual(
			filled,
			['2026-W01', '2026-W02', '2026-W03', '2026-W04', '2026-W05', '2026-W06', '2026-W07', '2026-W08', '2026-W09', '2026-W10'],
		);
	});

	it('inserts missing months and days', () => {
		assert.deepEqual(fillTimeCategories(['2026-03', '2026-01']), ['2026-01', '2026-02', '2026-03']);
		assert.deepEqual(fillTimeCategories(['2026-01-03', '2026-01-01']), [
			'2026-01-01',
			'2026-01-02',
			'2026-01-03',
		]);
	});

	it('crosses the ISO year boundary using 52/53-week years', () => {
		assert.equal(isoWeeksInYear(2025), 52);
		assert.equal(isoWeeksInYear(2026), 53);
		const filled = fillTimeCategories(['2025-W52', '2026-W02']);
		assert.deepEqual(filled, ['2025-W52', '2026-W01', '2026-W02']);
		assert.equal(formatIsoWeek(2026, 1), '2026-W01');
	});
});

describe('inferUnspecifiedSort', () => {
	it('defaults time-like X to Time old → new, tags to Value high → low', () => {
		assert.equal(inferUnspecifiedSort(undefined, ['2026-W16', '2026-W32']), 'time-asc');
		assert.equal(inferUnspecifiedSort('value-desc', ['2026-W16', '2026-W32']), 'time-asc');
		assert.equal(inferUnspecifiedSort('value-desc', ['cooking', 'comedy']), 'value-desc');
		assert.equal(inferUnspecifiedSort('label-asc', ['2026-W16', '2026-W32']), 'label-asc');
		assert.equal(inferUnspecifiedSort('value-asc', ['2026-W16', '2026-W32']), 'value-asc');
	});
});
