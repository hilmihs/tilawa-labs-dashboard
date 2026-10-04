"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveProgramAccess } from "@/lib/programs/resolve";
import { logReminderClick } from "@/lib/reminders/log";

/**
 * Record that a coordinator opened the WhatsApp reminder for a halaqah.
 *
 * The send itself happens in WhatsApp, outside anything this app can observe,
 * so the click is the only evidence we will ever have. It is worth recording
 * because the Action Items list is worked by more than one person: without a
 * "last reminded" stamp the same teacher gets chased twice in an evening while
 * another is skipped.
 *
 * Access is re-checked here rather than trusted from the page — a server action
 * is a public endpoint, and the program slug arrives from the client.
 */
export async function recordReminderClick(
  programSlug: string,
  halaqahId: number,
  pengajar: string | null,
  phone: string | null,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const program = await resolveProgramAccess(user, programSlug);
  if (!program) return;

  await logReminderClick(
    { programId: program.id, halaqahId, pengajar, phone },
    user.email,
  );
  revalidatePath(`/${programSlug}/inbox`);
}
