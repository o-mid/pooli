import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const runtime = "edge";
export const alt = "Pooli";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background: "#F4F7F5",
          color: "#0E1512",
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 24,
          }}
        >
          {siteConfig.name}
        </div>
        <div style={{ fontSize: 32, maxWidth: 900, lineHeight: 1.25, color: "#3D4A45" }}>
          {siteConfig.tagline.en}
        </div>
      </div>
    ),
    { ...size },
  );
}
