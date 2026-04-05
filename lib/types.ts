export type ParcelSummary = {
  id: number;
  apn: string | null;
  ownerName: string | null;
  acreage: number | null;
  county: string | null;
  state: string | null;
};

export type ParcelFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon, {
  id: number;
  apn?: string | null;
  ownerName?: string | null;
  acreage?: number | null;
}>;
