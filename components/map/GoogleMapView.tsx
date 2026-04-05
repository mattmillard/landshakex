"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
  }
}

type Props = {
  apiKey: string;
  onMapReady?: () => void;
};

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js";

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }

    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps script")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });
}

export default function GoogleMapView({ apiKey, onMapReady }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | google.maps.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [mapTypeId, setMapTypeId] = useState<"roadmap" | "satellite" | "hybrid">("roadmap");

  useEffect(() => {
    let canceled = false;

    async function boot() {
      if (!mapContainerRef.current || mapRef.current) return;

      await loadGoogleMaps(apiKey);
      if (canceled || !mapContainerRef.current || !window.google?.maps) return;

      mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: 39.8283, lng: -98.5795 },
        zoom: 4,
        mapTypeId: "roadmap",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      onMapReady?.();

      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          ({ coords }) => {
            const pos = { lat: coords.latitude, lng: coords.longitude };
            const map = mapRef.current;
            if (!map) return;

            if (!markerRef.current) {
              markerRef.current = new window.google!.maps.Marker({
                position: pos,
                map,
                title: "You"
              });
            } else if ("setPosition" in markerRef.current) {
              markerRef.current.setPosition(pos);
            }

            map.panTo(pos);
            if ((map.getZoom() ?? 4) < 14) {
              map.setZoom(14);
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
    }

    boot().catch(console.error);

    return () => {
      canceled = true;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey, onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMapTypeId(mapTypeId);
  }, [mapTypeId]);

  return (
    <>
      <div ref={mapContainerRef} className="map-wrap" />
      <div className="map-layer-picker">
        <button className={mapTypeId === "roadmap" ? "active" : ""} onClick={() => setMapTypeId("roadmap")}>
          Streets
        </button>
        <button className={mapTypeId === "satellite" ? "active" : ""} onClick={() => setMapTypeId("satellite")}>
          Satellite
        </button>
        <button className={mapTypeId === "hybrid" ? "active" : ""} onClick={() => setMapTypeId("hybrid")}>
          Hybrid
        </button>
      </div>
    </>
  );
}
