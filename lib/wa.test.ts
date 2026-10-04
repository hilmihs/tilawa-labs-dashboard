import { describe, expect, it } from "vitest";
import { normalizePhone, phoneLokal } from "./wa";

describe("normalizePhone", () => {
  it("brings the usual shapes to 62…", () => {
    expect(normalizePhone("0812-3456-789")).toBe("628123456789");
    expect(normalizePhone("+62 812 3456 789")).toBe("628123456789");
    expect(normalizePhone("8123456789")).toBe("628123456789");
  });

  it("folds a doubled country code and a kept trunk zero", () => {
    expect(normalizePhone("626281278722822")).toBe("6281278722822");
    expect(normalizePhone("62626281278722822")).toBe("6281278722822");
    expect(normalizePhone("6208123456789")).toBe("628123456789");
    expect(phoneLokal("626281278722822")).toBe("081278722822");
  });

  it("leaves non-mobile 6262 prefixes alone and rejects junk", () => {
    expect(normalizePhone("6262012345678")).toBe("6262012345678");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("-")).toBeNull();
  });
});
