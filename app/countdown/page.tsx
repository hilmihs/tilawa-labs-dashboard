import { cookies } from "next/headers";
import { isPageConfigured, unlockCookieName, verifyUnlockToken } from "@/lib/auth/page-password";
import type { PaksaState } from "@/lib/countdown/board";
import { COUNTDOWN_SLUG } from "./constants";
import { PasswordGate } from "./PasswordGate";
import { Board } from "./Board";

// Baca cookie unlock dan jam server per permintaan — tidak ada yang boleh
// diprerender di sini.
export const dynamic = "force-dynamic";

const PAKSA: PaksaState[] = ["auto", "normal", "urgent", "berlangsung", "hari-h"];

export default async function CountdownPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(unlockCookieName(COUNTDOWN_SLUG))?.value;
  const unlocked = token ? await verifyUnlockToken(token, COUNTDOWN_SLUG) : false;

  if (!unlocked) {
    // Bedakan "password salah" dari "password belum diatur" — tanpa itu deploy
    // baru terlihat seperti halaman rusak.
    const configured = await isPageConfigured(COUNTDOWN_SLUG);
    return <PasswordGate configured={configured} />;
  }

  // ?state=urgent dst. memaksa tampilan hero untuk memeriksa desainnya tanpa
  // menunggu tanggalnya tiba. Nilai asing diabaikan, bukan dilempar.
  const { state } = await searchParams;
  const paksa = PAKSA.includes(state as PaksaState) ? (state as PaksaState) : "auto";

  return <Board paksa={paksa} />;
}
