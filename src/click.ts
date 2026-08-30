import type { AggregatedChart, CategoryNote, ClickPayload } from './types.ts';

function uniqueNotes(notes: CategoryNote[]): CategoryNote[] {
	const seen = new Set<string>();
	const unique: CategoryNote[] = [];
	for (const note of notes) {
		const key = note.path || note.name;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(note);
	}
	return unique.sort((a, b) => b.y - a.y);
}

export function notesForCategory(
	data: AggregatedChart,
	category: string,
	seriesName?: string,
): CategoryNote[] {
	const catIndex = data.categories.indexOf(category);
	if (catIndex < 0) return [];
	const seriesIndex = seriesName ? data.seriesNames.indexOf(seriesName) : -1;
	if (seriesIndex >= 0) {
		return uniqueNotes(data.notes[seriesIndex]?.[catIndex] ?? []);
	}
	return uniqueNotes(data.seriesNames.flatMap((_, index) => data.notes[index]?.[catIndex] ?? []));
}

export function notesForSeries(data: AggregatedChart, seriesName: string): CategoryNote[] {
	const seriesIndex = data.seriesNames.indexOf(seriesName);
	if (seriesIndex < 0) return [];
	return uniqueNotes((data.notes[seriesIndex] ?? []).flat());
}

export function notesByName(data: AggregatedChart, name: string): CategoryNote[] {
	return uniqueNotes(data.notes.flat(2).filter((note) => note.name === name || note.path === name));
}

export function pickOpenNote(notes: CategoryNote[]): CategoryNote | null {
	if (notes.length === 0) return null;
	return notes.reduce((best, note) => (note.y > best.y ? note : best));
}

export function exampleTitles(notes: CategoryNote[], limit = 3): string[] {
	return uniqueNotes(notes)
		.slice(0, limit)
		.map((note) => note.name);
}

export function resolveClickNotes(data: AggregatedChart, payload: ClickPayload): CategoryNote[] {
	if (payload.dataType === 'edge' && payload.data?.source) {
		const sourceNotes = notesForCategory(data, payload.data.source, payload.data.target);
		if (sourceNotes.length > 0) return sourceNotes;
		return notesForCategory(data, payload.data.source);
	}

	const name = payload.name ?? payload.data?.name;
	if (!name) return [];

	if (data.categories.includes(name)) {
		return notesForCategory(data, name, payload.seriesName);
	}
	if (data.seriesNames.includes(name)) {
		return notesForSeries(data, name);
	}
	return notesByName(data, name);
}
