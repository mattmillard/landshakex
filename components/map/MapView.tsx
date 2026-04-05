"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

const CENTER: [number, number] = [-98.5795, 39.8283];

const STREETS_STYLE = "https://demotiles.maplibre.org/style.json";
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
  layers: [
    {
      id: "satellite",
      type: "raster",
      source: "satellite"
    }
  ]
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
    {
      id: "satellite",
      type: "raster",
      source: "satellite"
    },
    {
      id: "labels",
      type: "raster",
      source: "labels"
    }
  ]
} as const;

type Props = {
  onMapReady?: () => void;
};

export default function MapView({ onMapReady }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const headingRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const [layer, setLayer] = useState<"streets" | "satellite" | "hybrid">("streets");
  const targetRef = useRef<[number, number] | null>(null);
  const smoothingTimerRef = useRef<number | null>(null);
  const hasCenteredRef = useRef(false);
  const [followUser, setFollowUser] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [zoom, setZoom] = useState(3.6);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STREETS_STYLE,
      center: CENTER,
      zoom: 3.6
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const deviceOrientationHandler = (event: DeviceOrientationEvent) => {
      if (typeof event.alpha === "number") {
        headingRef.current = event.alpha;
      }
    };

    if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", deviceOrientationHandler, true);
    }

    map.on("zoom", () => {
      setZoom(Number(map.getZoom().toFixed(2)));
    });

    map.on("load", () => {
      onMapReady?.();
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
        headingEl.style.transform = `translate(-50%, -100%) rotate(${headingRef.current}deg)`;
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
        <button className={showDebug ? "active" : ""} onClick={() => setShowDebug((v) => !v)}>
          Debug
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
      {showDebug ? (
        <div className="map-debug-panel">
          <strong>Debug</strong>
          <div>Zoom: {zoom}</div>
          <div>Follow: {followUser ? "on" : "off"}</div>
          <div>Layer: {layer}</div>
        </div>
      ) : null}
    </>
  );
}
