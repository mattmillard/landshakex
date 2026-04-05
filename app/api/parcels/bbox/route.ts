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
  const apn = (parcel.apn || "").toUpperCase();
  const haystack = `${owner} ${apn}`;

  if (
    haystack.includes("US ") ||
    haystack.includes("U S ") ||
    haystack.includes("UNITED STATES") ||
    haystack.includes("USDA") ||
    haystack.includes("CORPS") ||
    haystack.includes("NATIONAL")
  ) {
    return "federal";
  }

  if (
    haystack.includes("STATE OF MISSOURI") ||
    haystack.includes("MISSOURI DEPARTMENT") ||
    haystack.includes("CONSERVATION COMMISSION") ||
    haystack.includes("MDC")
  ) {
    return "state";
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
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
      parsed.data.limit
    )) as RawParcel[];

    const grouped = new Map<string, RawParcel[]>();
    for (const p of parcels) {
      if (!p.geom) continue;

      const ownerRaw = (p.owner_name || "").trim();
      const owner = ownerRaw.length > 0 ? ownerRaw.toUpperCase() : null;
      const apn = (p.apn || "").trim().toUpperCase();

      // If owner is missing, do NOT aggregate all unknown parcels together.
      // Keep each parcel isolated by APN (or id fallback) so county-level rendering doesn't collapse.
      const identity = owner || (apn.length > 0 ? `APN:${apn}` : `ID:${p.id}`);
      const key = `${p.county || ""}|${p.state || ""}|${identity}`;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    const features: Feature[] = [];

    for (const groupItems of grouped.values()) {
      const owner = groupItems[0].owner_name || "Unknown";
      const county = groupItems[0].county || null;
      const state = groupItems[0].state || null;
      const totalAcreage = groupItems.reduce((sum, p) => sum + (typeof p.acreage === "number" ? p.acreage : 0), 0);
      const parcelIds = groupItems.map((p) => p.id);
      const apns = groupItems.map((p) => p.apn).filter(Boolean);
      const conservationClass = classifyConservation(groupItems[0]);

      const turfFeatures = groupItems
        .filter((p) => p.geom)
        .map((p) => turf.feature(p.geom as GeoJSON.Polygon | GeoJSON.MultiPolygon));

      if (!turfFeatures.length) continue;

      let merged: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = turfFeatures[0] as GeoJSON.Feature<
        GeoJSON.Polygon | GeoJSON.MultiPolygon
      >;
      for (let i = 1; i < turfFeatures.length; i++) {
        try {
          const unioned = turf.union(
            turf.featureCollection([
              merged,
              turfFeatures[i] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
            ])
          );
          if (unioned) merged = unioned as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
        } catch {
          // If union fails for invalid geometry edge case, keep previous merge result.
        }
      }

      const geometry = merged.geometry as GeoJSON.Geometry;
      if (!geometry) continue;

      features.push({
        type: "Feature",
        geometry,
        properties: {
          id: parcelIds[0],
          owner_name: owner,
          acreage: Number(totalAcreage.toFixed(3)),
          county,
          state,
          parcel_count: groupItems.length,
          apn: apns[0] || null,
          apns,
          parcel_ids: parcelIds,
          conservation_class: conservationClass
        }
      });
    }

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
