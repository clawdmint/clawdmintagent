import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const title = searchParams.get("title") || "Clawdmint";
  const description = searchParams.get("desc") || "Where AI Agents Deploy. Humans Mint.";
  const agent = searchParams.get("agent") || "";
  const image = searchParams.get("image") || "";
  const minted = searchParams.get("minted") || "0";
  const supply = searchParams.get("supply") || "0";
  const price = searchParams.get("price") || "Free";
  const type = searchParams.get("type") || "default"; // "collection" | "default"

  if (type === "collection") {
    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)",
            position: "relative",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {/* Grid pattern overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.05,
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
              display: "flex",
            }}
          />

          {/* Gradient orbs */}
          <div
            style={{
              position: "absolute",
              top: "-100px",
              right: "-100px",
              width: "400px",
              height: "400px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-50px",
              left: "-50px",
              width: "300px",
              height: "300px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)",
              display: "flex",
            }}
          />

          {/* Collection Image (left side) */}
          <div
            style={{
              width: "420px",
              height: "630px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {image ? (
              <img
                src={image}
                width={360}
                height={360}
                style={{
                  borderRadius: "24px",
                  objectFit: "cover",
                  border: "2px solid rgba(6,182,212,0.3)",
                  boxShadow: "0 0 60px rgba(6,182,212,0.15)",
                }}
              />
            ) : (
              <div
                style={{
                  width: "360px",
                  height: "360px",
                  borderRadius: "24px",
                  background: "linear-gradient(135deg, rgba(6,182,212,0.1), rgba(168,85,247,0.1))",
                  border: "2px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "120px",
                }}
              >
                🦞
              </div>
            )}
          </div>

          {/* Content (right side) */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "60px 60px 60px 20px",
            }}
          >
            {/* Agent badge */}
            {agent && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    background: "rgba(6,182,212,0.15)",
                    border: "1px solid rgba(6,182,212,0.3)",
                    borderRadius: "20px",
                    padding: "6px 16px",
                    fontSize: "16px",
                    color: "#06b6d4",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>🤖</span>
                  <span>{agent}</span>
                </div>
              </div>
            )}

            {/* Title */}
            <div
              style={{
                fontSize: "48px",
                fontWeight: 800,
                color: "white",
                lineHeight: 1.1,
                marginBottom: "16px",
                display: "flex",
              }}
            >
              {title.length > 30 ? title.slice(0, 30) + "..." : title}
            </div>

            {/* Description */}
            {description && (
              <div
                style={{
                  fontSize: "20px",
                  color: "#9ca3af",
                  lineHeight: 1.4,
                  marginBottom: "32px",
                  display: "flex",
                }}
              >
                {description.length > 80 ? description.slice(0, 80) + "..." : description}
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: "flex", gap: "24px", marginBottom: "32px" }}>
              {/* Price */}
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px",
                  padding: "16px 24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#06b6d4", display: "flex" }}>
                  {price}
                </div>
                <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px", display: "flex" }}>
                  PRICE
                </div>
              </div>

              {/* Progress */}
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px",
                  padding: "16px 24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: "24px", fontWeight: 700, color: "white", display: "flex" }}>
                  {minted}/{supply}
                </div>
                <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px", display: "flex" }}>
                  MINTED
                </div>
              </div>
            </div>

            {/* Branding */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "24px", display: "flex" }}>🦞</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "white", display: "flex" }}>
                  Clawdmint
                </div>
                <div style={{ fontSize: "13px", color: "#6b7280", display: "flex" }}>
                  Agent-Native NFT Launchpad on Base
                </div>
              </div>
            </div>
          </div>

          {/* Bottom accent */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: "linear-gradient(90deg, transparent, #06b6d4, #a855f7, transparent)",
              display: "flex",
            }}
          />
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  // Default OG image (homepage)
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)",
          position: "relative",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.05,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            display: "flex",
          }}
        />

        {/* Orbs */}
        <div
          style={{
            position: "absolute",
            top: "-150px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Logo */}
        <div style={{ fontSize: "100px", marginBottom: "20px", display: "flex" }}>🦞</div>

        {/* Title */}
        <div
          style={{
            fontSize: "72px",
            fontWeight: 800,
            background: "linear-gradient(135deg, #06b6d4, #a855f7, #ec4899)",
            backgroundClip: "text",
            color: "transparent",
            marginBottom: "16px",
            display: "flex",
          }}
        >
          Clawdmint
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "28px",
            color: "#9ca3af",
            marginBottom: "40px",
            display: "flex",
          }}
        >
          Where AI Agents Deploy. Humans Mint.
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: "16px" }}>
          <div
            style={{
              background: "rgba(59,130,246,0.1)",
              border: "1px solid rgba(59,130,246,0.3)",
              borderRadius: "20px",
              padding: "8px 20px",
              fontSize: "16px",
              color: "#60a5fa",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            ⬡ Built on Base
          </div>
          <div
            style={{
              background: "rgba(168,85,247,0.1)",
              border: "1px solid rgba(168,85,247,0.3)",
              borderRadius: "20px",
              padding: "8px 20px",
              fontSize: "16px",
              color: "#c084fc",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            ⚡ OpenClaw Compatible
          </div>
          <div
            style={{
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: "20px",
              padding: "8px 20px",
              fontSize: "16px",
              color: "#34d399",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            🛡 On-Chain Verified
          </div>
        </div>

        {/* Bottom accent */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "linear-gradient(90deg, transparent, #06b6d4, #a855f7, transparent)",
            display: "flex",
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
