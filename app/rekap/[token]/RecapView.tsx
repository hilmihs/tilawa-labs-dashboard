"use client";

import { useMemo, useState, useTransition } from "react";
import {
  submitRecapConfirmations,
  type RecapEntry,
  type RecapSubmitResult,
} from "./actions";
import type {
  RecapConfirmStatus,
  RecapHalaqah,
  RecapMeeting,
  TeacherRecap,
} from "@/lib/confirmations/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";

/**
 * The teacher-facing recap form. Purely presentational with respect to trust:
 * `locked` and the labels are decided on the server and passed in, and every
 * answer is re-validated by the server action — the disabled states here are a
 * courtesy to the teacher, never the enforcement.
 */

/** Hand-written month names; the runtime may ship without full ICU data. */
const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
}

/** Same wording as app/confirm/[token]/ConfirmForm.tsx — teachers see both. */
const REASONS: { code: string; label: string }[] = [
  { code: "izin", label: "Izin" },
  { code: "sakit", label: "Sakit" },
  { code: "badal", label: "Digantikan badal" },
  { code: "libur", label: "Libur / tanggal merah" },
  { code: "kegiatan", label: "Ada kegiatan lain" },
  { code: "lainnya", label: "Lainnya" },
];

const TILAWAH_URL = "https://cms.tilawalabs.demo";

type Answer = {
  status: RecapConfirmStatus | "";
  reasonCode: string;
  reasonText: string;
  attest: boolean;
};

/**
 * Prefill from the confirmation the teacher already sent, so reopening the link
 * shows their own last words rather than an empty form. A taught meeting only
 * ever carries the dispute back: any other stored status there belongs to a
 * coordinator or predates the sync catching up, and offering it as an editable
 * answer would invite the teacher to overwrite it by accident.
 */
function initialAnswer(m: RecapMeeting): Answer {
  const status: RecapConfirmStatus | "" = m.done
    ? m.confStatus === "data_tidak_sesuai"
      ? "data_tidak_sesuai"
      : ""
    : (m.confStatus ?? "");
  return {
    status,
    reasonCode: m.reasonCode ?? "izin",
    reasonText: status ? (m.reasonText ?? "") : "",
    attest: status === "mengajar_kendala_sistem",
  };
}

export function RecapView({
  token,
  recap,
  locked,
  periodText,
  lockText,
}: {
  token: string;
  recap: TeacherRecap;
  locked: boolean;
  periodText: string;
  lockText: string;
}) {
  const meetings = useMemo(
    () => recap.halaqah.flatMap((h) => h.meetings),
    [recap.halaqah],
  );

  const [answers, setAnswers] = useState<Record<number, Answer>>(() =>
    Object.fromEntries(meetings.map((m) => [m.jadwalId, initialAnswer(m)])),
  );
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RecapSubmitResult | null>(null);

  // A saved confirmation replaces the button with a thank-you in the same spot.
  // Any later edit clears it, so a teacher who changes an answer gets the button
  // back instead of leaving the change unsent.
  const saved = result?.ok === true;

  function patch(jadwalId: number, next: Partial<Answer>) {
    setAnswers((prev) => ({ ...prev, [jadwalId]: { ...prev[jadwalId], ...next } }));
    setResult(null);
  }

  const answered = meetings.filter((m) => answers[m.jadwalId]?.status).length;
  // Gap meetings still without an answer — what the teacher would be leaving
  // open if they submit now. Taught meetings need no answer at all.
  const unanswered = meetings.filter(
    (m) => !m.done && !answers[m.jadwalId]?.status,
  ).length;
  // Mirrors the server gate: an un-attested "mengajar_kendala_sistem" would be
  // silently dropped, so block submit instead of pretending it was saved.
  const attestMissing = meetings.some(
    (m) =>
      answers[m.jadwalId]?.status === "mengajar_kendala_sistem" &&
      !answers[m.jadwalId]?.attest,
  );
  const hasNote = note.trim().length > 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return;
    const entries: RecapEntry[] = [];
    for (const m of meetings) {
      const a = answers[m.jadwalId];
      if (!a || !a.status) continue; // unanswered — leave whatever is stored alone
      entries.push({
        jadwalId: m.jadwalId,
        status: a.status,
        reasonCode: a.status === "tidak_mengajar" ? a.reasonCode : null,
        reasonText: a.reasonText.trim() ? a.reasonText.trim() : null,
        attest: a.attest,
      });
    }
    startTransition(async () => {
      setResult(await submitRecapConfirmations(token, entries, hasNote ? note : null));
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <header className="space-y-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Ustadz/ah <b>{recap.nama}</b> · periode <b>{periodText}</b>
        </p>
        {locked ? (
          <Alert variant="danger">
            Presensi sudah dikunci pada <b>{lockText}</b>. Halaman ini hanya bisa dibaca.
          </Alert>
        ) : (
          <Alert variant="warning">
            Mohon dikonfirmasi sebelum presensi dikunci pada <b>{lockText}</b>.
          </Alert>
        )}
      </header>

      <Card className="p-4 text-sm shadow-none">
        <div className="font-medium">Ringkasan</div>
        <ul className="mt-2 space-y-1 text-neutral-600 dark:text-neutral-400">
          <li>{recap.counts.halaqah} halaqah</li>
          <li>
            <b className="text-emerald-700 dark:text-emerald-300">{recap.counts.taught}</b> dari{" "}
            {recap.counts.meetings} pertemuan tercatat mengajar
          </li>
          <li>
            <b className="text-amber-700 dark:text-amber-300">{recap.counts.gaps}</b> belum ada
            catatan
          </li>
        </ul>
        {/* Said up front, not in the fine print: the recap is built only from
            what the website holds. Teachers who also record attendance in a
            spreadsheet or over WhatsApp would otherwise read "belum ada catatan"
            as an accusation about work they did record — somewhere else. */}
        <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
          Rekap ini disusun <b>hanya dari data di website</b>. Presensi yang dicatat lewat
          spreadsheet — baik yang dikirim via teks WhatsApp maupun yang diisi di spreadsheet —
          belum termasuk di sini.
        </p>
      </Card>


      {recap.halaqah.map((h) => (
        <HalaqahCard
          key={`${h.programSlug}-${h.halaqahId}`}
          halaqah={h}
          answers={answers}
          locked={locked}
          onPatch={patch}
        />
      ))}

      <Card className="space-y-3 p-4 text-sm shadow-none">
        <div className="font-medium">Ada yang belum sesuai?</div>
        <p className="text-neutral-600 dark:text-neutral-400">
          Pertemuan terluput?{" "}
          <a
            className="text-primary underline underline-offset-4"
            href={TILAWAH_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Silakan buka kelasnya lalu isi presensi di cms.tilawalabs.demo
          </a>
        </p>
        <p className="text-neutral-600 dark:text-neutral-400">
          Reschedule atau dibadal?{" "}
          <a
            className="text-primary underline underline-offset-4"
            href={TILAWAH_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ubah tanggal / ganti pengajarnya langsung di cms.tilawalabs.demo
          </a>
        </p>
        <label className="block">
          <span className="text-neutral-600 dark:text-neutral-400">
            Ada data lain yang tidak sesuai? Tulis di sini
          </span>
          <Textarea
            className="mt-1"
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setResult(null);
            }}
            disabled={locked}
            maxLength={4000}
            placeholder="Mis. halaqah ini bukan saya, atau ada pertemuan yang tanggalnya keliru"
          />
        </label>
      </Card>

      {!locked && saved && (
        <Card className="space-y-1 p-5 text-center shadow-none" role="status">
          <div className="text-base font-semibold text-emerald-700 dark:text-emerald-300">
            Konfirmasi tersimpan. Terima kasih, Ustadz/ah. 🙏
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Jazaakumullahu khairan. Bila ada yang ingin diubah, ubah jawaban di atas sebelum{" "}
            {lockText} — tombol kirim akan muncul lagi.
          </p>
        </Card>
      )}

      {!locked && !saved && (
        <div className="space-y-2">
          {result && !result.ok && <Alert variant="danger">{result.error}</Alert>}
          {/* Pressing this IS the statement, so it has to say what it states.
              The button used to be disabled whenever nothing had been answered —
              which locked out the most common case of all: a teacher whose month
              is already complete and who only needs to say "yes, this is right". */}
          <p className="text-center text-xs text-neutral-500">
            {unanswered > 0
              ? `${unanswered} pertemuan belum dijawab. Ustadz/ah tetap bisa mengirim sekarang dan melengkapinya sebelum ${lockText}.`
              : "Menekan tombol ini berarti Ustadz/ah menyatakan rekap di atas sudah sesuai."}
          </p>
          <Button
            type="submit"
            variant="success"
            size="lg"
            className="w-full"
            disabled={pending || attestMissing}
          >
            {pending
              ? "Menyimpan…"
              : answered === 0 && !hasNote
                ? "Data saya sudah tepat — kirim konfirmasi"
                : "Kirim konfirmasi"}
          </Button>
        </div>
      )}
      {!locked && !saved && attestMissing && (
        <p className="text-center text-xs text-amber-700 dark:text-amber-300">
          Mohon centang pernyataan pada pertemuan yang terkendala sistem.
        </p>
      )}
    </form>
  );
}

function HalaqahCard({
  halaqah,
  answers,
  locked,
  onPatch,
}: {
  halaqah: RecapHalaqah;
  answers: Record<number, Answer>;
  locked: boolean;
  onPatch: (jadwalId: number, next: Partial<Answer>) => void;
}) {
  return (
    <Card className="p-4 shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{halaqah.halaqahName}</span>
        {halaqah.asBadal && <Badge tone="indigo">badal</Badge>}
      </div>
      <div className="mt-0.5 text-xs text-neutral-500">
        {halaqah.programName} · {halaqah.taught} dari {halaqah.meetings.length} pertemuan
        tercatat mengajar
      </div>

      <div className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-900">
        {halaqah.meetings.map((m) => (
          <MeetingRow
            key={m.jadwalId}
            meeting={m}
            answer={answers[m.jadwalId]}
            locked={locked}
            onPatch={onPatch}
          />
        ))}
      </div>
    </Card>
  );
}

function MeetingRow({
  meeting,
  answer,
  locked,
  onPatch,
}: {
  meeting: RecapMeeting;
  answer: Answer;
  locked: boolean;
  onPatch: (jadwalId: number, next: Partial<Answer>) => void;
}) {
  const id = meeting.jadwalId;
  const disputing = answer.status === "data_tidak_sesuai";

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Pertemuan {meeting.order ?? "?"}</span>
        <span className="text-neutral-500">· {fmtDate(meeting.date)}</span>
        {meeting.done ? (
          <Badge tone="success">✓ tercatat mengajar</Badge>
        ) : (
          <Badge tone="warning">belum ada catatan</Badge>
        )}
      </div>

      {meeting.done ? (
        <div className="mt-2 text-sm">
          {!disputing ? (
            <button
              type="button"
              className="text-xs text-neutral-500 underline underline-offset-4 disabled:opacity-50"
              disabled={locked}
              onClick={() => onPatch(id, { status: "data_tidak_sesuai" })}
            >
              data ini tidak sesuai
            </button>
          ) : (
            <div className="space-y-2">
              <Textarea
                rows={2}
                value={answer.reasonText}
                onChange={(e) => onPatch(id, { reasonText: e.target.value })}
                disabled={locked}
                maxLength={500}
                placeholder="Apa yang tidak sesuai? Mis. saya tidak mengajar di pertemuan ini"
              />
              {!locked && (
                <button
                  type="button"
                  className="text-xs text-neutral-500 underline underline-offset-4"
                  onClick={() => onPatch(id, { status: "", reasonText: "" })}
                >
                  batal, datanya sudah benar
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`status_${id}`}
              value="tidak_mengajar"
              checked={answer.status === "tidak_mengajar"}
              disabled={locked}
              onChange={() => onPatch(id, { status: "tidak_mengajar" })}
            />
            Saya memang <b>tidak mengajar</b> di pertemuan ini
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`status_${id}`}
              value="mengajar_belum_input"
              checked={answer.status === "mengajar_belum_input"}
              disabled={locked}
              onChange={() => onPatch(id, { status: "mengajar_belum_input" })}
            />
            Saya <b>mengajar</b>, cuma belum input presensi
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`status_${id}`}
              value="mengajar_kendala_sistem"
              checked={answer.status === "mengajar_kendala_sistem"}
              disabled={locked}
              onChange={() => onPatch(id, { status: "mengajar_kendala_sistem" })}
            />
            Saya <b>mengajar</b>, tapi terkendala sistem (tak bisa lanjut 90 menit)
          </label>

          {answer.status === "tidak_mengajar" && (
            <div className="space-y-2 border-t border-neutral-100 pt-2 dark:border-neutral-900">
              {/* Asked BEFORE the reason dropdown, because "tidak mengajar" is the
                  answer that closes a meeting for good. A reschedule or a badal
                  keeps the session alive and moves it to whoever really taught
                  it; confirming "tidak mengajar" instead makes the month look
                  settled while the meeting quietly disappears from everyone's
                  record. */}
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <b>Sebelum lanjut:</b> apakah pertemuan ini sudah di-<i>reschedule</i> atau
                sudah diganti pengajarnya (<i>badal</i>) di{" "}
                <a
                  className="underline underline-offset-2"
                  href={TILAWAH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  cms.tilawalabs.demo
                </a>
                ?
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    <b>Belum</b> — mohon ubah tanggalnya atau ganti pengajarnya dulu di sana,
                    supaya pertemuan ini tidak lagi tercatat sebagai kosong.
                  </li>
                  <li>
                    <b>Sudah, atau memang tidak bisa diubah</b> — barulah pilih alasannya di
                    bawah ini.
                  </li>
                </ul>
              </div>
              <Select
                value={answer.reasonCode}
                disabled={locked}
                onChange={(e) => onPatch(id, { reasonCode: e.target.value })}
              >
                {REASONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <Input
                type="text"
                value={answer.reasonText}
                disabled={locked}
                maxLength={500}
                placeholder="Keterangan tambahan (opsional)"
                onChange={(e) => onPatch(id, { reasonText: e.target.value })}
              />
            </div>
          )}

          {answer.status === "mengajar_kendala_sistem" && (
            <div className="space-y-2 border-t border-neutral-100 pt-2 dark:border-neutral-900">
              <label className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={answer.attest}
                  disabled={locked}
                  onChange={(e) => onPatch(id, { attest: e.target.checked })}
                />
                <span>
                  Saya menyatakan <b>benar-benar mengajar</b> pertemuan ini, namun terkendala
                  sistem sehingga tidak terekam.
                </span>
              </label>
              <Input
                type="text"
                value={answer.reasonText}
                disabled={locked}
                maxLength={500}
                placeholder="Jelaskan kendala (opsional), mis. app error / tak bisa lanjut 90 menit"
                onChange={(e) => onPatch(id, { reasonText: e.target.value })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
