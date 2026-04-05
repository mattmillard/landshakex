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

## Repository layout (Vercel auto-detect)
This repo is now a **root-level Next.js app** so Vercel can detect it automatically on GitHub import.

```txt
landshakex/
  app/
  components/
  lib/
  package.json
  next.config.mjs
  tsconfig.json
  postcss.config.mjs
  tailwind.config.ts
  .env.example
  infra/
  docs/
```

## Deployment (Vercel)
- Import repo from GitHub
- Framework preset should auto-detect as **Next.js**
- Build command: `next build` (auto)
- Output: `.next` (auto)

## Next actions
1. Set root `.env.local` from `.env.example`
2. Run migrations:
   - `infra/supabase/migrations/0001_init.sql`
   - `infra/supabase/migrations/0002_parcels_rpc.sql`
3. Import your first county parcel dataset into `parcels`
4. Verify API routes:
   - `GET /api/parcels/point`
   - `GET /api/parcels/bbox`
   - `GET /api/parcels/:id`
5. Add waypoint CRUD
