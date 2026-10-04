import { describe, expect, it } from "vitest";
import { basi, sejak } from "./beranda";

const now = new Date("2026-09-23T07:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("sejak", () => {
  it("names the unit a reader expects", () => {
    expect(sejak(ago(20_000), now)).toBe("baru saja");
    expect(sejak(ago(5 * 60_000), now)).toBe("5 menit lalu");
    expect(sejak(ago(3 * 3_600_000), now)).toBe("3 jam lalu");
    expect(sejak(ago(50 * 3_600_000), now)).toBe("2 hari lalu");
  });

  it("never says a negative age when clocks drift", () => {
    expect(sejak(new Date(now.getTime() + 60_000), now)).toBe("baru saja");
  });
});

describe("basi", () => {
  it("flags a missing or >24h-old sync", () => {
    expect(basi(null, now)).toBe(true);
    expect(basi(ago(23 * 3_600_000), now)).toBe(false);
    expect(basi(ago(25 * 3_600_000), now)).toBe(true);
  });
});
