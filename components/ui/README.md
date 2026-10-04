# components/ui — the shared primitives

Small, unopinionated building blocks used by ~40 pages. Two rules:

1. **Additive only.** These files are imported everywhere; add variants and optional
   props, never rename or remove one. Every default here renders like it did before.
2. **No new ad-hoc values.** Sizes come from the type scale, muted/status colors come
   from the tokens below. If something is missing, extend the scale in
   `app/globals.css` rather than reaching for `text-[13.5px]` or `text-neutral-400`.

---

## Buttons (`button.tsx`)

The old problem: a header stacked `Export xlsx`, `Refresh sekarang` and
`Tarik ulang penuh` as three identical outline buttons, even though the last one
re-pulls every halaqah of a program. Weight now follows cost.

| variant                | when                                                                            | how many per screen |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------- |
| `default` / `primary`  | THE action of the screen — `Tampilkan`, `Simpan`, `Kirim`                        | **at most one**     |
| `secondary` / `outline`| cheap, reversible support actions — `Export xlsx`, `Refresh sekarang`             | any                 |
| `ghost`                | tertiary / in-table / toolbar actions; no border, never competes                  | any                 |
| `heavy`                | expensive or wide-blast-radius but *not* destructive — `Tarik ulang penuh`, backfill, re-import | rare       |
| `destructive`          | irreversible data loss (delete, purge). Solid brick red.                          | rare                |
| `success`              | positive commit — `Ingatkan via WA`                                               | sparingly           |
| `link`                 | inline navigation that must look like text                                        | any                 |

`primary` is an alias of `default` and `outline` an alias of `secondary` (shadcn
naming) — use whichever reads better at the call site; they render identically.

Colors follow the brand (design "Overhaul Warna Logo" 1a) through tokens only — no
per-theme overrides in the variants:

| variant       | light                          | dark                         |
| ------------- | ------------------------------ | ---------------------------- |
| `default`     | forest `#2E413D`, white text   | gold `#CCBB76`, ink text     |
| `destructive` | brick `red-600` `#A63F2D`      | same                         |
| `success`     | moss `emerald-700` `#2F6546`   | same                         |
| `heavy`       | ochre `--warn` dashed outline  | `--warn` (light ochre)       |
| focus ring    | `--ring` = bronze `#A38D45`    | gold                         |

`heavy` is a dashed ochre (amber) outline: it reads as "think first" without shouting like a
primary or a delete. It does not create the guard rail by itself — **always** pair it
with a confirm step and a `title` that says what the action costs:

```tsx
<Button
  variant="heavy"
  size="sm"
  title="Tarik ulang SEMUA halaqah program ini, termasuk yang presensinya tidak berubah. Lambat."
  onClick={() => confirm("Tarik ulang penuh?") && refresh(true)}
>
  ⟳ Tarik ulang penuh
</Button>
```

If a screen ends up with two primaries, one of them is really a secondary. If it ends
up with three equal outlines, the expensive one is really a `heavy` — or belongs in an
overflow "⋯" menu.

Sizes: `xs` (h-7, text-11) · `sm` (h-8) · `default` (h-9) · `lg` (h-10) · `icon`.
`xs` exists for dense header/toolbar rows that previously hand-rolled `px-2 py-1.5 text-xs`.

---

## Type scale (`app/globals.css`)

Registered in Tailwind's font-size namespace, so `text-11`, `sm:text-14`, `md:text-20`
all work. The built-in `text-xs` / `text-sm` / … keep working — nothing broke.

| class     | size    | use for                                          |
| --------- | ------- | ------------------------------------------------ |
| `text-11` | 11px    | micro-labels, table meta, chips (pair with `cap`) |
| `text-12` | 12px    | dense table body, secondary lines                 |
| `text-14` | 14px    | default body / table body (= `text-sm`)           |
| `text-16` | 16px    | card titles, emphasised body (= `text-base`)      |
| `text-20` | 20px    | section headings, small KPI value                 |
| `text-28` | 28px    | hero KPI number                                   |

Migrating the arbitrary sizes still in the tree:

```
text-[8.5px] [9px] [9.5px] [10px] [10.5px] [11px] → text-11
text-[12.5px] [13px]                              → text-12
text-[15px]                                       → text-14
text-[19px]                                       → text-20
text-[27px]                                       → text-28
```

`cap` (existing) is the uppercase micro-label: `class="cap text-11 text-ink-faint"`.
Mono (`font-mono`) is for numbers only — never for labels or prose.

---

## Text color tokens (`app/globals.css`)

`text-neutral-400` was the de-facto muted color. It is **2.6:1 on white** — it fails
WCAG AA in light mode, and the app has no `dark:` pair on most of those call sites.
Use these instead; both are redefined per theme and clear 4.5:1 on `--card` *and*
`--surface-app` in light **and** dark.

| token           | role                                                     |
| --------------- | -------------------------------------------------------- |
| `text-ink-muted`| secondary text — hints, sub-labels, table meta (~5.9:1)   |
| `text-ink-faint`| tertiary micro-labels, denominators, placeholders (~4.7:1)|

Nothing quieter than `text-ink-faint` may carry meaning. Body text keeps
`text-foreground`.

Status text colors are single tokens, so dark mode stops mixing `red-600` (too dark on
the card) with `red-400`:

| token         | light                 | dark                  | use                                |
| ------------- | --------------------- | --------------------- | ---------------------------------- |
| `text-danger` | red-700 `#8E3324`     | red-300 `#DC9886`     | error text, over-threshold numbers |
| `text-warn`   | amber-700 `#7E500A`   | amber-300 `#E3BC6C`   | needs attention, not broken        |
| `text-ok`     | emerald-700 `#2F6546` | emerald-300 `#9CC4A8` | healthy / on target                |

(`red`/`amber`/`emerald`/`green`/`yellow`/`blue`/`neutral` are re-pointed to earth tones
in `app/globals.css`, so these names are brick / ochre / moss / slate / warm grey.)

Replace `text-red-600 dark:text-red-400` with plain `text-danger`; same for the amber
and emerald pairs. These are for **text and borders**. Filled pill backgrounds still
come from `toneBadgeClass` in `lib/ui/status.ts` (`<Badge tone="danger">`), which is
already theme-correct — don't hand-roll `bg-danger`.

---

## Status chips (`badge.tsx`, `lib/ui/status.ts`)

`toneBadgeClass` is the design's earth chip pairs (fill / text, light):

| tone      | design label | light                  | dark                     |
| --------- | ------------ | ---------------------- | ------------------------ |
| `success` | Aman         | `#E2EEE5` / `#2F6546`  | emerald-950 / emerald-300 |
| `warning` | Perhatian    | `#F7EBCF` / `#7E500A`  | amber-950 / amber-300    |
| `danger`  | Kritis       | `#F5DFD9` / `#8E3324`  | red-950 / red-300        |
| `info`    | Izin         | `#E0E9EF` / `#35556B`  | blue-950 / blue-300      |
| `teal`    | sage-teal    | `#DCEBE7` / `#235C57`  | `#10231F` / `#93C7BF`    |
| `indigo`  | mulberry     | `#EEE3EC` / `#6A3D63`  | `#2A1827` / `#D7B3D0`    |
| `neutral` | —            | neutral-100 / neutral-600 | neutral-800 / neutral-400 |

`teal` and `indigo` keep their names (additive-only) but are warm hexes — Tailwind's
stock teal/indigo are not re-pointed. `<Badge caps>` (opt-in) renders the design's status
chip type: uppercase 11px bold, `.06em` tracking, `3px 10px` — use it for short status
words (AMAN / KRITIS), not for names or free text.

Attendance squares (`AttendanceHeatmap`, `attendanceCellClass`): H `#3D7A57`,
T `#94600E`, I `#3D6078`, A `#A63F2D` (the `-600` step; dark uses `-400`). "Belum" is
hollow — transparent with a 1px `--border-strong` outline — in both themes.

---

## `SyncStatus` (`sync-status.tsx`)

Renders `Terakhir disinkron: 19.10 WIB (5 jam lalu)` colored by age. Pages used to
print this line in red unconditionally, so a normal five-hour-old sync looked like an
outage and the color stopped meaning anything.

| age              | color        |
| ---------------- | ------------ |
| < 2 jam          | green (`fresh`) |
| 2–24 jam         | amber (`aging`) |
| > 24 jam         | red (`stale`)   |
| belum pernah     | amber (`unknown`) — nothing has broken yet |
| last run failed  | red, regardless of age |

The thresholds are spelled out in the `title` attribute, together with the exact
timestamp of the last success.

```tsx
import { SyncStatus } from "@/components/ui/sync-status";

// preferred: hand it the raw timestamp and let it decide
<SyncStatus at={lastSync?.finishedAt} failed={lastSync?.lastStatus === "failed"} running={lastSync?.running} />

// already have lastSyncLabel() output? pass it through — legacy ok/warn/bad tones map over
<SyncStatus label={sync.text} tone={sync.tone} />
```

Server-safe: no state, no timers, `suppressHydrationWarning` set so a render that
straddles a minute boundary can't throw a hydration error.

Also exported: `syncTone(at, {failed, running})`, `syncToneClass(tone)`,
`formatSyncLabel(at)`, `SYNC_FRESH_HOURS`, `SYNC_STALE_HOURS`, `SYNC_THRESHOLD_HINT`
— for headers that need the tone without the default markup.

---

## Tables (`table.tsx`)

`TableWrap` → `Table` → `THead`/`TBody` → `TR` → `TH`/`TD`, all unchanged by default.
Four additions:

**Sticky header.** Needs a vertical scroll container to stick against, so
`maxHeight` on the wrapper and `sticky` on the head go together:

```tsx
<TableWrap maxHeight="70vh">
  <Table>
    <THead sticky>…</THead>
```

**Zebra rows.** `<TBody zebra>` tints every other row. Use it on tables wider than
~6 columns where the eye loses the row; leave it off for short tables, where banding
is just noise.

**Numeric columns.** `<TH numeric>` / `<TD numeric>` add right alignment + tabular
figures so digits line up. `numericClass` is exported for hand-built cells.
`SortTH` already right-aligns its arrow when the className contains `text-right`.

**Inline fractions.** `Numeric` keeps the denominator on the *same* line instead of
stacking a second line under the value — stacking doubled every row height for
information that reads fine muted and inline:

```tsx
<TDNum value="86%" fraction="12/14" />          {/* cell + value + fraction */}
<Numeric value={hadir} fraction={`dari ${total}`} />  {/* inside your own cell */}
```

The fraction renders `text-11 text-ink-faint`. The sorted column of a `SortTH` turns its
label ink and its arrow bronze (`text-brand-bronze`, gold in dark), as in design 1c.

**Tabs / segmented.** `TabsTrigger` marks the active tab with a card-colored pill and a
2px bronze underline (gold in dark). `SegmentedControl` fills the selected segment with
`bg-primary` (forest / gold) on the warm neutral-100 track.

---

## Related

- `kpi-strip.md` — the KPI strip's own hero/support/chip contract.
- `lib/ui/status.ts` — status tones for badges, chips, attendance cells.
- KPI figures (`StatTile`, `KpiStrip`) are Plus Jakarta Sans 800 with `-0.03em` tracking
  and tabular figures (design 1a "angka hero").
