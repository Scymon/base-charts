import { ListValue, NullValue, NumberValue, Value } from 'obsidian';
import { normalizeTag } from './labels.ts';

export function isEmptyValue(value: Value | null | undefined): boolean {
	if (value == null) return true;
	if (value instanceof NullValue) return true;
	return !value.isTruthy();
}

function hasListApi(value: Value): value is ListValue {
	const candidate = value as ListValue;
	return typeof candidate.length === 'function' && typeof candidate.get === 'function';
}

export function isListValue(value: Value | null | undefined): value is ListValue {
	if (value == null) return false;
	return value instanceof ListValue || hasListApi(value);
}

function readPrimitiveNumber(value: Value): number | null {
	const boxed = value as NumberValue & { value?: unknown };
	if (typeof boxed.value === 'number' && Number.isFinite(boxed.value)) {
		return boxed.value;
	}
	return null;
}

export function asNumber(value: Value | null | undefined): number | null {
	if (value == null || value instanceof NullValue) return null;
	if (value instanceof NumberValue) {
		const boxed = readPrimitiveNumber(value);
		if (boxed != null) return boxed;
	}

	const raw = value.toString().trim();
	if (raw === '') return null;
	const percent = raw.endsWith('%');
	const cleaned = raw.replace(/[%$,]/g, '').trim();
	const parsed = Number(cleaned);
	if (!Number.isFinite(parsed)) return null;
	return percent ? parsed : parsed;
}

export function categoryLabels(value: Value | null | undefined): string[] {
	if (isEmptyValue(value) || value == null) return [];
	if (isListValue(value)) {
		const labels: string[] = [];
		for (let i = 0; i < value.length(); i++) {
			const item = value.get(i);
			if (isEmptyValue(item)) continue;
			const text = item.toString().trim();
			if (text) labels.push(normalizeTag(text));
		}
		return labels;
	}

	const text = value.toString().trim();
	if (!text) return [];
	return [normalizeTag(text)];
}
