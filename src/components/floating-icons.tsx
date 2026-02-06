"use client";

import { useTheme } from "./theme-provider";
import { clsx } from "clsx";

const BaseLogo = () => (
  <svg viewBox="0 0 111 111" fill="currentColor" className="w-full h-full">
    <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" />
  </svg>
);

const RobotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <circle cx="9" cy="14" r="1.5" fill="currentColor" />
    <circle cx="15" cy="14" r="1.5" fill="currentColor" />
    <path d="M12 2v4" />
    <path d="M8 8V6a4 4 0 0 1 8 0v2" />
    <path d="M1 12h2" />
    <path d="M21 12h2" />
  </svg>
);

const BlockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const HexIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z" />
  </svg>
);

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" />
  </svg>
);

const ClawIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
  </svg>
);

interface FloatingItem {
  icon: "base" | "robot" | "lobster" | "block" | "hex" | "spark" | "claw";
  size: number;
  top: string;
  left: string;
  delay: number;
  duration: number;
}

const floatingItems: FloatingItem[] = [
  { icon: "robot", size: 40, top: "6%", left: "4%", delay: 0, duration: 18 },
  { icon: "base", size: 32, top: "12%", left: "82%", delay: 3, duration: 22 },
  { icon: "lobster", size: 44, top: "30%", left: "90%", delay: 7, duration: 16 },
  { icon: "hex", size: 28, top: "52%", left: "2%", delay: 10, duration: 20 },
  { icon: "block", size: 36, top: "68%", left: "86%", delay: 2, duration: 19 },
  { icon: "spark", size: 24, top: "20%", left: "42%", delay: 5, duration: 24 },
  { icon: "robot", size: 30, top: "78%", left: "12%", delay: 8, duration: 21 },
  { icon: "base", size: 38, top: "42%", left: "68%", delay: 12, duration: 17 },
  { icon: "lobster", size: 36, top: "10%", left: "28%", delay: 1, duration: 23 },
  { icon: "claw", size: 30, top: "60%", left: "48%", delay: 6, duration: 18 },
  { icon: "hex", size: 26, top: "88%", left: "72%", delay: 9, duration: 22 },
  { icon: "block", size: 28, top: "4%", left: "62%", delay: 4, duration: 25 },
  { icon: "spark", size: 22, top: "74%", left: "38%", delay: 11, duration: 20 },
  { icon: "claw", size: 34, top: "46%", left: "8%", delay: 14, duration: 19 },
];

function getIcon(type: FloatingItem["icon"]) {
  switch (type) {
    case "base": return <BaseLogo />;
    case "robot": return <RobotIcon />;
    case "lobster": return <span className="text-[1em] leading-none">🦞</span>;
    case "block": return <BlockIcon />;
    case "hex": return <HexIcon />;
    case "spark": return <SparkIcon />;
    case "claw": return <ClawIcon />;
  }
}

export function FloatingIcons() {
  const { theme } = useTheme();

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {floatingItems.map((item, i) => (
        <div
          key={i}
          className={clsx(
            "absolute",
            theme === "dark" ? "text-white" : "text-gray-800"
          )}
          style={{
            width: item.size,
            height: item.size,
            top: item.top,
            left: item.left,
            opacity: theme === "dark" ? 0.08 : 0.07,
            animation: `floating-icon ${item.duration}s ease-in-out ${item.delay}s infinite`,
          }}
        >
          {getIcon(item.icon)}
        </div>
      ))}
    </div>
  );
}
