import { describe, expect, it } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import { ORG_ROOT, accessibleTree, findNodeByPath, programSlugsUnder } from "./structure";

const as = (role: SessionPayload["role"], programs: string[] = []) =>
  ({ role, programs }) as unknown as SessionPayload;

describe("Div. Kaderisasi & Amaliyyah", () => {
  it("menggantikan Div. Pra + Post Program", () => {
    const ids = ORG_ROOT.children!.map((c) => c.id);
    expect(ids).toContain("div-kaderisasi-amaliyyah");
    expect(ids).not.toContain("div-pra-post");
  });

  it("berisi fitur monitoring (ke /acara) dan tracking individu (CV)", () => {
    const div = findNodeByPath(ORG_ROOT, ["div-kaderisasi-amaliyyah"])!;
    expect(findNodeByPath(div, ["monitoring-kegiatan"])?.href).toBe("/acara");
    expect(findNodeByPath(div, ["tracking-individu"])?.href).toBe("/orang");
    expect(programSlugsUnder(div)).toEqual([]);
  });

  it("tampil untuk super, tidak menyeret divisi ke pohon koordinator", () => {
    const superIds = accessibleTree(as("super_coordinator"))!.children!.map((c) => c.id);
    expect(superIds).toContain("div-kaderisasi-amaliyyah");
    const koordIds = accessibleTree(as("coordinator", ["dpq"]))!.children!.map((c) => c.id);
    expect(koordIds).toEqual(["div-program"]);
  });
});
