"use client";

/** Tombol cetak / simpan PDF — disembunyikan saat dicetak. */
export function TombolCetak() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-9 rounded-[9px] bg-primary px-4 text-14 font-medium text-primary-foreground print:hidden"
    >
      Cetak / simpan PDF
    </button>
  );
}
