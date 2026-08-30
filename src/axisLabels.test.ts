import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	AXIS_ELLIPSIS,
	AXIS_ELLIPSIS_LABEL,
	axisEllipsisPayload,
	axisLabelShowsTick,
	categoryAxisLabelHandlers,
	dataZoomRangeForIndices,
	ellipsisClickPayload,
	formatCategoryAxisTick,
	planCategoryAxisTicks,
	resolveAxisEllipsisRange,
	resolveEllipsisRange,
	skippedLabels,
	tickIndexFromAxisEvent,
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

	it('emits a gap for every consecutive shown pair that skips at least one label', () => {
		const labels = tagLabels(80);
		const plan = planCategoryAxisTicks(labels, 400, { placement: 'bottom', rotate: 45 });
		assert.ok(plan.shown.length >= 2);
		assert.ok((plan.shown[1] ?? 0) - (plan.shown[0] ?? 0) > 1);
		assert.equal(plan.gaps[0]?.start, (plan.shown[0] ?? 0) + 1);
		assert.equal(plan.gaps[0]?.end, (plan.shown[1] ?? 0) - 1);
		for (let i = 0; i < plan.shown.length - 1; i += 1) {
			const left = plan.shown[i] ?? 0;
			const right = plan.shown[i + 1] ?? 0;
			if (right - left <= 1) continue;
			const gap = plan.gaps.find((item) => item.start === left + 1 && item.end === right - 1);
			assert.ok(gap, `missing ellipsis between shown ${left} and ${right}`);
		}
	});

	it('ellipsizes the first gap on a dense rotated date axis', () => {
		const origin = Date.UTC(2025, 4, 31);
		const labels = Array.from({ length: 453 }, (_, index) =>
			new Date(origin + index * 86_400_000).toISOString().slice(0, 10),
		);
		const plan = planCategoryAxisTicks(labels, 720, { placement: 'bottom', rotate: 45 });
		assert.equal(labels[0], '2025-05-31');
		assert.equal(plan.shown[0], 0);
		assert.equal(plan.shown.at(-1), 452);
		assert.ok((plan.shown[1] ?? 0) > 1);
		assert.equal(plan.gaps[0]?.start, 1);
		assert.equal(plan.gaps[0]?.end, (plan.shown[1] ?? 1) - 1);
		assert.ok((plan.gaps[0]?.index ?? -1) >= 1);
	});
});

describe('category axis label stream', () => {
	it('shows planned labels and one ... tick per hidden stretch', () => {
		const labels = weekLabels(80);
		const plan = planCategoryAxisTicks(labels, 400, { placement: 'bottom', rotate: 45 });
		const { interval, formatter } = categoryAxisLabelHandlers(plan);
		assert.equal(plan.shown[0], 0);
		assert.equal(plan.shown.at(-1), 79);
		assert.ok(plan.gaps.length > 0);
		assert.equal(interval(0), true);
		assert.equal(interval(79), true);
		assert.equal(formatter(labels[0] ?? '', 0), '2026-W01');
		assert.equal(formatter(labels[79] ?? '', 79), '2026-W80');
		for (const index of plan.shown) {
			assert.equal(axisLabelShowsTick(plan, index), true);
			assert.equal(interval(index), true);
			assert.equal(formatter(labels[index] ?? '', index), labels[index]);
			assert.notEqual(formatter(labels[index] ?? '', index), AXIS_ELLIPSIS_LABEL);
		}
		for (const gap of plan.gaps) {
			assert.equal(plan.shown.includes(gap.index), false);
			assert.equal(axisLabelShowsTick(plan, gap.index), true);
			assert.equal(interval(gap.index), true);
			assert.equal(formatter(labels[gap.index] ?? '', gap.index), AXIS_ELLIPSIS_LABEL);
			assert.equal(formatCategoryAxisTick(plan, gap.index, labels[gap.index] ?? ''), '...');
			if (gap.start !== gap.index) {
				assert.equal(interval(gap.start), false);
			}
		}
		assert.equal(labels.includes('...'), false);
	});

	it('hover list for a gap is exactly the hidden labels between two visibles', () => {
		const labels = weekLabels(80);
		const plan = planCategoryAxisTicks(labels, 400, { placement: 'bottom', rotate: 45 });
		assert.ok(plan.shown.length >= 2);
		assert.ok(plan.gaps.length >= 1);
		for (let i = 0; i < plan.shown.length - 1; i += 1) {
			const left = plan.shown[i] ?? 0;
			const right = plan.shown[i + 1] ?? 0;
			if (right - left <= 1) continue;
			const gap = plan.gaps.find((item) => item.start === left + 1 && item.end === right - 1);
			assert.ok(gap);
			assert.deepEqual(skippedLabels(labels, gap.start, gap.end), labels.slice(left + 1, right));
			const payload = axisEllipsisPayload(plan, gap.index);
			assert.ok(payload);
			assert.deepEqual(resolveEllipsisRange(payload), { start: gap.start, end: gap.end });
		}
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

	it('resolves an axis-label event on the gap index to skipStart/skipEnd', () => {
		const labels = weekLabels(80);
		const plan = planCategoryAxisTicks(labels, 400, { placement: 'bottom', rotate: 45 });
		const gap = plan.gaps[0];
		assert.ok(gap);
		const payload = axisEllipsisPayload(plan, gap.index);
		assert.ok(payload);
		assert.deepEqual(resolveEllipsisRange(payload), { start: gap.start, end: gap.end });
		assert.deepEqual(
			resolveAxisEllipsisRange(
				{ componentType: 'xAxis', dataIndex: gap.index, value: labels[gap.index] },
				plan,
				labels,
			),
			{ start: gap.start, end: gap.end },
		);
		assert.equal(
			resolveAxisEllipsisRange(
				{ componentType: 'series', name: labels[gap.index], dataIndex: gap.index },
				plan,
				labels,
			),
			null,
		);
		assert.equal(
			resolveAxisEllipsisRange({ componentType: 'xAxis', dataIndex: plan.shown[0], value: labels[0] }, plan, labels),
			null,
		);
		assert.equal(axisEllipsisPayload(plan, plan.shown[0] ?? 0), null);
		assert.equal(tickIndexFromAxisEvent({ componentType: 'xAxis', value: labels[gap.index] }, labels), gap.index);
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

