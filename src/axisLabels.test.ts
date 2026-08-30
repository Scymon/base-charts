import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	AXIS_ELLIPSIS,
	AXIS_ELLIPSIS_LABEL,
	dataZoomRangeForIndices,
	ellipsisClickPayload,
	planCategoryAxisTicks,
	resolveEllipsisRange,
	skippedLabels,
	visibleIndexRange,
} from './axisLabels.ts';

function weekLabels(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `2026-W${String(index + 1).padStart(2, '0')}`);
}

function tagLabels(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `topic-${index}`);
}

describe('planCategoryAxisTicks', () => {
	it('keeps every label when they still fit', () => {
		const labels = ['alpha', 'beta'];
		const plan = planCategoryAxisTicks(labels, 720, { placement: 'bottom', rotate: 45 });
		assert.deepEqual(plan.shown, [0, 1]);
		assert.equal(plan.gaps.length, 0);
	});

	it('keeps first and last of the visible window on a dense category axis', () => {
		const labels = tagLabels(80);
		const plan = planCategoryAxisTicks(labels, 400, { placement: 'bottom', rotate: 45 });
		assert.equal(plan.shown[0], 0);
		assert.equal(plan.shown.at(-1), 79);
		assert.ok(plan.shown.length < labels.length);
		assert.ok(plan.gaps.length > 0);
		assert.ok(plan.gaps.every((gap) => gap.end >= gap.start));
	});

	it('turns skipped runs into a single ellipsis index in each gap', () => {
		const labels = tagLabels(60);
		const plan = planCategoryAxisTicks(labels, 320, { placement: 'bottom', rotate: 45 });
		assert.ok(plan.gaps.length >= 1);
		for (const gap of plan.gaps) {
			assert.ok(gap.index >= gap.start && gap.index <= gap.end);
			assert.equal(plan.shown.includes(gap.index), false);
			const skipped = labels.slice(gap.start, gap.end + 1);
			assert.ok(skipped.length >= 1);
		}
	});

	it('thins time-like category labels the same way as tags', () => {
		const labels = weekLabels(80);
		const plan = planCategoryAxisTicks(labels, 400, { placement: 'bottom', rotate: 45 });
		assert.ok(plan.gaps.length > 0);
		assert.equal(plan.shown[0], 0);
		assert.equal(plan.shown.at(-1), 79);
		assert.equal(labels[0], '2026-W01');
		assert.ok(plan.gaps.some((gap) => labels[gap.start]?.startsWith('2026-W')));
	});

	it('plans a left axis by vertical pitch, not 45° smear', () => {
		const labels = tagLabels(40);
		const plan = planCategoryAxisTicks(labels, 200, { placement: 'left', rotate: 0 });
		assert.equal(plan.shown[0], 0);
		assert.equal(plan.shown.at(-1), 39);
		assert.ok(plan.gaps.length > 0);
	});

	it('only plans the visible zoom window', () => {
		const labels = tagLabels(200);
		const plan = planCategoryAxisTicks(labels, 720, {
			placement: 'bottom',
			rotate: 45,
			visibleStart: 180,
			visibleEnd: 199,
		});
		assert.equal(plan.shown[0], 180);
		assert.equal(plan.shown.at(-1), 199);
		assert.ok(plan.shown.every((index) => index >= 180 && index <= 199));
	});
});

describe('resolveEllipsisRange', () => {
	it('resolves a click payload to a start/end index range', () => {
		const payload = ellipsisClickPayload(4, 20);
		assert.equal(payload.dataType, AXIS_ELLIPSIS);
		assert.equal(payload.name, AXIS_ELLIPSIS_LABEL);
		assert.deepEqual(resolveEllipsisRange(payload), { start: 4, end: 20 });
		assert.deepEqual(
			resolveEllipsisRange({
				name: '...',
				data: { kind: AXIS_ELLIPSIS, skipStart: 10, skipEnd: 25 },
			}),
			{ start: 10, end: 25 },
		);
		assert.equal(resolveEllipsisRange({ name: 'beta' }), null);
		assert.equal(resolveEllipsisRange({ name: '...', data: { skipStart: 3, skipEnd: 1 } }), null);
	});
});

describe('dataZoomRangeForIndices', () => {
	it('maps a skipped run to a dataZoom window', () => {
		const zoom = dataZoomRangeForIndices(10, 25, 100);
		assert.equal(zoom.startValue, 10);
		assert.equal(zoom.endValue, 25);
		assert.ok(zoom.start < zoom.end);
		assert.ok(zoom.end <= 100);
	});
});

describe('visibleIndexRange', () => {
	it('reads percent and value windows', () => {
		assert.deepEqual(visibleIndexRange(undefined, 10), { startIndex: 0, endIndex: 9 });
		assert.deepEqual(visibleIndexRange({ start: 0, end: 50 }, 20), { startIndex: 0, endIndex: 9 });
		assert.deepEqual(visibleIndexRange({ startValue: 4, endValue: 11 }, 20), {
			startIndex: 4,
			endIndex: 11,
		});
	});
});

describe('skippedLabels', () => {
	it('slices the collapsed run', () => {
		assert.deepEqual(skippedLabels(['a', 'b', 'c', 'd'], 1, 2), ['b', 'c']);
	});
});
