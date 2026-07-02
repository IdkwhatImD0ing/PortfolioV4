import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Bill Zhang — voice-driven AI portfolio at art3m1s.me";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(circle at 20% 20%, rgba(162,89,255,0.25), transparent 50%), radial-gradient(circle at 80% 80%, rgba(232,121,249,0.20), transparent 60%), linear-gradient(135deg, #07060d 0%, #0c0a17 100%)",
          padding: "72px",
          color: "#ece9f4",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            fontSize: "22px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#c084fc",
          }}
        >
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "999px",
              background: "#e879f9",
              boxShadow: "0 0 22px #e879f9",
            }}
          />
          <span>art3m1s.me</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div
            style={{
              fontSize: "144px",
              fontWeight: 600,
              letterSpacing: "-0.05em",
              lineHeight: 0.9,
              color: "#ece9f4",
            }}
          >
            Bill Zhang
          </div>
          <div
            style={{
              fontSize: "52px",
              fontStyle: "italic",
              letterSpacing: "-0.02em",
              backgroundImage: "linear-gradient(135deg, #a259ff 0%, #e879f9 70%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Talk to my portfolio.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: "22px",
            color: "#b9b3cc",
          }}
        >
          <span>Applied AI Engineer · Scale AI</span>
          <span style={{ color: "#6c6885" }}>Voice-driven portfolio · 2026</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
