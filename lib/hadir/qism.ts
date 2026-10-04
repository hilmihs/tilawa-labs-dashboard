/**
 * Atribut the institute dari dua bentuk penulisan: berkas Form Kehadiran Rumah Belajar
 * memisah Qism/Mustawa/Fatroh, berkas Pendataan Board Ta'dzhim memadatkannya
 * dalam satu sel ("Syariah - Shobahi", "Khirij - Syariah"). Murni, tanpa DB.
 *
 * Aturan yang paling menentukan: `khirij` adalah nilai MUSTAWA (lulusan),
 * bukan nama prodi. "Khirij - Syariah" = lulusan Syariah. Kalau dianggap qism,
 * rekap "jumlah prodi setiap sesi" melahirkan kolom hantu bernama Khirij.
 */
export const QISM = ["Syariah", "I'dad", "Lughoh", "Idary", "Lainnya"] as const;
export type Qism = (typeof QISM)[number];

export const FATROH = ["Shobahi", "Masa'i"] as const;
export type Fatroh = (typeof FATROH)[number];

export type AtributLipia = { qism: Qism | null; mustawa: string | null; fatroh: Fatroh | null };

/** Token bentuk banding: tanpa apostrof, tanpa aksen, huruf kecil, spasi tunggal. */
function token(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  return String(raw)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

const PETA_QISM: Record<string, Qism> = {
  syariah: "Syariah", syaria: "Syariah", syari: "Syariah",
  idad: "I'dad", idadi: "I'dad",
  lughoh: "Lughoh", lughah: "Lughoh", lugho: "Lughoh",
  idary: "Idary", idari: "Idary", idariy: "Idary",
};

const PETA_FATROH: Record<string, Fatroh> = {
  shobahi: "Shobahi", sobahi: "Shobahi", shobahiy: "Shobahi", sobahiy: "Shobahi",
  masai: "Masa'i", masaiy: "Masa'i", masay: "Masa'i",
};

/** 'khirij' / 'khirrij' → penanda lulusan. */
function isKhirij(t: string): boolean {
  return /^khir+ij$/.test(t);
}

/** Nilai mustawa dari kolom terpisah: angka jadi string, Khirrij jadi 'khirij'. */
function mustawaDari(v: unknown): string | null {
  const tokens = token(v);
  if (tokens.length === 0) return null;
  if (tokens.some(isKhirij)) return "khirij";
  const angka = tokens.find((t) => /^\d+$/.test(t));
  if (angka) return String(Number(angka));
  return tokens.join(" ");
}

export function pecahQism(
  teks: string | null | undefined,
  extra: { mustawa?: unknown; fatroh?: unknown } = {},
): AtributLipia {
  const tokens = token(teks);
  let qism: Qism | null = null;
  let fatroh: Fatroh | null = null;
  let khirij = false;
  for (const t of tokens) {
    if (isKhirij(t)) { khirij = true; continue; }
    if (!qism && PETA_QISM[t]) { qism = PETA_QISM[t]; continue; }
    if (!fatroh && PETA_FATROH[t]) fatroh = PETA_FATROH[t];
  }
  if (!qism && tokens.length > 0) qism = "Lainnya";
  if (!fatroh) fatroh = PETA_FATROH[token(extra.fatroh)[0] ?? ""] ?? null;
  const mustawa = khirij ? "khirij" : mustawaDari(extra.mustawa);
  return { qism, mustawa, fatroh };
}
