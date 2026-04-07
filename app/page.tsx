"use client";

import MapView from "@/components/map/MapView";
import AuthPanel from "@/components/auth/AuthPanel";

export default function HomePage() {
  return (
    <main>
      <AuthPanel />
      <MapView />
    </main>
  );
}
