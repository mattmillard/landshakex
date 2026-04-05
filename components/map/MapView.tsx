"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

const CENTER: [number, number] = [-98.5795, 39.8283];

const MAPLIBRE_STYLES: Record<"streets" | "satellite" | "hybrid", string> = {
  streets: "https://demotiles.maplibre.org/style.json",
  satellite: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  hybrid: "https://demotiles.maplibre.org/style.json"
};

type Props = {
  onMapReady?: () => void;
};

export default function MapView({ onMapReady }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [layer, setLayer] = useState<"streets" | "satellite" | "hybrid">("streets");

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAPLIBRE_STYLES[layer],
      center: CENTER,
      zoom: 3.6
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      onMapReady?.();
    });

    mapRef.current = map;

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          const lngLat: [number, number] = [coords.longitude, coords.latitude];

          if (!markerRef.current) {
            markerRef.current = new maplibregl.Marker({ color: "#22c55e" }).setLngLat(lngLat).addTo(map);
          } else {
            markerRef.current.setLngLat(lngLat);
          }

          map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 14), duration: 700 });
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

    map.setStyle(MAPLIBRE_STYLES[layer]);
  }, [layer]);

  return (
    <>
      <div ref={mapContainerRef} className="map-wrap" />
      <div className="map-layer-picker">
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
    </>
  );
}
