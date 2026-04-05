import { NextResponse } from "next/server";
import { pointQuerySchema } from "@/lib/validation";
import { getParcelByPoint } from "@/lib/parcels";

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

  try {
    const parcel = await getParcelByPoint(parsed.data.lng, parsed.data.lat);
    if (!parcel) {
      return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
    }

    return NextResponse.json({
      query: parsed.data,
      parcel,
      source: "supabase"
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to query parcel by point", detail: String(error) },
      { status: 500 }
    );
  }
}
