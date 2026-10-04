"use server";

import { revalidatePath } from "next/cache";
import { requireProgramAccess } from "@/lib/programs/resolve";
import {
  addPertemuanFor,
  updatePertemuanFor,
  deletePertemuanFor,
  type ManageResult,
  type AddPertemuanInput,
  type EditPertemuanInput,
} from "@/lib/sync/manage";

export async function addPertemuan(program: string, inp: AddPertemuanInput): Promise<ManageResult> {
  await requireProgramAccess(program);
  const r = await addPertemuanFor(program, inp);
  if (r.ok) revalidatePath(`/${program}/halaqah/${inp.tilawahHalaqahId}`);
  return r;
}

export async function editPertemuan(program: string, inp: EditPertemuanInput): Promise<ManageResult> {
  await requireProgramAccess(program);
  const r = await updatePertemuanFor(program, inp);
  if (r.ok) revalidatePath(`/${program}/halaqah/${inp.tilawahHalaqahId}`);
  return r;
}

export async function deletePertemuan(
  program: string,
  halaqahId: number,
  jadwalId: number,
): Promise<ManageResult> {
  await requireProgramAccess(program);
  const r = await deletePertemuanFor(program, jadwalId);
  if (r.ok) revalidatePath(`/${program}/halaqah/${halaqahId}`);
  return r;
}
