"use client";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export type Recipient = {
  key: string;
  tilawahUserId: number | null;
  nama: string;
  // penerimaan
  hari: string;
  pukul: string;
  tempat: string;
  pengajar: string;
  halaqah: string;
  tanggalMulai: string; // ISO
  // peringatan
  kelas: string;
  pelanggaran: string[];
  /** Untouched upstream values, shown as hints so an edit is visible as an edit. */
  raw: { nama: string; hari: string; pukul: string; tempat: string; pengajar: string; halaqah: string };
};

export type LetterFieldsProps = {
  recipient: Recipient;
  letterType: "penerimaan" | "peringatan";
  onChange: (key: string, patch: Partial<Recipient>) => void;
  onRemove: (key: string) => void;
};

const hint = (raw: string) => (raw ? `Data sistem: ${raw}` : "Tidak ada di data sistem");

export function LetterFields({ recipient: r, letterType, onChange, onRemove }: LetterFieldsProps) {
  const set = (patch: Partial<Recipient>) => onChange(r.key, patch);

  const setPelanggaran = (idx: number, value: string) => {
    const next = [...r.pelanggaran];
    next[idx] = value;
    set({ pelanggaran: next });
  };

  return (
    <div className="rounded-lg border border-neutral-200 p-4 space-y-3 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <FormField label="Nama peserta" hint={hint(r.raw.nama)}>
            <Input value={r.nama} onChange={(e) => set({ nama: e.target.value })} />
          </FormField>
        </div>
        <Button type="button" variant="ghost" onClick={() => onRemove(r.key)} className="mt-6">
          Hapus
        </Button>
      </div>

      {letterType === "penerimaan" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Hari" hint={hint(r.raw.hari)}>
            <Input value={r.hari} onChange={(e) => set({ hari: e.target.value })} />
          </FormField>
          <FormField label="Pukul" hint={hint(r.raw.pukul)}>
            <Input value={r.pukul} onChange={(e) => set({ pukul: e.target.value })} />
          </FormField>
          <FormField label="Tempat" hint={hint(r.raw.tempat)}>
            <Input value={r.tempat} onChange={(e) => set({ tempat: e.target.value })} />
          </FormField>
          <FormField label="Nama pengajar" hint={hint(r.raw.pengajar)}>
            <Input value={r.pengajar} onChange={(e) => set({ pengajar: e.target.value })} />
          </FormField>
          <FormField label="Halaqah" hint={hint(r.raw.halaqah)}>
            <Input value={r.halaqah} onChange={(e) => set({ halaqah: e.target.value })} />
          </FormField>
          <FormField label="Tanggal mulai belajar" hint="Pertemuan pertama halaqah">
            <Input
              type="date"
              value={r.tanggalMulai}
              onChange={(e) => set({ tanggalMulai: e.target.value })}
            />
          </FormField>
        </div>
      ) : (
        <div className="space-y-3">
          <FormField label="Kelas" hint={hint(r.raw.halaqah)}>
            <Input value={r.kelas} onChange={(e) => set({ kelas: e.target.value })} />
          </FormField>
          <FormField
            label="Butir pelanggaran"
            hint="Terisi otomatis dari catatan presensi — betulkan kalau tidak sesuai."
          >
            <div className="space-y-2">
              {r.pelanggaran.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={item}
                    onChange={(e) => setPelanggaran(idx, e.target.value)}
                    placeholder="mis. Empat kali (4×) alpa."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => set({ pelanggaran: r.pelanggaran.filter((_, i) => i !== idx) })}
                    aria-label="Hapus butir"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => set({ pelanggaran: [...r.pelanggaran, ""] })}
              >
                + Tambah butir
              </Button>
            </div>
          </FormField>
        </div>
      )}
    </div>
  );
}
