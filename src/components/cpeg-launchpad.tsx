"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  PartyPopper,
  RefreshCw,
  Rocket,
} from "lucide-react";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { CpegContractBar } from "@/components/cpeg-contract-bar";
import { CpegHybridPanel } from "@/components/cpeg-hybrid-panel";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { useCpegSite } from "@/components/cpeg-site-context";
import { describeError, explorerTxUrl, truncateAddress } from "@/lib/cpeg-ui";
import { cpegPublicPaths } from "@/lib/cpeg-site-paths";

type SolanaWeb3Transaction = InstanceType<typeof Transaction> | InstanceType<typeof VersionedTransaction>;

interface LaunchInstructionAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface LaunchInstruction {
  programId: string;
  accounts: LaunchInstructionAccount[];
  dataBase64: string;
}

interface LaunchPreparePayload {
  success: boolean;
  error?: string;
  requires_signature?: boolean;
  standard_mode?: "custom_registry" | "metaplex_hybrid";
  launch?: {
    token_mint: string;
    cluster?: "devnet" | "mainnet-beta";
    collection_address: string | null;
    hook_validation_address: string | null;
    renderer_id: string;
    renderer_version: string;
    renderer_hash: string;
    collection_seed: string;
    peg_unit_raw?: string;
    renderer_params: Record<string, unknown>;
    max_pegs: number;
    royalty_bps: number;
    marketplace_fee_bps: number;
    launch_fee_lamports?: string;
    standard_mode?: "custom_registry" | "metaplex_hybrid";
    identity_mode?: "standalone" | "metaplex_agent";
    canonical_root?: string | null;
    agent_asset_address?: string | null;
    agent_identity_pda?: string | null;
    agent_collection_address?: string | null;
    agent_wallet_address?: string | null;
    agent_registry_program_id?: string | null;
    agent_token_mint?: string | null;
    agent_token_launch_id?: string | null;
    hybrid_program_id?: string | null;
    hybrid_escrow_address?: string | null;
    hybrid_core_collection_address?: string | null;
    hybrid_asset_collection_address?: string | null;
    hybrid_swap_amount_raw?: string;
    hybrid_capture_fee_lamports?: string;
    hybrid_reroll?: boolean;
    hybrid_status?: string;
    hybrid_plan?: Record<string, unknown>;
  };
  token2022_setup?: {
    mint_account_size: number;
    rent_lamports: string;
    instructions: LaunchInstruction[];
  };
  manifest?: {
    program_id: string;
    cluster: "devnet" | "mainnet-beta";
    instructions: LaunchInstruction[];
  };
  fees?: {
    launch_fee_lamports?: string;
    premium_indexing_fee_lamports?: string;
    total_lamports?: string;
  };
  hybrid_setup?: Record<string, unknown>;
}

interface AgentRootPayload {
  success: boolean;
  agent_root?: {
    agent_id: string;
    agent_name: string;
    identity_mode: "metaplex_agent";
    canonical_root: string;
    agent_asset_address: string;
    agent_identity_pda: string;
    agent_collection_address: string | null;
    agent_wallet_address: string | null;
    agent_registry_program_id: string;
    agent_token_launch_id: string | null;
    agent_token_name: string | null;
    agent_token_symbol: string | null;
    agent_token_mint: string | null;
    agent_token_chain: string | null;
    agent_token_network: string | null;
  } | null;
}

interface FeeQuote {
  launch: {
    base_lamports: string;
    base_sol: string;
    premium_lamports: string;
    premium_sol: string;
    total_lamports: string;
    total_sol: string;
  };
  rent: {
    lamports: string;
    sol: string;
  };
  total_sol: string;
}

interface LaunchTokenStatePayload {
  success: boolean;
  token?: {
    whole_units: number;
    is_sealed: boolean;
    metadata: { name: string; symbol: string; uri: string } | null;
  };
}

interface LaunchDexCompatibilityPayload {
  success: boolean;
  token?: { is_token_2022: boolean };
  hook?: { matches_cpeg_program: boolean };
  collection?: {
    collection_exists: boolean;
    validation_exists: boolean;
  };
  dex?: {
    official_router: { available: boolean };
    orca: { candidate: boolean; blockers?: string[] };
    meteora: { candidate: boolean; blockers?: string[] };
  };
}

interface LaunchStatsPayload {
  success: boolean;
  market?: {
    active_listings: number;
    filled_listings: number;
  };
}

interface LaunchPegsPayload {
  success: boolean;
  pegs?: Array<{ minted: boolean }>;
}

interface LaunchReadiness {
  token2022: boolean;
  transferHook: boolean;
  metadata: boolean;
  supplyMinted: boolean;
  initialPegsAssigned: boolean;
  marketOpen: boolean;
  routeAvailable: boolean;
  orcaCandidate: boolean;
  meteoraCandidate: boolean;
  sealed: boolean;
}

const DEFAULT_FORM = {
  name: "",
  symbol: "",
  subject: "ape",
  maxPegs: "1000",
  decimals: "6",
};

const FIXED_CREATOR_ROYALTY_BPS = 200;
const MAX_PEGS_PER_COLLECTION = 10_000;

const SUBJECT_OPTIONS: Array<[string, string]> = [
  ["ape", "Ape"],
  ["agent", "Agent"],
  ["alien", "Alien"],
  ["azuki", "Azuki"],
  ["bear", "Bear"],
  ["bird", "Bird"],
  ["cat", "Cat"],
  ["demon", "Demon"],
  ["dog", "Dog"],
  ["dragon", "Dragon"],
  ["fox", "Fox"],
  ["frog", "Frog"],
  ["ghost", "Ghost"],
  ["horse", "Horse"],
  ["lion", "Lion"],
  ["meme", "Meme"],
  ["monkey", "Monkey"],
  ["ninja", "Ninja"],
  ["panda", "Panda"],
  ["penguin", "Penguin"],
  ["punk", "Punk"],
  ["robot", "Robot"],
  ["samurai", "Samurai"],
  ["skeleton", "Skeleton"],
  ["sports", "Athlete"],
  ["unicorn", "Unicorn"],
  ["vampire", "Vampire"],
  ["wizard", "Wizard"],
  ["wolf", "Wolf"],
  ["zombie", "Zombie"],
];

const SUBJECT_EMOJI: Record<string, string> = {
  ape: "\u{1F435}",
  agent: "\u{1F575}",
  monkey: "\u{1F412}",
  cat: "\u{1F408}",
  dog: "\u{1F415}",
  robot: "\u{1F916}",
  alien: "\u{1F47D}",
  dragon: "\u{1F432}",
  wizard: "\u{1F9D9}",
  samurai: "\u{1F5E1}",
  ninja: "\u{1F977}",
  ghost: "\u{1F47B}",
  frog: "\u{1F438}",
  bear: "\u{1F43B}",
  bird: "\u{1F426}",
  horse: "\u{1F40E}",
  sports: "\u{1F3C6}",
  meme: "\u{1F602}",
  unicorn: "\u{1F984}",
  punk: "\u{1F3B8}",
  azuki: "\u{1F338}",
  fox: "\u{1F98A}",
  wolf: "\u{1F43A}",
  zombie: "\u{1F9DF}",
  demon: "\u{1F608}",
  vampire: "\u{1F9DB}",
  skeleton: "\u{1F480}",
  lion: "\u{1F981}",
  penguin: "\u{1F427}",
  panda: "\u{1F43C}",
};

const PREVIEW_PEG_IDS = [1, 7, 23, 47, 88, 142];

const SUGGESTED_NAMES: Array<[string, string, string]> = [
  ["Claw Apes", "CLAWAPE", "ape"],
  ["Shadow Pack", "SHDW", "ape"],
  ["Volcanic Tribe", "VOLT", "ape"],
  ["Cyber Agents", "CYAGT", "agent"],
  ["Frost Wardens", "FROST", "ape"],
  ["Gold Standard", "GLD", "ape"],
  ["Pixel Punks", "PPUNK", "punk"],
  ["Spirit Azuki", "AZUKI", "azuki"],
  ["Ether Unicorns", "UNICORN", "unicorn"],
];

function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function manifestToInstruction(instruction: LaunchInstruction) {
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

function getClientRpcUrl(cluster: "devnet" | "mainnet-beta") {
  const configured =
    process.env["NEXT_PUBLIC_CPEG_BROWSER_RPC_URL"] ||
    process.env["NEXT_PUBLIC_SOLANA_BROWSER_RPC_URL"];
  if (configured) return configured;
  return clusterApiUrl(cluster);
}

function lamportsToSolDisplay(value?: string) {
  if (!value) return "0";
  return (Number(value) / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

interface LaunchResult {
  signature?: string | null;
  cluster: "devnet" | "mainnet-beta";
  mint: string;
  collection?: string | null;
  validation?: string | null;
  rendererHash: string;
  standardMode?: "custom_registry" | "metaplex_hybrid";
  hybridStatus?: string | null;
  agentAsset?: string | null;
  agentIdentity?: string | null;
  agentTokenMint?: string | null;
  authorityAddress?: string | null;
}

interface LaunchLookupPayload {
  success: boolean;
  launches?: Array<{
    name: string;
    symbol: string;
    token_mint: string;
    collection_address: string | null;
    hook_validation_address: string | null;
    cluster: "devnet" | "mainnet-beta";
    renderer_hash: string | null;
    standard_mode?: "custom_registry" | "metaplex_hybrid";
    hybrid_status?: string | null;
    agent_asset_address?: string | null;
    agent_identity_pda?: string | null;
    agent_token_mint?: string | null;
    authority_address?: string | null;
  }>;
}

type OwnerLaunchShortcut = NonNullable<LaunchLookupPayload["launches"]>[number];

export function CpegLaunchpad() {
  const { solanaAddress, isConnected, login } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCpegSite = useCpegSite();
  const cpegUrls = useMemo(() => cpegPublicPaths(isCpegSite), [isCpegSite]);
  const [form, setForm] = useState(DEFAULT_FORM);
  /** Shifts preview collection seed so non-subject traits re-roll in the grid (not used on-chain). */
  const [previewVariance, setPreviewVariance] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [feeQuote, setFeeQuote] = useState<FeeQuote | null>(null);
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [agentRoot, setAgentRoot] = useState<AgentRootPayload["agent_root"]>(null);
  const [agentRootLoading, setAgentRootLoading] = useState(false);
  const [showAdvancedResult, setShowAdvancedResult] = useState(false);
  const [ownerLaunches, setOwnerLaunches] = useState<OwnerLaunchShortcut[]>([]);

  const connectedAddress = solanaAddress || "";
  const launchMintFromUrl = searchParams?.get("mint") || "";

  const normalizedSymbol = useMemo(() => form.symbol.trim().toUpperCase(), [form.symbol]);
  const symbolValid = useMemo(() => /^[A-Z0-9]{1,12}$/.test(normalizedSymbol), [normalizedSymbol]);
  const nameValid = form.name.trim().length >= 2;
  const maxPegsNumber = useMemo(() => Number.parseInt(form.maxPegs, 10), [form.maxPegs]);
  const maxPegsValid = Number.isFinite(maxPegsNumber) && maxPegsNumber > 0 && maxPegsNumber <= MAX_PEGS_PER_COLLECTION;
  const decimalsNumber = useMemo(() => Number.parseInt(form.decimals, 10), [form.decimals]);
  const decimalsValid = Number.isFinite(decimalsNumber) && decimalsNumber >= 0 && decimalsNumber <= 9;

  const formValid = nameValid && symbolValid && maxPegsValid && decimalsValid;
  const canLaunch =
    Boolean(connectedAddress) &&
    formValid &&
    Boolean(agentRoot?.agent_asset_address) &&
    Boolean(agentRoot?.agent_token_mint);

  const previewQuery = useMemo(() => {
    const params = new URLSearchParams({ subject: form.subject });
    if (previewVariance) params.set("v", previewVariance);
    return params.toString();
  }, [form.subject, previewVariance]);

  // Fetch the live fee quote so that the user sees the actual launch cost before signing.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/cpeg");
        const body = (await response.json().catch(() => null)) as
          | { success?: boolean; fees?: { launch?: Record<string, string> } }
          | null;
        if (cancelled || !body?.success) return;
        const launch = body.fees?.launch as
          | {
              base_lamports?: string;
              premium_lamports?: string;
              total_lamports?: string;
              base_sol?: string;
              premium_sol?: string;
              total_sol?: string;
            }
          | undefined;
        const rentLamports = (body.fees as { rent_lamports?: string } | undefined)?.rent_lamports;
        if (launch?.total_lamports) {
          setFeeQuote({
            launch: {
              base_lamports: launch.base_lamports || "0",
              base_sol: launch.base_sol || "0",
              premium_lamports: launch.premium_lamports || "0",
              premium_sol: launch.premium_sol || "0",
              total_lamports: launch.total_lamports,
              total_sol: launch.total_sol || lamportsToSolDisplay(launch.total_lamports),
            },
            rent: {
              lamports: rentLamports || "0",
              sol: lamportsToSolDisplay(rentLamports),
            },
            total_sol: lamportsToSolDisplay(
              (BigInt(launch.total_lamports || "0") + BigInt(rentLamports || "0")).toString()
            ),
          });
        }
      } catch {
        // Quote is decorative; ignore failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!launchMintFromUrl || result?.mint === launchMintFromUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/cpeg?limit=80", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as LaunchLookupPayload | null;
        if (cancelled || !response.ok || !body?.success) return;
        const launch = (body.launches || []).find((item) => item.token_mint === launchMintFromUrl);
        if (!launch) return;
        setForm((current) => ({
          ...current,
          name: launch.name || current.name,
          symbol: launch.symbol || current.symbol,
        }));
        setResult({
          signature: null,
          cluster: launch.cluster || "mainnet-beta",
          mint: launch.token_mint,
          collection: launch.collection_address,
          validation: launch.hook_validation_address,
          rendererHash: launch.renderer_hash || "",
          standardMode: launch.standard_mode,
          hybridStatus: launch.hybrid_status || null,
          agentAsset: launch.agent_asset_address || null,
          agentIdentity: launch.agent_identity_pda || null,
          agentTokenMint: launch.agent_token_mint || launch.token_mint,
          authorityAddress: launch.authority_address || null,
        });
      } catch {
        // If the saved launch cannot be restored, keep the normal launch form.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launchMintFromUrl, result?.mint]);

  useEffect(() => {
    let cancelled = false;
    if (!connectedAddress) {
      setOwnerLaunches([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const response = await fetch("/api/cpeg?limit=60", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as LaunchLookupPayload | null;
        if (cancelled || !response.ok || !body?.success) return;
        setOwnerLaunches(
          (body.launches || []).filter((launch) => launch.authority_address === connectedAddress).slice(0, 6)
        );
      } catch {
        if (!cancelled) setOwnerLaunches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  const copyValue = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value).catch(() => {});
  }, []);

  useEffect(() => {
    if (!connectedAddress) {
      setAgentRoot(null);
      return;
    }
    let cancelled = false;
    setAgentRootLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/cpeg/agent-root?wallet=${encodeURIComponent(connectedAddress)}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as AgentRootPayload | null;
        if (!cancelled) setAgentRoot(body?.success ? body.agent_root || null : null);
      } catch {
        if (!cancelled) setAgentRoot(null);
      } finally {
        if (!cancelled) setAgentRootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  const updateForm = useCallback(<K extends keyof typeof DEFAULT_FORM>(key: K, value: (typeof DEFAULT_FORM)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const handleLaunch = useCallback(async () => {
    setError("");
    setStatus("");
    setResult(null);

    if (!isConnected || !connectedAddress) {
      login();
      return;
    }
    if (!canLaunch) {
      setError(
        agentRoot?.agent_asset_address && !agentRoot?.agent_token_mint
          ? "Launch an agent token first, then return to cPEG."
          : agentRoot?.agent_asset_address
            ? "Please complete the form before launching."
            : "Connect the wallet that owns your verified Clawdmint agent before launching."
      );
      return;
    }

    setLaunching(true);
    try {
      const agentTokenMint = agentRoot?.agent_token_mint || "";
      setStatus("Preparing your cPEG collection...");
      const prepareResponse = await fetch("/api/cpeg/launchpad/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          symbol: normalizedSymbol,
          token_mint: agentTokenMint,
          authority_address: connectedAddress,
          max_pegs: maxPegsNumber,
          decimals: decimalsNumber,
          royalty_bps: FIXED_CREATOR_ROYALTY_BPS,
          premium_indexing: true,
          standard_mode: "metaplex_hybrid",
          agent_token_mint: agentTokenMint,
          identity_mode: "metaplex_agent",
          agent_asset_address: agentRoot?.agent_asset_address || undefined,
          agent_identity_pda: agentRoot?.agent_identity_pda || undefined,
          agent_collection_address: agentRoot?.agent_collection_address || undefined,
          agent_wallet_address: agentRoot?.agent_wallet_address || undefined,
          agent_name: agentRoot?.agent_name || undefined,
          agent_token_launch_id: agentRoot?.agent_token_launch_id || undefined,
          renderer_params: {
            subject: form.subject,
            palette: "auto",
            accessory: "auto",
            background: "auto",
            vibe: "auto",
          },
        }),
      });
      const prepareBody = (await prepareResponse.json().catch(() => null)) as LaunchPreparePayload | null;
      if (!prepareResponse.ok || !prepareBody?.success || !prepareBody.launch) {
        throw new Error(prepareBody?.error || "Failed to prepare launch transaction.");
      }

      if (prepareBody.requires_signature === false || prepareBody.standard_mode === "metaplex_hybrid") {
        const provider = getPhantomProvider();
        if (!provider?.signMessage) {
          setError("Phantom message signing is required for cPEG launch.");
          setStatus("");
          return;
        }
        const approvalMessage = [
          "ClawPEG Launch Approval",
          `Name: ${form.name.trim()}`,
          `Symbol: ${normalizedSymbol}`,
          `Token: ${prepareBody.launch.token_mint}`,
          `Renderer: ${prepareBody.launch.renderer_hash}`,
          `Authority: ${connectedAddress}`,
          `Agent: ${prepareBody.launch.agent_asset_address || ""}`,
        ].join("\n");
        setStatus("Opening Phantom for launch approval...");
        const signedApproval = await provider.signMessage(new TextEncoder().encode(approvalMessage), "utf8");
        const approvalSignature =
          signedApproval instanceof Uint8Array ? signedApproval : signedApproval.signature;

        setStatus("Publishing your cPEG collection...");
        const confirmResponse = await fetch("/api/cpeg/launchpad/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            symbol: normalizedSymbol,
            token_mint: prepareBody.launch.token_mint,
            authority_address: connectedAddress,
            creator_address: connectedAddress,
            standard_mode: "metaplex_hybrid",
            wallet_message: approvalMessage,
            wallet_signature: bytesToBase64(approvalSignature),
            collection_address: prepareBody.launch.collection_address,
            hook_validation_address: prepareBody.launch.hook_validation_address,
            renderer_id: prepareBody.launch.renderer_id,
            renderer_version: prepareBody.launch.renderer_version,
            renderer_hash: prepareBody.launch.renderer_hash,
            collection_seed: prepareBody.launch.collection_seed,
            peg_unit_raw: prepareBody.launch.peg_unit_raw,
            max_pegs: prepareBody.launch.max_pegs,
            royalty_bps: prepareBody.launch.royalty_bps,
            marketplace_fee_bps: prepareBody.launch.marketplace_fee_bps,
            launch_fee_lamports: prepareBody.launch.launch_fee_lamports,
            renderer_params: prepareBody.launch.renderer_params,
            identity_mode: prepareBody.launch.identity_mode || "metaplex_agent",
            agent_asset_address: prepareBody.launch.agent_asset_address || undefined,
            agent_identity_pda: prepareBody.launch.agent_identity_pda || undefined,
            agent_collection_address: prepareBody.launch.agent_collection_address || undefined,
            agent_wallet_address: prepareBody.launch.agent_wallet_address || undefined,
            agent_token_mint: prepareBody.launch.agent_token_mint || prepareBody.launch.token_mint,
            agent_token_launch_id: agentRoot?.agent_token_launch_id || undefined,
            hybrid_program_id: prepareBody.launch.hybrid_program_id || null,
            hybrid_escrow_address: prepareBody.launch.hybrid_escrow_address || null,
            hybrid_core_collection_address: prepareBody.launch.hybrid_core_collection_address || null,
            hybrid_asset_collection_address: prepareBody.launch.hybrid_asset_collection_address || null,
            hybrid_swap_amount_raw: prepareBody.launch.hybrid_swap_amount_raw,
            hybrid_capture_fee_lamports: prepareBody.launch.hybrid_capture_fee_lamports,
            hybrid_reroll: prepareBody.launch.hybrid_reroll,
            hybrid_status: prepareBody.launch.hybrid_status,
            hybrid_plan: prepareBody.launch.hybrid_plan || prepareBody.hybrid_setup || {},
          }),
        });
        const confirmBody = (await confirmResponse.json().catch(() => null)) as
          | { success?: boolean; error?: string }
          | null;
        if (!confirmResponse.ok || !confirmBody?.success) {
          throw new Error(confirmBody?.error || "Failed to publish cPEG collection.");
        }
        setResult({
          signature: null,
          cluster: prepareBody.launch.cluster || "mainnet-beta",
          mint: prepareBody.launch.token_mint,
          collection: prepareBody.launch.collection_address,
          validation: prepareBody.launch.hook_validation_address,
          rendererHash: prepareBody.launch.renderer_hash,
          standardMode: "metaplex_hybrid",
          hybridStatus: prepareBody.launch.hybrid_status || null,
          agentAsset: prepareBody.launch.agent_asset_address || null,
          agentIdentity: prepareBody.launch.agent_identity_pda || null,
          agentTokenMint: prepareBody.launch.agent_token_mint || prepareBody.launch.token_mint,
          authorityAddress: connectedAddress,
        });
        router.replace(`${cpegUrls.launch}?mint=${encodeURIComponent(prepareBody.launch.token_mint)}`, { scroll: false });
        setStatus("");
        return;
      }

      if (!prepareBody.token2022_setup || !prepareBody.manifest) {
        throw new Error("Launch transaction manifest is missing.");
      }

      const provider = getPhantomProvider();
      if (!provider?.signTransaction) {
        setError("Phantom transaction signing is unavailable.");
        return;
      }
      const mint = Keypair.generate();

      setStatus("Opening Phantom for launch signature...");
      const cluster = prepareBody.manifest.cluster;
      const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
      const transaction = new Transaction();
      for (const instruction of [
        ...prepareBody.token2022_setup.instructions,
        ...prepareBody.manifest.instructions,
      ]) {
        transaction.add(manifestToInstruction(instruction));
      }

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = new PublicKey(connectedAddress);
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.partialSign(mint);

      const signedTransaction = (await provider.signTransaction(transaction as SolanaWeb3Transaction)) as SolanaWeb3Transaction;
      const rawTransaction =
        signedTransaction instanceof VersionedTransaction
          ? signedTransaction.serialize()
          : signedTransaction.serialize({ requireAllSignatures: true, verifySignatures: false });

      // Diagnostic-only preflight: surface raw program logs to the browser console so
      // launch failures can be triaged without exposing secrets in the UI. The actual
      // broadcast still runs preflight via sendRawTransaction below.
      try {
        const sim = await connection.simulateTransaction(
          signedTransaction as SolanaWeb3Transaction,
          { sigVerify: false, commitment: "confirmed" } as Parameters<typeof connection.simulateTransaction>[1]
        );
        if (sim.value.err) {
          console.warn("[cpeg-launch] preflight err:", sim.value.err);
        }
        if (sim.value.logs?.length) {
          console.info("[cpeg-launch] preflight logs:\n" + sim.value.logs.join("\n"));
        }
      } catch (simError) {
        console.warn("[cpeg-launch] preflight simulate threw:", simError);
      }

      setStatus("Broadcasting cPEG launch transaction...");
      const signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      await fetch("/api/cpeg/launchpad/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          symbol: normalizedSymbol,
          signature,
          token_mint: prepareBody.launch.token_mint,
          collection_address: prepareBody.launch.collection_address,
          hook_validation_address: prepareBody.launch.hook_validation_address,
          renderer_id: prepareBody.launch.renderer_id,
          renderer_version: prepareBody.launch.renderer_version,
          renderer_params: prepareBody.launch.renderer_params,
          identity_mode: prepareBody.launch.identity_mode || "standalone",
          agent_asset_address: prepareBody.launch.agent_asset_address || undefined,
          agent_identity_pda: prepareBody.launch.agent_identity_pda || undefined,
          agent_collection_address: prepareBody.launch.agent_collection_address || undefined,
          agent_wallet_address: prepareBody.launch.agent_wallet_address || undefined,
        }),
      }).catch(() => null);

      setResult({
        signature,
        cluster,
        mint: prepareBody.launch.token_mint,
        collection: prepareBody.launch.collection_address,
        validation: prepareBody.launch.hook_validation_address,
        rendererHash: prepareBody.launch.renderer_hash,
        authorityAddress: connectedAddress,
      });
      router.replace(`${cpegUrls.launch}?mint=${encodeURIComponent(prepareBody.launch.token_mint)}`, { scroll: false });
      setStatus("");
    } catch (launchError) {
      setError(describeError(launchError, "Failed to launch cPEG."));
      setStatus("");
    } finally {
      setLaunching(false);
    }
  }, [
    canLaunch,
    connectedAddress,
    decimalsNumber,
    form.name,
    form.subject,
    isConnected,
    login,
    maxPegsNumber,
    normalizedSymbol,
    agentRoot,
    router,
    cpegUrls.launch,
  ]);

  useEffect(() => {
    if (!result?.mint) {
      setReadiness(null);
      return;
    }
    if (result.standardMode === "metaplex_hybrid") {
      setReadiness(null);
      setReadinessLoading(false);
      return;
    }
    let cancelled = false;
    setReadinessLoading(true);
    void (async () => {
      try {
        const [tokenRes, dexRes, statsRes, pegsRes, probeRes] = await Promise.all([
          fetch(`/api/cpeg/${result.mint}/token`, { cache: "no-store" }),
          fetch(`/api/cpeg/${result.mint}/dex/compatibility`, { cache: "no-store" }),
          fetch(`/api/cpeg/${result.mint}/stats`, { cache: "no-store" }),
          fetch(`/api/cpeg/${result.mint}/pegs?start=1&limit=8`, { cache: "no-store" }),
          fetch(`/api/cpeg/${result.mint}/dex?side=buy&preview_sol=0.1`, { cache: "no-store" }),
        ]);
        const tokenBody = (await tokenRes.json().catch(() => null)) as LaunchTokenStatePayload | null;
        const dexBody = (await dexRes.json().catch(() => null)) as LaunchDexCompatibilityPayload | null;
        const statsBody = (await statsRes.json().catch(() => null)) as LaunchStatsPayload | null;
        const pegsBody = (await pegsRes.json().catch(() => null)) as LaunchPegsPayload | null;
        const probeBody = (await probeRes.json().catch(() => null)) as { has_route?: boolean } | null;
        if (cancelled) return;
        setReadiness({
          token2022: Boolean(dexBody?.token?.is_token_2022),
          transferHook: Boolean(dexBody?.hook?.matches_cpeg_program),
          metadata: Boolean(tokenBody?.token?.metadata),
          supplyMinted: Boolean((tokenBody?.token?.whole_units || 0) > 0),
          initialPegsAssigned: Boolean((pegsBody?.pegs || []).some((peg) => peg.minted)),
          marketOpen: Boolean((statsBody?.market?.active_listings || 0) > 0 || (statsBody?.market?.filled_listings || 0) > 0),
          routeAvailable: Boolean(probeBody?.has_route),
          orcaCandidate: Boolean(dexBody?.dex?.orca?.candidate),
          meteoraCandidate: Boolean(dexBody?.dex?.meteora?.candidate),
          sealed: Boolean(tokenBody?.token?.is_sealed),
        });
      } catch {
        if (!cancelled) setReadiness(null);
      } finally {
        if (!cancelled) setReadinessLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result?.mint, result?.standardMode]);

  if (result) {
    const isHybridLaunch = result.standardMode === "metaplex_hybrid";
    const resultRows = isHybridLaunch
      ? [
          ["Agent token", result.agentTokenMint || result.mint],
          ["Agent Core asset", result.agentAsset || ""],
          ["Agent identity", result.agentIdentity || ""],
          ["Renderer hash", result.rendererHash],
        ].filter(([, value]) => value)
      : [
          ["Token mint", result.mint],
          ["Collection PDA", result.collection || ""],
          ["Validation PDA", result.validation || ""],
          ["Renderer hash", result.rendererHash],
        ].filter(([, value]) => value);
    return (
      <section className="border-y border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#101010]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-[1fr_420px] md:px-10 md:py-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#53c7ff]">Launch complete</p>
            <h2 className="mt-4 flex items-center gap-3 text-4xl font-black uppercase leading-none md:text-5xl">
              <PartyPopper className="h-10 w-10 text-[#53c7ff]" />
              {`${form.name || "cPEG"} is ready.`}
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-neutral-700 dark:text-white/70">
              {isHybridLaunch
                ? "Your agent token is now linked to a cPEG collection. Holders can buy the token, get cPEG, release it back to tokens, or trade exact cPEG identities."
                : "Your cPEG collection is live on-chain. The contract address below is your official asset. Share it with holders and agents."}
            </p>

            <div className="mt-7">
              <CpegContractBar
                tokenMint={result.mint}
                cluster={result.cluster}
                symbol={form.symbol || "CPEG"}
              />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <SuccessCell title="Agent token" text="Linked" />
              <SuccessCell title="Art rule" text="Saved" />
              <SuccessCell title="Market profile" text="Ready" />
            </div>

            {isHybridLaunch ? (
              <div className="mt-8">
                <CpegHybridPanel tokenMint={result.mint} initialAuthorityAddress={result.authorityAddress} />
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              {isHybridLaunch ? (
                <a
                  href={`${cpegUrls.home.replace(/\/$/, "")}/${encodeURIComponent(result.mint)}`}
                  className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
                >
                  Get cPEG <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <a
                  href={cpegUrls.market({ mint: result.mint })}
                  className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
                >
                  Open market <ArrowRight className="h-4 w-4" />
                </a>
              )}
              <a
                href={`${cpegUrls.explore}?mint=${encodeURIComponent(result.mint)}`}
                className="inline-flex items-center gap-2 border border-neutral-400 dark:border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wide text-neutral-950 dark:text-white transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
              >
                View gallery <ArrowRight className="h-4 w-4" />
              </a>
              {result.signature ? (
                <a
                  href={explorerTxUrl(result.signature, result.cluster)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 border border-neutral-400 dark:border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wide text-neutral-950 dark:text-white transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
                >
                  View transaction <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowAdvancedResult((value) => !value)}
                className="inline-flex items-center gap-2 border border-neutral-300 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/15 dark:text-white/55"
              >
                Advanced details
                <ChevronDown className={`h-3 w-3 transition ${showAdvancedResult ? "rotate-180" : ""}`} />
              </button>
              {showAdvancedResult ? (
                <div className="mt-3 grid gap-2 font-mono text-xs text-neutral-700 dark:text-white/72">
                  {resultRows.map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => copyValue(value)}
                      className="group flex items-center justify-between gap-3 border border-neutral-200 bg-neutral-100/90 px-3 py-2 text-left transition hover:border-[#53c7ff]/40 dark:border-white/10 dark:bg-black/40"
                    >
                      <span className="text-neutral-500 dark:text-white/40">{label}</span>
                      <span className="flex items-center gap-2">
                        <span className="truncate">{truncateAddress(value, 8, 8)}</span>
                        <Copy className="h-3 w-3 text-neutral-500 transition group-hover:text-[#53c7ff] dark:text-white/35" />
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border border-[#53c7ff]/35 bg-[#53c7ff]/10 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9fe2ff]">Collection preview</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((pegId) => (
                <div key={pegId} className="aspect-square overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/cpeg/preview/svg?pegId=${pegId}&${previewQuery}`}
                    alt={`${form.symbol || "cPEG"} preview #${pegId}`}
                    className="h-full w-full object-cover [image-rendering:pixelated]"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-2 border border-neutral-200 bg-neutral-50/80 p-4 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-600 dark:border-white/10 dark:bg-black/35 dark:text-white/55">
              <Row label="Token link" value="Ready" highlight />
              <Row label="Renderer" value="Saved" highlight />
              <Row label="Gallery" value="Ready" highlight />
              <Row label="Creator royalty" value="2.00%" />
              <Row label="Indexing" value="Included" />
            </div>

            {!isHybridLaunch ? (
              <div className="mt-5 border border-neutral-200 bg-neutral-50/90 p-4 dark:border-white/10 dark:bg-black/40">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#53c7ff]">Readiness</p>
                {readinessLoading ? (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                  Checking on-chain readiness...
                </p>
                ) : readiness ? (
                  <div className="mt-3 grid gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
                    <Row label="Token-2022" value={readiness.token2022 ? "OK" : "Pending"} highlight={readiness.token2022} />
                    <Row label="Transfer hook" value={readiness.transferHook ? "OK" : "Pending"} highlight={readiness.transferHook} />
                    <Row label="Metadata" value={readiness.metadata ? "OK" : "Pending"} highlight={readiness.metadata} />
                    <Row label="Market open" value={readiness.marketOpen ? "Yes" : "No"} highlight={readiness.marketOpen} />
                    <Row label="Mint authority sealed" value={readiness.sealed ? "Yes" : "No"} highlight={readiness.sealed} muted={!readiness.sealed} />
                  </div>
                ) : (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                  Readiness data unavailable.
                </p>
                )}
              </div>
            ) : null}

            <div className="mt-5 border border-neutral-200 bg-neutral-50/90 p-4 dark:border-white/10 dark:bg-black/40">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#53c7ff]">Next</p>
              <div className="mt-3 space-y-3 text-xs leading-6 text-neutral-700 dark:text-white/70">
                <p>
                  Open Get cPEG for token-backed identities, or open the market to list and buy exact cPEGs.
                </p>
                <p className="text-neutral-500 dark:text-white/45">
                  Your public cPEG links stay the same as the collection grows.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const randomizeArt = () => {
    const random = <T,>(arr: Array<[string, T]>) => arr[Math.floor(Math.random() * arr.length)][0];
    updateForm("subject", random(SUBJECT_OPTIONS));
    let next = "";
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      next = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      next = Math.random().toString(36).slice(2, 14);
    }
    setPreviewVariance(next.slice(0, 24));
  };

  const shufflePreviewRoll = () => {
    let next = "";
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      next = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      next = Math.random().toString(36).slice(2, 14);
    }
    setPreviewVariance(next.slice(0, 24));
  };

  const applyPreset = (name: string, symbol: string, subject: string) => {
    updateForm("name", name);
    updateForm("symbol", symbol);
    updateForm("subject", subject);
  };

  return (
    <section className="border-y border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0a0a0a]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.1fr_0.9fr] md:px-10 md:py-14">
        <div className="space-y-5">
          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#53c7ff]">Identity</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Name"
                value={form.name}
                onChange={(value) => updateForm("name", value)}
                placeholder="Claw Apes"
                error={!nameValid && form.name.length > 0 ? "At least 2 characters." : ""}
              />
              <Field
                label="Symbol"
                value={form.symbol}
                onChange={(value) => updateForm("symbol", value.toUpperCase())}
                placeholder="CLAWAPE"
                error={!symbolValid && form.symbol.length > 0 ? "1-12 chars, A-Z 0-9." : ""}
              />
              <Field
                label="Max PEGs"
                value={form.maxPegs}
                onChange={(value) => updateForm("maxPegs", value)}
                inputMode="numeric"
                hint="Whole units only. Protocol limit is 10,000."
                error={!maxPegsValid && form.maxPegs.length > 0 ? "1 to 10,000." : ""}
              />
              <Field
                label="Decimals"
                value={form.decimals}
                onChange={(value) => updateForm("decimals", value)}
                inputMode="numeric"
                error={!decimalsValid && form.decimals.length > 0 ? "0 to 9." : ""}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTED_NAMES.map(([name, symbol, subject]) => (
                <button
                  key={`${name}-${symbol}`}
                  type="button"
                  onClick={() => applyPreset(name, symbol, subject)}
                  className="border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55 transition hover:border-[#53c7ff]/50 hover:text-[#53c7ff]"
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-4 border border-neutral-200 bg-neutral-50/80 p-4 dark:border-white/10 dark:bg-black/35">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#53c7ff]">Agent link</p>
              {agentRootLoading ? (
                <p className="mt-2 text-xs text-neutral-600 dark:text-white/55">Checking your agent...</p>
              ) : agentRoot ? (
                <div className="mt-3 grid gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 dark:text-white/55">
                  <Row label="Agent" value={agentRoot.agent_name} />
                  <Row
                    label="Agent token"
                    value={agentRoot.agent_token_symbol || (agentRoot.agent_token_mint ? truncateAddress(agentRoot.agent_token_mint, 6, 6) : "Missing")}
                    highlight={Boolean(agentRoot.agent_token_mint)}
                    muted={!agentRoot.agent_token_mint}
                  />
                  <Row label="Identity" value="Verified" highlight />
                </div>
              ) : (
                <p className="mt-2 text-xs leading-6 text-neutral-600 dark:text-white/55">
                  No verified agent was found for this wallet. Create or sync your Clawdmint agent first.
                </p>
              )}
            </div>
          </div>

          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#53c7ff]">Character</p>
                <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-white/55">
                  Archetypes set the shared silhouette; some read as a tight PFP bust, others as a full-body sprite (for example Unicorn is a side-profile pegasus). Palette, mood, accessories, and backdrops stay peg-seeded for huge variety per mint.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={randomizeArt}
                  className="inline-flex items-center gap-1.5 border border-neutral-300 dark:border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600 dark:text-white/65 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
                >
                  <RefreshCw className="h-3 w-3" /> Randomize art
                </button>
                <button
                  type="button"
                  onClick={shufflePreviewRoll}
                  className="inline-flex items-center gap-1.5 border border-neutral-300 dark:border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600 dark:text-white/65 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
                >
                  <RefreshCw className="h-3 w-3" /> Shuffle traits
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {SUBJECT_OPTIONS.map(([value, label]) => {
                const isActive = form.subject === value;
                const emoji = SUBJECT_EMOJI[value] || "\u{2728}";
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateForm("subject", value)}
                    aria-pressed={isActive}
                    className={`group relative flex aspect-square flex-col items-center justify-center gap-1 border bg-neutral-100/95 dark:bg-black/30 p-2 transition ${
                      isActive
                        ? "border-[#53c7ff] text-[#53c7ff] shadow-[0_0_18px_rgba(83,199,255,0.25)]"
                        : "border-neutral-200 text-neutral-700 hover:border-[#53c7ff]/50 hover:text-[#53c7ff] dark:border-white/10 dark:text-white/75 dark:hover:border-[#53c7ff]/50"
                    }`}
                  >
                    <span className="text-2xl leading-none" aria-hidden>{emoji}</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em]">{label}</span>
                    {isActive ? (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#53c7ff] shadow-[0_0_8px_rgba(83,199,255,0.9)]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 dark:border-white/10">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                Shared
              </span>
              <span className="border border-neutral-200 bg-neutral-100/95 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600 dark:border-white/10 dark:bg-black/30 dark:text-white/55">
                Archetype
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                Per peg
              </span>
              <span className="border border-neutral-200 bg-neutral-100/95 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600 dark:border-white/10 dark:bg-black/30 dark:text-white/55">
                Palette
              </span>
              <span className="border border-neutral-200 bg-neutral-100/95 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600 dark:border-white/10 dark:bg-black/30 dark:text-white/55">
                Mood
              </span>
              <span className="border border-neutral-200 bg-neutral-100/95 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600 dark:border-white/10 dark:bg-black/30 dark:text-white/55">
                Accessory
              </span>
              <span className="border border-neutral-200 bg-neutral-100/95 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600 dark:border-white/10 dark:bg-black/30 dark:text-white/55">
                Backdrop
              </span>
            </div>
          </div>

          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#53c7ff]">Economics</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <InfoCell label="Creator royalty" value="2.00%" />
              <InfoCell label="Indexing" value="Included" />
              <InfoCell label="Max supply" value="10,000" />
            </div>

            {feeQuote ? (
              <div className="mt-5 grid gap-2 border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/40 p-4 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55">
                <Row label="Protocol fee" value={`${feeQuote.launch.base_sol} SOL`} />
                {BigInt(feeQuote.launch.premium_lamports) > BigInt(0) ? (
                  <Row label="Indexing fee" value={`${feeQuote.launch.premium_sol} SOL`} />
                ) : null}
                {BigInt(feeQuote.rent.lamports) > BigInt(0) ? (
                  <Row label="Estimated rent" value={`${feeQuote.rent.sol} SOL`} muted />
                ) : null}
                <Row
                  label="Total"
                  value={`${feeQuote.total_sol} SOL`}
                  highlight
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#53c7ff]">Live preview</p>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                v0.3.0
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="relative aspect-square overflow-hidden border border-[#53c7ff]/35 bg-neutral-200 shadow-[0_0_35px_rgba(83,199,255,0.12)] dark:bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/cpeg/preview/svg?pegId=${PREVIEW_PEG_IDS[0]}&${previewQuery}`}
                  alt={`Featured preview #${PREVIEW_PEG_IDS[0]}`}
                  className="h-full w-full object-cover [image-rendering:pixelated]"
                />
                <span className="absolute bottom-2 left-2 bg-neutral-950/75 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-white">
                  #{PREVIEW_PEG_IDS[0]}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
              {PREVIEW_PEG_IDS.slice(1).map((pegId) => (
                <div
                  key={pegId}
                  className="relative aspect-square overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/cpeg/preview/svg?pegId=${pegId}&${previewQuery}`}
                    alt={`Preview #${pegId}`}
                    className="h-full w-full object-cover [image-rendering:pixelated]"
                  />
                  <span className="absolute bottom-1 left-1 bg-neutral-950/75 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-white">
                    #{pegId}
                  </span>
                </div>
              ))}
              </div>
            </div>
          </div>

          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">Wallet</p>
                <p className="mt-1 font-mono text-sm text-neutral-950 dark:text-white">
                  {connectedAddress ? truncateAddress(connectedAddress, 6, 6) : "Not connected"}
                </p>
              </div>
              <button
                type="button"
                onClick={isConnected ? handleLaunch : login}
                disabled={launching || (isConnected && !canLaunch)}
                className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {isConnected ? "Launch cPEG" : "Connect Phantom"}
              </button>
            </div>
            {status ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[#53c7ff]">
                <Loader2 className="h-3 w-3 animate-spin" /> {status}
              </p>
            ) : null}
            {error ? (
              <div className="mt-3 border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-200">
                {error}
              </div>
            ) : null}
            {!error && !status && isConnected && !canLaunch ? (
              <p className="mt-3 text-[11px] text-neutral-500 dark:text-white/45">
                {agentRoot?.agent_asset_address
                  ? agentRoot?.agent_token_mint
                    ? "Complete the form to launch."
                    : "Launch an agent token first, then return to cPEG."
                  : "A verified Clawdmint agent is required for new launches."}
              </p>
            ) : null}
            {!isConnected ? (
              <p className="mt-3 text-[11px] text-neutral-700 dark:text-white/55">Connect Phantom on devnet or mainnet.</p>
            ) : null}
          </div>

          {ownerLaunches.length ? (
            <div className="border border-[#ec5cff]/25 bg-[#ec5cff]/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#ec5cff]">Your launches</p>
                  <p className="mt-2 text-xs leading-5 text-neutral-600 dark:text-white/50">
                    Continue setup or reopen the saved launch screen.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {ownerLaunches.map((launch) => (
                  <button
                    key={launch.token_mint}
                    type="button"
                    onClick={() => router.push(`${cpegUrls.launch}?mint=${encodeURIComponent(launch.token_mint)}`)}
                    className="flex items-center justify-between gap-3 border border-neutral-200 bg-neutral-50 px-3 py-3 text-left transition hover:border-[#53c7ff] dark:border-white/10 dark:bg-black/30"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black uppercase text-neutral-950 dark:text-white">
                        {launch.name}
                      </span>
                      <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500 dark:text-white/45">
                        {launch.symbol} / {truncateAddress(launch.token_mint, 5, 5)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[#53c7ff]">
                      Manage
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  inputMode?: "text" | "numeric" | "decimal";
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
        {label}
      </p>
      <p className="mt-2 text-lg font-black uppercase tracking-tight text-neutral-950 dark:text-[#f7f2df]">
        {value}
      </p>
    </div>
  );
}

function SuccessCell({ title, text }: { title: string; text: string }) {
  return (
    <div className="border border-neutral-200 bg-neutral-100/90 p-4 dark:border-white/10 dark:bg-black/35">
      <div className="flex items-center gap-2 text-[#53c7ff]">
        <CheckCircle2 className="h-4 w-4" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{text}</span>
      </div>
      <p className="mt-2 text-sm font-black uppercase tracking-tight text-neutral-950 dark:text-[#f7f2df]">
        {title}
      </p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint, error, inputMode }: FieldProps) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 w-full border bg-neutral-50 dark:bg-white/[0.04] px-3 py-3 text-sm text-neutral-950 dark:text-white outline-none transition focus:border-[#53c7ff] ${
          error ? "border-red-400/60" : "border-neutral-300 dark:border-white/12"
        }`}
      />
      {error ? (
        <span className="mt-1 block text-[10px] text-red-300">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[10px] text-neutral-500 dark:text-white/40">{hint}</span>
      ) : null}
    </label>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full border border-neutral-300 dark:border-white/12 bg-neutral-100 dark:bg-[#151515] px-3 py-3 text-sm text-neutral-950 dark:text-white outline-none transition focus:border-[#53c7ff]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
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
    <div className="flex items-center justify-between">
      <span className={muted ? "text-neutral-500 dark:text-white/35" : "text-neutral-700 dark:text-white/55"}>{label}</span>
      <span className={highlight ? "text-[#53c7ff]" : muted ? "text-neutral-700 dark:text-white/55" : "text-neutral-900 dark:text-[#f7f2df]"}>{value}</span>
    </div>
  );
}
