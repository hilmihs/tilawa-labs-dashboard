import { describe, expect, it } from "vitest";
import {
  BARIS_MIN_TINGGI,
  barisChip,
  buildBoard,
  inisial,
  KOLOM_STAKEHOLDER,
  selisihHari,
  stakeholderTier,
  TINGGI_UNTUK_BARIS,
  toRow,
  warnaUsia,
  WARNA,
  type Directive,
} from "./board";

/** 3 September 2026, 19:42 WIB. */
const NOW = Date.parse("2026-09-03T12:42:00Z");

function d(over: Partial<Directive> = {}): Directive {
  return {
    id: over.id ?? "a",
    title: over.title ?? "Arahan",
    source: over.source ?? "Dewan",
    pic: over.pic ?? "Tim Program",
    stakeholders: over.stakeholders ?? ["Ketua Majelis"],
    requestedAt: over.requestedAt ?? "2026-09-01",
    checkpoint: over.checkpoint ?? null,
    checkpointUpdatedAt: over.checkpointUpdatedAt ?? null,
  };
}

describe("selisihHari", () => {
  it("counts calendar days in Jakarta, not 24-hour blocks", () => {
    // 22:00 WIB kemarin ke 07:00 WIB hari ini adalah 9 jam, tapi satu hari.
    expect(selisihHari("2026-09-02", Date.parse("2026-09-03T00:00:00Z"))).toBe(1);
  });

  it("is zero on the day itself, even late at night", () => {
    expect(selisihHari("2026-09-03", Date.parse("2026-09-03T16:59:00Z"))).toBe(0);
  });
});

describe("warnaUsia", () => {
  it("steps at 7, 14 and 30 days", () => {
    expect(warnaUsia(7)).toBe(WARNA.hijau);
    expect(warnaUsia(8)).toBe(WARNA.kuning);
    expect(warnaUsia(15)).toBe(WARNA.jingga);
    expect(warnaUsia(31)).toBe(WARNA.merah);
  });
});

describe("inisial", () => {
  it("takes first and last word", () => {
    expect(inisial("Tim Kaderisasi")).toBe("TK");
    expect(inisial("Hilmi Sobandi Hanif")).toBe("HH");
    expect(inisial("Dewan")).toBe("DE");
  });
});

describe("toRow", () => {
  it("treats a directive that never had a checkpoint as silent since it was requested", () => {
    const row = toRow(d({ requestedAt: "2026-07-14" }), NOW);
    expect(row.age).toBe(51);
    expect(row.updDays).toBeNull();
    expect(row.stale).toBe(true);
    expect(row.upd).toBe("belum ada kabar 51 hari");
    expect(row.checkpoint).toBe("Belum ada checkpoint.");
  });

  it("does not mark a fresh checkpoint as stale, however old the directive is", () => {
    const row = toRow(
      d({
        requestedAt: "2026-07-14",
        checkpoint: "Draf tier 1 selesai.",
        checkpointUpdatedAt: "2026-09-02T04:00:00Z",
      }),
      NOW,
    );
    expect(row.age).toBe(51);
    expect(row.late).toBe(true);
    expect(row.stale).toBe(false);
    expect(row.upd).toBe("diperbarui kemarin");
  });
});

describe("stakeholder layout", () => {
  it("shrinks the chip as the busiest directive grows", () => {
    expect(stakeholderTier(1).font).toBeGreaterThan(stakeholderTier(5).font);
    expect(stakeholderTier(5).font).toBeGreaterThan(stakeholderTier(20).font);
  });

  it("wraps to more lines as names accumulate", () => {
    const t = stakeholderTier(6);
    const one = barisChip(["Ustadz Abdul Muhsin"], t);
    const six = barisChip(
      [
        "Ustadz Abdul Muhsin",
        "Ustadz Amina Fitri Wijaya",
        "Ustadz Rahmat Hidayat",
        "Ketua Majelis",
        "Tim Program",
        "Tim Administrasi",
      ],
      t,
    );
    expect(one).toBe(1);
    expect(six).toBeGreaterThan(one);
  });

  it("gives a name wider than the column its own line rather than overflowing", () => {
    const t = stakeholderTier(2);
    const huge = "X".repeat(200);
    expect(barisChip([huge], t)).toBe(1);
    expect(barisChip([huge, huge], t)).toBe(2);
    expect(KOLOM_STAKEHOLDER).toBeGreaterThan(0);
  });

  it("treats an empty stakeholder list as one line, not zero", () => {
    // Zero would make the row shorter than its own padding and collapse it.
    expect(barisChip([], stakeholderTier(0))).toBe(1);
  });
});

describe("buildBoard", () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    d({
      id: `d${i}`,
      title: `Arahan ${i}`,
      requestedAt: "2026-09-01",
      checkpoint: "ada",
      checkpointUpdatedAt: "2026-09-03T00:00:00Z",
    }),
  );

  it("fits ten minimum-height rows on one page and emits no silence page", () => {
    // 10 x 152 = 1520, under the 1548 available — height decides, not a row count.
    const view = buildBoard(many, NOW);
    expect(view.pages).toHaveLength(1);
    expect(view.pages[0].mode).toBe("usia");
    expect(view.pages[0].rows).toHaveLength(10);
  });

  it("spills to a second page once the rows are tall enough to fill one", () => {
    const crowded = Array.from({ length: 10 }, (_, i) =>
      d({
        id: `c${i}`,
        title: `Arahan ${i}`,
        requestedAt: "2026-09-01",
        checkpoint: "ada",
        checkpointUpdatedAt: "2026-09-03T00:00:00Z",
        stakeholders: [
          "Ustadz Abdul Muhsin",
          "Ustadz Amina Fitri Wijaya",
          "Ustadz Rahmat Hidayat",
          "Ketua Majelis",
          "Tim Program",
        ],
      }),
    );
    const view = buildBoard(crowded, NOW);
    expect(view.pages.length).toBeGreaterThan(1);

    // Every page stays inside the height it was packed for, and nothing is lost.
    const total = view.pages
      .filter((p) => p.mode === "usia")
      .reduce((n, p) => n + p.rows.length, 0);
    expect(total).toBe(10);
    for (const p of view.pages) {
      const used = p.rows.reduce((h, r) => h + view.heights[r.id], 0);
      expect(used).toBeLessThanOrEqual(TINGGI_UNTUK_BARIS);
    }
  });

  it("never drops a stakeholder — the row grows instead", () => {
    const names = [
      "Ustadz Abdul Muhsin",
      "Ustadz Amina Fitri Wijaya",
      "Ustadz Rahmat Hidayat",
      "Ustadz Akmal",
      "Ketua Majelis",
      "Tim Program",
      "Tim Administrasi",
      "Tim Kaderisasi",
    ];
    const view = buildBoard([d({ id: "ramai", stakeholders: names })], NOW);
    const row = view.pages[0].rows[0];
    expect(row.stakeholders).toEqual(names);
    // Eight long names cannot sit on one line, so the row must be taller than the floor.
    expect(view.heights.ramai).toBeGreaterThan(BARIS_MIN_TINGGI);
  });

  it("adds a silence page ordered by how long each has gone unupdated", () => {
    const view = buildBoard(
      [
        d({ id: "baru-tapi-bisu", requestedAt: "2026-08-20" }), // 14 hari, tak pernah checkpoint
        d({
          id: "tua-tapi-hidup",
          requestedAt: "2026-06-01",
          checkpoint: "jalan",
          checkpointUpdatedAt: "2026-09-03T00:00:00Z",
        }),
      ],
      NOW,
    );
    // Halaman usia menaruh yang tua di atas; halaman senyap membalikkannya.
    expect(view.pages).toHaveLength(2);
    expect(view.pages[0].rows[0].id).toBe("tua-tapi-hidup");
    expect(view.pages[1].mode).toBe("senyap");
    expect(view.pages[1].rows[0].id).toBe("baru-tapi-bisu");
  });

  it("counts only directives past the 30-day mark as mengendap", () => {
    const view = buildBoard(
      [d({ id: "x", requestedAt: "2026-07-14" }), d({ id: "y", requestedAt: "2026-09-01" })],
      NOW,
    );
    expect(view.lateCount).toBe(1);
    expect(view.total).toBe(2);
  });

  it("still yields one empty page when there is nothing to show", () => {
    const view = buildBoard([], NOW);
    expect(view.pages).toHaveLength(1);
    expect(view.pages[0].rows).toHaveLength(0);
    expect(view.total).toBe(0);
  });

  it("formats the wall-clock date in Jakarta", () => {
    expect(buildBoard([], NOW).dateText).toBe("Kamis, 3 September 2026");
  });
});
