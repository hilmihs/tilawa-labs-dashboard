/**
 * WhatsApp click-to-chat helpers. Teacher phones synced from tilawah come in
 * mixed shapes — "816559252", "085373700618", "6281…" — so normalize to the
 * bare international form wa.me expects (digits only, 62-prefixed, no "+").
 */

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("62")) {
    // already international
  } else if (d.startsWith("0")) {
    d = "62" + d.slice(1);
  } else if (d.startsWith("8")) {
    // Indonesian mobile with the leading 0 stripped by the source system.
    d = "62" + d;
  } else {
    d = "62" + d;
  }
  // Tilawah stores ~1.4k numbers with the country code typed twice ("6262812…")
  // or kept with the trunk zero ("620812…"). Left as-is they pass the length
  // check yet never equal the same number written "0812…", so two accounts of
  // one person looked like two people. Only folded when a mobile "8" follows.
  const lipat = /^(?:62)+0*(8\d{7,})$/.exec(d);
  if (lipat) d = "62" + lipat[1];
  // Plausible Indonesian mobile length after 62 prefix (62 + 9..13 digits).
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

/** Build a wa.me click-to-chat URL, or null if the phone can't be normalized. */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

/** Nomor untuk dibaca manusia: "81195806827" / "6281…" → "081195806827". Null bila tak sah. */
export function phoneLokal(raw: string | null | undefined): string | null {
  const p = normalizePhone(raw);
  return p ? `0${p.slice(2)}` : null;
}
