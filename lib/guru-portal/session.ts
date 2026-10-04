import { cookies } from "next/headers";
import {
  GURU_COOKIE_NAME,
  verifyGuruToken,
  type GuruTokenPayload,
} from "@/lib/auth/guru-token";

/** Read + verify the current teacher-portal session from the cookie, or null. */
export async function getGuruSession(): Promise<GuruTokenPayload | null> {
  const store = await cookies();
  const token = store.get(GURU_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyGuruToken(token);
}
