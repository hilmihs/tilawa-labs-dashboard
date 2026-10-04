import { describe, expect, it } from "vitest";
import { pesanIkhbar, tautanWa } from "./ikhbar";

describe("pesanIkhbar", () => {
  it("satu hari: memberi tahu, bukan meminta izin", () => {
    const p = pesanIkhbar({ namaArab: "الشيخ أحمد الشهاري", dari: "2026-09-29", sampai: "2026-09-29", alasan: "sakit", catatan: null });
    expect(p).toContain("أُحيطكم علمًا");
    expect(p).toContain("يوم الثلاثاء ٢٩ سبتمبر ٢٠٢٦");
    expect(p).toContain("السبب: مرض");
    expect(p).not.toContain("إذن");
    expect(p).not.toContain("ملاحظة");
    expect(p.split("\n").at(-1)).toBe("أحمد الشهاري");
  });
  it("rentang + catatan", () => {
    const p = pesanIkhbar({ namaArab: "محمد سالم بحيري", dari: "2026-10-05", sampai: "2026-10-07", alasan: "safar", catatan: "إلى مصر" });
    expect(p).toContain("من الاثنين ٥ أكتوبر ٢٠٢٦ إلى الأربعاء ٧ أكتوبر ٢٠٢٦");
    expect(p).toContain("ملاحظة: إلى مصر");
    expect(p.split("\n").at(-1)).toBe("محمد سالم بحيري");
  });
});

describe("tautanWa", () => {
  it("nomor jadi angka saja", () => {
    expect(tautanWa("+6281047738347", "س")).toBe("https://wa.me/6281047738347?text=%D8%B3");
  });
});
