"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { suggestPelanggaran } from "@/lib/hkm/surat-format";
import type { SuratCandidate } from "@/lib/hkm/surat-queries";
import { todayWibISO } from "@/lib/pdf/date-id";
import { generateSurat } from "./actions";
import { LetterFields, type Recipient } from "./LetterFields";
import { PesertaPicker } from "./PesertaPicker";

type LetterKind = "penerimaan" | "peringatan-1" | "peringatan-2" | "peringatan-3";

const KIND_OPTIONS: { value: LetterKind; label: string }[] = [
  { value: "penerimaan", label: "Penerimaan" },
  { value: "peringatan-1", label: "Peringatan 1" },
  { value: "peringatan-2", label: "Peringatan 2" },
  { value: "peringatan-3", label: "Peringatan 3" },
];

function splitKind(kind: LetterKind): { letterType: "penerimaan" | "peringatan"; level?: 1 | 2 | 3 } {
  if (kind === "penerimaan") return { letterType: "penerimaan" };
  return { letterType: "peringatan", level: Number(kind.slice(-1)) as 1 | 2 | 3 };
}

const keyOf = (c: SuratCandidate) => `u${c.tilawahUserId}`;

function toRecipient(c: SuratCandidate): Recipient {
  return {
    key: keyOf(c),
    tilawahUserId: c.tilawahUserId,
    nama: c.nama,
    hari: c.hari ?? "",
    pukul: c.pukul ?? "",
    tempat: c.tempat ?? "",
    pengajar: c.pengajar ?? "",
    halaqah: c.halaqah ?? "",
    tanggalMulai: c.tanggalMulai ?? "",
    kelas: c.kelas ?? "",
    pelanggaran: suggestPelanggaran(c.alfa, c.telat),
    raw: {
      nama: c.namaRaw,
      hari: c.hari ?? "",
      pukul: c.pukul ?? "",
      tempat: c.tempat ?? "",
      pengajar: c.pengajarRaw ?? "",
      halaqah: c.halaqahNameRaw ?? "",
    },
  };
}

const EMPTY_RAW = { nama: "", hari: "", pukul: "", tempat: "", pengajar: "", halaqah: "" };

export function SuratGenerator({
  programSlug,
  candidates,
}: {
  programSlug: string;
  candidates: SuratCandidate[];
}) {
  const [kind, setKind] = useState<LetterKind>("penerimaan");
  const [tanggalSurat, setTanggalSurat] = useState(todayWibISO());
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; pages: number } | null>(null);

  const { letterType, level } = splitKind(kind);

  const reset = () => {
    setError(null);
    setDone(null);
  };

  const toggle = (c: SuratCandidate) => {
    reset();
    const key = keyOf(c);
    setRecipients((prev) =>
      prev.some((r) => r.key === key) ? prev.filter((r) => r.key !== key) : [...prev, toRecipient(c)],
    );
  };

  const toggleMany = (list: SuratCandidate[], select: boolean) => {
    reset();
    setRecipients((prev) => {
      const keys = new Set(list.map(keyOf));
      const kept = prev.filter((r) => !keys.has(r.key));
      return select ? [...kept, ...list.map(toRecipient)] : kept;
    });
  };

  const addManual = () => {
    reset();
    // A stable key that can't collide with a roster row (those are "u<id>").
    const key = `m${recipients.length}-${Math.random().toString(36).slice(2, 8)}`;
    setRecipients((prev) => [
      ...prev,
      {
        key,
        tilawahUserId: null,
        nama: "",
        hari: "",
        pukul: "",
        tempat: "",
        pengajar: "",
        halaqah: "",
        tanggalMulai: "",
        kelas: "",
        pelanggaran: [],
        raw: EMPTY_RAW,
      },
    ]);
  };

  const removeKey = (key: string) => {
    reset();
    setRecipients((prev) => prev.filter((r) => r.key !== key));
  };

  const patch = (key: string, values: Partial<Recipient>) => {
    reset();
    setRecipients((prev) => prev.map((r) => (r.key === key ? { ...r, ...values } : r)));
  };

  /** Copy the halaqah fields of the first recipient onto the rest — a batch is
   *  almost always one halaqah, and this saves retyping four fields per row. */
  const applyFirstToAll = () => {
    reset();
    setRecipients((prev) => {
      const [first] = prev;
      if (!first) return prev;
      return prev.map((r, i) =>
        i === 0
          ? r
          : {
              ...r,
              hari: first.hari,
              pukul: first.pukul,
              tempat: first.tempat,
              pengajar: first.pengajar,
              halaqah: first.halaqah,
              tanggalMulai: first.tanggalMulai,
            },
      );
    });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await generateSurat(programSlug, {
        letterType,
        level,
        tanggalSurat,
        recipients: recipients.map((r) => ({
          tilawahUserId: r.tilawahUserId,
          nama: r.nama,
          hari: r.hari,
          pukul: r.pukul,
          tempat: r.tempat,
          pengajar: r.pengajar,
          halaqah: r.halaqah,
          tanggalMulai: r.tanggalMulai || undefined,
          kelas: r.kelas,
          pelanggaran: r.pelanggaran,
        })),
      });
      if (res.ok) setDone({ url: res.downloadUrl, pages: res.pageCount });
      else setError(res.error);
    } catch {
      setError("Gagal membuat surat. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const labelFor = (key: string) => recipients.find((r) => r.key === key)?.nama || "(tanpa nama)";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <FormField label="Jenis surat">
          <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={(v) => { reset(); setKind(v); }} />
        </FormField>
        <FormField label="Tanggal surat" hint="Dipakai untuk baris “Jakarta, …”">
          <Input
            type="date"
            value={tanggalSurat}
            onChange={(e) => { reset(); setTanggalSurat(e.target.value); }}
            className="w-44"
          />
        </FormField>
      </div>

      <PesertaPicker
        candidates={candidates}
        selectedKeys={recipients.map((r) => r.key)}
        labelFor={labelFor}
        onToggle={toggle}
        onToggleMany={toggleMany}
        onAddManual={addManual}
        onRemoveKey={removeKey}
        keyOf={keyOf}
      />

      {recipients.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-muted">
              Isi surat ({recipients.length} penerima)
            </h2>
            {letterType === "penerimaan" && recipients.length > 1 && (
              <Button type="button" variant="secondary" onClick={applyFirstToAll}>
                Samakan isi halaqah dengan yang pertama
              </Button>
            )}
          </div>
          {recipients.map((r) => (
            <LetterFields
              key={r.key}
              recipient={r}
              letterType={letterType}
              onChange={patch}
              onRemove={removeKey}
            />
          ))}
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}
      {done && (
        <Alert variant="success">
          <div className="flex flex-wrap items-center gap-3">
            <span>Surat siap — {done.pages} halaman.</span>
            <a
              href={done.url}
              className="font-medium underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              Unduh PDF
            </a>
          </div>
        </Alert>
      )}

      <Button type="button" onClick={submit} disabled={busy || recipients.length === 0}>
        {busy ? "Membuat…" : `Buat surat (${recipients.length})`}
      </Button>
    </div>
  );
}
