"use client";

import { useEffect, useRef, useState } from "react";

const CENTER: [number, number] = [39.8283, -98.5795];

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
  if (c === "federal") {
    return { color: "#60a5fa", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.22 };
  }
  if (c === "state") {
    return { color: "#fbbf24", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.2 };
  }
  return { color: "#22c55e", weight: 1, fillColor: "#22c55e", fillOpacity: 0.04 };
}

export default function MapView({ onMapReady }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const parcelLayerRef = useRef<import("leaflet").GeoJSON | null>(null);
  const conservationLayerRef = useRef<import("leaflet").GeoJSON | null>(null);
  const streetLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const satelliteLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const labelsLayerRef = useRef<import("leaflet").TileLayer | null>(null);

  const [layer, setLayer] = useState<"streets" | "satellite" | "hybrid">("satellite");
  const [followUser, setFollowUser] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeatureProps | null>(null);

  const targetRef = useRef<[number, number] | null>(null);
  const markerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const smoothingTimerRef = useRef<number | null>(null);
  const hasCenteredRef = useRef(false);
  const fetchPendingRef = useRef(false);

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

          // Show conservation/federal/state farther out (double distance): z>=10.
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

      void refreshParcels();
      onMapReady?.();

      mapRef.current = map;

      if (typeof navigator !== "undefined" && navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          ({ coords }) => {
            const lngLat: [number, number] = [coords.longitude, coords.latitude];
            targetRef.current = lngLat;

            if (!markerRef.current) {
              markerRef.current = L.circleMarker([lngLat[1], lngLat[0]], {
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
              setFollowUser(false);
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
      if (smoothingTimerRef.current !== null) {
        window.clearInterval(smoothingTimerRef.current);
      }
      markerRef.current = null;
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
      const marker = markerRef.current;
      if (!target || !marker) return;

      const current = marker.getLatLng();
      const easedLat = current.lat + (target[1] - current.lat) * 0.18;
      const easedLng = current.lng + (target[0] - current.lng) * 0.18;
      marker.setLatLng([easedLat, easedLng]);

      if (followUser) {
        const center = map.getCenter();
        const centerLng = center.lng + (easedLng - center.lng) * 0.1;
        const centerLat = center.lat + (easedLat - center.lat) * 0.1;
        map.panTo([centerLat, centerLng], { animate: true });
      }
    };

    smoothingTimerRef.current = window.setInterval(tick, 120);
    return () => {
      if (smoothingTimerRef.current !== null) window.clearInterval(smoothingTimerRef.current);
    };
  }, [followUser]);

  return (
    <>
      <div ref={mapContainerRef} className="map-wrap" />
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
