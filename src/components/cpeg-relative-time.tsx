"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/cpeg-ui";

interface CpegRelativeTimeProps {
  iso: string;
  className?: string;
}

export function CpegRelativeTime({ iso, className }: CpegRelativeTimeProps) {
  const [label, setLabel] = useState(() => formatRelativeTime(iso));

  useEffect(() => {
    setLabel(formatRelativeTime(iso));
    const interval = setInterval(() => {
      setLabel(formatRelativeTime(iso));
    }, 30_000);
    return () => clearInterval(interval);
  }, [iso]);

  return <span className={className}>{label}</span>;
}
