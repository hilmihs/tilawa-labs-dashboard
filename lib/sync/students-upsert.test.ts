import { describe, expect, it } from "vitest";
import {
  ABSENSI_COLUMNS,
  ENROLLMENT_COLUMNS,
  studentsSyncUpdateSet,
} from "@/lib/sync/students-upsert";

/** A row shaped like the one tilawah-sync builds, every column populated. */
const values = {
  halaqahUserId: 4466,
  name: "NAUFAL NABILA",
  userCode: "HKM-0042",
  phone: "0812",
  halaqahId: 216,
  pengajar: "Amina Anisa Hidayat",
  pertemuan: "3/24",
  kehadiranPercentage: "12.5",
  gender: 1,
  enrollmentStatusCode: 0,
  enrollmentStatus: "Pulang kampung, tidak aktif kegiatan lagi",
  enrollmentCreatedAt: new Date("2026-07-01T00:00:00Z"),
  enrollmentUpdatedAt: new Date("2026-07-31T00:00:00Z"),
  raw: {},
  syncedAt: new Date("2026-08-25T00:00:00Z"),
};

describe("studentsSyncUpdateSet", () => {
  it("writes every column when both sources are present", () => {
    const set = studentsSyncUpdateSet(values, { hasEnrollment: true, hasAbsensi: true });
    expect(Object.keys(set).sort()).toEqual(Object.keys(values).sort());
  });

  /**
   * The 25 Agu 2026 regression: between full sweeps the sync skips unchanged
   * halaqah, so it holds the absensi report but no enrollment. Writing the
   * enrollment columns anyway nulled halaqah_user_id for 272 murid and emptied
   * 17 rosters, because the detail page filters `halaqah_user_id is not null`.
   */
  it("leaves the enrollment columns untouched when the halaqah detail was skipped", () => {
    const set = studentsSyncUpdateSet(values, { hasEnrollment: false, hasAbsensi: true });
    for (const c of ENROLLMENT_COLUMNS) expect(set).not.toHaveProperty(c);
    expect(set.halaqahUserId).toBeUndefined();
    expect(set.enrollmentStatusCode).toBeUndefined();
    // ...while the report half still lands.
    for (const c of ABSENSI_COLUMNS) expect(set).toHaveProperty(c);
  });

  it("leaves the report columns untouched for a peserta absent from the absensi report", () => {
    const set = studentsSyncUpdateSet(values, { hasEnrollment: true, hasAbsensi: false });
    for (const c of ABSENSI_COLUMNS) expect(set).not.toHaveProperty(c);
    expect(set.phone).toBeUndefined();
    for (const c of ENROLLMENT_COLUMNS) expect(set).toHaveProperty(c);
  });

  it("still refreshes the shared columns when neither source is available", () => {
    const set = studentsSyncUpdateSet(values, { hasEnrollment: false, hasAbsensi: false });
    expect(Object.keys(set).sort()).toEqual(
      ["halaqahId", "name", "pengajar", "raw", "syncedAt"].sort(),
    );
  });

  it("omits columns the caller never built rather than writing undefined", () => {
    const partial = { name: "X", syncedAt: values.syncedAt };
    const set = studentsSyncUpdateSet(partial, { hasEnrollment: true, hasAbsensi: true });
    expect(Object.keys(set).sort()).toEqual(["name", "syncedAt"]);
  });
});
