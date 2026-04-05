import { NextResponse } from "next/server";
import { MOCK_PARCEL } from "@/lib/mock/parcels";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  // TODO: Replace with DB fetch by parcel id
  if (Number(id) !== MOCK_PARCEL.id) {
    return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
  }

  return NextResponse.json({ parcel: MOCK_PARCEL, source: "mock" });
}
