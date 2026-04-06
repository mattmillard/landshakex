import { NextResponse } from "next/server";
import * as turf from "@turf/turf";
import { bboxQuerySchema } from "@/lib/validation";
import { getParcelsByBbox } from "@/lib/parcels";

type RawParcel = {
  id: number;
  apn: string | null;
  owner_name: string | null;
  acreage: number | null;
  county: string | null;
  state: string | null;
  geom: GeoJSON.Geometry | null;
  metadata?: Record<string, unknown> | null;
};

type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;

function classifyConservation(parcel: RawParcel): "federal" | "state" | null {
  const owner = (parcel.owner_name || "").toUpperCase();

  // Federal ownership and conservation patterns.
  const federalNeedles = [
    "UNITED STATES",
    "U.S.",
    " US ",
    "USDA",
    "U S A",
    "US ARMY CORPS",
    "CORPS OF ENGINEERS",
    "NATIONAL FOREST",
    "NATIONAL PARK",
    "BUREAU OF LAND MANAGEMENT",
    "FISH AND WILDLIFE",
    "DEPARTMENT OF INTERIOR",
    "DEPARTMENT OF AGRICULTURE"
  ];

  if (federalNeedles.some((n) => owner.includes(n))) {
    return "federal";
  }

  // State/public conservation patterns.
  const stateNeedles = [
    "STATE OF MISSOURI",
    "MISSOURI DEPARTMENT OF CONSERVATION",
    "CONSERVATION COMMISSION",
    "MISSOURI DEPARTMENT OF NATURAL RESOURCES",
    "MISSOURI DEPARTMENT OF TRANSPORTATION",
    "MDC",
    "MDNR",
    "MISSOURI STATE"
  ];

  if (stateNeedles.some((n) => owner.includes(n))) {
    return "state";
  }

  return null;
}

function mergeConservationUnits(features: Feature[]): Feature[] {
  const grouped = new Map<string, Feature[]>();

  for (const f of features) {
    const cls = (f.properties?.conservation_class as string | undefined) ?? null;
    if (!cls) continue;

    const owner = String(f.properties?.owner_name || "UNKNOWN").trim().toUpperCase();
    const county = String(f.properties?.county || "");
    const state = String(f.properties?.state || "");
    const key = `${state}|${county}|${cls}|${owner}`;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }

  const merged: Feature[] = [];

  for (const group of grouped.values()) {
    if (!group.length) continue;

    let acc = turf.feature(group[0].geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon) as GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon
    >;
    for (let i = 1; i < group.length; i++) {
      try {
        const next = turf.feature(group[i].geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon) as GeoJSON.Feature<
          GeoJSON.Polygon | GeoJSON.MultiPolygon
        >;
        const u = turf.union(turf.featureCollection([acc, next]));
        if (u) acc = u as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      } catch {
        // ignore invalid union step
      }
    }

    const acres = group.reduce((s, g) => s + (Number(g.properties?.acreage) || 0), 0);
    const parcelIds = group.map((g) => Number(g.properties?.id)).filter((n) => Number.isFinite(n));
    const apns = group.map((g) => String(g.properties?.apn || "")).filter(Boolean);

    merged.push({
      type: "Feature",
      geometry: acc.geometry as GeoJSON.Geometry,
      properties: {
        ...group[0].properties,
        id: parcelIds[0] || group[0].properties?.id,
        parcel_ids: parcelIds,
        apns,
        parcel_count: group.length,
        acreage: Number(acres.toFixed(2)),
        is_merged_unit: true
      }
    });
  }

  return merged;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conservationOnly = searchParams.get("conservationOnly") === "1";

  const parsed = bboxQuerySchema.safeParse({
    minLng: searchParams.get("minLng"),
    minLat: searchParams.get("minLat"),
    maxLng: searchParams.get("maxLng"),
    maxLat: searchParams.get("maxLat"),
    limit: searchParams.get("limit") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const parcels = (await getParcelsByBbox(
      parsed.data.minLng,
      parsed.data.minLat,
      parsed.data.maxLng,
      parsed.data.maxLat,
      parsed.data.limit,
      conservationOnly
    )) as RawParcel[];

    const baseFeatures: Feature[] = parcels
      .filter((p) => p.geom)
      .map((p) => ({
        type: "Feature",
        geometry: p.geom as GeoJSON.Geometry,
        properties: {
          id: p.id,
          owner_name: p.owner_name,
          acreage: p.acreage,
          county: p.county,
          state: p.state,
          parcel_count: 1,
          apn: p.apn,
          apns: p.apn ? [p.apn] : [],
          parcel_ids: [p.id],
          conservation_class: classifyConservation(p),
          is_merged_unit: false
        }
      }));

    const mergedConservation = mergeConservationUnits(baseFeatures);
    const nonConservation = baseFeatures.filter((f) => !f.properties?.conservation_class);
    const features = conservationOnly ? mergedConservation : [...nonConservation, ...mergedConservation];

    return NextResponse.json({
      query: parsed.data,
      count: features.length,
      source: "supabase",
      featureCollection: {
        type: "FeatureCollection",
        features
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to query parcels by bbox", detail: String(error) },
      { status: 500 }
    );
  }
}
