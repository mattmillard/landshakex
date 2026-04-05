# LandShakeX Technical Spec

## Architecture
- Next.js app on Vercel
- Supabase Postgres + PostGIS
- MapLibre GL JS rendering
- API via Next.js route handlers

## Data Flow
1. Import county GeoJSON
2. Normalize + validate geometry/properties
3. Store in `parcels` (PostGIS)
4. Query by point or bbox
5. Return compact payload to map UI

## Spatial Query Strategy
- Point-in-polygon for selected parcel
- Bounding-box intersection for viewport loads
- GIST indexes on geometry and point columns

## Performance Targets
- Keep map payload per request bounded
- Use geometry simplification for low zoom
- Add MVT tile pipeline once dataset exceeds MVP threshold

## Security
- RLS for user-owned tables
- Server-side key for parcel endpoints
- Read-only share tokens with expiry

## Deployment
- Vercel for web/API
- Supabase managed Postgres
- Sentry + analytics post-MVP
