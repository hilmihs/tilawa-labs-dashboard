/**
 * Client for the Mabni school-attendance API (boarding.tilawalabs.demo/api/v1).
 * Server-to-server: log in with an ADMIN account for a Sanctum bearer token,
 * then read cursor-paginated collections. Docs: MABNI public API spec.
 *
 * Every collection here is read-only upstream (`OPTIONS` answers `GET,HEAD`),
 * cursor-paginated, capped at per_page=1000, and STRICT about query params —
 * an unknown one is rejected with 422 "Parameter tidak dikenal." rather than
 * ignored, so only send the filters a route actually documents.
 */
const BASE = () => (process.env.MABNI_BASE_URL ?? "https://boarding.tilawalabs.demo/api/v1").replace(/\/$/, "");

export type MabniAbsensi = {
  id: number;
  tanggal: string; // "YYYY-MM-DD"
  status: "hadir" | "izin" | "alpha" | "terlambat" | string;
  keterangan: string | null;
  jam_terlambat: string | null;
  updated_at: string;
  siswa: { id: number; nama: string };
  sesi: { id: number; jam: string | null; jam_selesai: string | null };
  kelas: { id: number; nama: string };
  jenjang: { id: number; nama: string };
  periode: { id: number; nama: string };
};

/** `hari` is ISO-ish weekday numbers (1=Senin … 7=Ahad), e.g. [2,5] = Selasa & Jumat. */
export type MabniKelas = {
  id: number;
  nama: string;
  gender: "ikhwan" | "akhwat" | string | null;
  jenis_pertemuan: string | null; // "yaumi" | "usbui" | …
  tipe: string | null; // "offline" | "online"
  ruang: string | null;
  tempat: string | null;
  hari: number[] | null;
  jenjang: { id: number; nama: string } | null;
  periode: { id: number; nama: string } | null;
  updated_at: string;
};

export type MabniSiswa = {
  id: number;
  nama: string;
  nama_ayah: string | null;
  nama_ibu: string | null;
  kelas: { id: number; nama: string } | null;
  updated_at: string;
};

/** No phone upstream — `email` is the only contact channel the API exposes. */
export type MabniGuru = {
  id: number;
  nama: string; // full name; the class name only carries nicknames
  nickname: string | null;
  email: string | null;
  updated_at: string;
};

/** The recurring pattern for a class, NOT the individual session occurrences. */
export type MabniJadwal = {
  id: number;
  hari: number[] | null;
  jam: string | null;
  jam_selesai: string | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  kelas: { id: number; nama: string } | null;
  guru: { id: number; nama: string } | null;
  updated_at: string;
};

export type MabniPeriode = {
  id: number;
  nama: string;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  aktif: boolean;
  updated_at: string;
};

/**
 * One setoran record. Upstream currently leaves `ayat_dari`/`ayat_sampai` null
 * and every `status` at "dalam_proses", writing the ayat range free-form inside
 * `surat` ("Az-zukhruf ayat 61-63") — so this is evidence of setoran ACTIVITY,
 * not of memorisation progress. See the integration notes.
 */
export type MabniHafalan = {
  id: number;
  surat: string | null;
  ayat_dari: number | null;
  ayat_sampai: number | null;
  status: string | null;
  keterangan: string | null;
  siswa: { id: number; nama: string };
  sesi: { id: number; tanggal: string | null } | null;
  metrik: { id: number; nama: string } | null;
  updated_at: string;
};

/**
 * The in-flight login, NOT the token it resolves to.
 *
 * Caching the resolved string looks equivalent and is not: mabni-sync pulls
 * eight endpoints through one Promise.all, all eight reach `token()` in the same
 * tick, all eight see an empty cache, and all eight POST /login before the first
 * answer comes back. Laravel throttles that route at 5 requests per minute, so
 * the burst answers itself with 429 and the whole sync dies at its first step —
 * which is exactly what happened every run from 18 Aug 2026, the day the eighth
 * fetch was added. Memoising the promise means one login per process no matter
 * how many callers arrive at once.
 */
let tokenPromise: Promise<string> | null = null;

async function login(): Promise<string> {
  const email = process.env.MABNI_LOGIN_EMAIL;
  const password = process.env.MABNI_LOGIN_PASSWORD;
  if (!email || !password) throw new Error("MABNI_LOGIN_EMAIL / MABNI_LOGIN_PASSWORD not set");
  const res = await fetch(`${BASE()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.token) {
    throw new Error(`Mabni login failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.token as string;
}

function token(): Promise<string> {
  if (!tokenPromise) {
    // A rejected login must not stay memoised, or every later caller in this
    // process replays the same failure without ever attempting a fresh login.
    tokenPromise = login().catch((err) => {
      tokenPromise = null;
      throw err;
    });
  }
  return tokenPromise;
}

async function getJson(path: string): Promise<{ data?: unknown[]; meta?: { next_cursor?: string | null } }> {
  const res = await fetch(`${BASE()}${path}`, {
    headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" },
  });
  if (res.status === 401) {
    // token revoked/expired — re-login once. Dropping the memoised promise is
    // what forces the next token() to hit /login again; the concurrent callers
    // that follow still share that single retry.
    tokenPromise = null;
    const retry = await fetch(`${BASE()}${path}`, {
      headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" },
    });
    if (!retry.ok) throw new Error(`Mabni GET ${path} failed: HTTP ${retry.status}`);
    return retry.json();
  }
  if (!res.ok) {
    // Surface the validation body: a 422 here names the offending parameter,
    // which is the whole diagnosis when a filter is wrong.
    const detail = await res.text().catch(() => "");
    throw new Error(`Mabni GET ${path} failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Read a whole collection, following `meta.next_cursor` to the end. Every
 * dataset here is small (hundreds to low thousands), so a full pull per sync is
 * cheaper to reason about than incremental state — `updated_since` is available
 * on every route if that ever stops being true.
 */
async function fetchAll<T>(path: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 1000; guard++) {
    const q = new URLSearchParams({ per_page: "1000" });
    for (const [k, v] of Object.entries(params)) q.set(k, String(v));
    if (cursor) q.set("cursor", cursor);
    const body = await getJson(`${path}?${q.toString()}`);
    rows.push(...((body.data as T[]) ?? []));
    cursor = body.meta?.next_cursor ?? null;
    if (!cursor || (body.data?.length ?? 0) === 0) break;
  }
  return rows;
}

/** Attendance rows from `dari` onward (defaults to everything). */
export function fetchAllAbsensi(opts: { dari?: string } = {}): Promise<MabniAbsensi[]> {
  return fetchAll<MabniAbsensi>("/absensi", { dari: opts.dari ?? "2024-01-01" });
}

export function fetchKelas(): Promise<MabniKelas[]> {
  return fetchAll<MabniKelas>("/kelas");
}

export function fetchSiswa(): Promise<MabniSiswa[]> {
  return fetchAll<MabniSiswa>("/siswa");
}

/** Without `kelasId` this is the whole teacher roster; with it, that class's teachers. */
export function fetchGuru(kelasId?: number): Promise<MabniGuru[]> {
  return fetchAll<MabniGuru>("/guru", kelasId == null ? {} : { kelas_id: kelasId });
}

export function fetchJadwal(): Promise<MabniJadwal[]> {
  return fetchAll<MabniJadwal>("/jadwal");
}

export function fetchPeriode(): Promise<MabniPeriode[]> {
  return fetchAll<MabniPeriode>("/periode");
}

export function fetchHafalan(): Promise<MabniHafalan[]> {
  return fetchAll<MabniHafalan>("/hafalan");
}

/**
 * One teacher check-in. Upstream grain is exactly one row per (guru, tanggal) —
 * a daily presence record, NOT per-session: `/absensi-guru` exposes no sesi_id
 * or kelas_id (both rejected 422), so this cannot be joined to a meeting.
 */
export type MabniGuruAbsensi = {
  id: number;
  tanggal: string; // "YYYY-MM-DD"
  status: "hadir" | "terlambat" | "izin" | string;
  keterangan: string | null;
  jam_masuk: string | null; // "09:46:33"
  sudah_izin: boolean;
  updated_at: string;
  guru: { id: number; nama: string };
};

/** Teacher daily check-ins from `dari` onward (defaults to everything). */
export function fetchAllGuruAbsensi(opts: { dari?: string } = {}): Promise<MabniGuruAbsensi[]> {
  return fetchAll<MabniGuruAbsensi>("/absensi-guru", { dari: opts.dari ?? "2024-01-01" });
}

/**
 * Exam marks. Typed loosely ON PURPOSE: the collection is still empty upstream
 * (model `NilaiUjian`, 0 rows for every filter), so an empty resource reveals
 * no field names and any interface written today would be a guess. Rows are
 * carried through verbatim and the dashboard renders whatever keys arrive —
 * see the integration notes #5.
 */
export type MabniNilai = { id: number } & Record<string, unknown>;

export function fetchNilai(): Promise<MabniNilai[]> {
  return fetchAll<MabniNilai>("/nilai");
}
