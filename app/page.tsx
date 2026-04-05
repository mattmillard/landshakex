"use client";

import { useMemo } from "react";
import MapView from "@/components/map/MapView";
import GoogleMapView from "@/components/map/GoogleMapView";
import { env } from "@/lib/env";

export default function HomePage() {
  const hasGoogleKey = useMemo(() => Boolean(env.googleMapsApiKey), []);

  return (
    <main>
      {hasGoogleKey ? <GoogleMapView apiKey={env.googleMapsApiKey!} /> : <MapView />}

      <section className="bottom-sheet" style={{ maxWidth: 720, margin: "0 auto", borderRadius: "12px 12px 0 0" }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.1, textTransform: "uppercase", opacity: 0.75 }}>
          LandShakeX
        </p>
        <h2 style={{ margin: "8px 0 6px", fontSize: 20 }}>Live Parcel Map</h2>
        <p style={{ margin: 0, opacity: 0.9, fontSize: 14, lineHeight: 1.4 }}>
          Location tracking is on when permission is granted. Use Streets, Satellite, or Hybrid from the map.
        </p>
      </section>
    </main>
  );
}
