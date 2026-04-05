import { NextResponse } from "next/server";
import { pointQuerySchema } from "@/lib/validation";
import { MOCK_PARCEL } from "@/lib/mock/parcels";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = pointQuerySchema.safeParse({
    lng: searchParams.get("lng"),
    lat: searchParams.get("lat")
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // TODO: Replace with PostGIS point-in-polygon query
  return NextResponse.json({
    query: parsed.data,
    parcel: MOCK_PARCEL,
    source: "mock"
  });
}
