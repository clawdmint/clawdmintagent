"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownUp, ArrowUpRight, Flame, Layers, Sparkles, Zap } from "lucide-react";

interface CpegBondingCurveProps {
  tokenMint: string;
}

interface StateResponse {
  success: boolean;
  launch?: {
    symbol: string;
    agent_token_symbol?: string | null;
    cluster: string;
    decimals: number;
    token_supply_raw: string;
    peg_unit_raw: string;
    max_pegs: number;
    effective_max_pegs: number;
    available_capacity: number;
    owned_assets: number;
    pool_assets: number;
    total_assets: number;
    vault_token_balance_raw: string;
    vault_token_balance_whole: number;
  };
}

interface ActivityResponse {
  success: boolean;
  totals?: {
    mints_24h: number;
    burns_24h: number;
    net_24h: number;
    lifetime_mints: number;
    lifetime_burns: number;
    current_minted: number;
    current_in_pool: number;
    total_assets: number;
    max_pegs: number;
  };
  hourly?: Array<{ hour_ts: string; mints: number; burns: number; net: number }>;
  daily?: Array<{ day_ts: string; mints: number; burns: number; net: number; cumulative: number }>;
}

interface DerivedState {
  symbol: string;
  cluster: string;
  decimals: number;
  pegUnitRaw: bigint;
  totalSupplyRaw: bigint;
  vaultLockedRaw: bigint;
  effectiveMaxPegs: number;
  currentMinted: number;
  inPool: number;
  totalAssets: number;
  saturation: number;
  reserveRaw: bigint;
  circulatingRaw: bigint;
  driftRaw: bigint;
}

const REFRESH_INTERVAL_MS = 30_000;

function safeBigInt(input: string | number | bigint | null | undefined): bigint {
  if (input === null || input === undefined) return BigInt(0);
  try {
    return typeof input === "bigint" ? input : BigInt(String(input).split(".")[0] || "0");
  } catch {
    return BigInt(0);
  }
}

function bigIntDiv(numerator: bigint, denominator: bigint, precision = 4) {
  if (denominator === BigInt(0)) return 0;
  const factor = BigInt(10 ** precision);
  const scaled = (numerator * factor) / denominator;
  return Number(scaled) / 10 ** precision;
}

function formatWholeWithDecimals(raw: bigint, decimals: number, maxFractionDigits = 2) {
  const scale = BigInt(`1${"0".repeat(Math.max(0, decimals))}`);
  if (scale === BigInt(0)) return raw.toString();
  const whole = raw / scale;
  const fraction = raw % scale;
  const fractionText =
    decimals > 0 && fraction > BigInt(0)
      ? fraction
          .toString()
          .padStart(decimals, "0")
          .replace(/0+$/, "")
          .slice(0, maxFractionDigits)
      : "";
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fractionText ? `${wholeStr}.${fractionText}` : wholeStr;
}

function formatCompactWholeToken(raw: bigint, decimals: number) {
  const scale = BigInt(`1${"0".repeat(Math.max(0, decimals))}`);
  if (scale === BigInt(0)) return raw.toString();
  const whole = raw / scale;
  const num = Number(whole);
  if (!Number.isFinite(num)) return whole.toString();
  if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatPercent(value: number, precision = 2) {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(precision)}%`;
}

export function CpegBondingCurve({ tokenMint }: CpegBondingCurveProps) {
  const [state, setState] = useState<StateResponse["launch"] | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [stateResponse, activityResponse] = await Promise.all([
        fetch(`/api/cpeg/${tokenMint}/hybrid/state`, { cache: "no-store" }),
        fetch(`/api/cpeg/${tokenMint}/hybrid/activity`, { cache: "no-store" }),
      ]);
      const stateJson = (await stateResponse.json().catch(() => null)) as StateResponse | null;
      const activityJson = (await activityResponse.json().catch(() => null)) as ActivityResponse | null;
      if (stateJson?.launch) setState(stateJson.launch);
      if (activityJson?.success) setActivity(activityJson);
      setError(null);
      setLastUpdated(Date.now());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Curve feed offline");
    }
  }, [tokenMint]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (refreshTick === 0) return;
    refresh();
  }, [refresh, refreshTick]);

  const derived = useMemo<DerivedState | null>(() => {
    if (!state) return null;
    const pegUnit = safeBigInt(state.peg_unit_raw);
    const totalSupply = safeBigInt(state.token_supply_raw);
    const vaultLocked = safeBigInt(state.vault_token_balance_raw);
    const currentMinted = state.owned_assets;
    const expectedLocked = pegUnit * BigInt(currentMinted);
    const drift =
      vaultLocked > expectedLocked
        ? vaultLocked - expectedLocked
        : expectedLocked - vaultLocked;
    const effectiveMax = Math.max(1, state.effective_max_pegs || state.max_pegs || 1);
    const reserveRaw = vaultLocked;
    const circulating = totalSupply > reserveRaw ? totalSupply - reserveRaw : BigInt(0);
    return {
      symbol: (state.agent_token_symbol || state.symbol || "").trim() || "TOKEN",
      cluster: state.cluster,
      decimals: state.decimals,
      pegUnitRaw: pegUnit,
      totalSupplyRaw: totalSupply,
      vaultLockedRaw: vaultLocked,
      effectiveMaxPegs: effectiveMax,
      currentMinted,
      inPool: state.pool_assets,
      totalAssets: state.total_assets,
      saturation: Math.min(1, currentMinted / effectiveMax),
      reserveRaw,
      circulatingRaw: circulating,
      driftRaw: drift,
    };
  }, [state]);

  const loading = !state && !activity;

  return (
    <section className="relative overflow-hidden border border-[#53c7ff]/25 bg-gradient-to-br from-[#06101a] via-[#070d18] to-[#040814] p-5 md:p-8">
      <CurveHeader
        cluster={derived?.cluster || ""}
        loading={loading}
        error={error}
        lastUpdated={lastUpdated}
      />

      <div className="relative mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <CurvePlot derived={derived} />
        <SideStats derived={derived} activity={activity} />
      </div>

      <div className="relative mt-6 grid gap-6 md:grid-cols-2">
        <HourlyHistogram activity={activity} />
        <CumulativeSparkline activity={activity} derived={derived} />
      </div>
    </section>
  );
}

function CurveHeader({
  cluster,
  loading,
  error,
  lastUpdated,
}: {
  cluster: string;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ageSeconds = lastUpdated ? Math.max(0, Math.floor((now - lastUpdated) / 1000)) : null;
  const ageLabel =
    ageSeconds === null
      ? "--"
      : ageSeconds < 60
      ? `${ageSeconds}s ago`
      : `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s ago`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#9fe2ff]">
          PEG SATURATION CURVE
        </p>
        <p className="mt-2 text-2xl font-black uppercase tracking-tight text-white md:text-3xl">
          Backing <span className="text-[#53c7ff]">reservoir</span>
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
          Every captured cPEG locks a fixed slice of the agent token. The curve below maps the
          escrow reservoir to minted identities, refreshed every 30 seconds straight from the
          chain and the protocol database.
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 font-mono text-[10px] uppercase tracking-[0.22em]">
        <div className="flex items-center gap-2">
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              error ? "bg-[#ff6c6c]" : "bg-[#53ffac] shadow-[0_0_10px_#53ffac]"
            }`}
          >
            {!error ? (
              <span className="absolute inset-0 inline-flex h-full w-full animate-ping rounded-full bg-[#53ffac] opacity-60" />
            ) : null}
          </span>
          <span className={error ? "text-[#ff9b9b]" : "text-[#aef0ff]"}>
            {error ? "feed offline" : loading ? "syncing" : "streaming"}
          </span>
          {cluster ? <span className="text-white/30">|</span> : null}
          {cluster ? <span className="text-white/55">{cluster}</span> : null}
        </div>
        <span className="text-white/35">updated {ageLabel}</span>
      </div>
    </div>
  );
}

function CurvePlot({ derived }: { derived: DerivedState | null }) {
  // SVG plot in unitless 100x100 logical space, rendered via viewBox so the
  // container can grow without retina-specific math. We pad the inside so the
  // axis labels never clip.
  const padX = 8;
  const padY = 8;
  const innerW = 100 - padX * 2;
  const innerH = 100 - padY * 2;

  const saturation = derived ? Math.min(1, Math.max(0, derived.saturation)) : 0;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const relX = (event.clientX - rect.left) / rect.width;
      const svgX = relX * 100;
      const ratio = Math.min(1, Math.max(0, (svgX - padX) / innerW));
      setHoverRatio(ratio);
    },
    [innerW, padX]
  );
  const handleMouseLeave = useCallback(() => setHoverRatio(null), []);

  // We draw two layers: a "ghost" reference line (the full peg backing path
  // from 0 -> max) and the "filled" path up to the current position. The
  // filled path is animated via CSS transition on the dash offset so a fresh
  // capture or release smoothly moves the cursor.
  const points = useMemo(() => {
    const segments = 64;
    const list: { x: number; y: number; t: number }[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      // Subtle ease for visual richness. The underlying mechanic is linear
      // (fixed peg), so we render the "ground truth" line straight and use
      // the easing only for the glow band below it.
      const x = padX + innerW * t;
      const y = padY + innerH * (1 - t);
      list.push({ x, y, t });
    }
    return list;
  }, [innerH, innerW, padX, padY]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
  }, [points]);

  const glowBandPath = useMemo(() => {
    if (points.length === 0) return "";
    // Sigmoid envelope for the soft glow band beneath the line. Gives the
    // chart depth even though the protocol-level relationship is linear.
    const upper = points.map((point) => {
      const ease = 1 / (1 + Math.exp(-12 * (point.t - 0.5)));
      const yOffset = (1 - ease) * innerH * 0.18 + ease * 0.5;
      return { x: point.x, y: Math.max(padY, point.y - yOffset) };
    });
    const lower = [...points].reverse().map((point) => ({ x: point.x, y: padY + innerH }));
    const top = upper
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    const bottom = lower
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    return `${top} ${bottom} Z`;
  }, [points, innerH, padY]);

  const fillPath = useMemo(() => {
    if (points.length === 0) return "";
    const cutoff = padX + innerW * saturation;
    const inside = points.filter((p) => p.x <= cutoff);
    if (inside.length === 0) return "";
    const last = inside[inside.length - 1];
    const top = inside
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    return `${top} L ${last.x.toFixed(2)} ${(padY + innerH).toFixed(2)} L ${padX.toFixed(2)} ${(padY + innerH).toFixed(2)} Z`;
  }, [points, saturation, padX, padY, innerW, innerH]);

  const cursorX = padX + innerW * saturation;
  const cursorY = padY + innerH * (1 - saturation);

  const symbol = derived?.symbol || "TOKEN";
  const decimals = derived?.decimals ?? 0;
  const reserveLabel = derived ? formatCompactWholeToken(derived.reserveRaw, decimals) : "0";
  const supplyLabel = derived ? formatCompactWholeToken(derived.totalSupplyRaw, decimals) : "0";

  return (
    <div className="border border-white/10 bg-black/40 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/50">
            Reservoir vs minted identities
          </p>
          <p className="mt-1 text-xl font-black uppercase tracking-tight text-white">
            {derived ? `${(derived.saturation * 100).toFixed(3)}% saturation` : "--"}
          </p>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          <p>
            <span className="text-white/40">y-axis</span>{" "}
            <span className="text-[#9fe2ff]">{reserveLabel}</span>
            <span className="text-white/30"> / {supplyLabel}</span>{" "}
            <span className="text-white/40">{symbol}</span>
          </p>
          <p className="mt-1">
            <span className="text-white/40">x-axis</span>{" "}
            <span className="text-[#9fe2ff]">{derived?.currentMinted ?? 0}</span>
            <span className="text-white/30"> / {derived?.effectiveMaxPegs ?? 0} cPEG</span>
          </p>
        </div>
      </div>

      <div className="relative mt-4 aspect-[16/10] w-full">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#53c7ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#53c7ff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="curve-glow" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#9fe2ff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#9fe2ff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="cursor-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="40%" stopColor="#53c7ff" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#53c7ff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="line-shimmer" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#9fe2ff" stopOpacity="0">
                <animate
                  attributeName="offset"
                  values="-0.3;1.1"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1">
                <animate
                  attributeName="offset"
                  values="-0.2;1.2"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="0%" stopColor="#53c7ff" stopOpacity="0">
                <animate
                  attributeName="offset"
                  values="-0.1;1.3"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
              </stop>
            </linearGradient>
          </defs>

          {Array.from({ length: 6 }).map((_, idx) => {
            const ratio = idx / 5;
            const y = padY + innerH * ratio;
            return (
              <line
                key={`grid-h-${idx}`}
                x1={padX}
                x2={padX + innerW}
                y1={y}
                y2={y}
                stroke="#ffffff"
                strokeOpacity={0.05}
                strokeWidth={0.15}
              />
            );
          })}
          {Array.from({ length: 6 }).map((_, idx) => {
            const ratio = idx / 5;
            const x = padX + innerW * ratio;
            return (
              <line
                key={`grid-v-${idx}`}
                x1={x}
                x2={x}
                y1={padY}
                y2={padY + innerH}
                stroke="#ffffff"
                strokeOpacity={0.05}
                strokeWidth={0.15}
              />
            );
          })}

          <path d={glowBandPath} fill="url(#curve-glow)" />
          <path d={fillPath} fill="url(#curve-fill)">
            <animate attributeName="opacity" values="0.85;1;0.85" dur="4s" repeatCount="indefinite" />
          </path>
          <path
            d={linePath}
            fill="none"
            stroke="#9fe2ff"
            strokeOpacity={0.55}
            strokeWidth={0.5}
            strokeDasharray="0.6 0.6"
          />
          <path d={linePath} fill="none" stroke="url(#line-shimmer)" strokeWidth={0.9} />

          {/* Flow particles moving from origin toward the current cursor */}
          {derived && saturation > 0.001
            ? Array.from({ length: 4 }).map((_, idx) => {
                const delay = idx * 1.0;
                return (
                  <circle
                    key={`flow-${idx}`}
                    r={0.65}
                    fill="#ffffff"
                    opacity={0.85}
                  >
                    <animate
                      attributeName="cx"
                      values={`${padX};${cursorX}`}
                      dur="4s"
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="cy"
                      values={`${padY + innerH};${cursorY}`}
                      dur="4s"
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;1;0.7;0"
                      dur="4s"
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                );
              })
            : null}

          {derived ? (
            <g style={{ transition: "transform 600ms ease-out" }}>
              <line
                x1={padX}
                x2={cursorX}
                y1={cursorY}
                y2={cursorY}
                stroke="#53c7ff"
                strokeOpacity={0.35}
                strokeWidth={0.25}
                strokeDasharray="0.5 0.5"
              />
              <line
                x1={cursorX}
                x2={cursorX}
                y1={cursorY}
                y2={padY + innerH}
                stroke="#53c7ff"
                strokeOpacity={0.35}
                strokeWidth={0.25}
                strokeDasharray="0.5 0.5"
              />
              <circle cx={cursorX} cy={cursorY} r={3} fill="#53c7ff" fillOpacity={0.2}>
                <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
                <animate
                  attributeName="fill-opacity"
                  values="0.35;0;0.35"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx={cursorX} cy={cursorY} r={2.4} fill="url(#cursor-glow)" />
              <circle cx={cursorX} cy={cursorY} r={0.9} fill="#ffffff" />
            </g>
          ) : null}

          {hoverRatio !== null ? (
            <g pointerEvents="none">
              <line
                x1={padX + innerW * hoverRatio}
                x2={padX + innerW * hoverRatio}
                y1={padY}
                y2={padY + innerH}
                stroke="#ffffff"
                strokeOpacity={0.35}
                strokeWidth={0.25}
                strokeDasharray="0.4 0.4"
              />
              <circle
                cx={padX + innerW * hoverRatio}
                cy={padY + innerH * (1 - hoverRatio)}
                r={1.6}
                fill="#ffffff"
                fillOpacity={0.85}
              />
              <circle
                cx={padX + innerW * hoverRatio}
                cy={padY + innerH * (1 - hoverRatio)}
                r={0.6}
                fill="#0a1825"
              />
            </g>
          ) : null}
        </svg>
        <CurveTooltip
          hoverRatio={hoverRatio}
          derived={derived}
          symbol={symbol}
          decimals={decimals}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.18em]">
        <Legend label="reservoir" value={reserveLabel + " " + symbol} accent="#53c7ff" />
        <Legend
          label="minted"
          value={`${derived?.currentMinted ?? 0} / ${derived?.effectiveMaxPegs ?? 0}`}
          accent="#9fe2ff"
        />
        <Legend
          label="circulating"
          value={
            derived ? formatCompactWholeToken(derived.circulatingRaw, decimals) + " " + symbol : "0"
          }
          accent="#f7f2df"
        />
      </div>
    </div>
  );
}

function CurveTooltip({
  hoverRatio,
  derived,
  symbol,
  decimals,
}: {
  hoverRatio: number | null;
  derived: DerivedState | null;
  symbol: string;
  decimals: number;
}) {
  if (hoverRatio === null || !derived) return null;
  const maxPegs = derived.effectiveMaxPegs;
  const projectedMinted = Math.round(maxPegs * hoverRatio);
  const projectedLockedRaw = derived.pegUnitRaw * BigInt(projectedMinted);
  const isRight = hoverRatio < 0.5;
  return (
    <div
      className="pointer-events-none absolute top-3 z-10 border border-white/15 bg-[#070d18]/95 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] shadow-[0_0_25px_-5px_#53c7ff80] backdrop-blur"
      style={isRight ? { right: "1rem" } : { left: "1rem" }}
    >
      <p className="text-white/40">at {(hoverRatio * 100).toFixed(2)}% saturation</p>
      <p className="mt-1.5 flex items-center justify-between gap-4 text-white">
        <span className="text-white/55">minted</span>
        <span className="font-black text-[#9fe2ff]">
          {projectedMinted} / {maxPegs}
        </span>
      </p>
      <p className="mt-1 flex items-center justify-between gap-4 text-white">
        <span className="text-white/55">reservoir</span>
        <span className="font-black text-[#53c7ff]">
          {formatCompactWholeToken(projectedLockedRaw, decimals)} {symbol}
        </span>
      </p>
    </div>
  );
}

function Legend({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="border border-white/10 bg-black/40 px-3 py-2">
      <p className="text-white/40">{label}</p>
      <p className="mt-1 truncate text-[12px] font-black tracking-tight" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function SideStats({
  derived,
  activity,
}: {
  derived: DerivedState | null;
  activity: ActivityResponse | null;
}) {
  const totals = activity?.totals;
  const symbol = derived?.symbol || "TOKEN";
  const decimals = derived?.decimals ?? 0;
  const mintPriceLabel = derived
    ? `${formatCompactWholeToken(derived.pegUnitRaw, decimals)} ${symbol}`
    : "--";
  const burnPriceLabel = mintPriceLabel;
  const reserveLabel = derived ? formatCompactWholeToken(derived.reserveRaw, decimals) : "0";
  const circulatingLabel = derived ? formatCompactWholeToken(derived.circulatingRaw, decimals) : "0";
  const driftLabel = derived
    ? formatWholeWithDecimals(derived.driftRaw, decimals, 2) + " " + symbol
    : "0";
  const saturationLabel = derived ? formatPercent(derived.saturation, 3) : "0%";

  const expectedLockedRaw = derived
    ? derived.pegUnitRaw * BigInt(derived.currentMinted)
    : BigInt(0);
  const backingHealth = derived
    ? derived.reserveRaw >= expectedLockedRaw
      ? "Fully backed"
      : "Underbacked"
    : "--";

  return (
    <div className="grid gap-3">
      <PriceCard
        icon={Zap}
        label="Mint"
        value={mintPriceLabel}
        sublabel={`per cPEG into ${symbol}`}
        accent="#53c7ff"
      />
      <PriceCard
        icon={Flame}
        label="Burn"
        value={burnPriceLabel}
        sublabel={`returned per release`}
        accent="#ec5cff"
      />
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Layers}
          label="Reserve"
          value={`${reserveLabel} ${symbol}`}
          sublabel={`locked in escrow`}
        />
        <StatCard
          icon={Sparkles}
          label="Circulating"
          value={`${circulatingLabel} ${symbol}`}
          sublabel={`free supply`}
        />
        <StatCard
          icon={Activity}
          label="Saturation"
          value={saturationLabel}
          sublabel={`${derived?.currentMinted ?? 0} of ${derived?.effectiveMaxPegs ?? 0}`}
        />
        <StatCard
          icon={ArrowDownUp}
          label="Drift"
          value={driftLabel}
          sublabel={backingHealth}
          tone={backingHealth === "Fully backed" ? "ok" : "warn"}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FlowCard label="Mint 24h" value={totals?.mints_24h ?? 0} accent="#53ffac" />
        <FlowCard label="Burn 24h" value={totals?.burns_24h ?? 0} accent="#ec5cff" />
        <FlowCard
          label="Net 24h"
          value={`${(totals?.net_24h ?? 0) > 0 ? "+" : ""}${totals?.net_24h ?? 0}`}
          accent={
            (totals?.net_24h ?? 0) > 0
              ? "#53ffac"
              : (totals?.net_24h ?? 0) < 0
              ? "#ec5cff"
              : "#9fe2ff"
          }
        />
      </div>
    </div>
  );
}

function PriceCard({
  icon: Icon,
  label,
  value,
  sublabel,
  accent,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  sublabel: string;
  accent: string;
}) {
  return (
    <div
      className="relative overflow-hidden border border-white/10 bg-black/45 p-4"
      style={{ boxShadow: `inset 0 0 0 1px ${accent}10` }}
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-20 blur-2xl"
        style={{ background: `radial-gradient(circle at right, ${accent}, transparent 65%)` }}
      />
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
        <Icon className="h-3 w-3" style={{ color: accent }} />
        {label}
      </div>
      <p className="mt-2 text-xl font-black tracking-tight text-white">{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
        {sublabel}
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = "default",
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  sublabel: string;
  tone?: "default" | "ok" | "warn";
}) {
  const toneColor = tone === "ok" ? "#53ffac" : tone === "warn" ? "#f7b85c" : "#ffffff";
  return (
    <div className="border border-white/10 bg-black/40 p-3">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 text-sm font-black tracking-tight" style={{ color: toneColor }}>
        {value}
      </p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">
        {sublabel}
      </p>
    </div>
  );
}

function FlowCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="border border-white/10 bg-black/40 px-3 py-2 text-center">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className="mt-1 text-base font-black tracking-tight" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function HourlyHistogram({ activity }: { activity: ActivityResponse | null }) {
  const hourly = activity?.hourly || [];
  const maxBar = Math.max(1, ...hourly.map((b) => Math.max(b.mints, b.burns)));
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hoverBucket = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < hourly.length ? hourly[hoverIdx] : null;
  const hoverPercent =
    hoverIdx !== null && hourly.length > 1 ? (hoverIdx / (hourly.length - 1)) * 100 : 0;

  return (
    <div className="relative border border-white/10 bg-black/40 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
            24h mint / burn flow
          </p>
          <p className="mt-1 text-sm font-black tracking-tight text-white">Per-hour buckets</p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em]">
          <span className="text-[#53ffac]">mint</span>
          <span className="ml-3 text-[#ec5cff]">burn</span>
        </div>
      </div>
      <div className="relative mt-3 h-28">
        <div
          className="absolute inset-0 flex items-end gap-[3px]"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {hourly.length === 0 ? (
            <div className="grid h-full w-full place-items-center text-xs text-white/35">
              No flow events in the last 24h.
            </div>
          ) : (
            hourly.map((bucket, idx) => {
              const mintH = (bucket.mints / maxBar) * 100;
              const burnH = (bucket.burns / maxBar) * 100;
              const isHovered = hoverIdx === idx;
              return (
                <div
                  key={`${bucket.hour_ts}-${idx}`}
                  className={`relative flex h-full flex-1 flex-col justify-end transition-colors ${
                    isHovered ? "bg-white/[0.04]" : ""
                  }`}
                  onMouseEnter={() => setHoverIdx(idx)}
                >
                  <div
                    className="w-full bg-[#53ffac]/85 shadow-[0_0_8px_#53ffac55] transition-all duration-700"
                    style={{
                      height: `${mintH}%`,
                      minHeight: bucket.mints > 0 ? 2 : 0,
                      filter: isHovered ? "brightness(1.4)" : undefined,
                    }}
                  />
                  <div
                    className="mt-[1px] w-full bg-[#ec5cff]/85 shadow-[0_0_8px_#ec5cff55] transition-all duration-700"
                    style={{
                      height: `${burnH}%`,
                      minHeight: bucket.burns > 0 ? 2 : 0,
                      filter: isHovered ? "brightness(1.4)" : undefined,
                    }}
                  />
                  {bucket.mints + bucket.burns > 0 ? (
                    <span className="absolute inset-x-0 -top-1 mx-auto h-1 w-1 rounded-full bg-white/40 opacity-0 transition-opacity duration-1000" />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        {hoverBucket ? (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 border border-white/15 bg-[#070d18]/95 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] shadow-[0_0_25px_-5px_#53c7ff80] backdrop-blur"
            style={{ left: `${hoverPercent}%` }}
          >
            <p className="text-white/45">
              {new Date(hoverBucket.hour_ts).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="mt-1 flex items-center gap-3">
              <span className="text-[#53ffac]">+{hoverBucket.mints}</span>
              <span className="text-[#ec5cff]">-{hoverBucket.burns}</span>
              <span className="text-white/55">
                net {hoverBucket.net > 0 ? "+" : ""}
                {hoverBucket.net}
              </span>
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">
        <span>-24h</span>
        <span>now</span>
      </div>
    </div>
  );
}

function CumulativeSparkline({
  activity,
  derived,
}: {
  activity: ActivityResponse | null;
  derived: DerivedState | null;
}) {
  const daily = activity?.daily || [];
  const maxCumulative = Math.max(1, ...daily.map((b) => b.cumulative), derived?.currentMinted ?? 0);
  const minCumulative = 0;

  const padX = 4;
  const padY = 8;
  const innerW = 100 - padX * 2;
  const innerH = 100 - padY * 2;

  const coords = useMemo(() => {
    if (daily.length === 0) return [] as { x: number; y: number; bucket: (typeof daily)[number] }[];
    const span = Math.max(1, daily.length - 1);
    return daily.map((bucket, idx) => ({
      x: padX + (innerW * idx) / span,
      y:
        padY +
        innerH * (1 - (bucket.cumulative - minCumulative) / (maxCumulative - minCumulative || 1)),
      bucket,
    }));
  }, [daily, innerH, innerW, maxCumulative, padX, padY]);

  const points = useMemo(() => {
    if (coords.length === 0) return "";
    return coords
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
  }, [coords]);

  const areaPath = useMemo(() => {
    if (!points) return "";
    const baseY = padY + innerH;
    const firstX = padX;
    const lastX = padX + innerW;
    return `${points} L ${lastX.toFixed(2)} ${baseY.toFixed(2)} L ${firstX.toFixed(2)} ${baseY.toFixed(2)} Z`;
  }, [points, padX, padY, innerW, innerH]);

  const latestCumulative = daily.length > 0 ? daily[daily.length - 1].cumulative : 0;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || coords.length === 0) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const relX = (event.clientX - rect.left) / rect.width;
      const svgX = relX * 100;
      const span = Math.max(1, coords.length - 1);
      const idx = Math.min(
        coords.length - 1,
        Math.max(0, Math.round(((svgX - padX) / innerW) * span))
      );
      setHoverIdx(idx);
    },
    [coords.length, innerW, padX]
  );
  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  const hovered = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <div className="relative border border-white/10 bg-black/40 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
            Cumulative captures
          </p>
          <p className="mt-1 text-sm font-black tracking-tight text-white">30-day reservoir trace</p>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
          <p className="text-white/55">latest</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[#53c7ff]">
            {latestCumulative}
            <ArrowUpRight className="h-3 w-3" />
          </p>
        </div>
      </div>
      <div className="relative mt-3 aspect-[16/6] w-full">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="sparkline-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#53c7ff" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#53c7ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {coords.length === 0 ? (
            <text
              x="50"
              y="55"
              textAnchor="middle"
              fontSize="6"
              fill="#ffffff"
              opacity="0.35"
              fontFamily="ui-monospace, monospace"
            >
              awaiting activity
            </text>
          ) : (
            <>
              <path d={areaPath} fill="url(#sparkline-fill)" />
              <path d={points} fill="none" stroke="#9fe2ff" strokeWidth={0.6} />
              {/* Trailing pulse on the latest point so the line feels alive. */}
              {coords.length > 0 ? (
                <>
                  <circle
                    cx={coords[coords.length - 1].x}
                    cy={coords[coords.length - 1].y}
                    r={1.6}
                    fill="#53c7ff"
                    fillOpacity={0.4}
                  >
                    <animate attributeName="r" values="1;3;1" dur="2.4s" repeatCount="indefinite" />
                    <animate
                      attributeName="fill-opacity"
                      values="0.5;0;0.5"
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle
                    cx={coords[coords.length - 1].x}
                    cy={coords[coords.length - 1].y}
                    r={0.9}
                    fill="#ffffff"
                  />
                </>
              ) : null}
              {hovered ? (
                <>
                  <line
                    x1={hovered.x}
                    x2={hovered.x}
                    y1={padY}
                    y2={padY + innerH}
                    stroke="#ffffff"
                    strokeOpacity={0.35}
                    strokeWidth={0.25}
                    strokeDasharray="0.4 0.4"
                  />
                  <circle cx={hovered.x} cy={hovered.y} r={1.6} fill="#ffffff" fillOpacity={0.9} />
                  <circle cx={hovered.x} cy={hovered.y} r={0.6} fill="#0a1825" />
                </>
              ) : null}
            </>
          )}
        </svg>
        {hovered ? (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 border border-white/15 bg-[#070d18]/95 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] shadow-[0_0_25px_-5px_#53c7ff80] backdrop-blur"
            style={{ left: `${hovered.x}%` }}
          >
            <p className="text-white/45">
              {new Date(hovered.bucket.day_ts).toLocaleDateString(undefined, {
                month: "short",
                day: "2-digit",
              })}
            </p>
            <p className="mt-1 text-white">
              <span className="text-white/55">cumulative </span>
              <span className="font-black text-[#9fe2ff]">{hovered.bucket.cumulative}</span>
            </p>
            <p className="mt-0.5 flex gap-3">
              <span className="text-[#53ffac]">+{hovered.bucket.mints}</span>
              <span className="text-[#ec5cff]">-{hovered.bucket.burns}</span>
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">
        <span>-30d</span>
        <span>now</span>
      </div>
    </div>
  );
}
