"use client";

import { useRef, useState } from "react";
import {
  createLateIncident,
  searchStudents,
  type StudentSearchResult,
} from "./actions";
import { KATEGORI_UDZUR, PERIZINAN_OPTIONS, type Perizinan } from "@/lib/kategori-udzur";
import { Input, Select, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const LAINNYA = "Lainnya" as const;

function todayISO() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

export function LateIncidentForm({ programSlug }: { programSlug: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [selected, setSelected] = useState<StudentSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [arrivalTime, setArrivalTime] = useState("");
  const [perizinan, setPerizinan] = useState<Perizinan>("Izin");
  const [alasanChoice, setAlasanChoice] = useState<string>("");
  const [alasanFreetext, setAlasanFreetext] = useState("");
  const [keterangan, setKeterangan] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchStudents(programSlug, value);
      setResults(r);
      setSearching(false);
    }, 250);
  }

  function resetForm() {
    setQuery("");
    setSelected(null);
    setResults([]);
    setOccurredAt(todayISO());
    setArrivalTime("");
    setPerizinan("Izin");
    setAlasanChoice("");
    setAlasanFreetext("");
    setKeterangan("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (!selected) {
      setFeedback({ type: "error", message: "Pilih santri dulu dari hasil pencarian." });
      return;
    }
    if (!arrivalTime) {
      setFeedback({ type: "error", message: "Jam kedatangan wajib diisi." });
      return;
    }
    const alasan = alasanChoice === LAINNYA ? alasanFreetext.trim() : alasanChoice;
    if (!alasan) {
      setFeedback({ type: "error", message: "Alasan wajib dipilih/diisi." });
      return;
    }

    setSubmitting(true);
    const result = await createLateIncident(programSlug, {
      studentId: selected.id,
      marhalah: selected.marhalah ?? "-",
      occurredAt,
      arrivalTime,
      perizinan,
      alasan,
      keterangan: keterangan || undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    const waNote =
      perizinan === "Tidak Izin"
        ? result.waSent
          ? " WA ke the operations coordinator terkirim."
          : ` WA ke the operations coordinator belum terkirim (${result.waReason ?? "kirimi.id belum dikonfigurasi"}) — insiden tetap tersimpan.`
        : "";
    const tilawahNote = result.tilawahSynced
      ? " Presensi tilawah ikut ter-update."
      : ` Presensi tilawah belum ter-update (${result.tilawahReason ?? "belum tersinkron"}) — insiden tetap tersimpan.`;
    setFeedback({ type: "success", message: `Insiden tersimpan.${waNote}${tilawahNote}` });
    resetForm();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <Label htmlFor="student-search" className="mb-1">
          Cari santri
        </Label>
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
            <div>
              <div className="font-medium">{selected.full_name}</div>
              <div className="text-sm text-ink-muted">
                {selected.marhalah ?? "-"} · Ortu: {selected.father_name ?? selected.mother_name ?? "-"}
              </div>
            </div>
            <Button type="button" variant="link" size="sm" onClick={() => setSelected(null)}>
              Ganti
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              id="student-search"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Ketik nama santri..."
            />
            {searching && <div className="text-xs text-ink-faint mt-1">Mencari...</div>}
            {query.trim().length >= 2 && results.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-300 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                {results.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(s);
                        setResults([]);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <div className="font-medium">{s.full_name}</div>
                      <div className="text-xs text-ink-muted">{s.marhalah ?? "-"}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Tanggal" htmlFor="occurred-at">
          <Input
            id="occurred-at"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Jam kedatangan" htmlFor="arrival-time">
          <Input
            id="arrival-time"
            type="time"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            required
          />
        </FormField>
      </div>

      <FormField label="Perizinan" htmlFor="perizinan">
        <Select
          id="perizinan"
          value={perizinan}
          onChange={(e) => setPerizinan(e.target.value as Perizinan)}
        >
          {PERIZINAN_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
        {perizinan === "Tidak Izin" && (
          <Alert variant="warning">
            Akan otomatis menandai insiden ini butuh Surat Peringatan &amp; mengirim WA ke the operations coordinator.
          </Alert>
        )}
      </FormField>

      <FormField label="Alasan" htmlFor="alasan">
        <Select
          id="alasan"
          value={alasanChoice}
          onChange={(e) => setAlasanChoice(e.target.value)}
          required
        >
          <option value="" disabled>
            Pilih alasan...
          </option>
          {Object.entries(KATEGORI_UDZUR).map(([group, options]) => (
            <optgroup key={group} label={group}>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={LAINNYA}>Lainnya (isi manual)</option>
        </Select>
        {alasanChoice === LAINNYA && (
          <Input
            type="text"
            value={alasanFreetext}
            onChange={(e) => setAlasanFreetext(e.target.value)}
            placeholder="Tulis alasan..."
            required
          />
        )}
      </FormField>

      <FormField label="Keterangan (opsional)" htmlFor="keterangan">
        <Textarea
          id="keterangan"
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          rows={2}
        />
      </FormField>

      {feedback && (
        <Alert variant={feedback.type === "success" ? "success" : "danger"}>
          {feedback.message}
        </Alert>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Menyimpan..." : "Simpan insiden"}
      </Button>
    </form>
  );
}
