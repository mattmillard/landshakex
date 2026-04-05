import { NextResponse } from "next/server";
import { bboxQuerySchema } from "@/lib/validation";
import { getParcelsByBbox } from "@/lib/parcels";

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
    const parcels = await getParcelsByBbox(
      parsed.data.minLng,
      parsed.data.minLat,
      parsed.data.maxLng,
      parsed.data.maxLat,
      parsed.data.limit
    );

    return NextResponse.json({
      query: parsed.data,
      count: parcels.length,
      parcels,
      source: "supabase"
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to query parcels by bbox", detail: String(error) },
      { status: 500 }
    );
  }
}
