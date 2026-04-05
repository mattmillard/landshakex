import { NextResponse } from "next/server";
import { bboxQuerySchema } from "@/lib/validation";
import { MOCK_PARCELS } from "@/lib/mock/parcels";

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

  // TODO: Replace with PostGIS bbox intersection query and GeoJSON serialization.
  return NextResponse.json({
    query: parsed.data,
    count: MOCK_PARCELS.length,
    parcels: MOCK_PARCELS,
    source: "mock"
  });
}
