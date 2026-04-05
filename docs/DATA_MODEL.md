# LandShakeX Data Model

## Core entities

## profiles
User profile linked to Supabase auth user.
- id (uuid, PK)
- display_name (text)
- role (text)

## parcels
Geospatial parcel polygons and property attributes.
- id (bigserial, PK)
- source_dataset (text)
- apn (text)
- county/state (text)
- owner_name (text)
- acreage (numeric)
- zoning/land_use (text)
- assessed_value (numeric)
- centroid (geography point)
- geom (geometry multipolygon)
- metadata (jsonb)

Indexes:
- GIST(geom)
- GIST(centroid)
- btree(apn)
- owner_name text search index

## parcel_history
Optional history snapshots for owner/value changes.

## waypoints
User-created point features.
- location as geography(point)
- category/title/notes/photo_urls

## tracks
User line features.
- path as geometry(linestring)
- started_at/ended_at/distance_m

## saved_areas
User AOIs for offline cache packs.
- bbox as geometry(polygon)
- zoom_min/zoom_max

## map_shares
Read-only share tokens for map states.
- token (unique)
- payload (jsonb)
- expires_at

## Common spatial queries
1. Point-in-polygon for parcel pick
2. BBox intersection for viewport loads
3. Distance sorting for nearest waypoint

## Versioning guidance
- Keep parcel source imports immutable by `source_dataset`
- Track import jobs with timestamped dataset IDs
- Avoid in-place destructive updates without snapshot tables
