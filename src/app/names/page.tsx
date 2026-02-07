"use client";

import { useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
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
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  Tag,
  Crown,
  Star,
  ArrowRight,
  Hash,
  Wallet,
  Zap,
  Globe,
} from "lucide-react";

const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
const isMainnet = chainId === 8453;
const explorerUrl = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";
const NAMES_ADDRESS = (process.env["NEXT_PUBLIC_CLAWD_NAMES_ADDRESS"] || "") as `0x${string}`;

export default function NamesPage() {
  const { theme } = useTheme();
  const { address, isConnected, login } = useWallet();

  // Search state
  const [searchInput, setSearchInput] = useState("");
  const [searchName, setSearchName] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Registration state
  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [justRegistered, setJustRegistered] = useState(false);

  // User names
  const [myNames, setMyNames] = useState<Array<{ tokenId: bigint; name: string }>>([]);
  const [loadingNames, setLoadingNames] = useState(false);

  // Stats
  const [totalRegistered, setTotalRegistered] = useState(0);

  // Fetch user names
  const fetchMyNames = useCallback(async () => {
    if (!address || !NAMES_ADDRESS) return;
    setLoadingNames(true);
    try {
      const names = await getUserNames(address);
      setMyNames(names);
    } catch {
      // ignore
    }
    setLoadingNames(false);
  }, [address]);

  useEffect(() => {
    fetchMyNames();
  }, [fetchMyNames]);

  // Fetch total registered
  useEffect(() => {
    getTotalRegistered().then(setTotalRegistered);
  }, [justRegistered]);

  // After successful registration
  useEffect(() => {
    if (isSuccess && !justRegistered) {
      setJustRegistered(true);
      setAvailable(null);
      setSearchInput("");
      setSearchName("");
      fetchMyNames();
    }
  }, [isSuccess, justRegistered, fetchMyNames]);

  // Check availability when search changes
  useEffect(() => {
    if (!searchName) {
      setAvailable(null);
      setChecking(false);
      return;
    }

    const validation = validateName(searchName);
    if (!validation.valid) {
      setValidationError(validation.error || "Invalid name");
      setAvailable(null);
      setChecking(false);
      return;
    }

    setValidationError(null);
    setChecking(true);

    const timeout = setTimeout(async () => {
      if (!NAMES_ADDRESS) {
        // Contract not deployed yet — show as available for demo
        setAvailable(true);
        setChecking(false);
        return;
      }
      const isAvail = await checkNameAvailability(searchName);
      setAvailable(isAvail);
      setChecking(false);
    }, 400);

    return () => clearTimeout(timeout);
  }, [searchName]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    setJustRegistered(false);
    const normalized = normalizeName(value.replace(/[^a-zA-Z0-9-]/g, ""));
    setSearchName(normalized);
  };

  const handleRegister = () => {
    if (!searchName || !available || !NAMES_ADDRESS) return;

    const price = getNamePrice(searchName);
    writeContract({
      address: NAMES_ADDRESS,
      abi: CLAWD_NAMES_ABI,
      functionName: "register",
      args: [searchName],
      value: price,
    });
  };

  const isRegistering = isWritePending || isConfirming;
  const priceFormatted = searchName ? getNamePriceFormatted(searchName) : "0";

  const priceTier =
    searchName.length <= 3 ? "Premium" : searchName.length === 4 ? "Standard" : "Basic";
  const priceTierColor =
    searchName.length <= 3
      ? "text-amber-400"
      : searchName.length === 4
        ? "text-purple-400"
        : "text-cyan-400";

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
          <span className={clsx("text-sm font-medium", theme === "dark" ? "text-cyan-400" : "text-cyan-600")}>
            On-chain identity on Base
          </span>
        </div>
        <h1 className="text-display mb-3">
          <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            .clawd
          </span>{" "}
          Names
        </h1>
        <p className={clsx("text-body-lg max-w-xl mx-auto", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
          Claim your unique on-chain identity. Permanent, transferable, and yours forever.
        </p>
      </div>

      {/* Stats Bar */}
      <div className={clsx(
        "grid grid-cols-3 gap-4 mb-10",
      )}>
        {[
          { label: "Registered", value: totalRegistered.toString(), icon: Hash },
          { label: "Premium (3 chars)", value: "0.01 ETH", icon: Crown },
          { label: "Basic (5+ chars)", value: "0.001 ETH", icon: Tag },
        ].map((stat) => (
          <div
            key={stat.label}
            className={clsx(
              "glass-card p-4 text-center",
              theme === "light" && "bg-white/80"
            )}
          >
            <stat.icon className={clsx("w-5 h-5 mx-auto mb-2", theme === "dark" ? "text-gray-500" : "text-gray-400")} />
            <div className="text-heading-sm">{stat.value}</div>
            <div className={clsx("text-xs", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Search Box */}
      <div className={clsx(
        "glass-card p-6 sm:p-8 mb-8",
        theme === "light" && "bg-white/80"
      )}>
        <div className="flex items-center gap-3 mb-6">
          <Search className={clsx("w-5 h-5", theme === "dark" ? "text-cyan-400" : "text-cyan-600")} />
          <h2 className="text-heading-lg">Find your name</h2>
        </div>

        {/* Input */}
        <div className="relative mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search for a name..."
            maxLength={32}
            className={clsx(
              "w-full px-5 py-4 pr-32 rounded-2xl text-lg font-medium outline-none transition-all border-2",
              theme === "dark"
                ? "bg-white/[0.04] border-white/[0.08] text-white placeholder-gray-500 focus:border-cyan-500/50"
                : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-cyan-500"
            )}
          />
          <span className={clsx(
            "absolute right-5 top-1/2 -translate-y-1/2 text-lg font-bold",
            theme === "dark" ? "text-gray-500" : "text-gray-400"
          )}>
            .clawd
          </span>
        </div>

        {/* Validation / Availability Result */}
        {searchName && (
          <div className="space-y-4">
            {/* Validation error */}
            {validationError && (
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="w-5 h-5" />
                <span className="text-sm">{validationError}</span>
              </div>
            )}

            {/* Checking */}
            {checking && !validationError && (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span className={clsx("text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                  Checking availability...
                </span>
              </div>
            )}

            {/* Available */}
            {!checking && !validationError && available === true && (
              <div className={clsx(
                "rounded-2xl p-5 border",
                theme === "dark"
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-emerald-50 border-emerald-200"
              )}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                    <div>
                      <div className="font-bold text-lg">
                        {searchName}
                        <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>.clawd</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-emerald-400">Available!</span>
                        <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>•</span>
                        <span className={priceTierColor}>{priceTier}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-bold">{priceFormatted} ETH</div>
                      <div className={clsx("text-xs", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                        One-time payment
                      </div>
                    </div>

                    {!isConnected ? (
                      <button
                        onClick={login}
                        className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
                      >
                        Connect Wallet
                      </button>
                    ) : (
                      <button
                        onClick={handleRegister}
                        disabled={isRegistering || !NAMES_ADDRESS}
                        className={clsx(
                          "px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center gap-2",
                          isRegistering || !NAMES_ADDRESS
                            ? "bg-gray-600 cursor-not-allowed"
                            : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-lg hover:shadow-cyan-500/20"
                        )}
                      >
                        {isWritePending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Confirm in Wallet
                          </>
                        ) : isConfirming ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Registering...
                          </>
                        ) : !NAMES_ADDRESS ? (
                          "Coming Soon"
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            Register
                          </>
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
                "rounded-2xl p-5 border",
                theme === "dark"
                  ? "bg-red-500/5 border-red-500/20"
                  : "bg-red-50 border-red-200"
              )}>
                <div className="flex items-center gap-3">
                  <XCircle className="w-6 h-6 text-red-400" />
                  <div>
                    <div className="font-bold text-lg">
                      {searchName}
                      <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>.clawd</span>
                    </div>
                    <span className="text-sm text-red-400">Already taken</span>
                  </div>
                </div>
              </div>
            )}

            {/* Success */}
            {justRegistered && (
              <div className={clsx(
                "rounded-2xl p-5 border text-center",
                theme === "dark"
                  ? "bg-cyan-500/5 border-cyan-500/20"
                  : "bg-cyan-50 border-cyan-200"
              )}>
                <Sparkles className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                <div className="text-heading-lg mb-1">Name Registered!</div>
                <p className={clsx("text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                  Your .clawd name is now permanently yours as an NFT on Base.
                </p>
                {txHash && (
                  <a
                    href={`${explorerUrl}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-3 text-sm text-cyan-400 hover:underline"
                  >
                    View transaction <ArrowRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pricing Tiers */}
      <div className={clsx("glass-card p-6 sm:p-8 mb-8", theme === "light" && "bg-white/80")}>
        <h2 className="text-heading-lg mb-6 flex items-center gap-2">
          <Tag className="w-5 h-5 text-cyan-400" />
          Pricing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              tier: "Premium",
              chars: "3 characters",
              price: "0.01 ETH",
              example: "abc.clawd",
              color: "from-amber-500/20 to-amber-600/5",
              border: "border-amber-500/20",
              icon: Crown,
              iconColor: "text-amber-400",
            },
            {
              tier: "Standard",
              chars: "4 characters",
              price: "0.005 ETH",
              example: "claw.clawd",
              color: "from-purple-500/20 to-purple-600/5",
              border: "border-purple-500/20",
              icon: Star,
              iconColor: "text-purple-400",
            },
            {
              tier: "Basic",
              chars: "5+ characters",
              price: "0.001 ETH",
              example: "clawdmint.clawd",
              color: "from-cyan-500/20 to-cyan-600/5",
              border: "border-cyan-500/20",
              icon: Globe,
              iconColor: "text-cyan-400",
            },
          ].map((t) => (
            <div
              key={t.tier}
              className={clsx(
                "rounded-2xl p-5 border bg-gradient-to-b",
                theme === "dark" ? `${t.color} ${t.border}` : "bg-white border-gray-200"
              )}
            >
              <t.icon className={clsx("w-6 h-6 mb-3", t.iconColor)} />
              <div className="text-heading-sm mb-1">{t.tier}</div>
              <div className={clsx("text-xs mb-3", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                {t.chars}
              </div>
              <div className="text-xl font-bold mb-2">{t.price}</div>
              <div className={clsx(
                "text-xs font-mono px-2 py-1 rounded-lg inline-block",
                theme === "dark" ? "bg-white/[0.04] text-gray-400" : "bg-gray-100 text-gray-500"
              )}>
                {t.example}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* My Names */}
      {isConnected && (
        <div className={clsx("glass-card p-6 sm:p-8", theme === "light" && "bg-white/80")}>
          <h2 className="text-heading-lg mb-6 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-cyan-400" />
            My Names
          </h2>

          {loadingNames ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : myNames.length === 0 ? (
            <div className="text-center py-8">
              <Globe className={clsx("w-12 h-12 mx-auto mb-3", theme === "dark" ? "text-gray-600" : "text-gray-300")} />
              <p className={clsx("text-body", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                You don&apos;t have any .clawd names yet. Search above to get started!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myNames.map((n) => (
                <div
                  key={n.tokenId.toString()}
                  className={clsx(
                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                    theme === "dark"
                      ? "bg-white/[0.02] border-white/[0.06] hover:border-cyan-500/30"
                      : "bg-gray-50 border-gray-200 hover:border-cyan-300"
                  )}
                >
                  <div>
                    <div className="font-bold">
                      {n.name}
                      <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>.clawd</span>
                    </div>
                    <div className={clsx("text-xs", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                      Token #{n.tokenId.toString()}
                    </div>
                  </div>
                  <a
                    href={`${explorerUrl}/token/${NAMES_ADDRESS}?a=${n.tokenId.toString()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "text-xs px-3 py-1.5 rounded-lg",
                      theme === "dark"
                        ? "bg-white/[0.04] text-gray-400 hover:text-cyan-400"
                        : "bg-gray-100 text-gray-500 hover:text-cyan-600"
                    )}
                  >
                    View NFT
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className={clsx("mt-8 text-center text-sm", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
        <p>
          .clawd names are ERC-721 NFTs on Base. Permanent ownership, fully transferable.
        </p>
        {NAMES_ADDRESS && (
          <a
            href={`${explorerUrl}/address/${NAMES_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1 hover:text-cyan-400 transition-colors"
          >
            Contract: {NAMES_ADDRESS.slice(0, 6)}...{NAMES_ADDRESS.slice(-4)}
            <ArrowRight className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
