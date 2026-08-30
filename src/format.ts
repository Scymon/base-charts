export function formatNumber(value: number): string {
	if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(1);
}

export function formatAxisTick(value: number): string {
	if (!Number.isFinite(value)) return '';
	const abs = Math.abs(value);
	if (abs >= 10) return formatNumber(value);
	if (abs === 0) return '0';
	if (abs >= 1) return value.toFixed(1);
	return value.toFixed(2);
}
