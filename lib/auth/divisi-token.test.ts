import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  isTokenVersiCurrent,
  signDivisiToken,
  verifyDivisiToken,
  type DivisiTokenPayload,
} from "./divisi-token";

// AUTH_SECRET dibaca saat fungsi dipanggil, bukan saat modul dimuat.
const SECRET = "test-secret-for-divisi-token-unit-tests";
beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});
const key = () => new TextEncoder().encode(SECRET);

const VALID: DivisiTokenPayload = {
  did: "6d1f3a0e-1b2c-4d5e-8f90-abcdef123456",
  slug: "kajian-lipia-3",
  v: 1,
};

async function signRaw(claims: Record<string, unknown>, exp = "90d"): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key());
}

describe("signDivisiToken / verifyDivisiToken", () => {
  it("round-trips the payload", async () => {
    const token = await signDivisiToken(VALID);
    expect(await verifyDivisiToken(token)).toEqual(VALID);
  });

  it("returns only did, slug, v", async () => {
    const back = await verifyDivisiToken(await signDivisiToken(VALID));
    expect(back && Object.keys(back).sort()).toEqual(["did", "slug", "v"]);
  });
});

describe("verifyDivisiToken rejects", () => {
  it("garbage", async () => {
    expect(await verifyDivisiToken("bukan-token")).toBeNull();
    expect(await verifyDivisiToken("")).toBeNull();
  });

  it("a different secret", async () => {
    const forged = await new SignJWT({ ...VALID, scope: "divisi" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(new TextEncoder().encode("secret-lain"));
    expect(await verifyDivisiToken(forged)).toBeNull();
  });

  // Uji #3 spec: token recap/gap pengajar tidak boleh diputar ke papan divisi.
  it("scope recapconfirm / gapconfirm with the same secret", async () => {
    expect(await verifyDivisiToken(await signRaw({ ...VALID, scope: "recapconfirm" }))).toBeNull();
    expect(await verifyDivisiToken(await signRaw({ ...VALID, scope: "gapconfirm" }))).toBeNull();
    expect(await verifyDivisiToken(await signRaw({ ...VALID }))).toBeNull();
  });

  it("an expired token", async () => {
    expect(await verifyDivisiToken(await signRaw({ ...VALID, scope: "divisi" }, "-1s"))).toBeNull();
  });

  it("malformed claims", async () => {
    expect(await verifyDivisiToken(await signRaw({ ...VALID, did: 12, scope: "divisi" }))).toBeNull();
    expect(await verifyDivisiToken(await signRaw({ ...VALID, v: "1", scope: "divisi" }))).toBeNull();
    expect(await verifyDivisiToken(await signRaw({ did: VALID.did, v: 1, scope: "divisi" }))).toBeNull();
  });
});

// Uji #4 spec: token_versi naik → seluruh token lama divisi itu mati.
describe("isTokenVersiCurrent", () => {
  it("accepts a token signed at the divisi's current version", () => {
    expect(isTokenVersiCurrent({ ...VALID, v: 3 }, 3)).toBe(true);
  });
  it("rejects a token signed before the version was bumped", () => {
    expect(isTokenVersiCurrent({ ...VALID, v: 1 }, 2)).toBe(false);
  });
  it("rejects a token claiming a version the divisi has not reached", () => {
    expect(isTokenVersiCurrent({ ...VALID, v: 5 }, 2)).toBe(false);
  });
});
