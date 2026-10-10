import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Server side of scripts/geo-import.mts. Internal only: run through `convex run` (admin credentials), so there is no public surface.

const kind = v.union(v.literal("region"), v.literal("territorial_authority"), v.literal("subdivision"), v.literal("suburb"), v.literal("locality"), v.literal("other"));
const layer = v.union(v.literal("suburbs_localities"), v.literal("regional_council"), v.literal("territorial_authority"), v.literal("ta_subdivision"));
const row = v.object({
  source: v.union(v.literal("linz"), v.literal("statsnz")), layer, sourceId: v.string(), kind, selectable: v.boolean(),
  name: v.string(), nameAscii: v.string(), key: v.string(), altNames: v.array(v.string()), altKeys: v.array(v.string()),
  majorName: v.optional(v.string()), majorNameType: v.optional(v.string()),
  lat: v.optional(v.number()), lng: v.optional(v.number()), population: v.optional(v.number()),
  regionSourceIds: v.array(v.string()), taSourceIds: v.array(v.string()), subdivisionSourceIds: v.optional(v.array(v.string())), flags: v.array(v.string()),
});
const sourceInfo = v.object({ source: v.string(), layer: v.string(), title: v.string(), edition: v.string(), modified: v.string(), licence: v.string(), attribution: v.string(), url: v.string(), fetchedAt: v.string(), count: v.number() });

export const MAX_BATCH = 200;

export const startRun = internalMutation({
  args: { runId: v.string(), sources: v.array(sourceInfo) },
  handler: async (ctx, { runId, sources }) => {
    await ctx.db.insert("geoImports", { runId, startedAt: Date.now(), sources, seen: {} });
  },
});

/** Insert or update by (layer, sourceId). Regions and territorial authorities must be imported before the places that point at them. */
export const upsertBatch = internalMutation({
  args: { runId: v.string(), layer, rows: v.array(row) },
  handler: async (ctx, { runId, layer, rows }) => {
    if (rows.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} rows per batch`);
    const run = await ctx.db.query("geoImports").withIndex("by_run", (q) => q.eq("runId", runId)).unique();
    if (!run) throw new Error("Unknown import run");
    const parent = async (l: "regional_council" | "territorial_authority" | "ta_subdivision", id: string) =>
      (await ctx.db.query("places").withIndex("by_source", (q) => q.eq("layer", l).eq("sourceId", id)).unique())?._id;
    let inserted = 0, updated = 0;
    for (const r of rows) {
      if (r.layer !== layer) throw new Error("Row layer does not match the batch layer");
      const { regionSourceIds, taSourceIds, subdivisionSourceIds, ...rest } = r;
      const flags = [...r.flags];
      const link = async (l: "regional_council" | "territorial_authority" | "ta_subdivision", codes: string[]) => {
        const ids = [];
        for (const c of codes) {
          const id = await parent(l, c);
          if (id) ids.push(id);
          else flags.push(`parent_missing:${l}:${c}`);
        }
        return ids;
      };
      const doc = { ...rest, flags, regionIds: await link("regional_council", regionSourceIds), taIds: await link("territorial_authority", taSourceIds), subdivisionIds: await link("ta_subdivision", subdivisionSourceIds ?? []), active: true, runId };
      const existing = await ctx.db.query("places").withIndex("by_source", (q) => q.eq("layer", r.layer).eq("sourceId", r.sourceId)).unique();
      let id: Id<"places">;
      if (!existing) { id = await ctx.db.insert("places", doc); inserted++; }
      else {
        // replace, not patch: a field the source dropped (e.g. population) must not linger
        await ctx.db.replace(existing._id, doc);
        id = existing._id; updated++;
      }
      // Browse edges for the location picker: region > district > suburb. A district is a council area, or for Auckland one of its local boards; a suburb with neither hangs off its region. Rebuilt from the row each time, so a moved boundary leaves no stale edge.
      const parents = r.kind === "subdivision" ? doc.regionIds
        : r.kind === "territorial_authority" ? (r.flags.includes("has_districts") ? [] : doc.regionIds)
        : r.kind === "suburb" || r.kind === "locality" ? (doc.subdivisionIds.length ? doc.subdivisionIds : doc.taIds.length ? doc.taIds : doc.regionIds) : [];
      for (const old of await ctx.db.query("placeParents").withIndex("by_child", (q) => q.eq("childId", id)).take(20)) await ctx.db.delete(old._id);
      for (const parentId of parents) await ctx.db.insert("placeParents", { childId: id, parentId });
    }
    await ctx.db.patch(run._id, { seen: { ...run.seen, [layer]: (run.seen[layer] ?? 0) + rows.length } });
    return { inserted, updated };
  },
});

/** Mark places this run did not list as inactive (never delete: bookings and service areas may point at them). Refuses to retire a layer the run never wrote. */
export const finishRun = internalMutation({
  args: { runId: v.string(), layers: v.array(layer), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { runId, layers, cursor }) => {
    const run = await ctx.db.query("geoImports").withIndex("by_run", (q) => q.eq("runId", runId)).unique();
    if (!run) throw new Error("Unknown import run");
    const [current, ...rest] = layers;
    if (!current) { await ctx.db.patch(run._id, { finishedAt: Date.now() }); return { done: true, retired: run.retired ?? 0 }; }
    if (!run.seen[current]) throw new Error(`Run ${runId} wrote no ${current} rows; refusing to retire the layer`);
    const page = await ctx.db.query("places").withIndex("by_layer", (q) => q.eq("layer", current)).paginate({ numItems: 500, cursor: cursor ?? null });
    let retired = 0;
    for (const p of page.page as Doc<"places">[]) if (p.active && p.runId !== runId) { await ctx.db.patch(p._id, { active: false }); retired++; }
    await ctx.db.patch(run._id, { retired: (run.retired ?? 0) + retired });
    // Keep going until every layer is done; the script re-calls with the returned state.
    return page.isDone ? { done: false, next: { layers: rest, cursor: null } } : { done: false, next: { layers, cursor: page.continueCursor } };
  },
});
