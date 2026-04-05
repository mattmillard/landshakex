# LandShakeX API Spec (v1)

## Parcels
### GET /api/parcels/point?lng={lng}&lat={lat}
Return single parcel at location.

### GET /api/parcels/bbox?minLng={}&minLat={}&maxLng={}&maxLat={}&limit={}
Return parcels intersecting viewport.

### GET /api/parcels/:id
Return detail payload for one parcel.

## Search
### GET /api/search?q={query}
Search by APN, owner, county text fields.

## Waypoints
### POST /api/waypoints
Create waypoint.

### GET /api/waypoints
List user waypoints.

### PATCH /api/waypoints/:id
Update waypoint.

### DELETE /api/waypoints/:id
Delete waypoint.

## Offline Areas
### POST /api/offline/areas
Create/update AOI package request.

## Share Links
### POST /api/shares
Create signed read-only share token.

### GET /s/:token
Resolve shared map payload.
