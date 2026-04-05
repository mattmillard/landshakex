# LandShakeX Starter

Hunter-first parcel intelligence app (mobile-first), with secondary workflows for investors, contractors, realtors, appraisers, and inspectors.

## Stack (recommended)
- **Frontend:** Next.js + TypeScript + Tailwind
- **Map:** MapLibre GL JS
- **Backend:** Next.js route handlers on Vercel
- **Database:** Supabase Postgres + PostGIS
- **Auth:** Supabase Auth (initially)

## Why Supabase over Firestore
This app requires geospatial polygon/point queries, parcel intersections, viewport filtering, and spatial indexing. PostGIS is purpose-built for this. Firestore would require extra geospatial workarounds and is not ideal for parcel-heavy GIS workloads.

## MVP goals
1. Render local GeoJSON parcels on mobile-first map
2. Tap parcel => detail card (owner/APN/acreage/etc)
3. Layer toggles (satellite/topo/parcel)
4. Waypoints with notes/photos
5. Offline area save for field use
6. Share read-only map links

## API v1
- `GET /api/parcels/point?lng=&lat=`
- `GET /api/parcels/bbox?minLng=&minLat=&maxLng=&maxLat=&limit=`
- `GET /api/parcels/:id`
- `GET /api/search?q=`
- `POST /api/waypoints`
- `GET /api/waypoints`
- `PATCH /api/waypoints/:id`
- `DELETE /api/waypoints/:id`
- `POST /api/offline/areas`
- `POST /api/shares`

## Initial repo layout
```txt
landshakex/
  apps/
    web/
  packages/
    ui/
    types/
    map-style/
  infra/
    supabase/
      migrations/
      seed/
    scripts/
  docs/
```

## Next actions
1. Run migrations:
   - `infra/supabase/migrations/0001_init.sql`
   - `infra/supabase/migrations/0002_parcels_rpc.sql`
2. Set `apps/web/.env` from `apps/web/.env.example`
3. Import your first county parcel dataset into `parcels`
4. Verify API routes now query Supabase/PostGIS:
   - `GET /api/parcels/point`
   - `GET /api/parcels/bbox`
   - `GET /api/parcels/:id`
5. Add waypoint CRUD
