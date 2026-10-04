import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { signRecapToken, verifyRecapToken, type RecapTokenPayload } from "./recap-token";

// The module reads AUTH_SECRET when a function is called, not when it is
// imported, so setting it here is enough — no module mocking needed.
const SECRET = "test-secret-for-recap-token-unit-tests";

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});

const key = () => new TextEncoder().encode(SECRET);

const VALID: RecapTokenPayload = {
  gid: 4211,
  nama: "Ust. Fulan bin Fulan",
  start: "2026-07-16",
  end: "2026-08-15",
};

/** Sign an arbitrary claim set with the real secret, to isolate claim checks. */
async function signRaw(claims: Record<string, unknown>, exp = "30d"): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key());
}

describe("signRecapToken / verifyRecapToken", () => {
  it("round-trips the payload", async () => {
    const token = await signRecapToken(VALID);
    expect(await verifyRecapToken(token)).toEqual(VALID);
  });

  it("does not leak extra claims back into the payload", async () => {
    const token = await signRecapToken(VALID);
    const back = await verifyRecapToken(token);
    expect(back && Object.keys(back).sort()).toEqual(["end", "gid", "nama", "start"]);
  });
});

describe("verifyRecapToken rejects", () => {
  it("garbage that is not a JWT", async () => {
    expect(await verifyRecapToken("not-a-token")).toBeNull();
    expect(await verifyRecapToken("")).toBeNull();
  });

  it("a token signed with a different secret", async () => {
    const forged = await new SignJWT({ ...VALID, scope: "recapconfirm" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode("some-other-secret"));
    expect(await verifyRecapToken(forged)).toBeNull();
  });

  it("a token whose scope is gapconfirm (the per-halaqah confirm link)", async () => {
    // Same secret, same shape — only the scope differs. This is the replay the
    // separate scope exists to stop.
    const token = await signRaw({ ...VALID, scope: "gapconfirm" });
    expect(await verifyRecapToken(token)).toBeNull();
  });

  it("a token with no scope at all", async () => {
    expect(await verifyRecapToken(await signRaw({ ...VALID }))).toBeNull();
  });

  it("an expired token", async () => {
    const token = await signRaw({ ...VALID, scope: "recapconfirm" }, "-1h");
    expect(await verifyRecapToken(token)).toBeNull();
  });

  it("gid that is not a number", async () => {
    const token = await signRaw({ ...VALID, gid: "4211", scope: "recapconfirm" });
    expect(await verifyRecapToken(token)).toBeNull();
  });

  it("a missing gid", async () => {
    const token = await signRaw({ nama: VALID.nama, start: VALID.start, end: VALID.end, scope: "recapconfirm" });
    expect(await verifyRecapToken(token)).toBeNull();
  });

  it("nama that is not a string", async () => {
    const token = await signRaw({ ...VALID, nama: 42, scope: "recapconfirm" });
    expect(await verifyRecapToken(token)).toBeNull();
  });

  it("dates that are not YYYY-MM-DD", async () => {
    const bad = ["2026-7-16", "16-07-2026", "2026-07-16T00:00:00Z", ""];
    for (const start of bad) {
      expect(await verifyRecapToken(await signRaw({ ...VALID, start, scope: "recapconfirm" }))).toBeNull();
    }
    for (const end of bad) {
      expect(await verifyRecapToken(await signRaw({ ...VALID, end, scope: "recapconfirm" }))).toBeNull();
    }
  });

  it("a date that is not a string", async () => {
    const token = await signRaw({ ...VALID, end: 20260815, scope: "recapconfirm" });
    expect(await verifyRecapToken(token)).toBeNull();
  });
});
