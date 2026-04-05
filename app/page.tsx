export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
        background:
          "radial-gradient(1200px 600px at 80% -10%, rgba(34,197,94,0.12), transparent 60%), #0a0f1a"
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 860,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: "28px 24px",
          background: "rgba(18,26,43,0.75)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)"
        }}
      >
        <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.1, textTransform: "uppercase", opacity: 0.75 }}>
          LandShakeX
        </p>

        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(34px, 6vw, 56px)", lineHeight: 1.05 }}>
          Scout land faster.
          <br />
          Move smarter in the field.
        </h1>

        <p style={{ margin: 0, maxWidth: 680, opacity: 0.92, fontSize: 17, lineHeight: 1.55 }}>
          LandShakeX is a mobile-first parcel intelligence platform for hunters. Discover ownership,
          boundaries, access context, and waypoints from one map-first workflow designed for real terrain.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
          {[
            "Parcel lookup",
            "Tap-to-detail cards",
            "Waypoint notes + photos",
            "Offline field areas",
            "Shareable read-only links"
          ].map((item) => (
            <span
              key={item}
              style={{
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.04)"
              }}
            >
              {item}
            </span>
          ))}
        </div>

        <div style={{ marginTop: 26, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              border: 0,
              borderRadius: 10,
              padding: "11px 16px",
              fontWeight: 700,
              background: "#22c55e",
              color: "#04130a",
              cursor: "pointer"
            }}
          >
            Get early access
          </button>
          <button
            type="button"
            style={{
              borderRadius: 10,
              padding: "10px 15px",
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer"
            }}
          >
            View product brief
          </button>
        </div>
      </section>
    </main>
  );
}
