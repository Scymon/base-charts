import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	compareTimeLabels,
	currentPeriod,
	fillTimeCategories,
	formatIsoWeek,
	hasTimeCategories,
	inferUnspecifiedSort,
	isoWeeksInYear,
	isoYearWeekUtc,
	parseChartDate,
	parseChartTime,
} from './time.ts';

/** Sunday 2026-08-30, ISO week 2026-W35. */
const NOW_W35 = Date.UTC(2026, 7, 30);

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

	it('treats unpadded YYYY-M-D / YYYY-MM-D as calendar days', () => {
		const a = parseChartTime('2026-8-3');
		const b = parseChartTime('2026-08-3');
		const c = parseChartTime('2026-8-03');
		const d = parseChartTime('2026-08-03');
		assert.equal(a?.kind, 'day');
		assert.equal(a?.label, '2026-08-03');
		assert.equal(a?.t, d?.t);
		assert.equal(b?.t, d?.t);
		assert.equal(c?.t, d?.t);
		assert.equal(parseChartDate('2026-8-3'), '2026-08-03');
		assert.equal(parseChartTime('2026-08-30T15:04:00')?.label, '2026-08-30');
	});

	it('rejects three-number labels whose month is not 1–12', () => {
		assert.equal(parseChartTime('2026-55-16'), null);
		assert.equal(parseChartTime('2026-45-5'), null);
		assert.equal(parseChartTime('2026-45-28'), null);
		assert.equal(parseChartTime('2026-13-01'), null);
		assert.equal(parseChartTime('2026-00-10'), null);
		assert.equal(parseChartTime('2026-02-30'), null);
		assert.equal(parseChartTime('2026-04-31'), null);
		assert.equal(hasTimeCategories(['2026-55-16', '2026-45-5', '2026-45-28', '2026-52-10']), false);
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

	it('orders unpadded days by timestamp, not localeCompare', () => {
		assert.ok(compareTimeLabels('2026-8-3', '2026-8-28') < 0);
		assert.ok(compareTimeLabels('2026-8-9', '2026-8-10') < 0);
		assert.ok(compareTimeLabels('2026-8-10', '2026-8-9') > 0);
		assert.equal('2026-8-9'.localeCompare('2026-8-10') > 0, true);
		assert.ok(compareTimeLabels('2026-08-03', '2026-8-28') < 0);
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
		assert.deepEqual(fillTimeCategories(['2026-8-3', '2026-8-1']), ['2026-8-1', '2026-08-02', '2026-8-3']);
	});

	it('never emits a literal (empty) category', () => {
		const filled = fillTimeCategories(['2026-W10', '(empty)', '2026-W08', '']);
		assert.equal(filled.includes('(empty)'), false);
		assert.deepEqual(filled, ['2026-W08', '2026-W09', '2026-W10']);
	});

	it('crosses the ISO year boundary using 52/53-week years', () => {
		assert.equal(isoWeeksInYear(2025), 52);
		assert.equal(isoWeeksInYear(2026), 53);
		const filled = fillTimeCategories(['2025-W52', '2026-W02']);
		assert.deepEqual(filled, ['2025-W52', '2026-W01', '2026-W02']);
		assert.equal(formatIsoWeek(2026, 1), '2026-W01');
	});

	it('does not invent a tail through W52 when the last real week is W35', () => {
		const filled = fillTimeCategories(['2026-W22', '2026-W35'], NOW_W35);
		assert.equal(filled[0], '2026-W22');
		assert.equal(filled[filled.length - 1], '2026-W35');
		assert.equal(filled.includes('2026-W36'), false);
		assert.equal(filled.includes('2026-W52'), false);
		assert.equal(filled.includes('(empty)'), false);
	});

	it('still fills an internal hole such as W10 … W13', () => {
		assert.deepEqual(fillTimeCategories(['2026-W10', '2026-W13'], NOW_W35), [
			'2026-W10',
			'2026-W11',
			'2026-W12',
			'2026-W13',
		]);
	});

	it('does not pad out the year when a stray future week is present', () => {
		assert.deepEqual(isoYearWeekUtc(NOW_W35), { year: 2026, week: 35 });
		assert.equal(currentPeriod('week', NOW_W35)?.label, '2026-W35');
		const filled = fillTimeCategories(['2026-W22', '2026-W35', '2026-W52'], NOW_W35);
		assert.equal(filled.includes('2026-W36'), false);
		assert.equal(filled.includes('2026-W51'), false);
		assert.equal(filled.includes('2026-W52'), false);
		assert.equal(filled[filled.length - 1], '2026-W35');
		assert.ok(filled.includes('2026-W22'));
		assert.ok(filled.includes('2026-W28'));
	});

	it('does not invent the 83-week 2025-W22…2026-W52 tail seen on the live stacked area', () => {
		const filled = fillTimeCategories(['2025-W22', '2026-W35', '2026-W52'], NOW_W35);
		assert.equal(filled[0], '2025-W22');
		assert.equal(filled[filled.length - 1], '2026-W35');
		assert.equal(filled.includes('2026-W36'), false);
		assert.equal(filled.includes('2026-W52'), false);
		assert.ok(filled.length < 83);
		assert.ok(filled.includes('2026-W01'));
	});

	it('treats 2025-12-28 as ISO 2025-W52, not 2026-W52', () => {
		// Creepy Chicken Release 2025-12-28 14:46 — Sunday, last day of ISO 2025-W52.
		// A Bases formula of gggg-[W]WW (locale week-year + ISO week) labeled it
		// 2026-W52 under a US Sunday-start locale. Vault formulas now use GGGG.
		const release = Date.UTC(2025, 11, 28);
		assert.deepEqual(isoYearWeekUtc(release), { year: 2025, week: 52 });
		assert.equal(parseChartTime('2025-12-28')?.kind, 'day');
		assert.equal(parseChartTime('2025-W52')?.label, '2025-W52');
		assert.equal(parseChartTime('2026-W52')?.label, '2026-W52');
		assert.ok((parseChartTime('2026-W52')?.t ?? 0) > NOW_W35);
	});

	it('drops a populated 2026-W52 instead of rewriting it to 2025-W52', () => {
		// Live hover on 2026-W52 listed real notes (Creepy Chicken, Woke Fast
		// Food Fail). The plugin does not remap that label to ISO 2025-W52.
		const filled = fillTimeCategories(['2025-W22', '2026-W35', '2026-W52'], NOW_W35);
		assert.equal(filled.includes('2026-W52'), false);
		assert.ok(filled.includes('2025-W52'));
		assert.equal(filled[filled.length - 1], '2026-W35');
		assert.deepEqual(fillTimeCategories(['2026-W52'], NOW_W35), []);
		assert.deepEqual(fillTimeCategories(['2026-W36', '2026-W52'], NOW_W35), []);
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
