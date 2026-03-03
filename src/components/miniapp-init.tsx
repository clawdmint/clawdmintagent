"use client";

import { useEffect } from "react";

export function MiniAppInit() {
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.parent !== window) {
        import("@farcaster/miniapp-sdk").then(({ sdk }) => {
          sdk.actions.ready();
        }).catch(() => {});
      }
    } catch {
      // not in a miniapp context
    }
  }, []);

  return null;
}
