"use server";

import { revalidatePath } from "next/cache";
import { requireNewsUser } from "@/lib/news/auth";
import {
  deleteNews,
  submitNews,
  updateNews,
  type NewsInput,
  type NewsResult,
} from "@/lib/news/service";

/** Thin Server Action wrappers: authenticate, call the service, revalidate.
 * Nothing here touches /tv — a submitted kabar is not on air yet. */

export async function submitNewsAction(input: NewsInput): Promise<NewsResult<{ id: string }>> {
  const { actor, access } = await requireNewsUser();
  const res = await submitNews(actor, access, input);
  if (res.ok) revalidatePath("/berita");
  return res;
}

export async function updateNewsAction(id: string, input: NewsInput): Promise<NewsResult> {
  const { actor } = await requireNewsUser();
  const res = await updateNews(actor, id, input);
  if (res.ok) revalidatePath("/berita");
  return res;
}

export async function deleteNewsAction(id: string): Promise<NewsResult> {
  const { actor } = await requireNewsUser();
  const res = await deleteNews(actor, id);
  if (res.ok) revalidatePath("/berita");
  return res;
}
