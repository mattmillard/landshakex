import { NextResponse } from "next/server";
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

    const features: Feature[] = parcels
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
          conservation_class: classifyConservation(p)
        }
      }));

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
