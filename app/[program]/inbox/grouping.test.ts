import { describe, expect, it } from "vitest";
import type { PresensiGapHalaqah } from "@/lib/insights/queries";
import { buildGapViews, buildHalaqahView, groupTitle, URGENT_UNTOUCHED_DAYS } from "./grouping";

const TODAY = new Date("2026-09-05T00:00:00Z");
const NO_KRITIS = new Set<string>();

function halaqah(over: Partial<PresensiGapHalaqah>): PresensiGapHalaqah {
  return {
    halaqahId: 1,
    halaqahName: "Halaqah A",
    pengajar: "Ust. Fulan",
    guruPhone: "628",
    emptyMeetings: [],
    partialMeetings: [],
    ...over,
  };
}

/** The bug this module exists for: one peserta, 21 meetings, 21 red rows. */
describe("buildHalaqahView", () => {
  it("collapses one recurring peserta into a single group", () => {
    const partialMeetings = Array.from({ length: 21 }, (_, i) => ({
      order: i + 1,
      date: `2026-0${i < 9 ? 6 : 9}-${String((i % 28) + 1).padStart(2, "0")}`,
      missingStudents: ["Robianur"],
    }));
    const view = buildHalaqahView(halaqah({ partialMeetings }), {
      today: TODAY,
      isKritis: false,
    });

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].students).toEqual(["Robianur"]);
    expect(view.groups[0].meetings).toHaveLength(21);
    expect(view.groups[0].severity).toBe("routine");
    expect(groupTitle(view.groups[0])).toContain("21 pertemuan tanpa presensi");
    expect(view.summary.affectedStudents).toBe(1);
  });

  it("merges peserta that share the same set of pertemuan", () => {
    const view = buildHalaqahView(
      halaqah({
        partialMeetings: [
          { order: 3, date: "2026-09-03", missingStudents: ["Ali", "Budi", "Citra", "Dina"] },
        ],
      }),
      { today: TODAY, isKritis: false },
    );
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].students).toEqual(["Ali", "Budi", "Citra", "Dina"]);
    expect(groupTitle(view.groups[0])).toContain("4 peserta");
  });

  it("keeps untouched pertemuan as their own group and reds them only when stale", () => {
    const fresh = buildHalaqahView(halaqah({ emptyMeetings: [{ order: 9, date: "2026-09-02" }] }), {
      today: TODAY,
      isKritis: false,
    });
    expect(fresh.groups[0].kind).toBe("untouched");
    expect(fresh.groups[0].severity).toBe("attention");

    const stale = buildHalaqahView(halaqah({ emptyMeetings: [{ order: 2, date: "2026-07-01" }] }), {
      today: TODAY,
      isKritis: false,
    });
    expect(stale.groups[0].ageDays).toBeGreaterThan(URGENT_UNTOUCHED_DAYS);
    expect(stale.groups[0].severity).toBe("urgent");
    expect(stale.severity).toBe("urgent");
  });

  it("never reds a peserta group, even in a kritis halaqah", () => {
    const view = buildHalaqahView(
      halaqah({
        partialMeetings: [{ order: 1, date: "2026-06-22", missingStudents: ["Robianur"] }],
      }),
      { today: TODAY, isKritis: true },
    );
    expect(view.groups[0].severity).toBe("attention");
  });
});

describe("buildGapViews", () => {
  it("ranks by severity then impact, not by meeting order", () => {
    const views = buildGapViews(
      [
        halaqah({
          halaqahId: 1,
          halaqahName: "Kecil",
          partialMeetings: [{ order: 1, date: "2026-09-01", missingStudents: ["A"] }],
        }),
        halaqah({
          halaqahId: 2,
          halaqahName: "Besar",
          partialMeetings: Array.from({ length: 5 }, (_, i) => ({
            order: i + 1,
            date: `2026-08-0${i + 1}`,
            missingStudents: ["A", "B", "C"],
          })),
        }),
        halaqah({
          halaqahId: 3,
          halaqahName: "Terbengkalai",
          emptyMeetings: [{ order: 1, date: "2026-06-22" }],
        }),
      ],
      { today: TODAY, kritisHalaqah: NO_KRITIS },
    );

    expect(views.map((v) => v.halaqah.halaqahName)).toEqual(["Terbengkalai", "Besar", "Kecil"]);
    expect(views[0].severity).toBe("urgent");
    expect(views.filter((v) => v.severity === "urgent")).toHaveLength(1);
  });
});
