"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    let canceled = false;

    async function boot() {
      if (!mapContainerRef.current || mapRef.current) return;

      await loadGoogleMaps(apiKey);
      if (canceled || !mapContainerRef.current || !window.google?.maps) return;

      mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: 39.8283, lng: -98.5795 },
        zoom: 4,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false
      });

      onMapReady?.();
    }

    boot().catch(console.error);

    return () => {
      canceled = true;
      mapRef.current = null;
    };
  }, [apiKey, onMapReady]);

  return <div ref={mapContainerRef} className="map-wrap" />;
}
