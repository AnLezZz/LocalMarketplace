/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { newT } from "../test-utils/harness";
import { boundaryRows, linkCouncilsToRegions, linzRows, placeKey, report, type Boundary, type LinzRecord, type PlaceRow } from "../scripts/geo/transform.mts";

// FIXTURES, NOT REAL DATA: tiny invented squares in the shape of the LINZ / Stats NZ feeds, to exercise the logic.
const square = (x0: number, y0: number, x1: number, y1: number): Boundary["geometry"] => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const regions: Boundary[] = [
  { code: "R1", name: "Testland", nameAscii: "Testland", geometry: square(0, 0, 10, 10) },
  { code: "R2", name: "Otherland", nameAscii: "Otherland", geometry: square(10, 0, 20, 10) },
  { code: "R99", name: "Area Outside Region", nameAscii: "Area Outside Region", geometry: square(20, 0, 30, 10) },
];
const tas: Boundary[] = [
  { code: "T01", name: "Māori Bay District", nameAscii: "Maori Bay District", geometry: square(0, 0, 5, 10) },
  { code: "T02", name: "Hill City", nameAscii: "Hill City", geometry: square(5, 0, 20, 10) },
];
const rec = (o: Partial<LinzRecord> & { id: number; name: string }): LinzRecord => ({
  additional_name: null, type: "Suburb", major_name: null, major_name_type: null, territorial_authority: "Hill City", population_estimate: null, name_ascii: o.name, additional_name_ascii: null, centroid: { x: 7, y: 5 }, ...o,
});
const linz: LinzRecord[] = [
  rec({ id: 1, name: "Ponsonby", major_name: "Testville", major_name_type: "City" }),
  rec({ id: 2, name: "Ōtāhuhu", name_ascii: "Otahuhu", territorial_authority: "Māori Bay District", centroid: { x: 2, y: 5 } }),
  rec({ id: 3, name: "Newtown" }),
  rec({ id: 4, name: "Newtown", centroid: { x: 15, y: 5 } }), // same name, elsewhere
  rec({ id: 5, name: "Straddle", territorial_authority: "Māori Bay District, Hill City", centroid: { x: 7, y: 5 } }),
  rec({ id: 6, name: "Nowhere Bay", type: "Coastal Bay" }),
  rec({ id: 7, name: "Ghostville", territorial_authority: "Nonexistent District" }),
  rec({ id: 8, name: "Wrongplace", territorial_authority: "Māori Bay District", centroid: { x: 15, y: 5 } }), // LINZ says T1, centroid is in T2
  rec({ id: 9, name: "Offshore", centroid: { x: 50, y: 50 } }),
];

describe("transform", () => {
  test("keys ignore case, macrons and Mt/Mount", () => {
    expect(placeKey("Ōtāhuhu")).toBe(placeKey("OTAHUHU"));
    expect(placeKey("Mt Eden")).toBe(placeKey("Mount Eden"));
  });

  const places = linkCouncilsToRegions([...boundaryRows(regions, "regional_council"), ...boundaryRows(tas, "territorial_authority"), ...linzRows(linz, regions, tas)]);
  test("a council area belongs to the regions its suburbs are in", () => {
    expect(places.find((p) => p.sourceId === "T02")!.regionSourceIds.sort()).toEqual(["R1", "R2"]);
  });
  const by = (id: number) => places.find((p) => p.source === "linz" && p.sourceId === String(id))!;

  test("keeps the original spelling and the ASCII form", () => {
    expect(by(2).name).toBe("Ōtāhuhu");
    expect(by(2).nameAscii).toBe("Otahuhu");
  });
  test("links to TAs from LINZ's text and to regions from the centroid", () => {
    expect(by(1)).toMatchObject({ taSourceIds: ["T02"], regionSourceIds: ["R1"], majorName: "Testville", majorNameType: "City", selectable: true });
    expect(by(2)).toMatchObject({ taSourceIds: ["T01"], regionSourceIds: ["R1"] });
    expect(by(4).regionSourceIds).toEqual(["R2"]);
  });
  test("a suburb in two councils keeps both and is flagged, not guessed", () => {
    expect(by(5).taSourceIds.sort()).toEqual(["T01", "T02"]);
    expect(by(5).flags).toContain("multi_ta");
  });
  test("flags duplicates, unmatched councils, centroid disagreement and offshore points", () => {
    expect(by(3).flags).toContain("duplicate_name");
    expect(by(4).flags).toContain("duplicate_name");
    expect(by(7).flags).toContain("ta_unmatched:Nonexistent District");
    expect(by(7).taSourceIds).toEqual([]); // never invented
    expect(by(8).flags).toContain("ta_centroid_mismatch:Hill City");
    expect(by(9).flags).toContain("region_unresolved");
  });
  test("bays and catch-all areas are kept but not selectable", () => {
    expect(by(6)).toMatchObject({ kind: "other", selectable: false });
    expect(places.find((p) => p.sourceId === "R99")!.selectable).toBe(false);
  });
  test("the report counts Auckland-style candidates by each boundary definition", () => {
    const r = report(places, []);
    expect(r.totals.duplicateSourceIds).toBe(0);
    expect(r.aucklandCandidates).toHaveProperty("territorialAuthority076");
  });
});

describe("import", () => {
  const run = (t: ReturnType<typeof newT>, runId: string, rows: PlaceRow[]) =>
    (async () => {
      await t.mutation(internal.geoImport.startRun, { runId, sources: [] });
      for (const layer of ["regional_council", "territorial_authority", "suburbs_localities"] as const)
        await t.mutation(internal.geoImport.upsertBatch, { runId, layer, rows: rows.filter((p) => p.layer === layer) });
    })();
  const all = () => linkCouncilsToRegions([...boundaryRows(regions, "regional_council"), ...boundaryRows(tas, "territorial_authority"), ...linzRows(linz, regions, tas)]);
  const count = (t: ReturnType<typeof newT>) => t.run(async (ctx) => (await ctx.db.query("places").collect()).length);

  test("re-importing the same data creates no duplicates and links parents", async () => {
    const t = newT();
    await run(t, "r1", all());
    const first = await count(t);
    await run(t, "r2", all());
    expect(await count(t)).toBe(first);
    const ponsonby = await t.run(async (ctx) => {
      const p = await ctx.db.query("places").withIndex("by_source", (q) => q.eq("layer", "suburbs_localities").eq("sourceId", "1")).unique();
      return { p, region: await ctx.db.get(p!.regionIds[0]), ta: await ctx.db.get(p!.taIds[0]) };
    });
    expect(ponsonby.region?.name).toBe("Testland");
    expect(ponsonby.ta?.name).toBe("Hill City");
  });

  test("a changed record is updated in place and a dropped field does not linger", async () => {
    const t = newT();
    await run(t, "r1", linzRows([rec({ id: 1, name: "Ponsonby", population_estimate: 100 })], regions, tas).concat(boundaryRows(regions, "regional_council"), boundaryRows(tas, "territorial_authority")));
    await run(t, "r2", linzRows([rec({ id: 1, name: "Ponsonby" })], regions, tas).concat(boundaryRows(regions, "regional_council"), boundaryRows(tas, "territorial_authority")));
    const rows = await t.run((ctx) => ctx.db.query("places").withIndex("by_key", (q) => q.eq("key", "ponsonby")).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].population).toBeUndefined();
  });

  test("places missing from a later run are retired, not deleted; an empty layer is never retired", async () => {
    const t = newT();
    await run(t, "r1", all());
    await run(t, "r2", all().filter((p) => p.sourceId !== "3"));
    await t.mutation(internal.geoImport.finishRun, { runId: "r2", layers: ["suburbs_localities"] });
    const state = await t.run(async (ctx) => {
      const p = await ctx.db.query("places").withIndex("by_source", (q) => q.eq("layer", "suburbs_localities").eq("sourceId", "3")).unique();
      return p?.active;
    });
    expect(state).toBe(false);
    await t.mutation(internal.geoImport.startRun, { runId: "r3", sources: [] });
    await expect(t.mutation(internal.geoImport.finishRun, { runId: "r3", layers: ["suburbs_localities"] })).rejects.toThrow("refusing to retire");
  });
});

describe("subdivisions", () => {
  // FIXTURE: two invented subdivisions of Hill City (code prefix = the council's code).
  const subs: Boundary[] = [
    { code: "T0201", name: "Hill North Subdivision", nameAscii: "Hill North Subdivision", geometry: square(5, 0, 12, 10) },
    { code: "T0202", name: "Hill South Subdivision", nameAscii: "Hill South Subdivision", geometry: square(12, 0, 20, 10) },
  ];
  const rows = () => linkCouncilsToRegions([...boundaryRows(regions, "regional_council"), ...boundaryRows(tas, "territorial_authority"), ...boundaryRows(subs, "ta_subdivision"), ...linzRows(linz, regions, tas, subs)]);
  const by = (id: number) => rows().find((p) => p.source === "linz" && p.sourceId === String(id))!;

  test("a suburb links to the subdivision its centroid is in, inside the council LINZ names", () => {
    expect(by(1).subdivisionSourceIds).toEqual(["T0201"]);
    expect(by(4).subdivisionSourceIds).toEqual(["T0202"]);
    expect(rows().find((p) => p.sourceId === "T0201")).toMatchObject({ kind: "subdivision", taSourceIds: ["T02"], regionSourceIds: ["R1"] });
  });
  test("only councils that have subdivisions need one: others sit straight under the council; a gap in a split council is flagged", () => {
    expect(by(8).flags.some((f) => f.startsWith("subdivision") || f === "no_subdivision")).toBe(false); // Māori Bay District has none
    const gap = linzRows([rec({ id: 20, name: "Gapville", centroid: { x: 2, y: 5 } })], regions, tas, subs)[0]; // says Hill City, but lies outside both subdivisions
    expect(gap.subdivisionSourceIds).toEqual([]);
    expect(gap.flags).toContain("no_subdivision");
  });
  test("an explicit parent council (Auckland local boards) is honoured, and that council is browsed through them", () => {
    const boards: Boundary[] = [{ code: "7607", name: "Board One", nameAscii: "Board One", geometry: square(5, 0, 20, 10), parentCode: "T02" }];
    const all = linkCouncilsToRegions([...boundaryRows(regions, "regional_council"), ...boundaryRows(tas, "territorial_authority"), ...boundaryRows(boards, "ta_subdivision"), ...linzRows(linz, regions, tas, boards)]);
    expect(all.find((p) => p.sourceId === "7607")!.taSourceIds).toEqual(["T02"]);
    expect(all.find((p) => p.sourceId === "T02")!.flags).toContain("has_districts");
    expect(all.find((p) => p.source === "linz" && p.sourceId === "1")!.subdivisionSourceIds).toEqual(["7607"]);
  });
  test("browsing goes region > district (subdivision) > suburb, and a region or subdivision search finds who serves inside", async () => {
    const t = newT();
    await t.mutation(internal.geoImport.startRun, { runId: "s", sources: [] });
    for (const layer of ["regional_council", "territorial_authority", "ta_subdivision", "suburbs_localities"] as const)
      await t.mutation(internal.geoImport.upsertBatch, { runId: "s", layer, rows: rows().filter((p) => p.layer === layer) });
    const id = (key: string) => t.run(async (ctx) => (await ctx.db.query("places").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
    const council = await t.query(api.locations.children, { parentId: await id("testland") });
    expect(council.filter((c) => c.kind === "subdivision").map((c) => c.name)).toEqual(["Hill North Subdivision"]);
    const other = await t.query(api.locations.children, { parentId: await id("otherland") });
    expect(other.map((c) => c.name)).toContain("Hill South Subdivision"); // districts sit under the region their suburbs are in
    expect((await t.query(api.locations.children, { parentId: await id("testland"), kinds: ["subdivision"] })).map((c) => c.name)).toEqual(["Hill North Subdivision"]); // kinds filters what is listed
    const north = await t.query(api.locations.children, { parentId: await id("hill north subdivision") });
    expect(north.map((c) => c.name)).toContain("Ponsonby");
    expect(council.map((c) => c.name)).not.toContain("Ponsonby"); // suburbs hang off their district, not the region
  });
});
