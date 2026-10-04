import { describe, expect, it } from "vitest";
import { guruUtama } from "./tilawah-guru";

const u = (id: number, gender: number, type = "guru", status = 1) => ({ id, gender, pivot: { type, status } });

describe("guruUtama", () => {
  it("single guru pivot, murid ignored", () => {
    expect(guruUtama([u(9, 2, "murid"), u(1, 1)], [])?.id).toBe(1);
  });

  it("HITS 042 Akhwat Juni: the guru holding the pertemuan beats the stray first pivot", () => {
    const users = [u(22, 1), u(45, 2)];
    const jadwals = Array.from({ length: 27 }, () => ({ guru_id: 45 }));
    expect(guruUtama(users, jadwals, "HITS 042 AKHWAT JUNI")?.id).toBe(45);
  });

  it("badal minority does not flip the main teacher", () => {
    const jadwals = [{ guru_id: 5 }, { guru_id: 5 }, { guru_id: 5 }, { guru_id: 7 }];
    expect(guruUtama([u(7, 1), u(5, 1)], jadwals)?.id).toBe(5);
  });

  it("no pertemuan: gender from the class name decides", () => {
    expect(guruUtama([u(18, 2), u(27, 1)], [], "HITS 003 IKHWAN JUNI")?.id).toBe(27);
    expect(guruUtama([u(22, 1), u(45, 2)], null, "HITS 042 AKHWAT JUNI")?.id).toBe(45);
  });

  it("no signal at all: first pivot, as before", () => {
    expect(guruUtama([u(3, 1), u(4, 1)], [], "Tahsin Pagi")?.id).toBe(3);
  });

  it("deactivated pivot is skipped", () => {
    expect(guruUtama([u(22, 1, "guru", 0), u(45, 2)], [{ guru_id: 22 }])?.id).toBe(45);
  });

  it("no guru", () => {
    expect(guruUtama([u(9, 2, "murid")], [])).toBeNull();
  });
});
