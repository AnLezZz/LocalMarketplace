// Pure NZ geography transform: raw LINZ / Stats NZ records in, normalised place rows and a validation report out.
// No I/O, no Convex imports: scripts/geo-import.ts runs it under Node and convex/geoImport.test.ts runs it under vitest.
// Only erasable TypeScript syntax here (Node strips types itself).

export type Kind = "region" | "territorial_authority" | "subdivision" | "suburb" | "locality" | "other";
export type Layer = "suburbs_localities" | "regional_council" | "territorial_authority" | "ta_subdivision";

export type PlaceRow = {
  source: "linz" | "statsnz";
  layer: Layer;
  sourceId: string;
  kind: Kind;
  selectable: boolean; // may a provider or customer pick it? false for bays, lakes, "Area Outside ..." etc.
  name: string; // original spelling, macrons kept
  nameAscii: string;
  key: string; // case/macron/punctuation-insensitive match key
  altNames: string[];
  altKeys: string[];
  majorName?: string; // LINZ "major_name": the city, town or major locality it belongs to
  majorNameType?: string;
  lat?: number;
  lng?: number;
  population?: number;
  regionSourceIds: string[]; // Stats NZ regional council codes (from the centroid)
  taSourceIds: string[]; // Stats NZ territorial authority codes (from LINZ's own TA text; for a subdivision, the council its code belongs to)
  subdivisionSourceIds: string[]; // Stats NZ TA subdivision codes (from the centroid, only when consistent with the council text)
  flags: string[];
};

export type LinzRecord = {
  id: number;
  name: string;
  additional_name: string | null;
  type: string;
  major_name: string | null;
  major_name_type: string | null;
  territorial_authority: string | null;
  population_estimate: number | null;
  name_ascii: string | null;
  additional_name_ascii: string | null;
  centroid: { x: number; y: number } | null;
};

export type Ring = number[][];
export type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
// parentCode: the council area a subdivision belongs to, when its own code does not say (Auckland local boards all belong to council 076).
export type Boundary = { code: string; name: string; nameAscii: string; geometry: Geometry; parentCode?: string };

/** Case, macron, punctuation and spacing do not matter; a leading "Mt" equals "Mount". Same rule as suburbKey in convex/model/locations.ts. */
export function placeKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().replace(/^mt /, "mount ");
}

const splitList = (s: string | null | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function ringContains(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(rings: Ring[], x: number, y: number): boolean {
  if (!ringContains(rings[0], x, y)) return false;
  for (let i = 1; i < rings.length; i++) if (ringContains(rings[i], x, y)) return false; // inside a hole
  return true;
}

export function geometryContains(g: Geometry, x: number, y: number): boolean {
  return g.type === "Polygon" ? polygonContains(g.coordinates, x, y) : g.coordinates.some((p) => polygonContains(p, x, y));
}

/** Boundaries with a bounding box each, so a point test only walks the few rings that could hold it. */
export function boundaryIndex(boundaries: Boundary[]) {
  const boxed = boundaries.map((b) => {
    const polys = b.geometry.type === "Polygon" ? [b.geometry.coordinates] : b.geometry.coordinates;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polys) for (const [x, y] of p[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return { b, minX, minY, maxX, maxY };
  });
  return (x: number, y: number): Boundary | undefined =>
    boxed.find((e) => x >= e.minX && x <= e.maxX && y >= e.minY && y <= e.maxY && geometryContains(e.b.geometry, x, y))?.b;
}

const outside = (name: string) => /^area outside/i.test(name);

export function boundaryRows(boundaries: Boundary[], layer: "regional_council" | "territorial_authority" | "ta_subdivision"): PlaceRow[] {
  return boundaries.map((b) => ({
    source: "statsnz", layer, sourceId: b.code,
    kind: layer === "regional_council" ? "region" : layer === "territorial_authority" ? "territorial_authority" : "subdivision",
    selectable: !outside(b.name),
    name: b.name, nameAscii: b.nameAscii || b.name, key: placeKey(b.name), altNames: [], altKeys: [],
    regionSourceIds: [], taSourceIds: layer === "ta_subdivision" ? [b.parentCode ?? b.code.slice(0, 3)] : [], subdivisionSourceIds: [],
    flags: outside(b.name) ? ["not_a_council_area"] : [],
  }));
}

const linzKind = (type: string): Kind => (type === "Suburb" ? "suburb" : type === "Locality" ? "locality" : "other");

export function linzRows(records: LinzRecord[], regions: Boundary[], tas: Boundary[], subdivisions: Boundary[] = []) {
  const regionAt = boundaryIndex(regions);
  const subAt = boundaryIndex(subdivisions);
  const parentOf = (b: Boundary) => b.parentCode ?? b.code.slice(0, 3);
  const councilsWithDistricts = new Set(subdivisions.map(parentOf)); // only these must have a subdivision; other suburbs sit straight under their council
  const taAt = boundaryIndex(tas);
  const taByKey = new Map(tas.map((t) => [placeKey(t.name), t]));
  const rows: PlaceRow[] = [];
  for (const r of records) {
    const kind = linzKind(r.type);
    const alt = splitList(r.additional_name);
    const flags: string[] = [];
    const taNames = splitList(r.territorial_authority);
    const taSourceIds: string[] = [];
    for (const n of taNames) {
      const t = taByKey.get(placeKey(n));
      if (t) taSourceIds.push(t.code);
      else flags.push(`ta_unmatched:${n}`);
    }
    if (taNames.length > 1) flags.push("multi_ta");
    if (taNames.length === 0 && kind !== "other") flags.push("no_ta");
    let regionSourceIds: string[] = [];
    let subdivisionSourceIds: string[] = [];
    if (r.centroid) {
      const reg = regionAt(r.centroid.x, r.centroid.y);
      if (reg) regionSourceIds = [reg.code];
      else flags.push("region_unresolved");
      const ta = taAt(r.centroid.x, r.centroid.y);
      // The centroid is a check on LINZ's own TA text, never a replacement for it.
      if (ta && taSourceIds.length > 0 && !taSourceIds.includes(ta.code) && !outside(ta.name)) flags.push(`ta_centroid_mismatch:${ta.name}`);
      if (kind !== "other" && taSourceIds.some((t) => councilsWithDistricts.has(t))) {
        const sd = subAt(r.centroid.x, r.centroid.y);
        // Only link a subdivision that belongs to one of the councils LINZ names; otherwise flag it rather than guess.
        if (sd && !outside(sd.name) && taSourceIds.includes(parentOf(sd))) subdivisionSourceIds = [sd.code];
        else flags.push(sd && !outside(sd.name) ? `subdivision_ta_mismatch:${sd.name}` : "no_subdivision");
      }
    } else flags.push("no_centroid");
    rows.push({
      source: "linz", layer: "suburbs_localities", sourceId: String(r.id), kind, selectable: kind === "suburb" || kind === "locality",
      name: r.name, nameAscii: r.name_ascii || r.name, key: placeKey(r.name),
      altNames: alt, altKeys: alt.map(placeKey),
      ...(r.major_name ? { majorName: r.major_name } : {}), ...(r.major_name_type && r.major_name_type !== "None" ? { majorNameType: r.major_name_type } : {}),
      ...(r.centroid ? { lat: round(r.centroid.y), lng: round(r.centroid.x) } : {}),
      ...(r.population_estimate != null ? { population: r.population_estimate } : {}),
      regionSourceIds, taSourceIds, subdivisionSourceIds, flags,
    });
  }
  // The same name can legitimately exist more than once (several "Newtown"s). Flag every member so search shows disambiguating context.
  const byKey = new Map<string, PlaceRow[]>();
  for (const p of rows) if (p.selectable) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
  for (const group of byKey.values()) if (group.length > 1) for (const p of group) p.flags.push("duplicate_name");
  return rows;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

export type SourceInfo = { source: string; layer: string; title: string; edition: string; modified: string; licence: string; attribution: string; url: string; fetchedAt: string; count: number };

/** Validation report: what came in, what was flagged, and what the "Auckland" candidates are, so the boundary can be chosen deliberately. */
export function report(places: PlaceRow[], sources: SourceInfo[]) {
  const countBy = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
  const selectable = places.filter((p) => p.selectable && (p.kind === "suburb" || p.kind === "locality"));
  const flagCounts = countBy(selectable.flatMap((p) => p.flags.map((f) => f.split(":")[0])), (f) => f);
  const regionName = new Map(places.filter((p) => p.kind === "region").map((p) => [p.sourceId, p.name]));
  const taName = new Map(places.filter((p) => p.kind === "territorial_authority").map((p) => [p.sourceId, p.name]));
  const ids = places.map((p) => `${p.layer}:${p.sourceId}`);
  const aucklandTa = selectable.filter((p) => p.taSourceIds.some((c) => taName.get(c) === "Auckland"));
  const aucklandRegion = selectable.filter((p) => p.regionSourceIds.some((c) => regionName.get(c) === "Auckland"));
  const aucklandMajor = selectable.filter((p) => p.majorName === "Auckland");
  const names = (xs: PlaceRow[]) => new Set(xs.map((p) => p.sourceId));
  const only = (a: PlaceRow[], b: PlaceRow[]) => { const nb = names(b); return a.filter((p) => !nb.has(p.sourceId)).map((p) => p.name).sort(); };
  return {
    sources,
    totals: { places: places.length, byKind: countBy(places, (p) => p.kind), selectableLocalities: selectable.length, duplicateSourceIds: ids.length - new Set(ids).size },
    flags: flagCounts,
    macrons: { namesWithMacrons: places.filter((p) => p.name !== p.nameAscii).length, sample: places.filter((p) => p.name !== p.nameAscii).slice(0, 5).map((p) => `${p.name} / ${p.nameAscii}`) },
    flaggedSample: selectable.filter((p) => p.flags.some((f) => !f.startsWith("duplicate_name") && f !== "multi_ta")).slice(0, 20).map((p) => `${p.name} [${p.flags.join(", ")}]`),
    aucklandCandidates: {
      territorialAuthority076: aucklandTa.length,
      regionalCouncil02: aucklandRegion.length,
      linzMajorNameAuckland: aucklandMajor.length,
      inTaNotRegion: only(aucklandTa, aucklandRegion).slice(0, 30),
      inRegionNotTa: only(aucklandRegion, aucklandTa).slice(0, 30),
    },
  };
}

/** A council area belongs to the regions its own suburbs sit in (derived from the source data, never assumed). Mutates and returns `places`. */
export function linkCouncilsToRegions(places: PlaceRow[]): PlaceRow[] {
  const councils = new Map(places.filter((p) => p.kind === "territorial_authority").map((p) => [p.sourceId, p]));
  const subs = new Map(places.filter((p) => p.kind === "subdivision").map((p) => [p.sourceId, p]));
  for (const p of places) {
    if (p.layer !== "suburbs_localities" || !p.selectable) continue;
    for (const t of p.taSourceIds) {
      const c = councils.get(t);
      if (c) for (const r of p.regionSourceIds) if (!c.regionSourceIds.includes(r)) c.regionSourceIds.push(r);
    }
    for (const sd of p.subdivisionSourceIds) {
      const c = subs.get(sd);
      if (c) for (const r of p.regionSourceIds) if (!c.regionSourceIds.includes(r)) c.regionSourceIds.push(r);
    }
  }
  // A council that is split into subdivisions is browsed through them (Auckland > its local boards), not as one entry.
  for (const sd of subs.values()) { const c = councils.get(sd.taSourceIds[0]); if (c && !c.flags.includes("has_districts")) c.flags.push("has_districts"); }
  for (const c of councils.values()) if (c.selectable && c.regionSourceIds.length === 0) c.flags.push("no_region");
  return places;
}
