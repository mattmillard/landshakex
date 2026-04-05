# Import GeoJSON (playbook)

## Goal
Load local parcel GeoJSON into `parcels` table with normalized properties.

## Recommended pipeline
1. Validate GeoJSON structure (FeatureCollection + Polygon/MultiPolygon)
2. Normalize property keys (APN/owner/acreage/zoning)
3. Fix invalid geometries (if present)
4. Insert into staging table
5. Transform into `parcels`
6. Rebuild/analyze indexes

## Notes
- Keep original raw file in immutable archive path.
- Record `source_dataset` as `county-state-YYYYMMDD`.
- Reject features without geometry.
- Keep import logs with counts: total, inserted, rejected.
