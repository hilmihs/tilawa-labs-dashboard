import { describe, expect, it } from "vitest";
import { KODE_ALFABET, buatKode, ekstrakKode, urlQr } from "./kode";

describe("buatKode", () => {
  it("10 huruf dari alfabet tanpa huruf ambigu, unik antar panggilan", () => {
    const set = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const k = buatKode();
      expect(k).toHaveLength(10);
      for (const ch of k) expect(KODE_ALFABET).toContain(ch);
      expect(/[0OI1L]/.test(k)).toBe(false);
      set.add(k);
    }
    expect(set.size).toBe(500);
  });
});

describe("ekstrakKode", () => {
  it("menerima URL penuh, path, dan kode mentah", () => {
    expect(ekstrakKode("https://dashboard.edu.example.org/h/K7X9M2QDAB")).toBe("K7X9M2QDAB");
    expect(ekstrakKode("/h/K7X9M2QDAB")).toBe("K7X9M2QDAB");
    expect(ekstrakKode("K7X9M2QDAB")).toBe("K7X9M2QDAB");
    expect(ekstrakKode("http://localhost:3000/h/k7x9m2qdab?x=1")).toBe("K7X9M2QDAB");
    expect(ekstrakKode("https://x/h/K7X9M2QDAB/")).toBe("K7X9M2QDAB");
  });
  it("menolak yang bukan kode kita", () => {
    expect(ekstrakKode("")).toBeNull();
    expect(ekstrakKode(null)).toBeNull();
    expect(ekstrakKode("https://example.com/tiket/abc")).toBeNull();
    expect(ekstrakKode("K7X9M2QDA")).toBeNull(); // 9 huruf
    expect(ekstrakKode("K7X9M2QDA0")).toBeNull(); // angka 0 tidak ada di alfabet
    expect(ekstrakKode("K7X9M2QDAI")).toBeNull(); // huruf I tidak ada
  });
});

describe("urlQr", () => {
  it("tanpa garis miring ganda", () => {
    expect(urlQr("https://x.org/", "ABCDEFGHJK")).toBe("https://x.org/h/ABCDEFGHJK");
    expect(urlQr("https://x.org", "ABCDEFGHJK")).toBe("https://x.org/h/ABCDEFGHJK");
  });
});
