import { describe, expect, it } from "vitest";
import { buildRecapMessage, type RecapMessageInput } from "./message";
import type { RecapCounts } from "./types";

const counts = (over: Partial<RecapCounts> = {}): RecapCounts => ({
  halaqah: 2,
  meetings: 8,
  taught: 6,
  gaps: 2,
  confirmed: 0,
  unresolved: 2,
  ...over,
});

const input = (over: Partial<RecapMessageInput> = {}): RecapMessageInput => ({
  nama: "Ahmad Fauzi",
  programs: ["HITS Reguler"],
  counts: counts(),
  link: "https://dashboard.example.id/rekap/eyJhbGciOiJIUzI1NiJ9.abc-def_ghi",
  periodLabel: "16 Juli – 15 Agustus 2026",
  lockLabel: "17 Agustus 2026 pukul 16.00 WIB",
  ...over,
});

describe("buildRecapMessage", () => {
  it("opens with the salam and the teacher's name", () => {
    const msg = buildRecapMessage(input());
    expect(msg.startsWith("Assalamu'alaikum warahmatullahi wabarakatuh, Ustadz/ah Ahmad Fauzi 🙏")).toBe(true);
  });

  it("states the period, the counts and the lock deadline", () => {
    const msg = buildRecapMessage(input());
    expect(msg).toContain("periode 16 Juli – 15 Agustus 2026:");
    expect(msg).toContain("• 2 halaqah (HITS Reguler)");
    expect(msg).toContain("• 6 dari 8 pertemuan tercatat sudah diajar");
    expect(msg).toContain("⏰ Presensi dikunci 17 Agustus 2026 pukul 16.00 WIB.");
    expect(msg).toContain("Jazaakumullahu khairan 🌿");
  });

  describe("with gaps", () => {
    it("names the number of meetings still missing attendance", () => {
      const msg = buildRecapMessage(input({ counts: counts({ gaps: 3 }) }));
      expect(msg).toContain("• 3 pertemuan belum ada catatan presensi");
    });

    it("does not add the all-clear sentence", () => {
      const msg = buildRecapMessage(input());
      expect(msg).not.toContain("Semua pertemuan sudah tercatat");
    });
  });

  describe("without gaps", () => {
    const clean = input({ counts: counts({ meetings: 8, taught: 8, gaps: 0, unresolved: 0 }) });

    it("drops the gap line entirely instead of printing zero", () => {
      const msg = buildRecapMessage(clean);
      expect(msg).not.toContain("belum ada catatan presensi");
      expect(msg).not.toContain("• 0 ");
    });

    it("acknowledges the complete record and still asks for confirmation", () => {
      const msg = buildRecapMessage(clean);
      expect(msg).toContain("Semua pertemuan sudah tercatat — mohon konfirmasi bila sudah sesuai.");
      expect(msg).toContain("Mohon dicek dan dikonfirmasi di tautan ini:");
    });
  });

  describe("program list", () => {
    it("renders a single program without a separator", () => {
      const msg = buildRecapMessage(input({ counts: counts({ halaqah: 1 }), programs: ["HITS Reguler"] }));
      expect(msg).toContain("• 1 halaqah (HITS Reguler)");
    });

    it("joins several programs with commas", () => {
      const msg = buildRecapMessage(
        input({ counts: counts({ halaqah: 3 }), programs: ["HITS Reguler", "HITS Ekspres", "Tilawah Pagi"] }),
      );
      expect(msg).toContain("• 3 halaqah (HITS Reguler, HITS Ekspres, Tilawah Pagi)");
    });

    it("collapses repeated program names", () => {
      const msg = buildRecapMessage(input({ programs: ["HITS Reguler", "HITS Reguler"] }));
      expect(msg).toContain("• 2 halaqah (HITS Reguler)");
    });

    it("omits the parentheses when no program name is known", () => {
      const msg = buildRecapMessage(input({ programs: [] }));
      expect(msg).toContain("• 2 halaqah\n");
      expect(msg).not.toContain("()");
    });
  });

  describe("magic link", () => {
    const link = "https://dashboard.example.id/rekap/eyJhbGciOiJIUzI1NiJ9.abc-def_ghi";

    it("keeps the URL intact on its own line", () => {
      const msg = buildRecapMessage(input({ link }));
      expect(msg.split("\n")).toContain(link);
    });

    it("does not escape or wrap the URL", () => {
      const msg = buildRecapMessage(input({ link }));
      expect(msg).toContain(link);
      expect(msg).not.toContain("%2F");
      expect(msg).not.toContain("&amp;");
      expect(msg).not.toContain("<");
    });

    it("appears exactly once so there is nothing ambiguous to tap", () => {
      const msg = buildRecapMessage(input({ link }));
      expect(msg.split(link).length - 1).toBe(1);
    });
  });

  it("carries nothing that looks like a phone number", () => {
    // The builder is given no phone at all, but the assertion guards against a
    // future field being spliced into the body: the blast gets screenshotted.
    const msg = buildRecapMessage(input());
    expect(msg).not.toMatch(/\b0?8\d{8,}\b/);
    expect(msg).not.toMatch(/\b62\d{8,}\b/);
  });
});

describe("catatan spreadsheet khusus periode 16 Jul – 15 Agu 2026", () => {
  const base = {
    nama: "Fulanah",
    programs: ["HITS Reguler (Batch Januari 2026)"],
    counts: { halaqah: 1, meetings: 8, taught: 6, gaps: 2, confirmed: 0, unresolved: 2 },
    link: "https://dashboard.example.org/rekap/t",
    periodLabel: "16 Juli – 15 Agustus 2026",
    lockLabel: "17 Agustus 2026 pukul 18.00 WIB",
  };

  it("muncul untuk pengajar batch Januari pada periode ini", () => {
    const msg = buildRecapMessage({
      ...base,
      programSlugs: ["hits-regular-jan"],
      periodEnd: "2026-08-15",
    });
    expect(msg).toContain("16–19 Juli 2026");
    expect(msg).toContain("spreadsheet absensi pengajar");
  });

  it("muncul juga untuk batch April", () => {
    const msg = buildRecapMessage({
      ...base,
      programSlugs: ["hits-regular-apr"],
      periodEnd: "2026-08-15",
    });
    expect(msg).toContain("16–19 Juli 2026");
  });

  it("tidak muncul untuk batch lain", () => {
    const msg = buildRecapMessage({
      ...base,
      programSlugs: ["hits-regular", "dpq"],
      periodEnd: "2026-08-15",
    });
    expect(msg).not.toContain("16–19 Juli 2026");
  });

  // The point of gating on the period: nobody has to remember to delete this.
  it("berhenti terkirim setelah periodenya lewat", () => {
    const msg = buildRecapMessage({
      ...base,
      programSlugs: ["hits-regular-jan"],
      periodEnd: "2026-09-15",
    });
    expect(msg).not.toContain("16–19 Juli 2026");
  });

  it("tidak muncul kalau pemanggil tidak mengirim slug sama sekali", () => {
    expect(buildRecapMessage(base)).not.toContain("16–19 Juli 2026");
  });
});
