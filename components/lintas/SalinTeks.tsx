"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Tautan kecil "Salin …" yang menyalin teks ke papan klip dan berkata "Tersalin". */
export function SalinTeks({ teks, label = "Salin", className }: { teks: string; label?: string; className?: string }) {
  const [tersalin, setTersalin] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(teks).then(() => {
          setTersalin(true);
          setTimeout(() => setTersalin(false), 1500);
        })
      }
      className={cn("text-12 text-primary hover:underline", className)}
    >
      {tersalin ? "Tersalin" : label}
    </button>
  );
}
