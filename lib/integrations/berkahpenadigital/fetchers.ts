import {
  berkahGet,
  berkahGetAllPages,
  berkahPostJson,
  berkahFetchUrlText,
  type SessionHolder,
} from "./client";
import type {
  BerkahUser,
  BerkahHistory,
  BerkahTarget,
  BerkahBusinessUnit,
  BerkahSurah,
} from "./types";

/**
 * High-level typed fetchers, one per endpoint the HKM sync needs. History and
 * targets are pulled GLOBALLY (by date window / all pages), NOT per-user, to
 * avoid an N+1 request storm across hundreds of participants.
 */

/** All internal users (optionally scoped to a Board/business unit). */
export function fetchInternalUsers(
  baseUrl: string,
  holder: SessionHolder,
  opts: { businessUnitId?: number | null; isInternal?: number } = {},
): Promise<BerkahUser[]> {
  const isInternal = opts.isInternal ?? 1;
  const buId = opts.businessUnitId ?? "";
  return berkahGetAllPages<BerkahUser>(
    baseUrl,
    holder,
    `/api/users?filters[is_internal]=${isInternal}&filters[business_unit_id]=${buId}&column=name&direction=asc`,
    "users",
    { perPage: 100, pageSizeParam: "pagesize" },
  );
}

/**
 * All reading-history rows in [startDate, endDate] across all users (global
 * pull). Dates are `YYYY-MM-DD`; omit to pull everything the API returns.
 */
export function fetchAllHistory(
  baseUrl: string,
  holder: SessionHolder,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<BerkahHistory[]> {
  const params = new URLSearchParams();
  params.set("column", "history_date");
  params.set("direction", "asc");
  if (opts.startDate) params.set("start_date", opts.startDate);
  if (opts.endDate) params.set("end_date", opts.endDate);
  return berkahGetAllPages<BerkahHistory>(
    baseUrl,
    holder,
    `/api/users/history?${params.toString()}`,
    "target_histories",
    { perPage: 200, pageSizeParam: "pagesize" },
  );
}

/** All khatam targets across all users. */
export function fetchAllTargets(baseUrl: string, holder: SessionHolder): Promise<BerkahTarget[]> {
  return berkahGetAllPages<BerkahTarget>(baseUrl, holder, `/api/targets?`, "targets", {
    perPage: 200,
  });
}

export function fetchBusinessUnits(
  baseUrl: string,
  holder: SessionHolder,
): Promise<BerkahBusinessUnit[]> {
  return berkahGetAllPages<BerkahBusinessUnit>(baseUrl, holder, `/api/business-units?`, "business", {
    perPage: 100,
  });
}

/**
 * A parsed row from the /api/users/export CSV — the "Download CSV" on the users
 * page. This is the ONLY source that carries page numbers, which the khatam
 * engine needs. Column headers (confirmed from a real export):
 *   "User ID",Nama,Email,Internal,"Target Khatam Ke",Tanggal,
 *   "Dari Surah","Sampai Surah","Dari Ayat","Sampai Ayat",
 *   "Dari Juz","Sampai Juz","Dari Halaman","Sampai Halaman","Total Halaman"
 */
export type BerkahExportRow = {
  userId: number | null;
  nama: string | null;
  email: string | null;
  internal: string | null;
  targetKhatamKe: number | null;
  tanggal: string | null; // YYYY-MM-DD
  fromSuraName: string | null; // export gives surah NAMES, not numbers
  toSuraName: string | null;
  fromAyah: number | null;
  toAyah: number | null;
  fromJuz: number | null;
  toJuz: number | null;
  fromPage: number | null;
  toPage: number | null;
  totalPages: number | null;
};

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-") return null; // export uses "-" for missing
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const txt = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" || s === "-" ? null : s;
};

/**
 * Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). We parse by
 * hand rather than via SheetJS because SheetJS auto-detects the ISO `Tanggal`
 * column and rewrites it to an Excel serial number.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const normDate = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

type ReportResponse = {
  success?: boolean;
  message?: string;
  data?: { url?: string; filename?: string; original_name?: string };
};

/**
 * Pull + parse the reading export CSV for internal users over [startDate, endDate].
 *
 * Mirrors the users-page "Download CSV": POST /api/users/report with a JSON body
 * (business_id, is_internal, start_date, end_date) → the server generates a file
 * and returns its URL → we GET that URL and parse the CSV. One global request
 * (not per-user). Confirmed from the users-page JS bundle (2026-07-20).
 */
export async function fetchReadingExport(
  baseUrl: string,
  holder: SessionHolder,
  opts: { businessUnitId?: number | null; isInternal?: number; startDate?: string; endDate?: string } = {},
): Promise<BerkahExportRow[]> {
  const report = await berkahPostJson<ReportResponse>(baseUrl, holder, "/api/users/report", {
    business_id: opts.businessUnitId ?? null,
    is_internal: opts.isInternal ?? 1,
    start_date: opts.startDate ?? null,
    end_date: opts.endDate ?? null,
  });
  const url = report.data?.url;
  if (!report.success || !url) {
    throw new Error(`users/report did not return a file url — ${report.message ?? "unknown"}`);
  }

  const csv = await berkahFetchUrlText(baseUrl, holder, url);
  const matrix = parseCsv(csv);
  if (matrix.length < 2) return [];
  const header = matrix[0].map((h) => h.trim());
  const c = (name: string) => header.indexOf(name);
  const idx = {
    userId: c("User ID"),
    nama: c("Nama"),
    email: c("Email"),
    internal: c("Internal"),
    targetKhatamKe: c("Target Khatam Ke"),
    tanggal: c("Tanggal"),
    fromSura: c("Dari Surah"),
    toSura: c("Sampai Surah"),
    fromAyah: c("Dari Ayat"),
    toAyah: c("Sampai Ayat"),
    fromJuz: c("Dari Juz"),
    toJuz: c("Sampai Juz"),
    fromPage: c("Dari Halaman"),
    toPage: c("Sampai Halaman"),
    totalPages: c("Total Halaman"),
  };
  const at = (r: string[], i: number) => (i >= 0 ? r[i] : undefined);

  return matrix
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => ({
      userId: num(at(r, idx.userId)),
      nama: txt(at(r, idx.nama)),
      email: at(r, idx.email) ? String(at(r, idx.email)).trim().toLowerCase() || null : null,
      internal: txt(at(r, idx.internal)),
      targetKhatamKe: num(at(r, idx.targetKhatamKe)),
      tanggal: normDate(at(r, idx.tanggal)),
      fromSuraName: txt(at(r, idx.fromSura)),
      toSuraName: txt(at(r, idx.toSura)),
      fromAyah: num(at(r, idx.fromAyah)),
      toAyah: num(at(r, idx.toAyah)),
      fromJuz: num(at(r, idx.fromJuz)),
      toJuz: num(at(r, idx.toJuz)),
      fromPage: num(at(r, idx.fromPage)),
      toPage: num(at(r, idx.toPage)),
      totalPages: num(at(r, idx.totalPages)),
    }));
}

/** The 114-surah reference table (labels for the Juz/Surah heatmap). */
export async function fetchSurahs(baseUrl: string, holder: SessionHolder): Promise<BerkahSurah[]> {
  const body = await berkahGet<BerkahSurah[] | { surahs: BerkahSurah[] }>(
    baseUrl,
    holder,
    "/api/quran/surahs",
  );
  const data = body.data as BerkahSurah[] | { surahs?: BerkahSurah[] };
  return Array.isArray(data) ? data : (data.surahs ?? []);
}
