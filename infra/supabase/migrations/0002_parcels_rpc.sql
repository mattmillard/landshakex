-- LandShakeX parcel spatial RPCs for API routes
create extension if not exists postgis;

create or replace function public.get_parcel_by_point(
  p_lng double precision,
  p_lat double precision
)
returns table (
  id bigint,
  apn text,
  owner_name text,
  acreage numeric,
  county text,
  state text,
  land_use text,
  zoning text,
  assessed_value numeric,
  metadata jsonb
)
language sql
stable
as $$
  select
    p.id,
    p.apn,
    p.owner_name,
    p.acreage,
    p.county,
    p.state,
    p.land_use,
    p.zoning,
    p.assessed_value,
    p.metadata
  from public.parcels p
  where st_intersects(
    p.geom,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  )
  limit 1;
$$;

create or replace function public.get_parcels_by_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_limit integer default 1000
)
returns table (
  id bigint,
  apn text,
  owner_name text,
  acreage numeric,
  county text,
  state text,
  land_use text,
  zoning text,
  assessed_value numeric,
  metadata jsonb
)
language sql
stable
as $$
  select
    p.id,
    p.apn,
    p.owner_name,
    p.acreage,
    p.county,
    p.state,
    p.land_use,
    p.zoning,
    p.assessed_value,
    p.metadata
  from public.parcels p
  where st_intersects(
    p.geom,
    st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
  )
  order by p.id
  limit greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;
