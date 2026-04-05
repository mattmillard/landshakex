"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

const CENTER: [number, number] = [-98.5795, 39.8283];
const PARCEL_SOURCE_ID = "parcels";
const PARCEL_FILL_LAYER_ID = "parcels-fill";
const PARCEL_LINE_LAYER_ID = "parcels-line";

const STREETS_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Tiles © Esri"
    }
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }]
} as const;

const HYBRID_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Tiles © Esri"
    },
    labels: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Labels © Esri"
    }
  },
  layers: [
    { id: "satellite", type: "raster", source: "satellite" },
    { id: "labels", type: "raster", source: "labels" }
  ]
} as const;

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
};

async function fetchParcelFeatureCollection(bounds: maplibregl.LngLatBounds): Promise<GeoJSON.FeatureCollection | null> {
  const params = new URLSearchParams({
    minLng: String(bounds.getWest()),
    minLat: String(bounds.getSouth()),
    maxLng: String(bounds.getEast()),
    maxLat: String(bounds.getNorth()),
    limit: "5000"
  });

  const res = await fetch(`/api/parcels/bbox?${params.toString()}`);
  if (!res.ok) return null;
  const payload = await res.json();
  const fc = payload?.featureCollection;
  if (!fc || !Array.isArray(fc.features)) return null;
  return fc as GeoJSON.FeatureCollection;
}

function normalizeParcelProps(raw: Record<string, unknown>): ParcelFeatureProps {
  return {
    id: typeof raw.id === "number" ? raw.id : Number(raw.id),
    apn: typeof raw.apn === "string" ? raw.apn : undefined,
    owner_name: typeof raw.owner_name === "string" ? raw.owner_name : undefined,
    acreage: typeof raw.acreage === "number" ? raw.acreage : Number(raw.acreage),
    county: typeof raw.county === "string" ? raw.county : undefined,
    state: typeof raw.state === "string" ? raw.state : undefined
  };
}

export default function MapView({ onMapReady }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const headingRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const parcelFetchPendingRef = useRef(false);

  const [layer, setLayer] = useState<"streets" | "satellite" | "hybrid">("satellite");
  const targetRef = useRef<[number, number] | null>(null);
  const smoothingTimerRef = useRef<number | null>(null);
  const hasCenteredRef = useRef(false);
  const [followUser, setFollowUser] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeatureProps | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: SATELLITE_STYLE as unknown as maplibregl.StyleSpecification,
      center: CENTER,
      zoom: 3.6,
      maxZoom: 19
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const deviceOrientationHandler = (event: DeviceOrientationEvent) => {
      const anyEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const hasWebkitHeading = typeof anyEvent.webkitCompassHeading === "number";

      if (hasWebkitHeading) {
        headingRef.current = anyEvent.webkitCompassHeading as number;
      } else if (typeof event.alpha === "number") {
        headingRef.current = (360 - event.alpha + 360) % 360;
      }
    };

    if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", deviceOrientationHandler, true);
    }

    const ensureParcelLayer = () => {
      if (!map.getSource(PARCEL_SOURCE_ID)) {
        map.addSource(PARCEL_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] }
        });
      }

      if (!map.getLayer(PARCEL_FILL_LAYER_ID)) {
        map.addLayer({
          id: PARCEL_FILL_LAYER_ID,
          type: "fill",
          source: PARCEL_SOURCE_ID,
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "conservation_class"], "federal"],
              "#3b82f6",
              ["==", ["get", "conservation_class"], "state"],
              "#f59e0b",
              "#22c55e"
            ],
            "fill-opacity": [
              "case",
              ["==", ["get", "conservation_class"], "federal"],
              0.2,
              ["==", ["get", "conservation_class"], "state"],
              0.14,
              0.04
            ]
          }
        });
      }

      if (!map.getLayer(PARCEL_LINE_LAYER_ID)) {
        map.addLayer({
          id: PARCEL_LINE_LAYER_ID,
          type: "line",
          source: PARCEL_SOURCE_ID,
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "conservation_class"], "federal"],
              "#60a5fa",
              ["==", ["get", "conservation_class"], "state"],
              "#fbbf24",
              "#22c55e"
            ],
            "line-width": 1.2,
            "line-opacity": 0.95
          }
        });
      }
    };

    const refreshParcels = async () => {
      if (map.getZoom() < 13) {
        const source = map.getSource(PARCEL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      if (parcelFetchPendingRef.current) return;
      const source = map.getSource(PARCEL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      parcelFetchPendingRef.current = true;
      try {
        const bounds = map.getBounds();
        const fc = await fetchParcelFeatureCollection(bounds);
        if (fc) source.setData(fc);
      } catch {
        // no-op
      } finally {
        parcelFetchPendingRef.current = false;
      }
    };

    map.on("style.load", () => {
      ensureParcelLayer();
      void refreshParcels();
    });

    map.on("moveend", () => {
      void refreshParcels();
    });

    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [PARCEL_FILL_LAYER_ID] });
      const feat = features[0];
      if (!feat?.properties) return;
      setSelectedParcel(normalizeParcelProps(feat.properties as Record<string, unknown>));
    });

    map.on("mousemove", (e) => {
      const hasFeature = map.queryRenderedFeatures(e.point, { layers: [PARCEL_FILL_LAYER_ID] }).length > 0;
      map.getCanvas().style.cursor = hasFeature ? "pointer" : "";
    });

    map.on("load", () => {
      onMapReady?.();
      ensureParcelLayer();
      void refreshParcels();
    });

    mapRef.current = map;

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          const lngLat: [number, number] = [coords.longitude, coords.latitude];
          targetRef.current = lngLat;

          if (!markerRef.current) {
            const el = document.createElement("div");
            el.className = "user-pin";
            el.innerHTML = '<div class="user-pin-pulse"></div><div class="user-pin-core"></div><div class="user-pin-heading"></div>';
            markerRef.current = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
          }

          if (!hasCenteredRef.current) {
            map.easeTo({ center: lngLat, zoom: 14, duration: 900 });
            hasCenteredRef.current = true;
            setFollowUser(false);
          }
        },
        () => undefined,
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000
        }
      );
    }

    return () => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
        window.removeEventListener("deviceorientation", deviceOrientationHandler, true);
      }

      if (smoothingTimerRef.current !== null) {
        window.clearInterval(smoothingTimerRef.current);
      }

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }

      map.remove();
      mapRef.current = null;
    };
  }, [onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const tick = () => {
      const target = targetRef.current;
      const marker = markerRef.current;
      if (!target || !marker) return;

      const current = marker.getLngLat();
      const easedLng = current.lng + (target[0] - current.lng) * 0.18;
      const easedLat = current.lat + (target[1] - current.lat) * 0.18;
      const eased: [number, number] = [easedLng, easedLat];
      marker.setLngLat(eased);

      const headingEl = marker.getElement().querySelector(".user-pin-heading") as HTMLDivElement | null;
      if (headingEl) {
        headingEl.style.transform = `translate(-50%, calc(-100% - 0.625rem)) rotate(${headingRef.current}deg)`;
      }

      if (followUser) {
        const center = map.getCenter();
        const centerLng = center.lng + (easedLng - center.lng) * 0.1;
        const centerLat = center.lat + (easedLat - center.lat) * 0.1;
        map.easeTo({ center: [centerLng, centerLat], duration: 250, essential: true });
      }
    };

    smoothingTimerRef.current = window.setInterval(tick, 120);

    return () => {
      if (smoothingTimerRef.current !== null) {
        window.clearInterval(smoothingTimerRef.current);
      }
    };
  }, [followUser]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layer === "streets") {
      map.setStyle(STREETS_STYLE);
    } else if (layer === "satellite") {
      map.setStyle(SATELLITE_STYLE as unknown as maplibregl.StyleSpecification);
    } else {
      map.setStyle(HYBRID_STYLE as unknown as maplibregl.StyleSpecification);
    }
  }, [layer]);

  return (
    <>
      <div ref={mapContainerRef} className="map-wrap" />
      <div className="map-layer-picker">
        <button className={followUser ? "active" : ""} onClick={() => setFollowUser((v) => !v)}>
          {followUser ? "Following" : "Follow Me"}
        </button>
        <button className={layer === "streets" ? "active" : ""} onClick={() => setLayer("streets")}>
          Streets
        </button>
        <button className={layer === "satellite" ? "active" : ""} onClick={() => setLayer("satellite")}>
          Satellite
        </button>
        <button className={layer === "hybrid" ? "active" : ""} onClick={() => setLayer("hybrid")}>
          Hybrid
        </button>
      </div>

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
              <strong>{typeof selectedParcel.acreage === "number" && !Number.isNaN(selectedParcel.acreage) ? selectedParcel.acreage.toFixed(2) : "—"}</strong>
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
