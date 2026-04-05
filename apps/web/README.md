# apps/web

LandShakeX web app (Next.js + MapLibre).

## Run locally
```bash
npm install
npm run dev
```

Open: http://localhost:3000

## API stubs included
- `GET /api/parcels/point?lng=&lat=`
- `GET /api/parcels/bbox?minLng=&minLat=&maxLng=&maxLat=&limit=`
- `GET /api/parcels/:id`

These currently return mock data and are ready for PostGIS wiring.

## Env
- `NEXT_PUBLIC_MAP_STYLE_URL` (optional)
