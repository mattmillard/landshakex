"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { env } from "@/lib/env";

type Props = {
  onMapReady?: () => void;
};

export default function MapView({ onMapReady }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: env.maptilerStyleUrl,
      center: [-98.5795, 39.8283],
      zoom: 3.6
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      onMapReady?.();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onMapReady]);

  return <div ref={mapContainerRef} className="map-wrap" />;
}
