export function normalizeTag(label: string): string {
	return label.replace(/^#/, '').trim();
}

export function isExcludedLabel(label: string, excluded: Set<string>): boolean {
	return excluded.has(normalizeTag(label).toLowerCase());
}

export function parseExcludedTags(value: unknown, fallback: string[]): string[] {
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}
	if (typeof value === 'string' && value.trim()) {
		return value
			.split(/[\n,]/)
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [...fallback];
}
