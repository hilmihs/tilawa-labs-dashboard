import type { SessionPayload } from "@/lib/auth/session";

/**
 * Organizational structure of the dashboard, defined in code (the org rarely
 * changes; no DB table needed). Program leaves reference an existing program
 * `slug` and link to /[slug]/dashboard. Feature leaves (`href`) link to a
 * module that is not a program dashboard (e.g. /acara). Other nodes are either
 * grouping units (with children) or `comingSoon` placeholders (no data yet).
 */
export type OrgNode = {
  id: string; // path segment, e.g. "div-program", "hits"
  label: string;
  programSlug?: string; // set on a program leaf → links to its dashboard
  href?: string; // set on a feature leaf → links to that module
  hint?: string; // one-line "what is this" on a feature/placeholder card
  comingSoon?: boolean; // placeholder node without a dashboard yet
  children?: OrgNode[];
};

// Top tier = the org units (siblings): Mabni, Div. Program, and the placeholders.
export const ORG_ROOT: OrgNode = {
  id: "",
  label: "Struktur Organisasi",
  children: [
    { id: "mabni", label: "Boarding Programme", programSlug: "mabni" },
    {
      id: "div-program",
      label: "Div. Program",
      children: [
        {
          id: "hits",
          label: "HITS",
          children: [
            // Family entry — a batch switcher on the dashboard reaches the other
            // batches (hits-regular-jan/-apr).
            { id: "hits-regular", label: "Recitation Foundation — Evening", programSlug: "hits-regular" },
            {
              // The HITS programs run with a partner (a masjid, a foundation, a
              // community) rather than by Tilawa Labs alone. Same report layout as
              // Recitation Foundation — Evening, different owner — hence their own unit.
              id: "kolaborasi-tilawah",
              label: "Program Kolaborasi Tilawah",
              children: [
                { id: "hits-safar", label: "Recitation Foundation — Weekend", programSlug: "hits-safar" },
                { id: "hits-ortu-abk", label: "Recitation for Parents", programSlug: "hits-ortu-abk" },
                { id: "hits-nurul-iman", label: "Community Recitation Circle", programSlug: "hits-nurul-iman" },
                { id: "tahsin-keluarga", label: "Family Tahsin", programSlug: "tahsin-keluarga" },
                {
                  id: "tahfizh-nurul-iman",
                  label: "Halaqah Tahfizhul Qur'an (Community Mosque)",
                  programSlug: "tahfizh-nurul-iman",
                },
                {
                  id: "tafm-laz",
                  label: "Tahsin Al-Fatihah Mustahik (LAZ)",
                  programSlug: "tafm-laz",
                },
              ],
            },
          ],
        },
        { id: "dpq", label: "Preparatory Qur'an Class", programSlug: "dpq" },
        { id: "al-arabiyyah", label: "Arabic for Youth", programSlug: "al-arabiyyah" },
        // Maahir is where the HITS teachers themselves study (163 of 183 are
        // enrolled), so it sits beside HITS/Preparatory Qur'an Class/MLP rather than under HITS.
        { id: "maahir", label: "Teacher Development", programSlug: "maahir" },
        {
          // MLP = the in-house learning platform; HKM and RBI are the programs
          // that run on it.
          id: "mlp",
          label: "Learning Platform",
          children: [
            // HKM has two tabs on its dashboard: Setoran Tilawah (berkah) +
            // Presensi (the paired hkm-presensi tilawah program) — so no
            // separate nav entry.
            { id: "hkm", label: "Household Recitation", programSlug: "hkm" },
            { id: "rbi", label: "Open Study Room", programSlug: "rbi" },
          ],
        },
      ],
    },
    {
      // Menggantikan "Div. Pra + Post Program" (divisi itu tidak ada). Isinya
      // dua fitur dari hearing tim kaderisasi 7 Sep 2026 — kebutuhan lengkap di
      // docs/KADERISASI-HEARING-2026-09-07.md.
      id: "div-kaderisasi-amaliyyah",
      label: "Div. Kaderisasi & Amaliyyah",
      children: [
        {
          // Fitur 2 — sudah berjalan sebagai modul Acara (presensi QR kajian).
          id: "monitoring-kegiatan",
          label: "Monitoring Kegiatan & Kajian",
          href: "/acara",
          hint: "Presensi QR per kajian: hadir, ikhwan/akhwat, program, terlambat.",
        },
        {
          // Fitur 1 — "CV" per orang. Tahap 1 (identitas, mengajar, kegiatan) jalan;
          // penilaian disiplin & capaian menyusul setelah indikator KPI turun.
          id: "tracking-individu",
          label: "Tracking Perkembangan Individu (CV)",
          href: "/orang",
          hint: "Satu baris per orang: akun lintas program, halaqah yang diampu, kajian yang diikuti.",
        },
        {
          // Batch 1 rekomendasi 28 Sep: nilai panitia per acara → CV.
          id: "penilaian",
          label: "Penilaian Panitia",
          href: "/penilaian",
          hint: "Nilai B/C/D/E per panitia setelah acara; masuk ke CV individu.",
        },
      ],
    },
    { id: "masjid-al-kautsar", label: "Partner Mosque", comingSoon: true },
    {
      id: "operating-office",
      label: "Operating Office",
      href: "/operating-office",
    },
  ],
};

/** Walk a path of node ids from the root; returns the node or null. */
export function findNodeByPath(root: OrgNode, path: string[]): OrgNode | null {
  let node: OrgNode = root;
  for (const seg of path) {
    const next = node.children?.find((c) => c.id === seg);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** All program slugs reachable under a node (leaves in its subtree). */
export function programSlugsUnder(node: OrgNode): string[] {
  const out: string[] = [];
  const walk = (n: OrgNode) => {
    if (n.programSlug) out.push(n.programSlug);
    n.children?.forEach(walk);
  };
  walk(node);
  return out;
}

/**
 * Prune the tree to what a user may see. Super sees everything (coming-soon
 * included). A coordinator sees a node only if it (or a descendant) is a program
 * they were granted; coming-soon/empty branches are dropped for them.
 */
export function accessibleTree(user: SessionPayload, root: OrgNode = ORG_ROOT): OrgNode | null {
  if (user.role === "super_coordinator") return root;
  const granted = new Set(user.programs);

  const prune = (node: OrgNode): OrgNode | null => {
    if (node.programSlug) return granted.has(node.programSlug) ? node : null;
    // Feature leaves are not program grants; a coordinator reaches those modules
    // from the rail instead, so they don't pull a whole division into view.
    if (node.href) return null;
    const children = (node.children ?? [])
      .map(prune)
      .filter((c): c is OrgNode => c !== null);
    if (children.length === 0) return null; // no accessible descendants
    return { ...node, children };
  };

  return prune(root);
}
