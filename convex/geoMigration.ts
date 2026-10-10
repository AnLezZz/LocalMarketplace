import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { findPlaces, MAX_AREAS, queueReview, syncProviderAreas } from "./model/coverage";

/**
 * Links existing providers' suburb text to imported places. Run page by page until `done`:
 *   npx convex run geoMigration:migrateProviders '{"dryRun":true}'            (report only)
 *   npx convex run geoMigration:migrateProviders '{"cursor":"<next>"}'        (repeat with the returned cursor)
 * Only an exact single match is linked. Everything else becomes an open review; profiles and bookings are never changed or removed.
 * A provider with no service list now serves their base suburb only (the old "empty means anywhere" is retired).
 */
export const migrateProviders = internalMutation({
  args: { dryRun: v.optional(v.boolean()), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { dryRun, cursor }) => {
    const page = await ctx.db.query("providers").paginate({ numItems: 50, cursor: cursor ?? null });
    const out = { providers: 0, skipped: 0, baseLinked: 0, baseReview: 0, areasLinked: 0, areasReview: 0, emptyListNowBaseOnly: 0, reviews: [] as string[] };
    for (const p of page.page) {
      if (p.locationMigratedAt !== undefined) { out.skipped++; continue; }
      out.providers++;
      const base = (await findPlaces(ctx, p.suburb)).filter((x) => x.kind === "suburb" || x.kind === "locality");
      let baseAreaId: Id<"places"> | undefined;
      if (base.length === 1) { baseAreaId = base[0]._id; out.baseLinked++; }
      else { out.baseReview++; out.reviews.push(`${p.name}: base "${p.suburb}" ${base.length ? "ambiguous" : "unmatched"}`); if (!dryRun) await queueReview(ctx, p._id, "base", p.suburb, base.length ? "ambiguous" : "unmatched", base.map((x) => x._id)); }
      const areaIds = new Set<Id<"places">>();
      for (const text of p.serviceSuburbs ?? []) {
        const found = await findPlaces(ctx, text);
        if (found.length === 1 && areaIds.size < MAX_AREAS) { areaIds.add(found[0]._id); out.areasLinked++; }
        else { out.areasReview++; out.reviews.push(`${p.name}: service area "${text}" ${found.length ? "ambiguous" : "unmatched"}`); if (!dryRun) await queueReview(ctx, p._id, "service", text, found.length ? "ambiguous" : "unmatched", found.map((x) => x._id)); }
      }
      if ((p.serviceSuburbs ?? []).length === 0) out.emptyListNowBaseOnly++;
      if (!dryRun) { await ctx.db.patch(p._id, { baseAreaId, serviceAreaIds: [...areaIds], locationMigratedAt: Date.now() }); await syncProviderAreas(ctx, p._id); }
    }
    return { ...out, done: page.isDone, cursor: page.continueCursor };
  },
});

/** Rebuilds every provider's search rows (use after changing how they are built). Page by page, like migrateProviders. */
export const syncAll = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("providers").paginate({ numItems: 50, cursor: cursor ?? null });
    for (const p of page.page) await syncProviderAreas(ctx, p._id);
    return { synced: page.page.length, done: page.isDone, cursor: page.continueCursor };
  },
});
