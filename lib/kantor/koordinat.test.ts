import { describe, expect, it } from "vitest";
import { bacaKoordinat, tautanPendek } from "./koordinat";

describe("bacaKoordinat", () => {
  it("mengutamakan pin !3d/!4d di atas pusat tampilan @", () => {
    const url =
      "https://www.google.com/maps/place/Rumah+Belajar/@-6.2753297,106.822012,1140m/data=!3m2!1e3!4b1!4m6!3m5!1s0x2e69f32c4909343d:0x8c12e522768b9483!8m2!3d-6.275335!4d106.8245869!16s%2Fg%2F11lgk26p3g?entry=ttu";
    expect(bacaKoordinat(url)).toEqual({ lat: -6.275335, lng: 106.8245869 });
  });
  it("mengambil pin TERAKHIR bila tautan memuat tempat sebelumnya", () => {
    const url =
      "https://www.google.com/maps/place/Maktabah+Tilawa Labs/@-6.2753297,106.822012,1140m/data=!3m1!1e3!4m14!1m7!3m6!1s0x2e69f32c4909343d:0x8c12e522768b9483!2sRumah+Belajar!8m2!3d-6.275335!4d106.8245869!16s%2Fg%2F11lgk26p3g!3m5!1s0x2e69f3000fcd1fbb:0x725b2871037f6b68!8m2!3d-6.273427!4d106.8248666!16s%2Fg%2F11vypxmm5z?entry=ttu&g_ep=EgoyMDI2MDkyMi4wIKXMDSoASAFQAw%3D%3D";
    expect(bacaKoordinat(url)).toEqual({ lat: -6.273427, lng: 106.8248666 });
  });
  it("membaca q=, termasuk koma ter-encode", () => {
    expect(bacaKoordinat("https://www.google.com/maps?q=-6.27%2C106.84")).toEqual({ lat: -6.27, lng: 106.84 });
    expect(bacaKoordinat("https://maps.google.com/?q=-6.2,106.8&z=17")).toEqual({ lat: -6.2, lng: 106.8 });
  });
  it("membaca @lat,lng dan teks polos", () => {
    expect(bacaKoordinat("https://www.google.com/maps/@-6.2753,106.8245,17z")).toEqual({ lat: -6.2753, lng: 106.8245 });
    expect(bacaKoordinat(" -6.2700, 106.8400 ")).toEqual({ lat: -6.27, lng: 106.84 });
  });
  it("menolak di luar rentang dan teks tanpa angka", () => {
    expect(bacaKoordinat("95.1, 10.2")).toBeNull();
    expect(bacaKoordinat("https://maps.app.goo.gl/AbCdEf")).toBeNull();
  });
});

describe("tautanPendek", () => {
  it("mengenali tautan bagikan", () => {
    expect(tautanPendek("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(tautanPendek("https://www.google.com/maps/place/x")).toBe(false);
  });
});
