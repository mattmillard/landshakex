import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type ParcelSummaryDTO = {
  id: number;
  apn: string | null;
  owner_name: string | null;
  acreage: number | null;
  county: string | null;
  state: string | null;
};

export async function getParcelByPoint(lng: number, lat: number) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("get_parcel_by_point", {
    p_lng: lng,
    p_lat: lat
  });

  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

export async function getParcelsByBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  limit: number,
  includeConservationOnly: boolean = false
) {
  const supabaseAdmin = getSupabaseAdmin();

  const bbox = `SRID=4326;POLYGON((${minLng} ${minLat},${maxLng} ${minLat},${maxLng} ${maxLat},${minLng} ${maxLat},${minLng} ${minLat}))`;

  let query = supabaseAdmin
    .from("parcels")
    .select("id, apn, owner_name, acreage, county, state, geom")
    .in("source_dataset", [
      "callaway-mo-20260405",
      "boone-mo-20260405",
      "cole-mo-20260405",
      "cooper-mo-20260405"
    ])
    .filter("geom", "ov", bbox)
    .limit(limit);

  if (includeConservationOnly) {
    query = query.or(
      "owner_name.ilike.*UNITED STATES*,owner_name.ilike.*U.S.*,owner_name.ilike.*US %," +
        "owner_name.ilike.*USDA*,owner_name.ilike.*NATIONAL FOREST*,owner_name.ilike.*ARMY CORPS*," +
        "owner_name.ilike.*STATE OF MISSOURI*,owner_name.ilike.*MISSOURI DEPARTMENT OF CONSERVATION*," +
        "owner_name.ilike.*CONSERVATION COMMISSION*,owner_name.ilike.*DEPARTMENT OF NATURAL RESOURCES*"
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

export async function getParcelById(id: number) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("parcels")
    .select("id, apn, owner_name, acreage, county, state, land_use, zoning, assessed_value, metadata")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
