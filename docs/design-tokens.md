# Design tokens

All tokens live in `src/styles/tokens.css`. They are adapted from Chalkline's `src/styles/tokens.css` (0.31.0); `src/styles/tokens.test.ts` checks contrast in both themes and that no other file hard-codes a colour or px value.

## Layers

1. **Raw palette** (`--sy-palette-*`): every colour value, defined once in `:root` and never changed by a theme. Used only inside `tokens.css` (a test fails if any other file names a palette token).
2. **Semantic layer** (`--sy-bg`, `--sy-surface`, `--sy-text`, `--sy-accent`, `--sy-danger`, ...): what components use, usually through the Tailwind utilities (`bg-bg`, `bg-surface`, `text-text`, `text-accent`, ...). The `[data-theme='light']` and `[data-theme='dark']` blocks set only this layer, and every value is a `var()` pointing at the palette (a test checks).
3. **Theme-independent tokens**: touch target, focus ring, toast duration, motion, layout and chrome sizes, plus Tailwind's type scale, radii, spacing base and breakpoints in `@theme`.

## Differences from Chalkline

| Change | Why |
|---|---|
| Prefix `--sy-` instead of `--cl-`. | Sumyard's own namespace; the names after the prefix are Chalkline's. |
| New raw-palette layer, `--sy-palette-*` (32 colours, including 8 translucent). | The brief asks for themes to swap only a semantic layer over a raw palette. Chalkline sets each theme's semantic tokens straight to hex. **Every palette value is a Chalkline value**; no new colour was introduced. |
| Dropped the diagram-only tokens: canvas, grid, guides, find highlight, node, edge, group, minimap, swatches, handles, docking, palette and panel widths, AI, tour, stencils, Mermaid. | Not used by Sumyard. |
| Session B copied back six chrome tokens, with Chalkline's names and values: `--sy-toast-duration` (5000ms), `--sy-drawer-max-height` (80dvh, the menu), `--sy-full-sheet-height`, `--sy-help-width` (400px, every sheet; Chalkline's settings width equals it), `--sy-banner-width` (560px, the first-run notice) and `--sy-badge-dot` (8px). | The app chrome. No new token was invented. |
| 0.20.1 added one semantic token, `--sy-swatch-teal` (Tailwind `swatch-teal`), with Chalkline's name and values: `--cl-swatch-teal`, `#0f766e` light and `#5fd0c2` dark, as palette `teal-700` and `teal-300`. **Flagged:** Chalkline's swatch is a diagram fill colour; Sumyard uses it only for the Chart's `secondary` line style. | The Chart needed a fourth line colour that is not the danger colour (a car page with four options drew one in danger). No Sumyard token was distinct enough: the others are blue, red or grey. Contrast is tested at 3:1 (graphics) on bg, surface and surface-muted in both themes; line labels are drawn in `text`. |
| No logo token or logo. | Chalkline's mark is a diagram sketch. Sumyard has a text wordmark until a mark is designed (flagged; not invented). |

No semantic token was invented. The semantic names and values are Chalkline's (`swatch-teal` is a Chalkline swatch, see above).

## Semantic colours

| Token | Light | Dark |
|---|---|---|
| `bg` | paper-100 `#f4f3ef` | slate-900 `#12181b` |
| `surface` | white `#ffffff` | slate-800 `#1f282d` |
| `surface-muted` | paper-200 `#efeee9` | slate-750 `#28333a` |
| `border` | paper-300 `#dcd9d0` | slate-700 `#334047` |
| `border-strong` | slate-300 `#81888d` | slate-400 `#6f7e86` |
| `text` | slate-850 `#1d2327` | chalk `#ebede6` |
| `text-muted` | slate-500 `#5a6368` | slate-200 `#a5afb3` |
| `accent` | blue-600 `#1f6aa5` | blue-300 `#7cc0e6` |
| `accent-hover` | blue-700 `#185686` | blue-200 `#9dd0ee` |
| `accent-subtle` | blue-600 at 12% | blue-300 at 15% |
| `on-accent` | white | blue-950 `#0d1a22` |
| `focus` | blue-600 | blue-300 |
| `danger` | red-700 `#b3261e` | red-300 `#f2877d` |
| `on-danger` | white | red-950 `#1a0b09` |
| `swatch-teal` | teal-700 `#0f766e` | teal-300 `#5fd0c2` |
| `shadow-color`, `shadow-color-strong` | slate-850 at 10% and 16% | black at 35% and 50% |
| `overlay` | slate-850 at 40% | black at 60% |
