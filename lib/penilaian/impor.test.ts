import { describe, expect, it } from "vitest";
import { cocokNama, konversiNilai, ringkasImpor, siapkanImpor, tebakKolom, type Kandidat, type KpiMini } from "./impor";

const kpi: KpiMini[] = [
  { id: "k1", kode: "tepat_waktu", nama: "Ketepatan waktu" },
  { id: "k2", kode: "disiplin", nama: "Kedisiplinan" },
];
const kand = (orangId: string, nama: string, panitiaId: string | null = null): Kandidat => ({
  orangId, panitiaId, nama, namaKunci: nama.toLowerCase(), label: nama,
});
const K = [kand("o1", "Jannah", "p1"), kand("o2", "Sofyan", "p2"), kand("o3", "Salma"), kand("o4", "Salma"), kand("o5", "Daan Nurroyyan A")];

describe("tebakKolom", () => {
  it("maps name, evidence and KPI columns from Google Form headers", () => {
    const p = tebakKolom(["Timestamp", "Nama Lengkap", "Divisi", "Ketepatan waktu (1–4)", "Kedisiplinan", "Contoh kejadian"], kpi);
    expect(p).toEqual({ nama: "Nama Lengkap", evidence: "Contoh kejadian", kpi: { k1: "Ketepatan waktu (1–4)", k2: "Kedisiplinan" } });
  });
});

describe("konversiNilai", () => {
  it("accepts letters and the 1–4 scale", () => {
    expect(konversiNilai("b")).toBe("B");
    expect(konversiNilai("C - cukup")).toBe("C");
    expect(konversiNilai(4)).toBe("B");
    expect(konversiNilai("1")).toBe("E");
    expect(konversiNilai("2,6")).toBe("C");
    expect(konversiNilai("")).toBeNull();
    expect(konversiNilai("A")).toBe("tidak_sah");
    expect(konversiNilai("7")).toBe("tidak_sah");
  });
});

describe("cocokNama", () => {
  it("exact, prefix, and refuses duplicates", () => {
    expect(cocokNama("jannah ", K).cocok?.orangId).toBe("o1");
    expect(cocokNama("Daan Nurroyyan", K).cocok?.orangId).toBe("o5");
    expect(cocokNama("Salma", K)).toMatchObject({ cocok: null, alasan: "2 orang bernama Salma" });
    expect(cocokNama("Tamu Walkin Uji", K)).toMatchObject({ cocok: null, alasan: "nama tidak dikenal" });
  });
});

describe("siapkanImpor", () => {
  const peta = { nama: "Nama", evidence: "Contoh", kpi: { k1: "Waktu", k2: "Disiplin" } };
  it("classifies new, changed, same and rejected rows", () => {
    const rows = [
      { Nama: "Jannah", Waktu: 4, Disiplin: 4, Contoh: "" },
      { Nama: "sofyan", Waktu: 3, Disiplin: "B", Contoh: "" },
      { Nama: "Salma", Waktu: 4, Disiplin: 3, Contoh: "" },
      { Nama: "Daan Nurroyyan", Waktu: 2, Disiplin: 3, Contoh: "" },
      { Nama: "", Waktu: "", Disiplin: "", Contoh: "" },
      { Nama: "Jannah", Waktu: 4, Disiplin: 4, Contoh: "" },
    ];
    const lama = new Map<string, Record<string, "B" | "C" | "D" | "E">>([["o2", { k1: "B", k2: "B" }], ["o1", {}]]);
    const b = siapkanImpor(rows, peta, kpi, K, lama);
    expect(b.map((x) => [x.no, x.status])).toEqual([
      [2, "baru"],
      [3, "berubah"],
      [4, "ditolak"],
      [5, "ditolak"], // D tanpa contoh kejadian
      [7, "ditolak"], // duplikat
    ]);
    expect(b[1].nilai).toEqual({ k1: "C", k2: "B" });
    expect(ringkasImpor(b)).toEqual({ baru: 1, berubah: 1, sama: 0, ditolak: 3 });
  });
  it("marks unchanged re-imports as same", () => {
    const b = siapkanImpor([{ Nama: "Jannah", Waktu: "B", Disiplin: "B" }], { ...peta, evidence: null }, kpi, K, new Map([["o1", { k1: "B" as const, k2: "B" as const }]]));
    expect(b[0].status).toBe("sama");
  });
});
