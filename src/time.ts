import { SORT_MODES, type SortMode } from './types.ts';

export type TimeKind = 'week' | 'month' | 'day';

export interface ParsedTime {
	kind: TimeKind;
	/** Canonical axis label for generated gaps. */
	label: string;
	/** UTC ms at the start of the period, for chronological compare. */
	t: number;
}

/** ISO week `2026-W32` / `2026-W9` / formula-style `2026-[W]32`. */
const ISO_WEEK = /^(\d{4})-\[?W\]?(\d{1,2})$/i;
/** Calendar month `2026-08`. */
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;
/** Calendar day, optionally with a time suffix. */
const YEAR_MONTH_DAY = /^(\d{4}-\d{2}-\d{2})/;

const MIN_YEAR = 1990;
const MAX_YEAR = 2100;
/** Refuse to invent an enormous empty axis (e.g. daily across a decade). */
export const MAX_TIME_FILL = 400;

export function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

export function formatIsoDate(date: Date, utc = false): string {
	const year = utc ? date.getUTCFullYear() : date.getFullYear();
	const month = pad2((utc ? date.getUTCMonth() : date.getMonth()) + 1);
	const day = pad2(utc ? date.getUTCDate() : date.getDate());
	return `${year}-${month}-${day}`;
}

export function formatIsoWeek(year: number, week: number): string {
	return `${year}-W${pad2(week)}`;
}

export function formatYearMonth(year: number, month: number): string {
	return `${year}-${pad2(month)}`;
}

/** ISO weeks in a Gregorian year (52 or 53). */
export function isoWeeksInYear(year: number): number {
	const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
	const isoDay = jan1 === 0 ? 7 : jan1;
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	return isoDay === 4 || (leap && isoDay === 3) ? 53 : 52;
}

/** Monday UTC of ISO week 1 is the week that contains January 4. */
export function isoWeekStartUtc(year: number, week: number): number {
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const isoDay = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
	const monday = new Date(jan4);
	monday.setUTCDate(jan4.getUTCDate() - (isoDay - 1) + (week - 1) * 7);
	return monday.getTime();
}

function inYearRange(year: number): boolean {
	return year >= MIN_YEAR && year <= MAX_YEAR;
}

export function parseChartTime(label: string): ParsedTime | null {
	const trimmed = label.trim();
	if (!trimmed) return null;

	const week = trimmed.match(ISO_WEEK);
	if (week) {
		const year = Number(week[1]);
		const weekNo = Number(week[2]);
		if (!inYearRange(year) || weekNo < 1 || weekNo > 53) return null;
		if (weekNo > isoWeeksInYear(year)) return null;
		return { kind: 'week', label: formatIsoWeek(year, weekNo), t: isoWeekStartUtc(year, weekNo) };
	}

	const day = trimmed.match(YEAR_MONTH_DAY);
	if (day?.[1]) {
		const [year, month, date] = day[1].split('-').map(Number);
		if (!year || !month || !date || !inYearRange(year) || month < 1 || month > 12 || date < 1 || date > 31) {
			return null;
		}
		const t = Date.UTC(year, month - 1, date);
		if (!Number.isFinite(t)) return null;
		return { kind: 'day', label: day[1], t };
	}

	const month = trimmed.match(YEAR_MONTH);
	if (month) {
		const year = Number(month[1]);
		const monthNo = Number(month[2]);
		if (!inYearRange(year) || monthNo < 1 || monthNo > 12) return null;
		return { kind: 'month', label: formatYearMonth(year, monthNo), t: Date.UTC(year, monthNo - 1, 1) };
	}

	return parseLooseDate(trimmed);
}

function parseLooseDate(label: string): ParsedTime | null {
	if (!/\d{4}/.test(label)) return null;
	if (/^-?\d+(\.\d+)?$/.test(label)) return null;
	const parsed = Date.parse(label);
	if (!Number.isFinite(parsed)) return null;
	const date = new Date(parsed);
	if (Number.isNaN(date.getTime())) return null;
	const year = date.getUTCFullYear();
	if (!inYearRange(year)) return null;
	const iso = date.toISOString().slice(0, 10);
	return { kind: 'day', label: iso, t: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) };
}

/** YYYY-MM-DD for calendar heatmap cells. Weeks stay out (no single day). */
export function parseChartDate(label: string): string | null {
	const parsed = parseChartTime(label);
	if (!parsed || parsed.kind === 'week') return null;
	if (parsed.kind === 'month') {
		return `${parsed.label}-01`;
	}
	return parsed.label;
}

export function hasTimeCategories(categories: string[]): boolean {
	if (categories.length === 0) return false;
	const timed = categories.filter((category) => parseChartTime(category));
	return timed.length >= Math.max(1, Math.ceil(categories.length * 0.5));
}

export function compareTimeLabels(left: string, right: string): number {
	const a = parseChartTime(left);
	const b = parseChartTime(right);
	if (a && b && a.t !== b.t) return a.t - b.t;
	if (a && !b) return -1;
	if (!a && b) return 1;
	return left.localeCompare(right);
}

function nextPeriod(parsed: ParsedTime): ParsedTime | null {
	if (parsed.kind === 'week') {
		const year = Number(parsed.label.slice(0, 4));
		const week = Number(parsed.label.slice(6));
		if (!year || !week) return null;
		if (week >= isoWeeksInYear(year)) return parseChartTime(formatIsoWeek(year + 1, 1));
		return parseChartTime(formatIsoWeek(year, week + 1));
	}
	if (parsed.kind === 'month') {
		const year = Number(parsed.label.slice(0, 4));
		const month = Number(parsed.label.slice(5));
		if (!year || !month) return null;
		if (month >= 12) return parseChartTime(formatYearMonth(year + 1, 1));
		return parseChartTime(formatYearMonth(year, month + 1));
	}
	const next = new Date(parsed.t);
	next.setUTCDate(next.getUTCDate() + 1);
	return parseChartTime(formatIsoDate(next, true));
}

function majorityKind(parsed: ParsedTime[]): TimeKind | null {
	if (parsed.length === 0) return null;
	const counts: Record<TimeKind, number> = { week: 0, month: 0, day: 0 };
	for (const item of parsed) counts[item.kind] += 1;
	const ranked = (Object.entries(counts) as [TimeKind, number][]).sort((a, b) => b[1] - a[1]);
	const top = ranked[0];
	if (!top || top[1] === 0) return null;
	if ((ranked[1]?.[1] ?? 0) === top[1]) return null;
	return top[0];
}

function spanCount(start: ParsedTime, end: ParsedTime): number {
	if (start.kind !== end.kind) return Number.POSITIVE_INFINITY;
	if (start.kind === 'day') {
		return Math.round((end.t - start.t) / 86_400_000) + 1;
	}
	if (start.kind === 'month') {
		const sy = Number(start.label.slice(0, 4));
		const sm = Number(start.label.slice(5));
		const ey = Number(end.label.slice(0, 4));
		const em = Number(end.label.slice(5));
		return (ey - sy) * 12 + (em - sm) + 1;
	}
	let count = 1;
	let cursor: ParsedTime | null = start;
	const endT = end.t;
	while (cursor && cursor.t < endT) {
		count += 1;
		if (count > MAX_TIME_FILL + 1) return count;
		cursor = nextPeriod(cursor);
	}
	return count;
}

/**
 * Insert missing calendar steps between the earliest and latest time label.
 * Existing labels are kept as-is; invented gaps use the canonical format.
 */
export function fillTimeCategories(categories: string[]): string[] {
	const unique: string[] = [];
	for (const category of categories) {
		if (category.trim() === '' || category.trim() === '(empty)') continue;
		if (!unique.includes(category)) unique.push(category);
	}
	const parsed = unique
		.map((category) => ({ category, time: parseChartTime(category) }))
		.filter((item): item is { category: string; time: ParsedTime } => item.time != null);
	if (parsed.length < 2) return unique;

	const kind = majorityKind(parsed.map((item) => item.time));
	if (!kind) return unique;

	const ofKind = parsed.filter((item) => item.time.kind === kind);
	ofKind.sort((a, b) => a.time.t - b.time.t);
	const first = ofKind[0];
	const last = ofKind[ofKind.length - 1];
	if (!first || !last) return unique;
	if (spanCount(first.time, last.time) > MAX_TIME_FILL) return unique;

	const seen = new Set(unique);
	const filled: string[] = [];
	let cursor: ParsedTime | null = first.time;
	const originals = new Map<number, string>();
	for (const item of ofKind) {
		if (!originals.has(item.time.t)) originals.set(item.time.t, item.category);
	}

	while (cursor && cursor.t <= last.time.t) {
		const label = originals.get(cursor.t) ?? cursor.label;
		if (!seen.has(label)) {
			seen.add(label);
		}
		filled.push(label);
		if (cursor.t === last.time.t) break;
		cursor = nextPeriod(cursor);
		if (!cursor) break;
	}

	const leftovers = unique.filter(
		(category) => !filled.includes(category) && category.trim() !== '' && category.trim() !== '(empty)',
	);
	return leftovers.length > 0 ? [...filled, ...leftovers] : filled;
}

export function defaultSortForCategories(categories: string[]): SortMode {
	return hasTimeCategories(categories) ? 'time-asc' : 'value-desc';
}

export function resolveCategorySort(sort: SortMode | null | undefined, categories: string[]): SortMode {
	if (sort && (SORT_MODES as readonly string[]).includes(sort)) return sort;
	return defaultSortForCategories(categories);
}

/**
 * One-time default: time-like X uses Time (old → new) when the stored sort is
 * missing or still the generic Value (high to low) default.
 */
export function inferUnspecifiedSort(stored: unknown, categories: string[]): SortMode {
	if (stored === 'time-asc' || stored === 'time-desc' || stored === 'label-asc' || stored === 'label-desc' || stored === 'value-asc') {
		return stored;
	}
	if (hasTimeCategories(categories)) return 'time-asc';
	if (stored === 'value-desc') return 'value-desc';
	return defaultSortForCategories(categories);
}
