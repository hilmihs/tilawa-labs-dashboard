# `KpiStrip`

Header of a data screen. It has to answer **"apa yang berubah, dan apa yang harus saya
kerjakan"** — not list the table below it again. See `docs/UI-REVIEW-2026-09.md` §2.

Two shapes, one component. Pick by which prop you pass.

## 1. Hero (use this)

```tsx
<KpiStrip
  hero={{
    label: "Rata² kehadiran",
    value: 99.6,
    unit: "%",
    target: 70,
    delta: 1.2,
    deltaLabel: "vs Agu",
    spark: weekly,           // number[], oldest → newest
    href: "/mabni/kehadiran",
  }}
  support={[
    { label: "Peserta", value: 87 },
    { label: "Halaqah", value: 15 },
  ]}
  issues={[
    { label: "halaqah < 70%", value: 0, href: "/mabni/kehadiran?below=1" },
    { label: "presensi tertunda", value: 12, href: "/mabni/inbox", tone: "danger" },
  ]}
  allClearText="Semua aman"
/>
```

### `hero: KpiHero`

| field | type | note |
|---|---|---|
| `label` | `ReactNode` | caps micro-label |
| `value` | `ReactNode` | 32px figure — Plus Jakarta Sans 800, `-0.03em`, tabular |
| `unit` | `ReactNode?` | small, muted, inline after the figure |
| `target` | `number?` | 0–100. Draws the bar + tick + caption `target N%` |
| `progress` | `number?` | 0–100 bar fill. Defaults to `value` when it is a number — pass this only when `value` is preformatted (`"99,6"`) or on another scale |
| `delta` | `number?` | sign drives ▲/▼ and the color |
| `deltaLabel` | `ReactNode?` | e.g. `"vs Agu"` |
| `spark` | `number[]?` | oldest → newest; <2 usable points draws nothing |
| `href` | `string?` | makes the figure a drill-down `next/link` |
| `invert` | `boolean?` | lower is better: flips delta colors *and* "target met" |

Bar fill is moss (`emerald-600`, #3D7A57) once the target is met, ochre (`amber-600`,
#94600E) while it is not, warm grey when there is no usable `progress`. Delta and the
all-clear line use the `text-ok` / `text-danger` tokens. The tick stays visible after the fill passes it.

### `support?: KpiSupport[]`

`{ label, value, hint?, href? }`. **Max 3 — extras are dropped.** Right of the hero from
`sm` up, below it on mobile. Rendered at 16px, roughly half the hero, on purpose: these
are context (denominators, size), not decisions.

### `issues?: KpiIssue[]`

`{ label, value: number, href?, tone?: StatusTone }` → a chip row under a rule.

- **`value === 0` is dropped.** Never spend width saying "nothing here".
- Every issue chip should have an `href`. A number that demands action but has nowhere to
  go is not a KPI — put it in the table.
- `tone` defaults to `"warning"`. Reserve `"danger"` for what breaks today; red that shows
  up everywhere stops meaning "bahaya".

### `allClearText?: ReactNode`

Rendered as a single green line with a check when every issue is zero (or `issues` is
empty). Without it, an all-clear strip simply has no footer.

## 2. Legacy `items`

```tsx
<KpiStrip items={[{ label, value, hint?, valueClassName?, bar?, barClassName? }]} />
```

Same structure as before: equal cells, 27px figures (since the 1a rebrand: Plus Jakarta
Sans 800, `-0.03em`, tabular — was Geist Mono semibold), `grid-cols-2` /
`sm:grid-cols-3` / `lg:` one column per item. Kept only so the existing callers keep
working — do not reach for it in new screens.

`items` and `hero` are mutually exclusive at the type level.

## `Sparkline`

`components/ui/sparkline.tsx`. Self-contained inline SVG, no deps.

```tsx
<Sparkline points={number[]} stroke="currentColor" width={120} height={40}
           strokeWidth={2} fluid className={...} />
```

`fluid` (default `true`) stretches to the parent's width; `fluid={false}` keeps it exactly
`width` wide, which is what the KPI hero uses (64×20). Non-finite values are dropped,
fewer than two usable points renders `null`, and a flat series draws through the vertical
centre instead of emitting `NaN`.
