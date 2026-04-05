# LandShakeX PRD (MVP)

## Vision
A mobile-first parcel intelligence app for hunters, with professional-grade utility for investors, contractors, realtors, appraisers, and inspectors.

## Primary Audience
- Hunters (primary)

## Secondary Audience
- Investors
- Contractors
- Realtors
- Appraisers
- Home inspectors

## Core Problems
1. Unclear parcel boundaries in the field
2. Slow parcel context lookup
3. Weak offline workflows
4. Poor cross-audience map sharing

## MVP Features
1. Interactive mobile map
2. Local GeoJSON parcel layer
3. Parcel tap -> detail card
4. Layer toggles (satellite/topo/parcels)
5. Waypoints with notes/photos
6. Offline saved areas
7. Read-only share links

## Non-goals
- Full enterprise CRM
- Full appraisal report automation
- Nationwide premium data integrations on day 1

## Success Metrics
- P50 map load < 2.5s on LTE
- Parcel lookup < 1s
- 70%+ users create first waypoint
- Crash-free sessions > 99%

## Risks
- Large GeoJSON performance issues
- Data quality inconsistency by county
- Offline cache size growth

## Mitigations
- Switch to vector tiles for heavy counties
- Normalize import schema + validation scripts
- AOI-based offline packs
