/**
 * Parse the HKM participant master (CSV/XLSX) into typed rows. Shared by the
 * CLI import (`scripts/import-hkm-master.ts`) and the admin upload endpoint
 * (`/api/admin/import-hkm-master`) so both interpret the file identically.
 *
 * The master is the reconciled roster — registration data fuzzy-matched against
 * the partner system accounts — and is the ONLY source of halaqah/pengajar/gender. Live
 * reading data joins to these rows by normalized email at sync time.
 */
import * as XLSX from "xlsx";
import { normalizeEmail } from "@/lib/insights/hkm";

export type MasterRow = {
  namaPeserta: string;
  namaPengajar: string | null;
  namaHalaqah: string | null;
  hkm: string | null;
  gender: string | null;
  usernameNafi: string | null;
  emailMaster: string | null;
  statusEmail: string | null;
  matchMethod: string | null;
  confidence: string | null;
};

function normGender(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s === "nan" || s === "none") return null;
  return s === "ikhwan" ? "Ikhwan" : "Akhwat";
}

function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" || s === "nan" || s === "None" ? null : s;
}

/** Parse a raw master file (as a Buffer) into typed rows; blank rows dropped. */
export function parseMasterWorkbook(buf: Buffer): MasterRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  return rows
    .map((r) => {
      const namaPeserta = str(r["nama_peserta"]);
      if (!namaPeserta) return null; // skip blank rows
      const conf = r["confidence"];
      return {
        namaPeserta,
        namaPengajar: str(r["nama_pengajar"]),
        namaHalaqah: str(r["nama_halaqah"]),
        hkm: str(r["hkm"]),
        gender: normGender(r["jenis_kelamin"]),
        usernameNafi: str(r["username_nafi_master"]),
        emailMaster: normalizeEmail(String(r["email_master"] ?? "")),
        statusEmail: str(r["status_email"]),
        matchMethod: str(r["match_method"]),
        confidence: conf == null || conf === "" ? null : String(conf),
      } satisfies MasterRow;
    })
    .filter((r): r is MasterRow => r !== null);
}
