"use server";

import { revalidatePath } from "next/cache";
import { requireNewsUser } from "@/lib/news/auth";
import {
  addQuote,
  deleteQuote,
  moveNews,
  reviewNews,
  setPinned,
  setQuoteActive,
  type NewsResult,
  type QuoteInput,
} from "@/lib/news/service";
import { bustTvSnapshot } from "@/lib/tv/snapshot";

/**
 * Curation writes change what is on the wall, so each one drops both caches in
 * front of /tv: the ISR page and the 120s snapshot memo. Without the second one
 * an approved kabar would still wait up to two minutes.
 */
function refreshBoard() {
  bustTvSnapshot();
  revalidatePath("/tv");
  revalidatePath("/berita/kurasi");
  revalidatePath("/berita");
}

export async function reviewNewsAction(
  id: string,
  decision: "approve" | "reject" | "unpublish",
  note?: string,
): Promise<NewsResult> {
  const { actor, access } = await requireNewsUser({ curator: true });
  const res = await reviewNews(actor, access, id, decision, note);
  if (res.ok) refreshBoard();
  return res;
}

export async function setPinnedAction(id: string, pinned: boolean): Promise<NewsResult> {
  const { actor, access } = await requireNewsUser({ curator: true });
  const res = await setPinned(actor, access, id, pinned);
  if (res.ok) refreshBoard();
  return res;
}

export async function moveNewsAction(id: string, direction: "up" | "down"): Promise<NewsResult> {
  const { actor, access } = await requireNewsUser({ curator: true });
  const res = await moveNews(actor, access, id, direction);
  if (res.ok) refreshBoard();
  return res;
}

export async function addQuoteAction(input: QuoteInput): Promise<NewsResult> {
  const { actor, access } = await requireNewsUser({ curator: true });
  const res = await addQuote(actor, access, input);
  if (res.ok) refreshBoard();
  return res;
}

export async function setQuoteActiveAction(id: string, active: boolean): Promise<NewsResult> {
  const { actor, access } = await requireNewsUser({ curator: true });
  const res = await setQuoteActive(actor, access, id, active);
  if (res.ok) refreshBoard();
  return res;
}

export async function deleteQuoteAction(id: string): Promise<NewsResult> {
  const { actor, access } = await requireNewsUser({ curator: true });
  const res = await deleteQuote(actor, access, id);
  if (res.ok) refreshBoard();
  return res;
}
