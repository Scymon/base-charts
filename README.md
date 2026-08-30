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

Any base with a **category** (text, list, or date) and a **number** works. Pick those two properties; nothing else is assumed.

## Recipes

### Generic

1. Filter empty Y values (Bases view filter, or the built-in toggle).
2. Set **X-axis** to a category, list, or date.
3. Set **Y-axis** to a numeric property.
4. Set **Aggregation** to **Median** or **Average** when a few large numbers would dominate a sum.
5. Set **Chart type** to **Bar**. Switch to **Lollipop** when the category list is long, **Boxplot** or **Dumbbell** for the raw spread in each category, **Combo** for a second metric on Y2, or **Log Y** when the range is wide. **Icicle** and **tree** nest the same hierarchy as treemap. **Histogram** and **violin** bin the raw Y values. **Bar race** plays through time when X looks like dates; otherwise it is a ranked bar.

Click a bar, slice, box, combo bar, or sankey node to open a note from that category. One match opens immediately; several open the highest-Y note and list the other titles.

### Optional: Shorts.base

One optional setup if the base happens to have Score, tags, Channel, and a like-rate formula — useful, not required:

1. Filter **Score is not empty**.
2. **X-axis** `tags` (or `Source` / `topic`), **Y-axis** `Score`, aggregation **Median**.
3. **Boxplot** (X = tags, Y = Score) for the raw spread, not a median of medians.
4. **Combo**: X = tags, Y = Score, **Y2** = like-rate. Turn **Log Y** on if the Score spread is wild.
5. **Lollipop** for a long tag list. **Series by** `Channel` when you want a split.
6. Click a bar to open an example note from that tag.

Junk list labels (`viral`, `viral-video`, and similar) stay excluded by default; edit **Exclude tags** if you want them.

## View settings

| Setting | Notes |
| --- | --- |
| Chart type | Bar, horizontal bar, stacked bar, **percent stacked bar**, **combo**, **lollipop**, line, **step line**, area, **stacked area**, pie, doughnut, nightingale, scatter, heatmap, calendar heatmap, boxplot, **dumbbell**, **ridgeline**, packed bubbles, radar, gauge, **treemap**, sunburst, funnel, waterfall, sankey, **chord**, **polar bar**, **streamgraph**, **waffle**, **icicle**, **tree**, **parallel coordinates**, **network**, **marimekko**, **bullet**, **slope**, **histogram**, **violin**, **bar race** |
| X-axis | Any note, file, or formula property (category or time). Calendar heatmap and bar race need a date property or `file.ctime` |
| Y-axis | Any numeric property you pick |
| Y2-axis | Combo and bullet. Any second numeric property. Combo draws it as a line; bullet uses it as the target mark. Omitted when empty (bullet then marks the overall Y aggregate) |
| Aggregation | Count, sum, average, **median**. Default is median, not sum. Boxplot, dumbbell, histogram, and violin use the raw Y values |
| Series by | Optional split |
| Filter empty Y values | On by default |
| Sort | By value or label |
| Max categories | Caps busy category charts. Dense cartesian charts (12+ categories) get inside zoom (wheel + drag) and an “N of M categories” hint — no slider |
| Exclude tags | Applied when the X-axis or series is a list |
| Log Y | Display toggle. Logarithmic scale on cartesian value axes; zeros/negatives are skipped so the chart does not crash |
| Legend / data labels / grid | Display toggles |

Colors come from Obsidian CSS variables (`--color-blue`, `--interactive-accent`, `--text-normal`, and so on), so dark theme stays readable.

## List properties

If the Bases row exposes a list, Motion Chart **unnests** it: a note tagged `cooking` and `comedy` contributes its Y value to both categories.

If a list never arrives as multiple values (some properties stringify as one label), create a single-value property and use that as the X-axis.

## Build

```bash
npm install
npm test
npm run build
```

`npm run build` writes `main.js` next to `manifest.json` and `styles.css`.

## License

MIT
