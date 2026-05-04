"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  ArrowDownUp,
  ArrowUpRight,
  CheckSquare,
  ChevronDown,
  Filter,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Square,
  Tag,
  Users,
  XCircle,
} from "lucide-react";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { CpegRelativeTime } from "@/components/cpeg-relative-time";
import { useCpegSite } from "@/components/cpeg-site-context";
import {
  bpsToPercent,
  describeError,
  explorerTxUrl,
  formatLamportsToSol,
  truncateAddress,
} from "@/lib/cpeg-ui";
import { cpegPublicPaths } from "@/lib/cpeg-site-paths";

type SolanaWeb3Transaction = InstanceType<typeof Transaction> | InstanceType<typeof VersionedTransaction>;

interface ManifestAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface ManifestInstruction {
  programId: string;
  accounts: ManifestAccount[];
  dataBase64: string;
}

interface CpegLaunchSummary {
  name: string;
  symbol: string;
  token_mint: string;
  collection_address: string;
  cluster: string;
  market: {
    active_listings: number;
    floor_sol: string | null;
    volume_sol: string;
  };
}

interface CpegListing {
  listing_address: string;
  escrow_token_account: string;
  peg_id: number;
  seller: string;
  price_lamports: string;
  price_sol: string;
  image: string;
  marketplace_fee_bps?: number;
  royalty_bps?: number;
  seller_proceeds_sol?: string;
  creator_royalty_sol?: string;
  protocol_fee_sol?: string;
  listed_at?: string | null;
}

interface CpegCollectionSummary {
  name: string;
  symbol: string;
  token_mint: string;
  collection_address: string;
  royalty_bps: number;
  marketplace_fee_bps: number;
  max_pegs: number;
}

interface MarketSummary {
  active_listings: number;
  filled_listings: number;
  floor_sol: string | null;
  volume_sol: string;
}

interface ActivityEvent {
  id: string;
  kind: "ACTIVE" | "FILLED" | "CANCELLED";
  peg_id: number;
  token_mint: string;
  price_sol: string;
  seller: string;
  buyer: string | null;
  tx: string | null;
  at: string;
  image: string;
}

interface OwnedPeg {
  id: number;
  image: string;
  minted: boolean;
  owner: string | null;
}

const SORT_OPTIONS: Array<[string, string]> = [
  ["price_asc", "Price: low → high"],
  ["price_desc", "Price: high → low"],
  ["recent", "Recently listed"],
  ["oldest", "Oldest first"],
  ["peg_asc", "PEG #: low → high"],
  ["peg_desc", "PEG #: high → low"],
];

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(window.atob(value), (char) => char.charCodeAt(0));
}

function manifestToInstruction(instruction: ManifestInstruction) {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: base64ToBytes(instruction.dataBase64),
  });
}

function getClientRpcUrl(cluster: string) {
  const configured =
    process.env["NEXT_PUBLIC_CPEG_BROWSER_RPC_URL"] ||
    process.env["NEXT_PUBLIC_SOLANA_BROWSER_RPC_URL"];
  if (configured) return configured;
  return clusterApiUrl(cluster === "devnet" ? "devnet" : "mainnet-beta");
}

function solToLamports(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(normalized)) throw new Error("Invalid SOL price.");
  const [whole, fraction = ""] = normalized.split(".");
  return (BigInt(whole || "0") * BigInt(1_000_000_000) + BigInt(fraction.padEnd(9, "0"))).toString();
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array) {
  if (!bytes.length) return "";
  const digits = [0];
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    const byte = bytes[byteIndex];
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let encoded = "";
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    const byte = bytes[byteIndex];
    if (byte !== 0) break;
    encoded += BASE58_ALPHABET[0];
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    encoded += BASE58_ALPHABET[digits[index]];
  }
  return encoded;
}

function getSignedTransactionSignature(transaction: SolanaWeb3Transaction) {
  if (transaction instanceof VersionedTransaction) {
    return base58Encode(transaction.signatures[0]);
  }
  const signature = transaction.signatures[0]?.signature;
  if (!signature) throw new Error("Signed transaction is missing a signature.");
  return base58Encode(signature);
}

export function CpegMarketClient() {
  const { solanaAddress, isConnected, login } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCpegSite = useCpegSite();
  const cpegUrls = useMemo(() => cpegPublicPaths(isCpegSite), [isCpegSite]);
  const initialMint = searchParams?.get("mint") || "";
  const initialSort = searchParams?.get("sort") || "price_asc";

  const [launches, setLaunches] = useState<CpegLaunchSummary[]>([]);
  const [selectedMint, setSelectedMint] = useState(initialMint);
  const [listings, setListings] = useState<CpegListing[]>([]);
  const [collection, setCollection] = useState<CpegCollectionSummary | null>(null);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [ownedPegs, setOwnedPegs] = useState<OwnedPeg[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const [sort, setSort] = useState(initialSort);
  const [searchPeg, setSearchPeg] = useState("");
  const [maxPriceSol, setMaxPriceSol] = useState("");
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  const [pegId, setPegId] = useState("");
  const [priceSol, setPriceSol] = useState("0.1");
  const [showListPanel, setShowListPanel] = useState(false);

  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState("");
  // Trade-art entries produced by the most recent buy. Populated from the buy/confirm
  // response. Each fill atomically writes one TradeArtRecord on-chain via CPI from
  // cpeg-market::buy -> clawpeg::record_trade_art.
  const [lastTradeArt, setLastTradeArt] = useState<
    Array<{ peg_id: number; trade_index: number; address: string; image_url: string }>
  >([]);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedPegIds, setSelectedPegIds] = useState<number[]>([]);

  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const collectionMenuRef = useRef<HTMLDivElement | null>(null);

  const connectedAddress = solanaAddress || "";
  const selectedLaunch = useMemo(
    () => launches.find((launch) => launch.token_mint === selectedMint) || null,
    [launches, selectedMint]
  );

  const toggleSelectedPeg = useCallback((id: number) => {
    setSelectedPegIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-6)
    );
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedPegIds([]);
  }, []);

  const filteredListings = useMemo(() => {
    let items = listings;
    if (searchPeg.trim()) {
      const numeric = Number.parseInt(searchPeg.trim(), 10);
      if (Number.isFinite(numeric)) {
        items = items.filter((listing) => listing.peg_id === numeric);
      }
    }
    if (maxPriceSol.trim() && /^\d+(\.\d{0,9})?$/.test(maxPriceSol.trim())) {
      try {
        const maxLamports = BigInt(solToLamports(maxPriceSol.trim()));
        items = items.filter((listing) => {
          try {
            return BigInt(listing.price_lamports) <= maxLamports;
          } catch {
            return true;
          }
        });
      } catch {
        // ignore invalid price
      }
    }
    if (showOnlyMine && connectedAddress) {
      items = items.filter((listing) => listing.seller === connectedAddress);
    }
    return items;
  }, [connectedAddress, listings, maxPriceSol, searchPeg, showOnlyMine]);

  const batchTotals = useMemo(() => {
    if (!selectedPegIds.length) return null;
    const selected = filteredListings.filter((listing) => selectedPegIds.includes(listing.peg_id));
    let totalLamports = BigInt(0);
    let totalSeller = BigInt(0);
    let totalRoyalty = BigInt(0);
    let totalProtocol = BigInt(0);
    for (const listing of selected) {
      try {
        const price = BigInt(listing.price_lamports);
        const royaltyBps = listing.royalty_bps ?? 0;
        const protoBps = listing.marketplace_fee_bps ?? 0;
        const denom = BigInt(10_000);
        const protocol = (price * BigInt(protoBps)) / denom;
        const royalty = (price * BigInt(royaltyBps)) / denom;
        const seller = price - protocol - royalty;
        totalLamports += price;
        totalProtocol += protocol;
        totalRoyalty += royalty;
        totalSeller += seller;
      } catch {
        // ignore
      }
    }
    return {
      count: selected.length,
      total: formatLamportsToSol(totalLamports),
      seller: formatLamportsToSol(totalSeller),
      royalty: formatLamportsToSol(totalRoyalty),
      protocol: formatLamportsToSol(totalProtocol),
    };
  }, [filteredListings, selectedPegIds]);

  const listPreview = useMemo(() => {
    if (!collection) return null;
    const trimmed = priceSol.trim();
    if (!/^\d+(\.\d{0,9})?$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
    try {
      const lamports = BigInt(solToLamports(trimmed));
      if (lamports <= BigInt(0)) return null;
      const denom = BigInt(10_000);
      const protocol = (lamports * BigInt(collection.marketplace_fee_bps)) / denom;
      const royalty = (lamports * BigInt(collection.royalty_bps)) / denom;
      const seller = lamports - protocol - royalty;
      return {
        seller: formatLamportsToSol(seller),
        royalty: formatLamportsToSol(royalty),
        protocol: formatLamportsToSol(protocol),
        royaltyBps: collection.royalty_bps,
        protocolBps: collection.marketplace_fee_bps,
      };
    } catch {
      return null;
    }
  }, [collection, priceSol]);

  // Listings + summary fetch
  const refreshListings = useCallback(
    async (mint: string, options?: { silent?: boolean }) => {
      if (!mint) return;
      if (!options?.silent) setLoadingListings(true);
      try {
        const params = new URLSearchParams({ sort });
        const response = await fetch(`/api/cpeg/${mint}/market/listings?${params.toString()}`);
        const body = await response.json().catch(() => null);
        if (response.ok && body?.success) {
          setListings(body.listings || []);
          setCollection(body.collection || null);
          setSummary(body.summary || null);
        }
      } finally {
        setLoadingListings(false);
      }
    },
    [sort]
  );

  const refreshActivity = useCallback(async (mint: string) => {
    if (!mint) return;
    setLoadingActivity(true);
    try {
      const response = await fetch(`/api/cpeg/${mint}/activity?limit=24`);
      const body = await response.json().catch(() => null);
      if (response.ok && body?.success) {
        setActivity(body.events || []);
      }
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  const refreshOwnedPegs = useCallback(
    async (mint: string, owner: string, maxPegs: number) => {
      if (!mint || !owner) return;
      try {
        // Fetch up to 240 pegs (10 pages of 24) so users can scan their inventory.
        const pages = Math.min(10, Math.ceil(Math.max(1, maxPegs) / 24));
        const responses = await Promise.all(
          Array.from({ length: pages }, (_, index) =>
            fetch(
              `/api/cpeg/${mint}/pegs?start=${index * 24}&limit=24&owner=${encodeURIComponent(owner)}`
            ).then((r) => r.json().catch(() => null))
          )
        );
        const flattened: OwnedPeg[] = [];
        for (const body of responses) {
          if (body?.success && Array.isArray(body.pegs)) {
            for (const peg of body.pegs) {
              flattened.push({
                id: peg.id,
                image: peg.image,
                minted: Boolean(peg.minted),
                owner: peg.owner,
              });
            }
          }
        }
        setOwnedPegs(flattened);
      } catch {
        setOwnedPegs([]);
      }
    },
    []
  );

  // Initial: fetch global launches
  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/cpeg?limit=40");
      const body = await response.json().catch(() => null);
      if (response.ok && body?.success) {
        const items = (body.launches || [])
          .filter((launch: { collection_address?: string | null }) => launch.collection_address)
          .map((launch: {
            name: string;
            symbol: string;
            token_mint: string;
            collection_address: string;
            cluster: string;
            market?: { active_listings?: number; floor_sol?: string | null; volume_sol?: string };
          }) => ({
            name: launch.name,
            symbol: launch.symbol,
            token_mint: launch.token_mint,
            collection_address: launch.collection_address,
            cluster: launch.cluster,
            market: {
              active_listings: launch.market?.active_listings ?? 0,
              floor_sol: launch.market?.floor_sol ?? null,
              volume_sol: launch.market?.volume_sol ?? "0",
            },
          })) as CpegLaunchSummary[];
        setLaunches(items);
        setSelectedMint((current) => {
          if (current && items.some((launch) => launch.token_mint === current)) return current;
          return items[0]?.token_mint || "";
        });
      }
    })();
  }, []);

  // Sync URL with selected mint and sort
  useEffect(() => {
    const params: Record<string, string> = {};
    if (selectedMint) params["mint"] = selectedMint;
    if (sort && sort !== "price_asc") params["sort"] = sort;
    const path = Object.keys(params).length ? cpegUrls.market(params) : cpegUrls.market();
    router.replace(path, { scroll: false });
  }, [router, selectedMint, sort, cpegUrls]);

  useEffect(() => {
    void refreshListings(selectedMint);
    void refreshActivity(selectedMint);
  }, [refreshActivity, refreshListings, selectedMint]);

  useEffect(() => {
    if (!collection || !connectedAddress) {
      setOwnedPegs([]);
      return;
    }
    void refreshOwnedPegs(collection.token_mint, connectedAddress, collection.max_pegs);
  }, [collection, connectedAddress, refreshOwnedPegs]);

  // Click-outside for collection menu
  useEffect(() => {
    if (!collectionMenuOpen) return;
    function handleClick(event: MouseEvent) {
      if (!collectionMenuRef.current) return;
      if (!collectionMenuRef.current.contains(event.target as Node)) {
        setCollectionMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [collectionMenuOpen]);

  const sendPreparedTransaction = useCallback(
    async (
      instructions: ManifestInstruction[],
      cluster: string,
      setup?: Array<InstanceType<typeof TransactionInstruction>>
    ) => {
      if (!connectedAddress) throw new Error("Wallet not connected.");
      const provider = getPhantomProvider();
      if (!provider?.signTransaction) throw new Error("Phantom transaction signing is unavailable.");

      const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
      const transaction = new Transaction();
      for (const instruction of setup || []) transaction.add(instruction);
      for (const instruction of instructions) transaction.add(manifestToInstruction(instruction));
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = new PublicKey(connectedAddress);
      transaction.recentBlockhash = latestBlockhash.blockhash;
      const signed = (await provider.signTransaction(transaction as SolanaWeb3Transaction)) as SolanaWeb3Transaction;
      const signedSignature = getSignedTransactionSignature(signed);
      const raw =
        signed instanceof VersionedTransaction
          ? signed.serialize()
          : signed.serialize({ requireAllSignatures: true, verifySignatures: false });
      let signature = signedSignature;
      try {
        signature = await connection.sendRawTransaction(raw, {
          skipPreflight: false,
          maxRetries: 5,
          preflightCommitment: "confirmed",
        });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        if (!message.toLowerCase().includes("already been processed")) {
          throw sendError;
        }
      }
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );
      return signature;
    },
    [connectedAddress]
  );

  const handleList = useCallback(async () => {
    setError("");
    setStatus("");
    setLastTx("");
    if (!isConnected || !connectedAddress) {
      login();
      return;
    }
    if (!selectedLaunch || !pegId.trim()) {
      setError("Pick a PEG and price first.");
      return;
    }

    setBusy("list");
    try {
      const numericPegId = Number.parseInt(pegId, 10);
      if (!Number.isFinite(numericPegId) || numericPegId < 0) {
        throw new Error("Invalid PEG id.");
      }
      const priceLamports = solToLamports(priceSol);
      setStatus("Preparing cPEG escrow listing...");
      const response = await fetch(`/api/cpeg/${selectedLaunch.token_mint}/market/listings/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller: connectedAddress,
          peg_id: numericPegId,
          price_lamports: priceLamports,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error || "Failed to prepare listing.");

      const connection = new Connection(getClientRpcUrl(selectedLaunch.cluster), "confirmed");
      const escrowAta = new PublicKey(body.listing.escrow_token_account);
      const escrowAtaInfo = await connection.getAccountInfo(escrowAta, "confirmed");
      const setup = escrowAtaInfo
        ? []
        : [
            createAssociatedTokenAccountInstruction(
              new PublicKey(connectedAddress),
              escrowAta,
              new PublicKey(body.listing.listing_address),
              new PublicKey(selectedLaunch.token_mint),
              TOKEN_2022_PROGRAM_ID
            ),
          ];

      setStatus("Opening Phantom to escrow the PEG...");
      const signature = await sendPreparedTransaction(body.instructions, selectedLaunch.cluster, setup);
      await fetch(`/api/cpeg/${selectedLaunch.token_mint}/market/listings/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body.listing, signature }),
      }).catch(() => null);
      setLastTx(signature);
      setStatus(`Listed cPEG #${numericPegId} for ${priceSol} SOL.`);
      setShowListPanel(false);
      await refreshListings(selectedLaunch.token_mint);
      await refreshActivity(selectedLaunch.token_mint);
    } catch (listError) {
      setError(describeError(listError, "Failed to list cPEG."));
    } finally {
      setBusy("");
    }
  }, [
    connectedAddress,
    isConnected,
    login,
    pegId,
    priceSol,
    refreshActivity,
    refreshListings,
    selectedLaunch,
    sendPreparedTransaction,
  ]);

  const handleBuy = useCallback(
    async (listing: CpegListing) => {
      setError("");
      setStatus("");
      setLastTx("");
      setLastTradeArt([]);
      if (!isConnected || !connectedAddress) {
        login();
        return;
      }
      if (!selectedLaunch) return;

      setBusy(`buy-${listing.peg_id}`);
      try {
        setStatus(`Preparing buy for cPEG #${listing.peg_id}...`);
        const response = await fetch(`/api/cpeg/${selectedLaunch.token_mint}/market/buy/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buyer: connectedAddress, peg_id: listing.peg_id }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.success) throw new Error(body?.error || "Failed to prepare purchase.");

        const connection = new Connection(getClientRpcUrl(selectedLaunch.cluster), "confirmed");
        const buyerAta = new PublicKey(body.listing.buyer_token_account);
        const buyerAtaInfo = await connection.getAccountInfo(buyerAta, "confirmed");
        const setup = buyerAtaInfo
          ? []
          : [
              createAssociatedTokenAccountInstruction(
                new PublicKey(connectedAddress),
                buyerAta,
                new PublicKey(connectedAddress),
                new PublicKey(selectedLaunch.token_mint),
                TOKEN_2022_PROGRAM_ID
              ),
            ];

        setStatus("Opening Phantom for purchase...");
        const signature = await sendPreparedTransaction(body.instructions, selectedLaunch.cluster, setup);
        const confirmRes = await fetch(`/api/cpeg/${selectedLaunch.token_mint}/market/buy/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature, buyer: connectedAddress, peg_id: listing.peg_id }),
        }).catch(() => null);
        if (confirmRes?.ok) {
          const confirmBody = await confirmRes.json().catch(() => null);
          if (confirmBody?.trade_art) {
            setLastTradeArt([{ peg_id: listing.peg_id, ...confirmBody.trade_art }]);
          }
        }
        setLastTx(signature);
        setStatus(`Bought cPEG #${listing.peg_id}.`);
        await refreshListings(selectedLaunch.token_mint);
        await refreshActivity(selectedLaunch.token_mint);
      } catch (buyError) {
        setError(describeError(buyError, "Failed to buy cPEG."));
      } finally {
        setBusy("");
      }
    },
    [connectedAddress, isConnected, login, refreshActivity, refreshListings, selectedLaunch, sendPreparedTransaction]
  );

  const handleBatchBuy = useCallback(async () => {
    setError("");
    setStatus("");
    setLastTx("");
    setLastTradeArt([]);
    if (!isConnected || !connectedAddress) {
      login();
      return;
    }
    if (!selectedLaunch || !selectedPegIds.length) return;

    setBusy("batch-buy");
    try {
      setStatus(`Preparing batch purchase of ${selectedPegIds.length} cPEGs...`);
      const response = await fetch(`/api/cpeg/${selectedLaunch.token_mint}/market/buy/batch/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer: connectedAddress, peg_ids: selectedPegIds }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error || "Failed to prepare batch.");

      const connection = new Connection(getClientRpcUrl(selectedLaunch.cluster), "confirmed");
      const buyerAta = new PublicKey(body.buyer_token_account);
      const buyerAtaInfo = await connection.getAccountInfo(buyerAta, "confirmed");
      const setup = buyerAtaInfo
        ? []
        : [
            createAssociatedTokenAccountInstruction(
              new PublicKey(connectedAddress),
              buyerAta,
              new PublicKey(connectedAddress),
              new PublicKey(selectedLaunch.token_mint),
              TOKEN_2022_PROGRAM_ID
            ),
          ];

      setStatus("Opening Phantom for batch purchase...");
      const signature = await sendPreparedTransaction(body.instructions, selectedLaunch.cluster, setup);
      const confirmRes = await fetch(`/api/cpeg/${selectedLaunch.token_mint}/market/buy/batch/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, buyer: connectedAddress, peg_ids: body.peg_ids }),
      }).catch(() => null);
      if (confirmRes?.ok) {
        const confirmBody = await confirmRes.json().catch(() => null);
        if (Array.isArray(confirmBody?.trade_art)) {
          setLastTradeArt(confirmBody.trade_art);
        }
      }
      setLastTx(signature);
      setStatus(`Bought ${selectedPegIds.length} cPEGs in one transaction.`);
      exitSelectMode();
      await refreshListings(selectedLaunch.token_mint);
      await refreshActivity(selectedLaunch.token_mint);
    } catch (batchError) {
      const message = batchError instanceof Error ? batchError.message : "Failed to batch buy.";
      if (message.toLowerCase().includes("too large") || message.toLowerCase().includes("size limit")) {
        setError("Selection too large for one transaction. Try fewer PEGs.");
      } else {
        setError(describeError(batchError, "Failed to batch buy."));
      }
    } finally {
      setBusy("");
    }
  }, [
    connectedAddress,
    exitSelectMode,
    isConnected,
    login,
    refreshActivity,
    refreshListings,
    selectedLaunch,
    selectedPegIds,
    sendPreparedTransaction,
  ]);

  const handleCancel = useCallback(
    async (listing: CpegListing) => {
      setError("");
      setStatus("");
      setLastTx("");
      if (!isConnected || !connectedAddress) {
        login();
        return;
      }
      if (!selectedLaunch) return;

      setBusy(`cancel-${listing.peg_id}`);
      try {
        const response = await fetch(`/api/cpeg/${selectedLaunch.token_mint}/market/cancel/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seller: connectedAddress, peg_id: listing.peg_id }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.success) throw new Error(body?.error || "Failed to prepare cancel.");
        const signature = await sendPreparedTransaction(body.instructions, selectedLaunch.cluster);
        await fetch(`/api/cpeg/${selectedLaunch.token_mint}/market/cancel/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature, seller: connectedAddress, peg_id: listing.peg_id }),
        }).catch(() => null);
        setLastTx(signature);
        setStatus(`Cancelled cPEG #${listing.peg_id}.`);
        await refreshListings(selectedLaunch.token_mint);
        await refreshActivity(selectedLaunch.token_mint);
      } catch (cancelError) {
        setError(describeError(cancelError, "Failed to cancel listing."));
      } finally {
        setBusy("");
      }
    },
    [connectedAddress, isConnected, login, refreshActivity, refreshListings, selectedLaunch, sendPreparedTransaction]
  );

  const headerStats: Array<{ label: string; value: string; accent: string; icon: typeof Tag }> = [
    {
      label: "Floor",
      value: summary?.floor_sol ? `${summary.floor_sol} SOL` : "--",
      accent: "text-[#53c7ff]",
      icon: Tag,
    },
    {
      label: "Volume",
      value: summary ? `${summary.volume_sol} SOL` : "0 SOL",
      accent: "text-neutral-900 dark:text-[#f7f2df]",
      icon: Sparkles,
    },
    {
      label: "Listed",
      value: summary ? summary.active_listings.toLocaleString() : "0",
      accent: "text-neutral-700 dark:text-white/72",
      icon: Layers,
    },
    {
      label: "Trades",
      value: summary ? summary.filled_listings.toLocaleString() : "0",
      accent: "text-neutral-700 dark:text-white/72",
      icon: Users,
    },
    {
      label: "Royalty",
      value: collection ? bpsToPercent(collection.royalty_bps) : "--",
      accent: "text-neutral-700 dark:text-white/55",
      icon: Tag,
    },
    {
      label: "Fee",
      value: collection ? bpsToPercent(collection.marketplace_fee_bps) : "--",
      accent: "text-neutral-700 dark:text-white/55",
      icon: Tag,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-5 pb-16 pt-10 md:px-10 md:pt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={cpegUrls.home}
            className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55 transition hover:text-[#53c7ff]"
          >
            ← cPEG
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-400 dark:text-white/30">
            P2P Market
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            void refreshListings(selectedMint);
            void refreshActivity(selectedMint);
          }}
          className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600 dark:text-white/65 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
        >
          <RefreshCw className={`h-3 w-3 ${loadingListings ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <section className="mt-6 grid gap-6 border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] p-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div ref={collectionMenuRef} className="relative inline-block">
            <button
              type="button"
              onClick={() => setCollectionMenuOpen((current) => !current)}
              className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.04] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-700 dark:text-white/70 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
            >
              {selectedLaunch ? (
                <>
                  <span className="text-neutral-950 dark:text-white">{selectedLaunch.symbol}</span>
                  <span className="text-neutral-500 dark:text-white/35">·</span>
                  <span className="text-neutral-700 dark:text-white/55">{truncateAddress(selectedLaunch.token_mint, 4, 4)}</span>
                </>
              ) : (
                "Pick a collection"
              )}
              <ChevronDown className="h-3 w-3" />
            </button>
            {collectionMenuOpen ? (
              <div className="absolute left-0 top-full z-20 mt-2 max-h-[420px] w-[360px] overflow-y-auto border border-neutral-300 dark:border-white/15 bg-neutral-100 dark:bg-[#0c0c0c] shadow-xl">
                {launches.length ? (
                  launches.map((launch) => (
                    <button
                      key={launch.token_mint}
                      type="button"
                      onClick={() => {
                        setSelectedMint(launch.token_mint);
                        setCollectionMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 border-b border-neutral-200/60 dark:border-white/5 px-3 py-3 text-left transition hover:bg-neutral-50 dark:bg-white/[0.04] ${
                        launch.token_mint === selectedMint ? "bg-[#53c7ff]/10" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold uppercase">{launch.name}</p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
                          {launch.symbol} · {launch.market.active_listings} listed
                        </p>
                      </div>
                      <span className="font-mono text-xs text-[#53c7ff]">
                        {launch.market.floor_sol ? `${launch.market.floor_sol}` : "--"}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-xs text-neutral-500 dark:text-white/40">No collections found.</div>
                )}
              </div>
            ) : null}
          </div>

          <h1 className="mt-4 text-4xl font-black uppercase leading-[1.05] md:text-6xl">
            {selectedLaunch?.name || collection?.name || "cPEG market"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-600 dark:text-white/60">
            Listings move PEGs into program escrow. Buys execute a 3-way SOL split: seller,
            creator royalty, and protocol fee. No off-chain books, no wrapped fees.
          </p>

          {selectedLaunch ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href={cpegUrls.collection(selectedLaunch.token_mint)}
                className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700 dark:text-white/70 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
              >
                Open collection <ArrowUpRight className="h-3 w-3" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowListPanel((current) => !current);
                  setError("");
                  setStatus("");
                }}
                className="inline-flex items-center gap-2 border border-[#53c7ff]/40 bg-[#53c7ff]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#53c7ff]"
              >
                <Tag className="h-3 w-3" /> {showListPanel ? "Close list panel" : "List a PEG"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          {headerStats.map((cell) => {
            const Icon = cell.icon;
            return (
              <div key={cell.label} className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-3 w-3 text-neutral-400 dark:text-white/30" />
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/40">
                    {cell.label}
                  </p>
                </div>
                <p className={`mt-1 text-base font-black tracking-tight ${cell.accent}`}>{cell.value}</p>
              </div>
            );
          })}
        </div>
      </section>

      {showListPanel ? (
        <section className="mt-6 border border-[#53c7ff]/30 bg-[#0c1722] p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">List a PEG</p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-white/65">
                Pick from your unlisted PEGs and set a SOL price. Creator royalty and protocol fee
                are calculated below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowListPanel(false)}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700 dark:text-white/55 transition hover:text-[#53c7ff]"
            >
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">
                Your PEGs in this collection
              </p>
              {connectedAddress ? (
                ownedPegs.length ? (
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-7">
                    {ownedPegs.slice(0, 28).map((peg) => (
                      <button
                        key={peg.id}
                        type="button"
                        onClick={() => setPegId(String(peg.id))}
                        className={`group border bg-neutral-100/90 dark:bg-black/40 p-1 text-left transition ${
                          pegId === String(peg.id) ? "border-[#53c7ff]" : "border-neutral-200 dark:border-white/10 hover:border-[#53c7ff]/50"
                        }`}
                      >
                        <div className="aspect-square overflow-hidden bg-neutral-200 dark:bg-black">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={peg.image}
                            alt={`cPEG #${peg.id}`}
                            className="h-full w-full object-cover [image-rendering:pixelated]"
                            loading="lazy"
                          />
                        </div>
                        <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600 dark:text-white/65">
                          #{peg.id}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-neutral-500 dark:text-white/45">
                    No PEGs found in your wallet for this collection. You can still list one by typing
                    a PEG ID below.
                  </p>
                )
              ) : (
                <p className="mt-3 text-xs text-neutral-500 dark:text-white/45">Connect a wallet to see your PEGs.</p>
              )}

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">PEG ID</span>
                  <input
                    value={pegId}
                    inputMode="numeric"
                    onChange={(event) => setPegId(event.target.value)}
                    placeholder="e.g. 42"
                    className="mt-2 w-full border border-neutral-300 dark:border-white/12 bg-neutral-50 dark:bg-white/[0.04] px-3 py-3 text-sm text-neutral-950 outline-none transition focus:border-[#53c7ff] dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">Price (SOL)</span>
                  <input
                    value={priceSol}
                    inputMode="decimal"
                    onChange={(event) => setPriceSol(event.target.value)}
                    className="mt-2 w-full border border-neutral-300 dark:border-white/12 bg-neutral-50 dark:bg-white/[0.04] px-3 py-3 text-sm text-neutral-950 outline-none transition focus:border-[#53c7ff] dark:text-white"
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-4">
              {listPreview ? (
                <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/40 p-4 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55">
                  <Row label="Seller proceeds" value={`${listPreview.seller} SOL`} highlight />
                  <Row label={`Creator royalty (${bpsToPercent(listPreview.royaltyBps)})`} value={`${listPreview.royalty} SOL`} />
                  <Row label={`Protocol fee (${bpsToPercent(listPreview.protocolBps)})`} value={`${listPreview.protocol} SOL`} muted />
                </div>
              ) : null}
              <button
                type="button"
                onClick={isConnected ? handleList : login}
                disabled={Boolean(busy) || !selectedLaunch}
                className="inline-flex items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                {isConnected ? "List PEG" : "Connect Phantom"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 border border-neutral-300 dark:border-white/12 bg-neutral-100 dark:bg-[#0c0c0c] px-3 py-2">
                <ArrowDownUp className="h-3 w-3 text-neutral-500 dark:text-white/40" />
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="bg-transparent font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-950 outline-none transition dark:text-white"
                >
                  {SORT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 border border-neutral-300 dark:border-white/12 bg-neutral-100 dark:bg-[#0c0c0c] px-3 py-2">
                <Search className="h-3 w-3 text-neutral-500 dark:text-white/40" />
                <input
                  value={searchPeg}
                  inputMode="numeric"
                  onChange={(event) => setSearchPeg(event.target.value)}
                  placeholder="PEG #"
                  className="w-20 bg-transparent font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-950 outline-none transition placeholder:text-neutral-500 dark:text-white dark:placeholder:text-white/30"
                />
              </div>
              <div className="flex items-center gap-2 border border-neutral-300 dark:border-white/12 bg-neutral-100 dark:bg-[#0c0c0c] px-3 py-2">
                <Filter className="h-3 w-3 text-neutral-500 dark:text-white/40" />
                <input
                  value={maxPriceSol}
                  inputMode="decimal"
                  onChange={(event) => setMaxPriceSol(event.target.value)}
                  placeholder="Max SOL"
                  className="w-20 bg-transparent font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-950 outline-none transition placeholder:text-neutral-500 dark:text-white dark:placeholder:text-white/30"
                />
              </div>
              {connectedAddress ? (
                <button
                  type="button"
                  onClick={() => setShowOnlyMine((current) => !current)}
                  className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                    showOnlyMine
                      ? "border-[#53c7ff] bg-[#53c7ff]/10 text-[#53c7ff]"
                      : "border-neutral-300 dark:border-white/12 bg-neutral-100 dark:bg-[#0c0c0c] text-neutral-600 dark:text-white/65 hover:border-[#53c7ff]/40 hover:text-[#53c7ff]"
                  }`}
                >
                  My listings
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectMode ? (
                <>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55">
                    {selectedPegIds.length}/6 selected
                  </span>
                  <button
                    type="button"
                    onClick={isConnected ? handleBatchBuy : login}
                    disabled={!selectedPegIds.length || Boolean(busy)}
                    className="inline-flex items-center gap-2 border border-[#53c7ff]/60 bg-[#53c7ff]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#53c7ff] disabled:opacity-40"
                  >
                    {busy === "batch-buy" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingBag className="h-3 w-3" />}
                    Buy selected
                  </button>
                  <button
                    type="button"
                    onClick={exitSelectMode}
                    className="border border-neutral-300 dark:border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600 dark:text-white/60"
                  >
                    Done
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700 dark:text-white/70"
                >
                  <CheckSquare className="h-3 w-3" /> Multi-select
                </button>
              )}
            </div>
          </div>

          {selectMode && batchTotals && batchTotals.count > 0 ? (
            <div className="mt-4 grid gap-3 border border-[#53c7ff]/35 bg-[#53c7ff]/10 p-3 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-600 dark:text-white/65 sm:grid-cols-4">
              <Row label="Total" value={`${batchTotals.total} SOL`} highlight />
              <Row label="Sellers" value={`${batchTotals.seller} SOL`} />
              <Row label="Royalty" value={`${batchTotals.royalty} SOL`} />
              <Row label="Fee" value={`${batchTotals.protocol} SOL`} muted />
            </div>
          ) : null}

          {(status || error || lastTx) && (
            <div className="mt-4 grid gap-2">
              {status ? (
                <div className="flex items-center gap-2 border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-3 text-sm text-[#53c7ff]">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {status}
                </div>
              ) : null}
              {error ? (
                <div className="border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>
              ) : null}
              {lastTx && selectedLaunch ? (
                <a
                  href={explorerTxUrl(lastTx, selectedLaunch.cluster)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700 dark:text-white/55 transition hover:text-[#53c7ff]"
                >
                  Last transaction <ArrowUpRight className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          )}

          {lastTradeArt.length && selectedLaunch ? (
            <div className="mt-4 border border-[#53c7ff]/30 bg-[#53c7ff]/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9fe2ff]">
                    Trade art recorded on-chain
                  </p>
                  <p className="mt-1 text-sm leading-5 text-neutral-700 dark:text-white/75">
                    Your fill atomically minted {lastTradeArt.length === 1 ? "one" : lastTradeArt.length} deterministic
                    {lastTradeArt.length === 1 ? " piece" : " pieces"} of trade art via the cpeg-market &rarr; clawpeg
                    CPI. The art is permanent.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {lastTradeArt.map((art) => (
                  <a
                    key={art.peg_id}
                    href={`/api/cpeg/${selectedLaunch.token_mint}/trade-art/${art.trade_index}/svg`}
                    target="_blank"
                    rel="noreferrer"
                    className="group block border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/40 p-1 transition hover:border-[#53c7ff]"
                    title={art.address}
                  >
                    <div className="aspect-square overflow-hidden border border-neutral-200/60 dark:border-white/5 bg-neutral-200 dark:bg-black">
                      <Image
                        src={art.image_url}
                        alt={`Trade art for cPEG #${art.peg_id}`}
                        width={160}
                        height={160}
                        className="h-full w-full object-cover [image-rendering:pixelated]"
                        unoptimized
                      />
                    </div>
                    <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-700 dark:text-white/55 group-hover:text-[#53c7ff]">
                      T#{art.trade_index}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            {loadingListings && !filteredListings.length ? (
              <ListingsSkeleton />
            ) : filteredListings.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filteredListings.map((listing) => {
                  const isSelected = selectedPegIds.includes(listing.peg_id);
                  const isOwn = connectedAddress === listing.seller;
                  return (
                    <div
                      key={listing.listing_address}
                      className={`group relative border bg-neutral-100 dark:bg-[#0c0c0c] p-2 transition ${
                        selectMode && isSelected
                          ? "border-[#53c7ff]"
                          : "border-neutral-200 dark:border-white/10 hover:border-[#53c7ff]/40"
                      }`}
                    >
                      {selectMode ? (
                        <button
                          type="button"
                          onClick={() => toggleSelectedPeg(listing.peg_id)}
                          className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center border border-neutral-400 dark:border-white/30 bg-neutral-900/70 dark:bg-black/70 text-neutral-700 dark:text-white/70 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[#53c7ff]" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                      <div className="aspect-square overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black">
                        <Image
                          src={listing.image}
                          alt={`cPEG #${listing.peg_id}`}
                          width={320}
                          height={320}
                          unoptimized
                          className="h-full w-full object-cover [image-rendering:pixelated]"
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="font-mono text-xs uppercase tracking-wide text-neutral-600 dark:text-white/65">
                          #{listing.peg_id}
                        </p>
                        <p className="font-mono text-sm font-black tracking-tight text-[#53c7ff]">
                          {listing.price_sol} SOL
                        </p>
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/35">
                        <span>{truncateAddress(listing.seller)}</span>
                        {listing.listed_at ? (
                          <CpegRelativeTime iso={listing.listed_at} className="text-neutral-500 dark:text-white/35" />
                        ) : null}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-1 font-mono text-[9px] uppercase tracking-[0.14em]">
                        <FeeCell label="Seller" value={listing.seller_proceeds_sol || "--"} accent="text-neutral-900 dark:text-[#f7f2df]" />
                        <FeeCell label="Royal" value={listing.creator_royalty_sol || "--"} accent="text-[#53c7ff]" />
                        <FeeCell label="Fee" value={listing.protocol_fee_sol || "--"} accent="text-neutral-600 dark:text-white/65" />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleBuy(listing)}
                          disabled={Boolean(busy) || isOwn}
                          className="inline-flex items-center justify-center gap-1 border border-[#53c7ff]/45 bg-[#53c7ff]/10 px-2 py-2 text-[10px] font-black uppercase tracking-wide text-[#53c7ff] transition hover:bg-[#53c7ff]/20 disabled:opacity-40"
                        >
                          {busy === `buy-${listing.peg_id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ShoppingCart className="h-3 w-3" />
                          )}
                          Buy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancel(listing)}
                          disabled={Boolean(busy) || !isOwn}
                          className="inline-flex items-center justify-center gap-1 border border-neutral-300 dark:border-white/15 px-2 py-2 text-[10px] font-black uppercase tracking-wide text-neutral-700 dark:text-white/55 transition hover:border-red-300/40 hover:text-red-200 disabled:opacity-30"
                        >
                          {busy === `cancel-${listing.peg_id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {isOwn ? "Cancel" : "-"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border border-dashed border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] py-16 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">
                  No listings match your filter
                </p>
                <p className="mt-2 text-xs text-neutral-400 dark:text-white/30">
                  Try a different sort, clear the filters, or open another collection.
                </p>
              </div>
            )}
          </div>
        </div>

        <aside className="grid gap-4 self-start lg:sticky lg:top-24">
          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#53c7ff]">
                Live activity
              </p>
              <RefreshCw
                className={`h-3 w-3 text-neutral-400 dark:text-white/30 ${loadingActivity ? "animate-spin" : ""}`}
              />
            </div>
            {activity.length ? (
              <div className="mt-3 grid gap-2">
                {activity.slice(0, 12).map((event) => {
                  const accent =
                    event.kind === "FILLED"
                      ? "text-[#53c7ff]"
                      : event.kind === "CANCELLED"
                      ? "text-neutral-500 dark:text-white/40"
                      : "text-neutral-900 dark:text-[#f7f2df]";
                  return (
                    <a
                      key={event.id}
                      href={
                        event.tx && selectedLaunch
                          ? explorerTxUrl(event.tx, selectedLaunch.cluster)
                          : undefined
                      }
                      target={event.tx ? "_blank" : undefined}
                      rel={event.tx ? "noreferrer" : undefined}
                      className="group flex items-center gap-3 border border-neutral-200 dark:border-white/8 bg-neutral-100 dark:bg-[#0a0a0a] p-2 transition hover:border-[#53c7ff]/40"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={event.image}
                          alt={`#${event.peg_id}`}
                          className="h-full w-full object-cover [image-rendering:pixelated]"
                          loading="lazy"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${accent}`}>
                            {event.kind === "FILLED" ? "Sold" : event.kind === "CANCELLED" ? "Delisted" : "Listed"}
                          </span>
                          <span className="font-mono text-xs font-black text-[#53c7ff]">
                            {event.price_sol}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
                          #{event.peg_id} · {truncateAddress(event.seller)}
                        </p>
                        <CpegRelativeTime
                          iso={event.at}
                          className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/35"
                        />
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-xs text-neutral-500 dark:text-white/40">No activity yet for this collection.</p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function ListingsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-2">
          <div className="aspect-square animate-pulse bg-neutral-100/95 dark:bg-white/[0.03]" />
          <div className="mt-3 h-3 w-12 animate-pulse bg-neutral-200/70 dark:bg-white/[0.05]" />
          <div className="mt-2 h-2 w-20 animate-pulse bg-neutral-50 dark:bg-white/[0.04]" />
          <div className="mt-3 grid grid-cols-3 gap-1">
            <div className="h-7 animate-pulse bg-neutral-50 dark:bg-white/[0.04]" />
            <div className="h-7 animate-pulse bg-neutral-50 dark:bg-white/[0.04]" />
            <div className="h-7 animate-pulse bg-neutral-50 dark:bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface FeeCellProps {
  label: string;
  value: string;
  accent: string;
}

function FeeCell({ label, value, accent }: FeeCellProps) {
  return (
    <div className="border border-neutral-200 dark:border-white/8 bg-neutral-100/90 dark:bg-black/40 px-1 py-1 text-center">
      <div className="text-[8px] uppercase tracking-[0.18em] text-neutral-400 dark:text-white/30">{label}</div>
      <div className={`mt-0.5 ${accent}`}>{value}</div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}

function Row({ label, value, highlight, muted }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? "text-neutral-500 dark:text-white/35" : "text-neutral-700 dark:text-white/55"}>{label}</span>
      <span className={highlight ? "text-[#53c7ff]" : muted ? "text-neutral-700 dark:text-white/55" : "text-neutral-900 dark:text-[#f7f2df]"}>
        {value}
      </span>
    </div>
  );
}
