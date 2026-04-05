import type { ParcelSummary } from "@/lib/types";

export const MOCK_PARCEL: ParcelSummary = {
  id: 1,
  apn: "12-345-678-901",
  ownerName: "Sample Landowner LLC",
  acreage: 42.7,
  county: "Example",
  state: "TX"
};

export const MOCK_PARCELS = [MOCK_PARCEL];
