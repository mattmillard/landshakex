import { NextResponse } from "next/server";
import { getParcelById } from "@/lib/parcels";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid parcel id" }, { status: 400 });
  }

  try {
    const parcel = await getParcelById(numericId);
    if (!parcel) {
      return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
    }

    return NextResponse.json({ parcel, source: "supabase" });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch parcel", detail: String(error) },
      { status: 500 }
    );
  }
}
