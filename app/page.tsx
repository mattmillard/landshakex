"use client";

import { useMemo } from "react";
import MapView from "@/components/map/MapView";
import GoogleMapView from "@/components/map/GoogleMapView";
import { env } from "@/lib/env";

export default function HomePage() {
  const hasGoogleKey = useMemo(() => Boolean(env.googleMapsApiKey), []);

  return <main>{hasGoogleKey ? <GoogleMapView apiKey={env.googleMapsApiKey!} /> : <MapView />}</main>;
}
