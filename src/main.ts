import { Notice, Plugin } from 'obsidian';
import { viewOptions } from './options.ts';
import { VIEW_TYPE } from './types.ts';
import { MotionChartView } from './view.ts';

export default class BaseChartsPlugin extends Plugin {
	async onload(): Promise<void> {
		const registered = this.registerBasesView(VIEW_TYPE, {
			name: 'Motion Chart',
			icon: 'lucide-pie-chart',
			factory: (controller, containerEl) => new MotionChartView(controller, containerEl),
			options: (config) => viewOptions(config),
		});

		if (!registered) {
			new Notice('Base Charts: Obsidian Bases is not enabled in this vault.');
		}
	}
}
