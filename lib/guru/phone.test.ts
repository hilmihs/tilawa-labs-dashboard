import { describe, expect, it } from "vitest";
import { pickPhone } from "./phone";

// Only pickPhone is covered here: getTeacherPhoneMap needs a database, and this
// suite is the pure-function tier (see vitest.config.ts).

describe("pickPhone precedence", () => {
  it("prefers a manual override over the synced number", () => {
    // "Amina Kamila Permata" is in GURU_PHONE_OVERRIDES because tilawah has her wrong.
    expect(pickPhone("Amina Kamila Permata", "081111111111")).toBe("6281351407327");
  });

  it("applies the override even when nothing was synced", () => {
    expect(pickPhone("Ruqayyah Abdul Firdaus", null)).toBe("6281562538979");
  });

  it("matches the override on a padded name", () => {
    expect(pickPhone("  Amina Kamila Permata  ", null)).toBe("6281351407327");
  });

  it("falls back to the synced number for teachers with no override", () => {
    expect(pickPhone("Guru Tanpa Override", "081234567890")).toBe("6281234567890");
  });
});

describe("pickPhone normalization", () => {
  it("converts the local 0-prefixed form", () => {
    expect(pickPhone("Guru A", "081234567890")).toBe("6281234567890");
  });

  it("restores the leading digit dropped by the source system", () => {
    expect(pickPhone("Guru A", "81234567890")).toBe("6281234567890");
  });

  it("leaves an already-international number alone", () => {
    expect(pickPhone("Guru A", "6281234567890")).toBe("6281234567890");
  });

  it("strips separators before normalizing", () => {
    expect(pickPhone("Guru A", "+62 812-3456-7890")).toBe("6281234567890");
  });
});

describe("pickPhone rejects what it cannot trust", () => {
  it("returns null for a too-short number", () => {
    expect(pickPhone("Guru A", "0812")).toBeNull();
  });

  it("returns null for a too-long number", () => {
    expect(pickPhone("Guru A", "081234567890123456")).toBeNull();
  });

  it("returns null for null, empty and non-numeric input", () => {
    expect(pickPhone("Guru A", null)).toBeNull();
    expect(pickPhone("Guru A", "")).toBeNull();
    expect(pickPhone("Guru A", "-")).toBeNull();
    expect(pickPhone(null, null)).toBeNull();
  });
});

describe("regression: badal phones swapped between teachers", () => {
  // The bug this module exists for: lib/reports/queries.ts read the phone from
  // halaqah_sync (the halaqah's MAIN pengajar), so meetings attributed to a
  // badal carried someone else's number. In hits-regular, Amina Nur Cahyani
  // and Sakinah Rahma Hidayat were literally swapped —81913830975 vs 085373700618.
  // pickPhone must return exactly the number it was handed for that identity
  // and never reach for the other teacher's.
  it("keeps Aisyah's guru_sync number and never yields Rika's", () => {
    const phone = pickPhone("Amina Nur Cahyani", "81913830975");
    expect(phone).toBe("6281913830975");
    expect(phone).not.toBe("6285373700618");
  });

  it("keeps Rika's own number too", () => {
    expect(pickPhone("Sakinah Rahma Hidayat", "085373700618")).toBe("6285373700618");
  });
});

describe("placeholder numbers from the CMS", () => {
  // tilawah user ids 2816-2819 were created with sequential dummy numbers
  // (1000000121…124). They pass a pure length check — 621000000124 is twelve
  // digits — so the blast would have "delivered" four recaps into the void.
  it.each(["1000000121", "1000000122", "1000000123", "1000000124"])(
    "rejects the sequential placeholder %s",
    (placeholder) => {
      expect(pickPhone("Ruqayyah Nabila Anggraini", placeholder)).toBeNull();
    },
  );

  it("rejects any number whose subscriber part does not start with 8", () => {
    expect(pickPhone("Siapa Saja", "621234567890")).toBeNull();
    expect(pickPhone("Siapa Saja", "0211234567")).toBeNull();
  });

  it("still accepts the shapes tilawah really stores", () => {
    expect(pickPhone("A", "816559252")).toBe("62816559252");
    expect(pickPhone("B", "085373700618")).toBe("6285373700618");
    expect(pickPhone("C", "6281202865464")).toBe("6281202865464");
  });
});
