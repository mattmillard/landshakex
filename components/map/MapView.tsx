"use client";

import { useEffect, useRef, useState } from "react";

const CENTER: [number, number] = [39.8283, -98.5795];
const WAYPOINT_STORAGE_KEY = "landshakex:waypoint:v2";
const LONG_PRESS_MS = 350;

type Props = {
  onMapReady?: () => void;
};

type ParcelFeatureProps = {
  id?: number;
  apn?: string;
  owner_name?: string;
  acreage?: number;
  county?: string;
  state?: string;
  conservation_class?: "federal" | "state" | null;
};

type WaypointStyle = {
  color: string;
  icon: string;
};

type Waypoint = {
  lat: number;
  lng: number;
  name: string;
  style: WaypointStyle;
};

const WAYPOINT_COLORS = ["#ff3b1a", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"];
const WAYPOINT_ICONS = ["✖", "🎯", "⛳", "🦃", "🗼", "＋"];

async function fetchParcelFeatureCollection(
  bounds: import("leaflet").LatLngBounds,
  options?: { conservationOnly?: boolean; limit?: number }
): Promise<GeoJSON.FeatureCollection | null> {
  const params = new URLSearchParams({
    minLng: String(bounds.getWest()),
    minLat: String(bounds.getSouth()),
    maxLng: String(bounds.getEast()),
    maxLat: String(bounds.getNorth()),
    limit: String(options?.limit ?? 6000)
  });

  if (options?.conservationOnly) params.set("conservationOnly", "1");

  const res = await fetch(`/api/parcels/bbox?${params.toString()}`);
  if (!res.ok) return null;
  const payload = await res.json();
  const fc = payload?.featureCollection;
  if (!fc || !Array.isArray(fc.features)) return null;
  return fc as GeoJSON.FeatureCollection;
}

function normalizeParcelProps(raw: Record<string, unknown>): ParcelFeatureProps {
  const acreage = typeof raw.acreage === "number" ? raw.acreage : Number(raw.acreage);
  return {
    id: typeof raw.id === "number" ? raw.id : Number(raw.id),
    apn: typeof raw.apn === "string" ? raw.apn : undefined,
    owner_name: typeof raw.owner_name === "string" ? raw.owner_name : undefined,
    acreage: Number.isFinite(acreage) ? acreage : undefined,
    county: typeof raw.county === "string" ? raw.county : undefined,
    state: typeof raw.state === "string" ? raw.state : undefined,
    conservation_class:
      raw.conservation_class === "federal" || raw.conservation_class === "state"
        ? raw.conservation_class
        : null
  };
}

function styleByConservation(c: ParcelFeatureProps["conservation_class"]) {
  if (c === "federal") return { color: "#60a5fa", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.22 };
  if (c === "state") return { color: "#fbbf24", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.2 };
  return { color: "#22c55e", weight: 1, fillColor: "#22c55e", fillOpacity: 0.04 };
}

function makeDefaultWaypoint(lat: number, lng: number): Waypoint {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `Waypoint ${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${String(now.getFullYear()).slice(-2)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    lat,
    lng,
    name,
    style: {
      color: WAYPOINT_COLORS[0],
      icon: WAYPOINT_ICONS[0]
    }
  };
}

export default function MapView({ onMapReady }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  const parcelLayerRef = useRef<import("leaflet").GeoJSON | null>(null);
  const conservationLayerRef = useRef<import("leaflet").GeoJSON | null>(null);
  const streetLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const satelliteLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const labelsLayerRef = useRef<import("leaflet").TileLayer | null>(null);

  const userMarkerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const waypointMarkerRef = useRef<import("leaflet").Marker | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const smoothingTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const hasCenteredRef = useRef(false);
  const fetchPendingRef = useRef(false);
  const targetRef = useRef<[number, number] | null>(null);

  const [layer, setLayer] = useState<"streets" | "satellite" | "hybrid">("satellite");
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeatureProps | null>(null);
  const [waypoint, setWaypoint] = useState<Waypoint | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!mapContainerRef.current || mapRef.current) return;

      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (!active || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView(CENTER, 4);
      L.control.zoom({ position: "topright" }).addTo(map);

      streetLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap contributors"
      });
      satelliteLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, attribution: "Tiles &copy; Esri" }
      );
      labelsLayerRef.current = L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, attribution: "Labels &copy; Esri" }
      );
      satelliteLayerRef.current.addTo(map);

      const clearLayer = (r: React.MutableRefObject<import("leaflet").GeoJSON | null>) => {
        if (r.current) {
          map.removeLayer(r.current);
          r.current = null;
        }
      };

      const persistWaypoint = (next: Waypoint | null) => {
        if (typeof window === "undefined") return;
        if (!next) window.localStorage.removeItem(WAYPOINT_STORAGE_KEY);
        else window.localStorage.setItem(WAYPOINT_STORAGE_KEY, JSON.stringify(next));
      };

      const upsertWaypointMarker = (next: Waypoint) => {
        const icon = L.divIcon({
          className: "user-drop-pin-wrap",
          html: `<div class="user-drop-pin" style="background:${next.style.color}"><div class="user-drop-pin-icon">${next.style.icon}</div></div>`,
          iconSize: [34, 42],
          iconAnchor: [17, 40]
        });

        if (!waypointMarkerRef.current) {
          waypointMarkerRef.current = L.marker([next.lat, next.lng], { icon, draggable: false }).addTo(map);
          waypointMarkerRef.current.on("click", () => setEditorOpen(true));
        } else {
          waypointMarkerRef.current.setIcon(icon);
          waypointMarkerRef.current.setLatLng([next.lat, next.lng]);
        }
      };

      const setWaypointAt = (lat: number, lng: number) => {
        const next = makeDefaultWaypoint(lat, lng);
        setWaypoint(next);
        persistWaypoint(next);
        upsertWaypointMarker(next);
        setEditorOpen(true);
      };

      const refreshParcels = async () => {
        if (fetchPendingRef.current) return;
        fetchPendingRef.current = true;

        try {
          const zoom = map.getZoom();

          if (zoom < 12) {
            clearLayer(parcelLayerRef);
          } else {
            const fc = await fetchParcelFeatureCollection(map.getBounds(), { limit: 6000 });
            clearLayer(parcelLayerRef);
            if (fc) {
              parcelLayerRef.current = L.geoJSON(fc as GeoJSON.GeoJsonObject, {
                style: () => ({ color: "#22c55e", weight: 1, fillColor: "#22c55e", fillOpacity: 0.04 }),
                onEachFeature: (feature: GeoJSON.Feature, lyr: import("leaflet").Layer) => {
                  lyr.on("click", () => {
                    const props = normalizeParcelProps((feature.properties || {}) as Record<string, unknown>);
                    setSelectedParcel(props);
                  });
                }
              }).addTo(map);
            }
          }

          if (zoom < 10) {
            clearLayer(conservationLayerRef);
          } else {
            const conservationFc = await fetchParcelFeatureCollection(map.getBounds(), {
              conservationOnly: true,
              limit: 12000
            });
            clearLayer(conservationLayerRef);
            if (conservationFc) {
              conservationLayerRef.current = L.geoJSON(conservationFc as GeoJSON.GeoJsonObject, {
                style: (feature?: GeoJSON.Feature) => {
                  const props = normalizeParcelProps((feature?.properties || {}) as Record<string, unknown>);
                  return styleByConservation(props.conservation_class);
                },
                onEachFeature: (feature: GeoJSON.Feature, lyr: import("leaflet").Layer) => {
                  lyr.on("click", () => {
                    const props = normalizeParcelProps((feature.properties || {}) as Record<string, unknown>);
                    setSelectedParcel(props);
                  });
                }
              }).addTo(map);
            }
          }
        } finally {
          fetchPendingRef.current = false;
        }
      };

      map.on("moveend zoomend", () => {
        void refreshParcels();
      });

      const startLongPress = (e: import("leaflet").LeafletMouseEvent) => {
        if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = window.setTimeout(() => {
          setWaypointAt(e.latlng.lat, e.latlng.lng);
          longPressTimerRef.current = null;
        }, LONG_PRESS_MS);
      };
      const cancelLongPress = () => {
        if (longPressTimerRef.current !== null) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      };

      map.on("mousedown", (e) => startLongPress(e as import("leaflet").LeafletMouseEvent));
      map.on("touchstart", (e) => startLongPress(e as import("leaflet").LeafletMouseEvent));
      map.on("mouseup", cancelLongPress);
      map.on("touchend", cancelLongPress);
      map.on("mouseout", cancelLongPress);
      map.on("dragstart", cancelLongPress);
      map.on("zoomstart", cancelLongPress);

      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(WAYPOINT_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Waypoint;
            if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
              setWaypoint(parsed);
              upsertWaypointMarker(parsed);
            }
          }
        } catch {
          // no-op
        }
      }

      void refreshParcels();
      onMapReady?.();
      mapRef.current = map;

      if (typeof navigator !== "undefined" && navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          ({ coords }) => {
            const lngLat: [number, number] = [coords.longitude, coords.latitude];
            targetRef.current = lngLat;

            if (!userMarkerRef.current) {
              userMarkerRef.current = L.circleMarker([lngLat[1], lngLat[0]], {
                radius: 7,
                color: "#04130a",
                weight: 2,
                fillColor: "#22c55e",
                fillOpacity: 0.95
              }).addTo(map);
            }

            if (!hasCenteredRef.current) {
              map.setView([lngLat[1], lngLat[0]], 14, { animate: true });
              hasCenteredRef.current = true;
            }
          },
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
      }
    };

    void run();

    return () => {
      active = false;
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (smoothingTimerRef.current !== null) window.clearInterval(smoothingTimerRef.current);
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      userMarkerRef.current = null;
      waypointMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const streets = streetLayerRef.current;
    const satellite = satelliteLayerRef.current;
    const labels = labelsLayerRef.current;

    if (streets) map.removeLayer(streets);
    if (satellite) map.removeLayer(satellite);
    if (labels) map.removeLayer(labels);

    if (layer === "streets") {
      streets?.addTo(map);
    } else if (layer === "satellite") {
      satellite?.addTo(map);
    } else {
      satellite?.addTo(map);
      labels?.addTo(map);
    }
  }, [layer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const tick = () => {
      const target = targetRef.current;
      const marker = userMarkerRef.current;
      if (!target || !marker) return;

      const current = marker.getLatLng();
      const easedLat = current.lat + (target[1] - current.lat) * 0.18;
      const easedLng = current.lng + (target[0] - current.lng) * 0.18;
      marker.setLatLng([easedLat, easedLng]);
    };

    smoothingTimerRef.current = window.setInterval(tick, 120);
    return () => {
      if (smoothingTimerRef.current !== null) window.clearInterval(smoothingTimerRef.current);
    };
  }, []);

  const saveWaypointEdits = (next: Waypoint) => {
    setWaypoint(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WAYPOINT_STORAGE_KEY, JSON.stringify(next));
    }

    const marker = waypointMarkerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;

    import("leaflet").then(({ default: L }) => {
      const icon = L.divIcon({
        className: "user-drop-pin-wrap",
        html: `<div class="user-drop-pin" style="background:${next.style.color}"><div class="user-drop-pin-icon">${next.style.icon}</div></div>`,
        iconSize: [34, 42],
        iconAnchor: [17, 40]
      });
      marker.setIcon(icon);
      marker.setLatLng([next.lat, next.lng]);
    });
  };

  return (
    <>
      <div ref={mapContainerRef} className="map-wrap no-text-select" />

      <div className="waypoint-topbar">
        <button className="waypoint-top-btn">Cancel</button>
        <div className="waypoint-top-title">Add Waypoint</div>
        <button className="waypoint-top-btn waypoint-top-save">Save</button>
      </div>

      <div className="map-layer-picker">
        <button className={layer === "streets" ? "active" : ""} onClick={() => setLayer("streets")}>
          Street View
        </button>
        <button className={layer === "satellite" ? "active" : ""} onClick={() => setLayer("satellite")}>
          Satellite
        </button>
        <button className={layer === "hybrid" ? "active" : ""} onClick={() => setLayer("hybrid")}>
          Hybrid
        </button>
      </div>

      {editorOpen && waypoint ? (
        <div className="waypoint-sheet">
          <div className="waypoint-grabber" />
          <label className="waypoint-label">Waypoint Name</label>
          <input
            className="waypoint-input"
            value={waypoint.name}
            onChange={(e) => saveWaypointEdits({ ...waypoint, name: e.target.value })}
          />

          <div className="waypoint-label" style={{ marginTop: 12 }}>Type</div>
          <div className="waypoint-sub">Recently Used</div>

          <div className="waypoint-style-row">
            {WAYPOINT_ICONS.map((icon) => {
              const active = waypoint.style.icon === icon;
              return (
                <button
                  key={`icon-${icon}`}
                  className={`waypoint-style-btn ${active ? "active" : ""}`}
                  onClick={() => saveWaypointEdits({ ...waypoint, style: { ...waypoint.style, icon } })}
                >
                  {icon}
                </button>
              );
            })}
          </div>

          <div className="waypoint-color-row">
            {WAYPOINT_COLORS.map((color) => {
              const active = waypoint.style.color === color;
              return (
                <button
                  key={`color-${color}`}
                  className={`waypoint-color-btn ${active ? "active" : ""}`}
                  style={{ background: color }}
                  onClick={() => saveWaypointEdits({ ...waypoint, style: { ...waypoint.style, color } })}
                />
              );
            })}
          </div>

          <div className="waypoint-actions">
            <button className="waypoint-save-btn" onClick={() => setEditorOpen(false)}>
              Save
            </button>
            <button
              className="waypoint-delete-btn"
              onClick={() => {
                setWaypoint(null);
                setEditorOpen(false);
                if (typeof window !== "undefined") window.localStorage.removeItem(WAYPOINT_STORAGE_KEY);
                if (waypointMarkerRef.current && mapRef.current) {
                  mapRef.current.removeLayer(waypointMarkerRef.current);
                  waypointMarkerRef.current = null;
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {selectedParcel ? (
        <div className="parcel-sheet">
          <div className="parcel-sheet-row">
            <div>
              <div className="parcel-sheet-eyebrow">Selected Parcel</div>
              <div className="parcel-sheet-title">{selectedParcel.apn || "Parcel"}</div>
            </div>
            <button className="parcel-sheet-close" onClick={() => setSelectedParcel(null)}>
              Close
            </button>
          </div>

          <div className="parcel-grid">
            <div>
              <span>Owner</span>
              <strong>{selectedParcel.owner_name || "—"}</strong>
            </div>
            <div>
              <span>Acreage</span>
              <strong>
                {typeof selectedParcel.acreage === "number" && !Number.isNaN(selectedParcel.acreage)
                  ? selectedParcel.acreage.toFixed(2)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>County</span>
              <strong>{selectedParcel.county || "—"}</strong>
            </div>
            <div>
              <span>State</span>
              <strong>{selectedParcel.state || "—"}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
