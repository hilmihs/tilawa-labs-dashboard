/**
 * Shared look-and-feel for every xlsx export in this app.
 *
 * The exports are read by coordinators in Excel/Sheets, printed, and sorted —
 * so three things matter beyond "the numbers are right":
 *
 *   1. NUMBERS STAY NUMBERS. A percentage written as the string "92.86%" cannot
 *      be sorted, filtered, averaged, or conditionally formatted, and it silently
 *      breaks every pivot the coordinator builds on top. Percentages go in as a
 *      FRACTION with a `0.00%` number format, matching the coordinator's own
 *      workbooks (they store 0.9551, not "95.51%").
 *   2. THE HEADER STAYS VISIBLE. Freeze panes + repeat-rows-on-print, or a
 *      200-row roster is unreadable past the first screen.
 *   3. PLACEHOLDERS STAY DISTINCT. "-" means "no source for this yet"; 0 means
 *      measured zero. Never let a format turn one into the other.
 *
 * Callers own their layout; this module only supplies the shared primitives.
 */
import ExcelJS from "exceljs";

/** Neutral greys — the fills the exports already used, kept in one place. */
export const HEAD_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" },
};
export const TITLE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFBFBFBF" },
};
/** Every other data row, so a wide table can be read across without a ruler. */
export const ZEBRA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F5F5" },
};
/** Soft amber — a figure that is under its target and wants the eye. */
export const WARN_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
};

export const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
  bottom: { style: "thin" },
};

export const NUM_FMT = {
  int: "#,##0",
  dec1: "#,##0.0",
  dec2: "#,##0.00",
  pct: "0.00%",
  date: "yyyy-mm-dd",
} as const;

/** The placeholder every export uses for "no source for this yet". */
export const DASH = "-";

export type Align = "left" | "center" | "right";

/**
 * Bordered, vertically centred cell. `wrap` defaults on for text and off for
 * numbers — wrapping a number column only makes rows taller for nothing.
 */
export function box(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; fill?: ExcelJS.Fill; align?: Align; wrap?: boolean; indent?: number } = {},
) {
  cell.border = BORDER;
  cell.alignment = {
    vertical: "middle",
    horizontal: opts.align ?? "center",
    wrapText: opts.wrap ?? true,
    ...(opts.indent ? { indent: opts.indent } : {}),
  };
  if (opts.bold) cell.font = { bold: true };
  if (opts.fill) cell.fill = opts.fill;
}

/**
 * Write a percentage. `value` is a PERCENT (92.86), stored as the fraction
 * 0.9286 under a `0.00%` format; null becomes the placeholder, not 0.
 */
export function pctCell(cell: ExcelJS.Cell, value: number | null, opts: { bold?: boolean; fill?: ExcelJS.Fill } = {}) {
  if (value == null) {
    cell.value = DASH;
  } else {
    // Round the stored fraction: 33.3/100 is 0.33299999999999996 in binary
    // floating point, and that 19-digit repr is what a reader sees in the
    // formula bar (and what a width calculation would measure). Six decimals
    // keep four decimal places of percent, well past what any report shows.
    cell.value = Math.round((value / 100) * 1e6) / 1e6;
    cell.numFmt = NUM_FMT.pct;
  }
  box(cell, { align: "right", wrap: false, ...opts });
}

/** Same, for a value already expressed as a fraction (0.9286). */
export function ratioCell(cell: ExcelJS.Cell, real: number, ideal: number, opts: { bold?: boolean } = {}) {
  pctCell(cell, ideal > 0 ? (100 * real) / ideal : null, opts);
}

export function numCell(
  cell: ExcelJS.Cell,
  value: number | null,
  opts: { fmt?: string; bold?: boolean; fill?: ExcelJS.Fill } = {},
) {
  if (value == null) {
    cell.value = DASH;
  } else {
    cell.value = value;
    cell.numFmt = opts.fmt ?? NUM_FMT.int;
  }
  box(cell, { align: "right", wrap: false, bold: opts.bold, fill: opts.fill });
}

export function textCell(
  cell: ExcelJS.Cell,
  value: string | null | undefined,
  opts: { bold?: boolean; fill?: ExcelJS.Fill; align?: Align } = {},
) {
  cell.value = value?.trim() ? value : DASH;
  box(cell, { align: opts.align ?? "left", bold: opts.bold, fill: opts.fill });
}

/** Header band across `cols` columns at `row`. Returns the next row index. */
export function headerRow(
  ws: ExcelJS.Worksheet,
  row: number,
  headers: string[],
  opts: { fill?: ExcelJS.Fill; startCol?: number } = {},
): number {
  const start = opts.startCol ?? 1;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, start + i);
    cell.value = h;
    box(cell, { bold: true, fill: opts.fill ?? HEAD_FILL });
  });
  return row + 1;
}

/**
 * Keep the header on screen while scrolling AND on every printed page. Both, or
 * page 2 of a printed roster is a wall of unlabelled numbers.
 */
export function freezeHeader(ws: ExcelJS.Worksheet, headerRowIndex: number, opts: { xSplit?: number } = {}) {
  ws.views = [
    {
      state: "frozen",
      ySplit: headerRowIndex,
      xSplit: opts.xSplit ?? 0,
      activeCell: `A${headerRowIndex + 1}`,
    },
  ];
  ws.pageSetup = {
    ...(ws.pageSetup ?? {}),
    printTitlesRow: `${headerRowIndex}:${headerRowIndex}`,
  };
}

/** Sortable/filterable header — only for real list sheets, never for a recap. */
export function autoFilter(ws: ExcelJS.Worksheet, headerRowIndex: number, lastCol: number, lastRow: number) {
  if (lastRow <= headerRowIndex) return;
  ws.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: lastRow, column: lastCol },
  };
}

/** Landscape + fit-to-width, so a wide recap prints as one page across. */
export function printSetup(
  ws: ExcelJS.Worksheet,
  opts: { landscape?: boolean; fitToWidth?: number } = {},
) {
  ws.pageSetup = {
    ...(ws.pageSetup ?? {}),
    orientation: opts.landscape === false ? "portrait" : "landscape",
    fitToPage: true,
    fitToWidth: opts.fitToWidth ?? 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
}

/**
 * What a cell will LOOK like once Excel renders it, which is not what
 * `String(value)` returns:
 *
 *   Date  → `String()` gives "Sat Jul 11 2026 00:00:00 GMT+0700 (WIB)" (45 chars),
 *           so a date column measured naively pins itself to the clamp. Excel
 *           shows the number format, so measure that instead.
 *   number under a % format → 0.9286 renders as "92.86%", four characters wider
 *           than its source text.
 */
function displayWidthText(raw: ExcelJS.CellValue, numFmt?: string): string {
  if (raw == null) return "";
  if (raw instanceof Date) return numFmt && numFmt !== "General" ? numFmt : "yyyy-mm-dd";
  if (typeof raw === "object") {
    if ("richText" in raw) return (raw.richText as Array<{ text: string }>).map((t) => t.text).join("");
    if ("result" in raw) return String(raw.result ?? "");
    if ("text" in raw) return String((raw as { text: unknown }).text ?? ""); // hyperlink
    return "";
  }
  if (typeof raw === "number" && numFmt?.includes("%")) {
    return `${(raw * 100).toFixed(2)}%`;
  }
  return String(raw);
}

/**
 * Width each column to its widest cell, clamped. Excel's own "autofit" is not in
 * the file format — it has to be computed, and a hand-guessed width is what
 * truncates a 40-character halaqah name to "HITS NURIM 001…".
 */
export function autoWidth(
  ws: ExcelJS.Worksheet,
  opts: { min?: number; max?: number; padding?: number } = {},
) {
  const min = opts.min ?? 8;
  const max = opts.max ?? 42;
  const pad = opts.padding ?? 2;
  ws.columns.forEach((col) => {
    let widest = 0;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      // A merged cell's text belongs to the merge, not to this one column.
      if (cell.isMerged) return;
      const raw = cell.value;
      const text = displayWidthText(raw, cell.numFmt);
      // Wrapped text sets its own height; measure the longest LINE, not the blob.
      for (const line of text.split("\n")) widest = Math.max(widest, line.length);
    });
    col.width = Math.min(max, Math.max(min, widest + pad));
  });
}

/** Alternate row fill over a data range (inclusive), skipping already-filled cells. */
export function zebra(ws: ExcelJS.Worksheet, firstRow: number, lastRow: number, lastCol: number) {
  for (let r = firstRow; r <= lastRow; r += 2) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.fill || cell.fill.type !== "pattern") cell.fill = ZEBRA_FILL;
    }
  }
}

/**
 * Footnote under a table: merged, wrapped, small grey. Returns the next row.
 * Exports explain their own definitions — "keberlangsungan = terlaksana ÷
 * terjadwal" belongs next to the number, not in a chat message.
 */
export function noteRow(ws: ExcelJS.Worksheet, row: number, lastCol: number, text: string): number {
  ws.mergeCells(row, 1, row, lastCol);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  cell.font = { size: 9, color: { argb: "FF666666" } };
  ws.getRow(row).height = Math.max(16, 12 * Math.ceil(text.length / Math.max(1, lastCol * 14)));
  return row + 1;
}
