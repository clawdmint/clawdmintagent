"use client";

import { createContext, useContext } from "react";

const CpegSiteContext = createContext(false);

/** Whether the HTTP request was served on the configured cPEG subdomain (middleware + header). */
export function CpegSiteProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return <CpegSiteContext.Provider value={value}>{children}</CpegSiteContext.Provider>;
}

export function useCpegSite(): boolean {
  return useContext(CpegSiteContext);
}
