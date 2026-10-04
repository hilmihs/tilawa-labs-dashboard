/**
 * Types for the the partner system admin API at cms.example.com — the data source
 * for HKM tilawah monitoring. Same Laravel response envelope and pagination shape
 * as the tilawah CMS (see lib/integrations/tilawah-client.ts), so the client here
 * is a near-twin; only the login base URL and the endpoints differ.
 *
 * Endpoints (confirmed live 2026-07-20):
 *   GET /api/users?filters[is_internal]=1&filters[business_unit_id]=&page&pagesize
 *   GET /api/users/history?filters[history_date]=&filters[user_id]=&page&pagesize
 *   GET /api/targets?filters[user_id]=&per_page
 *   GET /api/business-units?per_page
 *   GET /api/quran/surahs
 */

/** Standard response envelope for every HKM CMS API endpoint. */
export type BerkahEnvelope<T> = {
  status: string;
  code: number;
  message: string;
  data: T;
  spent: number;
};

export type BerkahPagination = {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
};

/** A the partner system user row (only the ~15 fields the HKM pipeline consumes are typed). */
export type BerkahUser = {
  id: number;
  uuid: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  gender: number | null; // 1=L, 2=P
  is_internal: boolean | number | string | null;
  progress_khatam: number | string | null;
  total_khatam: number | null;
  last_read_at: string | null;
  business_unit?: { id: number; name: string } | null;
};

/** A per-day reading record from /api/users/history. */
export type BerkahHistory = {
  id: number;
  target_id: number | null;
  user_id: number | null;
  history_date: string | null;
  current_achievement: number | string | null;
  current_state: string | null;
  from_sura: number | null;
  to_sura: number | null;
  from_ayah: number | null;
  to_ayah: number | null;
  from_juz: number | string | null;
  to_juz: number | string | null;
  // Page fields are not always present on this endpoint; kept optional.
  from_page?: number | null;
  to_page?: number | null;
};

/** A khatam target from /api/targets. */
export type BerkahTarget = {
  id: number;
  user_id: number | null;
  target_type: string | null; // 'khatam'
  target_date: string | null;
  target_per_day: number | string | null;
  target_total: number | string | null;
  target_done: number | string | null;
  target_remaining: number | string | null;
  status_label: string | null;
};

export type BerkahBusinessUnit = {
  id: number;
  name: string;
  business_code?: string | null;
};

export type BerkahSurah = {
  id: number;
  surahNumber: number;
  latinName: string;
  arabicName: string;
  translationId: string;
  translationEn: string;
  revelationPlace: string;
  ayahCount: number;
};
