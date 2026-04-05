import { NextResponse } from "next/server";
import { bboxQuerySchema } from "@/lib/validation";
import { getParcelsByBbox } from "@/lib/parcels";

type BboxParcel = {
  id: number;
  apn: string | null;
  owner_name: string | null;
  acreage: number | null;
  county: string | null;
  state: string | null;
  geom: GeoJSON.Geometry | null;
};

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
    )) as BboxParcel[];

    const features = parcels
      .filter((p) => p.geom)
      .map((p) => ({
        type: "Feature" as const,
        geometry: p.geom as GeoJSON.Geometry,
        properties: {
          id: p.id,
          apn: p.apn,
          owner_name: p.owner_name,
          acreage: p.acreage,
          county: p.county,
          state: p.state
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
