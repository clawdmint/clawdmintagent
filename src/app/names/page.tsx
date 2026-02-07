"use client";

import { useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useTheme } from "@/components/theme-provider";
import { useWallet } from "@/components/wallet-context";
import {
  CLAWD_NAMES_ABI,
  validateName,
  normalizeName,
  getNamePrice,
  getNamePriceFormatted,
  checkNameAvailability,
  getUserNames,
  getTotalRegistered,
} from "@/lib/clawd-names";
import { clsx } from "clsx";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Zap,
  ExternalLink,
} from "lucide-react";

const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
const isMainnet = chainId === 8453;
const explorerUrl = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";
const NAMES_ADDRESS = (process.env["NEXT_PUBLIC_CLAWD_NAMES_ADDRESS"] || "") as `0x${string}`;

export default function NamesPage() {
  const { theme } = useTheme();
  const { address, isConnected, login } = useWallet();

  const [searchInput, setSearchInput] = useState("");
  const [searchName, setSearchName] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [justRegistered, setJustRegistered] = useState(false);

  const [myNames, setMyNames] = useState<Array<{ tokenId: bigint; name: string }>>([]);
  const [loadingNames, setLoadingNames] = useState(false);
  const [totalRegistered, setTotalRegistered] = useState(0);

  const fetchMyNames = useCallback(async () => {
    if (!address || !NAMES_ADDRESS) return;
    setLoadingNames(true);
    try {
      const names = await getUserNames(address);
      setMyNames(names);
    } catch { /* ignore */ }
    setLoadingNames(false);
  }, [address]);

  useEffect(() => { fetchMyNames(); }, [fetchMyNames]);
  useEffect(() => { getTotalRegistered().then(setTotalRegistered); }, [justRegistered]);

  useEffect(() => {
    if (isSuccess && !justRegistered) {
      setJustRegistered(true);
      setAvailable(null);
      setSearchInput("");
      setSearchName("");
      fetchMyNames();
    }
  }, [isSuccess, justRegistered, fetchMyNames]);

  useEffect(() => {
    if (!searchName) { setAvailable(null); setChecking(false); return; }
    const validation = validateName(searchName);
    if (!validation.valid) {
      setValidationError(validation.error || "Invalid name");
      setAvailable(null); setChecking(false); return;
    }
    setValidationError(null);
    setChecking(true);
    const timeout = setTimeout(async () => {
      if (!NAMES_ADDRESS) { setAvailable(true); setChecking(false); return; }
      const isAvail = await checkNameAvailability(searchName);
      setAvailable(isAvail);
      setChecking(false);
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchName]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    setJustRegistered(false);
    setSearchName(normalizeName(value.replace(/[^a-zA-Z0-9-]/g, "")));
  };

  const handleRegister = () => {
    if (!searchName || !available || !NAMES_ADDRESS) return;
    writeContract({
      address: NAMES_ADDRESS,
      abi: CLAWD_NAMES_ABI,
      functionName: "register",
      args: [searchName],
      value: getNamePrice(searchName),
    });
  };

  const isRegistering = isWritePending || isConfirming;
  const priceFormatted = searchName ? getNamePriceFormatted(searchName) : "0";

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Hero + Search — centered vertically when no results */}
      <div className={clsx(
        "flex-1 flex flex-col items-center justify-center px-4 transition-all duration-500",
        (searchName || myNames.length > 0) ? "pt-10 pb-6" : "pt-0"
      )}>
        {/* Animated dot grid background accent */}
        <div className="relative w-full max-w-2xl mx-auto">
          {/* Glow */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 bg-cyan-500/[0.04] rounded-full blur-3xl pointer-events-none" />

          {/* Title */}
          <div className="text-center mb-8 relative">
            <div className={clsx(
              "inline-block text-[11px] font-semibold tracking-[0.2em] uppercase mb-4 px-3 py-1 rounded-full",
              theme === "dark"
                ? "bg-cyan-500/[0.08] text-cyan-400 border border-cyan-500/10"
                : "bg-cyan-50 text-cyan-600 border border-cyan-200"
            )}>
              {totalRegistered > 0 ? `${totalRegistered} names claimed` : "On-chain identity"}
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.04em] mb-3">
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                .clawd
              </span>
            </h1>
            <p className={clsx(
              "text-base max-w-md mx-auto leading-relaxed",
              theme === "dark" ? "text-gray-500" : "text-gray-400"
            )}>
              Your permanent identity on Base. One name, forever yours.
            </p>
          </div>

          {/* Search */}
          <div className="relative group">
            <div className={clsx(
              "absolute -inset-0.5 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm",
              "bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30"
            )} />
            <div className={clsx(
              "relative flex items-center rounded-2xl border-2 overflow-hidden transition-all",
              theme === "dark"
                ? "bg-[#0a0f1c] border-white/[0.06] focus-within:border-white/[0.12]"
                : "bg-white border-gray-200 focus-within:border-cyan-300"
            )}>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search a name"
                maxLength={32}
                className={clsx(
                  "flex-1 px-5 py-4 text-lg font-medium bg-transparent outline-none",
                  theme === "dark"
                    ? "text-white placeholder-gray-600"
                    : "text-gray-900 placeholder-gray-300"
                )}
              />
              <span className={clsx(
                "pr-5 text-lg font-bold select-none shrink-0",
                theme === "dark" ? "text-gray-600" : "text-gray-300"
              )}>
                .clawd
              </span>
            </div>
          </div>

          {/* Results */}
          <div className="mt-4 min-h-[80px]">
            {/* Validation error */}
            {validationError && searchName && (
              <div className={clsx(
                "flex items-center gap-2 px-4 py-3 rounded-xl text-sm",
                theme === "dark" ? "text-red-400/80" : "text-red-500"
              )}>
                <XCircle className="w-4 h-4 shrink-0" />
                {validationError}
              </div>
            )}

            {/* Checking */}
            {checking && !validationError && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  Checking...
                </span>
              </div>
            )}

            {/* Available */}
            {!checking && !validationError && available === true && !justRegistered && (
              <div className={clsx(
                "rounded-2xl p-4 sm:p-5 border transition-all",
                theme === "dark"
                  ? "bg-emerald-500/[0.04] border-emerald-500/15"
                  : "bg-emerald-50/60 border-emerald-200/60"
              )}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-base truncate">
                        {searchName}
                        <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>.clawd</span>
                      </div>
                      <span className="text-xs text-emerald-400">Available</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={clsx(
                      "text-sm font-mono font-semibold tabular-nums",
                      theme === "dark" ? "text-gray-400" : "text-gray-500"
                    )}>
                      {priceFormatted} ETH
                    </span>

                    {!isConnected ? (
                      <button
                        onClick={login}
                        className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
                      >
                        Connect
                      </button>
                    ) : (
                      <button
                        onClick={handleRegister}
                        disabled={isRegistering || !NAMES_ADDRESS}
                        className={clsx(
                          "px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center gap-2",
                          isRegistering || !NAMES_ADDRESS
                            ? "bg-gray-600 cursor-not-allowed"
                            : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-lg hover:shadow-cyan-500/20"
                        )}
                      >
                        {isWritePending ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirm</>
                        ) : isConfirming ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Minting</>
                        ) : !NAMES_ADDRESS ? (
                          "Soon"
                        ) : (
                          <><Zap className="w-3.5 h-3.5" /> Claim</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Not available */}
            {!checking && !validationError && available === false && (
              <div className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-xl",
                theme === "dark" ? "text-red-400/70" : "text-red-400"
              )}>
                <XCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">
                  <strong>{searchName}.clawd</strong> is taken
                </span>
              </div>
            )}

            {/* Success */}
            {justRegistered && (
              <div className={clsx(
                "rounded-2xl p-5 border text-center",
                theme === "dark"
                  ? "bg-cyan-500/[0.04] border-cyan-500/15"
                  : "bg-cyan-50/60 border-cyan-200/60"
              )}>
                <Sparkles className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <div className="font-bold text-lg mb-0.5">Claimed!</div>
                <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  Your .clawd name is permanently yours on Base.
                </p>
                {txHash && (
                  <a
                    href={`${explorerUrl}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-cyan-400 hover:underline"
                  >
                    View on Basescan <ArrowRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Minimal pricing hint — only shown when no search */}
          {!searchName && (
            <div className={clsx(
              "flex items-center justify-center gap-4 mt-6 text-[11px] font-medium",
              theme === "dark" ? "text-gray-600" : "text-gray-400"
            )}>
              <span>3 chars &middot; 0.01 ETH</span>
              <span className={theme === "dark" ? "text-gray-700" : "text-gray-300"}>|</span>
              <span>4 chars &middot; 0.005 ETH</span>
              <span className={theme === "dark" ? "text-gray-700" : "text-gray-300"}>|</span>
              <span>5+ chars &middot; 0.001 ETH</span>
            </div>
          )}
        </div>
      </div>

      {/* My Names — only when connected and has names */}
      {isConnected && (myNames.length > 0 || loadingNames) && (
        <div className="px-4 pb-10">
          <div className="max-w-2xl mx-auto">
            <div className={clsx(
              "text-xs font-semibold uppercase tracking-[0.15em] mb-3",
              theme === "dark" ? "text-gray-600" : "text-gray-400"
            )}>
              Your names
            </div>

            {loadingNames ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Loading...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {myNames.map((n) => (
                  <a
                    key={n.tokenId.toString()}
                    href={`${explorerUrl}/token/${NAMES_ADDRESS}?a=${n.tokenId.toString()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all",
                      theme === "dark"
                        ? "bg-white/[0.02] border-white/[0.06] hover:border-cyan-500/30 hover:bg-cyan-500/[0.03]"
                        : "bg-white border-gray-200 hover:border-cyan-300 hover:bg-cyan-50/30"
                    )}
                  >
                    <span className="font-semibold text-sm">
                      {n.name}
                      <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>.clawd</span>
                    </span>
                    <ExternalLink className={clsx(
                      "w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity",
                      theme === "dark" ? "text-gray-500" : "text-gray-400"
                    )} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={clsx(
        "text-center pb-8 text-[11px]",
        theme === "dark" ? "text-gray-700" : "text-gray-300"
      )}>
        ERC-721 on Base &middot; Permanent &middot; Transferable
        {NAMES_ADDRESS && (
          <>
            {" "}&middot;{" "}
            <a
              href={`${explorerUrl}/address/${NAMES_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-cyan-500 transition-colors"
            >
              {NAMES_ADDRESS.slice(0, 6)}...{NAMES_ADDRESS.slice(-4)}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
