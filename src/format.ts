export function formatNumber(value: number): string {
	if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(1);
}
