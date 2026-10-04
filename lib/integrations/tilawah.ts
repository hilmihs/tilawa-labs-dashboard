/**
 * tilawah CMS (staging.cms.tilawah.tilawaproject.com — Mabni's tenant, not yet
 * in production) write-back integration.
 *
 * Reverse-engineered and LIVE-VERIFIED 2026-07-12 by driving the real admin UI
 * with explicit authorization (network-captured, then reverted — see plan doc):
 *
 *   POST /api/presensis
 *   body: { halaqah_user_id: number, halaqah_jadwal_id: number, status: number, notes: string }
 *   -> { status: "success", code: 201, data: { presensi: {...} } }
 *
 * The endpoint is an upsert keyed by (halaqah_user_id, halaqah_jadwal_id) —
 * submitting twice for the same pair updates the same row (same `id` came
 * back both times in testing), it does not create duplicates.
 *
 * Confirmed status codes (button order in the UI is Hadir/Izin/Alfa/Telat but
 * the codes are NOT positional — only these two were verified by a real write):
 *   1 = Hadir
 *   2 = Telat
 * Izin/Alfa codes are unconfirmed — do not guess, verify with another live
 * test before relying on them.
 *
 * Both blockers noted earlier are resolved: programmatic login lives in
 * tilawah-auth.ts (live-verified), and ID mapping (halaqah_user_id from
 * students_sync, tilawah_jadwal_id from jadwal_sync, both populated by
 * lib/sync/tilawah-sync.ts) is resolved by lib/sync/push-late-status.ts,
 * which calls pushPresensiStatus below.
 */

// 1 = Hadir, 2 = Telat, 3 = Izin/Sakit — all three confirmed by live write
// (30 Jul 2026, backfill HITS Community Mosque). Alfa (0) still unconfirmed.
export type PresensiStatus = 1 | 2 | 3;

type PushResult =
  | { implemented: false; reason: string }
  | { implemented: true; ok: true; presensiId: number }
  | { implemented: true; ok: false; reason: string };

// ── Generic write client ─────────────────────────────────────────────────
// Laravel + XSRF: every mutation needs X-XSRF-TOKEN + X-Requested-With. The
// `halaqah` and `users` resources reject a real PUT (405) — updates go through
// POST /{id} with `_method: "PUT"` in the body (see API_MAP.md).

export type TilawahAuth = { baseUrl: string; cookieHeader: string; xsrfToken: string };
export type WriteResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function tilawahMutate<T = unknown>(
  auth: TilawahAuth,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<WriteResult<T>> {
  try {
    const res = await fetch(`${auth.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": auth.xsrfToken,
        Cookie: auth.cookieHeader,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let parsed: { status?: string; message?: string; data?: T } = {};
    try {
      parsed = await res.json();
    } catch {
      /* some deletes return empty */
    }
    if (!res.ok || (parsed.status && parsed.status !== "success")) {
      return { ok: false, status: res.status, message: parsed.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: parsed.data as T };
  } catch (err) {
    return { ok: false, status: 0, message: err instanceof Error ? err.message : "fetch error" };
  }
}

// ── Halaqah ──────────────────────────────────────────────────────────────
export type HalaqahInput = {
  batchId: number;
  name: string;
  type: "offline" | "online" | "hybrid";
  levelId: number;
  dayId: number;
  sessionId: number;
  userId: number; // guru (one per halaqah)
  description?: string;
};

export function createHalaqah(auth: TilawahAuth, h: HalaqahInput) {
  return tilawahMutate(auth, "POST", "/api/halaqah", {
    batch_id: h.batchId,
    name: h.name,
    type: h.type,
    level_id: h.levelId,
    day_id: h.dayId,
    session_id: h.sessionId,
    description: h.description ?? "",
    user_id: h.userId,
    status: 1,
  });
}

/** Update a halaqah — including *ganti guru* via userId. Uses POST + _method:PUT. */
export function updateHalaqah(auth: TilawahAuth, id: number, h: HalaqahInput) {
  return tilawahMutate(auth, "POST", `/api/halaqah/${id}`, {
    _method: "PUT",
    batch_id: h.batchId,
    name: h.name,
    type: h.type,
    level_id: h.levelId,
    day_id: h.dayId,
    session_id: h.sessionId,
    description: h.description ?? "",
    user_id: h.userId,
    status: 1,
  });
}

/** Convenience: change only the teacher of a halaqah (needs the full current row). */
export function gantiGuru(auth: TilawahAuth, id: number, current: HalaqahInput, newGuruId: number) {
  return updateHalaqah(auth, id, { ...current, userId: newGuruId });
}

// ── Users (murid / guru) ─────────────────────────────────────────────────
export type UserInput = {
  name: string;
  email: string; // WAJIB — 422 if empty
  phone: string;
  gender: 1 | 2; // 1=L, 2=P
  role: "murid" | "guru";
  batchId: number;
  password?: string; // defaults to phone
};

export function createUser(auth: TilawahAuth, u: UserInput) {
  const pw = u.password ?? u.phone;
  return tilawahMutate(auth, "POST", "/api/users", {
    name: u.name,
    email: u.email,
    phone: u.phone,
    user_code: "",
    gender: u.gender,
    role: u.role,
    bio: "",
    wag: "Belum",
    halaqah_id: null,
    old_halaqah_id: null,
    move_reason: "",
    password: pw,
    password_confirmation: pw,
    batch_id: u.batchId,
    meta: { bio: "", wag: "Belum" },
  });
}

/**
 * Enroll or move a user into a halaqah. `moveReason` is REQUIRED (422 otherwise).
 * NB: creating a user does NOT enroll them — this second call does.
 */
export function enrollOrMoveUser(
  auth: TilawahAuth,
  userId: number,
  args: { halaqahId: number; moveReason: string; oldHalaqahId?: number | null },
) {
  return tilawahMutate(auth, "POST", `/api/users/${userId}`, {
    _method: "PUT",
    halaqah_id: args.halaqahId,
    old_halaqah_id: args.oldHalaqahId ?? null,
    move_reason: args.moveReason,
  });
}

// ── Pertemuan (jadwal) ───────────────────────────────────────────────────
export type PertemuanInput = {
  name: string;
  order: number;
  type: "offline" | "online" | "hybrid";
  startSessionDate: string; // "YYYY-MM-DD HH:MM:SS"
  endSessionDate: string; // must be AFTER start (400 otherwise)
  guruId: number;
  scheduleDate: string; // "YYYY-MM-DD"
  halaqahId: number;
  batchId: number;
  offlinePlace?: string;
  onlineUrl?: string;
  notes?: string;
  status?: number; // jadwal status; default 1. 3/4 = Mulai/Selesai ("taught").
};

function pertemuanBody(p: PertemuanInput): Record<string, unknown> {
  return {
    name: p.name,
    order: p.order,
    type: p.type,
    start_session_date: p.startSessionDate,
    end_session_date: p.endSessionDate,
    guru_id: p.guruId,
    online_url: p.onlineUrl ?? "",
    offline_place: p.offlinePlace ?? "",
    notes: p.notes ?? "",
    task_name: "",
    task_description: "",
    task_due: null,
    status: p.status ?? 1,
    moduls: [],
    schedule_date: p.scheduleDate,
    halaqah_id: p.halaqahId,
    batch_id: p.batchId,
  };
}

export function createPertemuan(auth: TilawahAuth, p: PertemuanInput) {
  return tilawahMutate(auth, "POST", "/api/pertemuans", pertemuanBody(p));
}

export function updatePertemuan(auth: TilawahAuth, id: number, p: PertemuanInput) {
  return tilawahMutate(auth, "PUT", `/api/pertemuans/${id}`, { id, ...pertemuanBody(p) });
}

/**
 * Hapus pertemuan. CAVEAT: upstream sering balas `500 "Gagal menghapus
 * pertemuan"` walau barisnya benar-benar terhapus — jangan pakai `ok` sebagai
 * bukti. Verifikasi lewat re-fetch `/api/halaqah/{id}` (lihat API_MAP.md).
 */
export function deletePertemuan(auth: TilawahAuth, id: number) {
  return tilawahMutate(auth, "DELETE", `/api/pertemuans/${id}`);
}

/**
 * Low-level client for the confirmed endpoint. Requires an already-authenticated
 * session (cookie header + XSRF token) — see lib/integrations/tilawah-auth.ts.
 * Kept separate from the orchestration in lib/sync/push-late-status.ts so this
 * verified request shape doesn't get entangled with ID-resolution logic.
 */
export async function pushPresensiStatus(args: {
  baseUrl: string;
  cookieHeader: string;
  xsrfToken: string;
  halaqahUserId: number;
  halaqahJadwalId: number;
  status: PresensiStatus;
  notes?: string;
}): Promise<PushResult> {
  try {
    const res = await fetch(`${args.baseUrl}/api/presensis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": args.xsrfToken,
        Cookie: args.cookieHeader,
      },
      body: JSON.stringify({
        halaqah_user_id: args.halaqahUserId,
        halaqah_jadwal_id: args.halaqahJadwalId,
        status: args.status,
        notes: args.notes ?? "",
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      return { implemented: true, ok: false, reason: body.message ?? `HTTP ${res.status}` };
    }
    return { implemented: true, ok: true, presensiId: body.data.presensi.id };
  } catch (err) {
    return {
      implemented: true,
      ok: false,
      reason: err instanceof Error ? err.message : "unknown fetch error",
    };
  }
}
