import { getTvSnapshot } from "@/lib/tv/snapshot";
import { Board } from "./Board";

/**
 * Public read-only board (/tv). Rendered on demand (not prerendered at build —
 * the build image has no database), but the snapshot's in-process TTL memo
 * (lib/tv/snapshot.ts, 120s) collapses every screen in the building onto one
 * shared DB flight, so twenty TVs still cost the database ~as much as one.
 *
 * force-dynamic: `getTvSnapshot()` hits Postgres, which isn't reachable during
 * `next build` in the Docker image. Prerendering it there fails the build; the
 * TTL memo already provides the cross-request DB sharing ISR would have.
 *
 * Nothing rendered may identify a person: aggregate counts, program names and
 * curated kabar only.
 */
export const dynamic = "force-dynamic";

export default async function TvPage({
  searchParams,
}: {
  searchParams: Promise<{ hari?: string }>;
}) {
  // ?hari=kemarin — used by the /arahan rotation, which airs in the daytime.
  const kemarin = (await searchParams).hari === "kemarin";
  const snapshot = await getTvSnapshot({ kemarin });
  return <Board snapshot={snapshot} kemarin={kemarin} />;
}
