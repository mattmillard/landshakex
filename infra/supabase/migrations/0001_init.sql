-- LandShakeX initial schema
create extension if not exists postgis;

-- Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text default 'hunter',
  created_at timestamptz default now()
);

-- Parcels
create table if not exists parcels (
  id bigserial primary key,
  source_dataset text not null,
  apn text,
  county text,
  state text,
  owner_name text,
  acreage numeric,
  land_use text,
  zoning text,
  assessed_value numeric,
  centroid geography(point, 4326),
  geom geometry(multipolygon, 4326) not null,
  metadata jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create index if not exists parcels_geom_gix on parcels using gist (geom);
create index if not exists parcels_centroid_gix on parcels using gist (centroid);
create index if not exists parcels_apn_idx on parcels (apn);
create index if not exists parcels_owner_idx on parcels using gin (to_tsvector('english', coalesce(owner_name, '')));

-- Optional parcel history
create table if not exists parcel_history (
  id bigserial primary key,
  parcel_id bigint references parcels(id) on delete cascade,
  snapshot_date date not null,
  owner_name text,
  assessed_value numeric,
  metadata jsonb default '{}'::jsonb
);

-- Waypoints
create table if not exists waypoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  notes text,
  category text,
  location geography(point, 4326) not null,
  photo_urls text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists waypoints_loc_gix on waypoints using gist (location);
create index if not exists waypoints_user_idx on waypoints (user_id);

-- Tracks
create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  path geometry(linestring, 4326),
  distance_m numeric,
  metadata jsonb default '{}'::jsonb
);

create index if not exists tracks_path_gix on tracks using gist (path);
create index if not exists tracks_user_idx on tracks (user_id);

-- Offline saved areas
create table if not exists saved_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  bbox geometry(polygon, 4326) not null,
  zoom_min int default 10,
  zoom_max int default 16,
  created_at timestamptz default now()
);

create index if not exists saved_areas_bbox_gix on saved_areas using gist (bbox);

-- Share links
create table if not exists map_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text unique not null,
  title text,
  payload jsonb not null,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- RLS baseline
alter table profiles enable row level security;
alter table waypoints enable row level security;
alter table tracks enable row level security;
alter table saved_areas enable row level security;
alter table map_shares enable row level security;

-- Policies: owner-only user data
create policy if not exists profiles_owner_select on profiles
  for select using (auth.uid() = id);

create policy if not exists profiles_owner_update on profiles
  for update using (auth.uid() = id);

create policy if not exists waypoints_owner_all on waypoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists tracks_owner_all on tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists saved_areas_owner_all on saved_areas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists map_shares_owner_all on map_shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Parcels table is read-only in MVP via server role (no direct anon writes).
