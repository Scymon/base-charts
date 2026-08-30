# Base Charts

An [Obsidian](https://obsidian.md) community plugin that adds **Motion Chart**, an animated chart layout for [Bases](https://help.obsidian.md/bases). It is a real Bases view type in the Add view / layout menu, not a markdown code-block chart.

Requires Obsidian 1.10 or newer, with the core Bases plugin enabled.

## Install

This plugin is not in the community directory yet. Install a local build:

1. Build (from this repo):

   ```bash
   npm install
   npm run build
   ```

2. Copy these files into your vault:

   ```
   <vault>/.obsidian/plugins/base-charts/manifest.json
   <vault>/.obsidian/plugins/base-charts/main.js
   <vault>/.obsidian/plugins/base-charts/styles.css
   ```

3. In Obsidian: **Settings → Community plugins → Reload** (or restart), then enable **Base Charts**.

For development, you can instead clone or symlink this folder into `.obsidian/plugins/base-charts` and run `npm run dev`.

## Add a chart to a base

1. Open a `.base` file (or create one with **New base**).
2. In the Bases toolbar, open the view menu (the view name, then the chevron).
3. Change the layout to **Motion Chart**.
4. Still in that view menu, set chart type, X-axis, Y-axis, and aggregation. You can switch types without leaving the base; the same dataset morphs between layouts.

Charts stagger in (bars, slices, and points cascade), morph when you change type, and animate again when filters or data change. Hover scales the mark slightly. The plugin respects `prefers-reduced-motion` and turns all of that off.

## Shorts performance recipe

For a vault of YouTube Shorts notes (`Shorts.base`) with properties such as Score, Likes, Comments, tags, Source, and Channel:

1. On the Motion Chart view, filter **Score is not empty** (use the Bases view filter, not a markdown query).
2. Set **X-axis** to `Source` or `topic`.
3. Set **Y-axis** to `Score`.
4. Set **Aggregation** to **Median** or **Average**. Do not use Sum for Score — a few viral shorts will dominate the chart.
5. Set **Chart type** to **Bar**. For a hunt-range view of how a tag actually performs, switch to **Boxplot** (X = tags, Y = Score). The box is min / 25th / median / 75th / max of each note’s Score in that tag — not a median of already-aggregated medians.

Optional:

- **Series by** `Channel` to split each source into channels, or use **Stacked bar** to pile channels in one column.
- Use **X-axis** `tags` to see which topics actually pull views. Junk tags are excluded by default (`viral`, `viral-video`, `the-quartering`, `jeremy-hambly`, `quartering-live`). Edit **Exclude tags** in view settings.
- Formula columns such as `like-rate` and `comment-rate` work as the Y-axis when they evaluate to numbers or percents.

## View settings

| Setting | Notes |
| --- | --- |
| Chart type | Bar, horizontal bar, **stacked bar**, line, area, pie, doughnut, **nightingale**, scatter, heatmap, **calendar heatmap**, **boxplot**, **packed bubbles**, radar, gauge, treemap, **sunburst**, funnel, **waterfall**, **sankey** |
| X-axis | Any note, file, or formula property (category or time). Calendar heatmap needs a date such as Release, Due, or `file.ctime` |
| Y-axis | A numeric property. Defaults to `Score` when that property exists |
| Aggregation | Count, sum, average, **median**. Default is median, not sum. Boxplot ignores this and uses the raw Y values in each category |
| Series by | Optional split, for example `Channel` |
| Filter empty Y values | On by default |
| Sort | By value or label |
| Max categories | Caps busy tag charts |
| Exclude tags | Applied when the X-axis or series is a list |
| Legend / data labels / grid | Display toggles |

Colors come from Obsidian CSS variables (`--color-blue`, `--interactive-accent`, `--text-normal`, and so on), so dark theme stays readable.

## List properties (tags)

If the Bases row exposes a list (typical for `tags`), Motion Chart **unnests** it: a short tagged `cooking` and `comedy` contributes its Score to both categories. That is the right model for “which tags help.”

If a list never arrives as multiple values (some properties stringify as one label), create a single-value `topic` property and use that as the X-axis.

## Build

```bash
npm install
npm test
npm run build
```

`npm run build` writes `main.js` next to `manifest.json` and `styles.css`.

## License

MIT
