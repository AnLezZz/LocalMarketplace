// Repeatable NZ geography import (LINZ Suburbs and Localities + Stats NZ regional council / territorial authority boundaries).
//
//   node scripts/geo-import.mts                       fetch from the public ArcGIS feeds, validate, write .geo-cache/report.json. Changes nothing.
//   node scripts/geo-import.mts --apply               the same, then upsert into the Convex deployment `npx convex run` targets (dev by default).
//   node scripts/geo-import.mts --linz f.geojson --regions r.geojson --tas t.geojson
//                                                    use downloaded files (also --subs; GeoJSON from LINZ Data Service / Stats NZ, EPSG:4326) instead of the feeds.
// Needs no API key: the feeds are public. Nothing here ever reaches the browser.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { boundaryRows, linkCouncilsToRegions, linzRows, report, type Boundary, type Geometry, type LinzRecord, type PlaceRow, type SourceInfo } from "./geo/transform.mts";

const FEEDS = {
  linz: { itemId: "cfe52bdf2a76491d86c4f433957f2460", url: "https://services.arcgis.com/xdsHIIxuCWByZiCB/arcgis/rest/services/LINZ_NZ_Suburbs_and_Localities/FeatureServer/0", title: "LINZ NZ Suburbs and Localities", source: "linz" },
  regions: { itemId: "e83157765acf4fca90a255888a368182", url: "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services/Regional_Council_2025/FeatureServer/0", title: "Regional Council 2025", source: "statsnz" },
  // Auckland Council's 21 local boards (2025 elections): the districts of Auckland, which Stats NZ has no complete layer for.
  subs: { itemId: "cff8b5bdbe8447c1811cec6a25e0b99c", url: "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/LocalElectoralBoundary/FeatureServer/2", title: "Auckland Council Local Boards 2025", source: "aucklandcouncil" },
  tas: { itemId: "d3d3d1c8fb2142f6b222a4233360be16", url: "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services/Territorial_Authority_2025/FeatureServer/0", title: "Territorial Authority 2025", source: "statsnz" },
} as const;
const OUT = ".geo-cache";
const BATCH = 100; // rows per `convex run` call; keeps the command line small

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  const body = await res.json();
  if (body.error) throw new Error(`${body.error.message}: ${url}`);
  return body;
}

async function pages(feed: { url: string }, params: Record<string, string>): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; ; offset += 2000) {
    const q = new URLSearchParams({ where: params.where ?? "1=1", outSR: "4326", orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: "2000", f: params.returnCentroid ? "json" : "geojson", ...params });
    const body = await getJson(`${feed.url}/query?${q}`);
    out.push(...body.features);
    if (!body.properties?.exceededTransferLimit && !body.exceededTransferLimit && body.features.length < 2000) return out;
  }
}

async function sourceInfo(feed: (typeof FEEDS)[keyof typeof FEEDS], count: number): Promise<SourceInfo> {
  const item = await getJson(`https://www.arcgis.com/sharing/rest/content/items/${feed.itemId}?f=json`);
  return {
    source: feed.source, layer: feed.title, title: item.title, edition: feed.title.match(/\d{4}/)?.[0] ?? "rolling", modified: new Date(item.modified).toISOString(),
    licence: /Attribution 4\.0/.test(item.licenseInfo ?? "") ? "CC BY 4.0" : "UNVERIFIED", attribution: String(item.accessInformation ?? "").replace(/<[^>]+>/g, "").trim(),
    url: feed.url, fetchedAt: new Date().toISOString(), count,
  };
}

/** Area-weighted centroid of the largest ring, for downloaded polygon files (the feeds supply a centroid directly). */
function centroidOf(g: Geometry): { x: number; y: number } | null {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let best: { a: number; x: number; y: number } | null = null;
  for (const [ring] of polys) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (a !== 0 && (!best || Math.abs(a) > Math.abs(best.a))) best = { a, x: cx / (3 * a), y: cy / (3 * a) };
  }
  return best && { x: best.x, y: best.y };
}

const boundaryOf = (f: any, prefix: "REGC2025_V1_00" | "TA2025_V1_00"): Boundary => ({ code: f.properties[prefix], name: f.properties[`${prefix}_NAME`], nameAscii: f.properties[`${prefix}_NAME_ASCII`], geometry: f.geometry });
const AUCKLAND_COUNCIL = "076"; // Stats NZ territorial authority code; every Auckland local board belongs to it
const localBoardOf = (f: any): Boundary => ({ code: String(f.properties.LocalBoardCode), name: f.properties.LocalBoardName, nameAscii: f.properties.LocalBoardName.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""), geometry: f.geometry, parentCode: AUCKLAND_COUNCIL });
const recordOf = (f: any, geometry: boolean): LinzRecord => {
  const p = f.properties ?? f.attributes; // downloaded GeoJSON vs. the feed's JSON
  return {
    id: p.id, name: p.name, additional_name: p.additional_name ?? null, type: p.type, major_name: p.major_name ?? null, major_name_type: p.major_name_type ?? null,
    territorial_authority: p.territorial_authority ?? null, population_estimate: p.population_estimate ?? null, name_ascii: p.name_ascii ?? null, additional_name_ascii: p.additional_name_ascii ?? null,
    centroid: geometry && f.geometry ? centroidOf(f.geometry) : f.centroid ?? null,
  };
};

async function load() {
  const files = { linz: opt("linz"), regions: opt("regions"), tas: opt("tas"), subs: opt("subs") };
  const fromFile = (path: string) => JSON.parse(readFileSync(path, "utf8")).features as any[];
  const infos: SourceInfo[] = [];
  const get = async (k: keyof typeof FEEDS, params: Record<string, string>) => {
    const feed = FEEDS[k];
    if (files[k]) {
      const features = fromFile(files[k]!);
      infos.push({ source: feed.source, layer: feed.title, title: feed.title, edition: "downloaded file", modified: "unknown", licence: "UNVERIFIED (downloaded file; check the publisher's licence)", attribution: "", url: files[k]!, fetchedAt: new Date().toISOString(), count: features.length });
      return features;
    }
    const features = await pages(feed, params);
    infos.push(await sourceInfo(feed, features.length));
    return features;
  };
  const regions = (await get("regions", { outFields: "*", geometryPrecision: "4" })).map((f) => boundaryOf(f, "REGC2025_V1_00"));
  const tas = (await get("tas", { outFields: "*", geometryPrecision: "4" })).map((f) => boundaryOf(f, "TA2025_V1_00"));
  const subs = (await get("subs", { where: "Status='Current'", outFields: "*", geometryPrecision: "4" })).map(localBoardOf);
  const linz = (await get("linz", { outFields: "id,name,additional_name,type,major_name,major_name_type,territorial_authority,population_estimate,name_ascii,additional_name_ascii", returnGeometry: files.linz ? "true" : "false", returnCentroid: "true" })).map((f) => recordOf(f, !!files.linz));
  return { regions, tas, subs, linz, infos };
}

function convexRun(fn: string, payload: unknown) {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(payload)], { encoding: "utf8", maxBuffer: 1 << 26 });
  return out.trim() ? JSON.parse(out.slice(out.indexOf("{"))) : null;
}

async function main() {
  const { regions, tas, subs, linz, infos } = await load();
  const places: PlaceRow[] = linkCouncilsToRegions([...boundaryRows(regions, "regional_council"), ...boundaryRows(tas, "territorial_authority"), ...boundaryRows(subs, "ta_subdivision"), ...linzRows(linz, regions, tas, subs)]);
  const rep = report(places, infos);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/report.json`, JSON.stringify(rep, null, 2));
  writeFileSync(`${OUT}/places.json`, JSON.stringify(places));
  console.log(JSON.stringify(rep, null, 2));
  if (rep.totals.duplicateSourceIds > 0) throw new Error("Duplicate source IDs in the input; refusing to continue");
  if (!flag("apply")) return console.log(`\nDry run only. Report: ${OUT}/report.json. Re-run with --apply to write to the Convex deployment.`);

  const runId = new Date().toISOString();
  convexRun("geoImport:startRun", { runId, sources: infos });
  const order = ["regional_council", "territorial_authority", "ta_subdivision", "suburbs_localities"] as const; // parents first
  for (const layer of order) {
    const rows = places.filter((p) => p.layer === layer);
    for (let i = 0; i < rows.length; i += BATCH) {
      const r = convexRun("geoImport:upsertBatch", { runId, layer, rows: rows.slice(i, i + BATCH) });
      console.log(`${layer} ${Math.min(i + BATCH, rows.length)}/${rows.length}`, JSON.stringify(r));
    }
  }
  let state: any = { layers: [...order], cursor: null };
  for (let r = convexRun("geoImport:finishRun", { runId, ...state }); !r.done; r = convexRun("geoImport:finishRun", { runId, ...r.next })) console.log("retiring", JSON.stringify(r.next.layers));
  console.log(`Import ${runId} finished.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
