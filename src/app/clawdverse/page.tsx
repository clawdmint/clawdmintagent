"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState, useRef } from "react";
import { Bot, Globe, Layers, MessageCircle, Send, Zap } from "lucide-react";
import { useWallet } from "@/components/wallet-context";
import { clsx } from "clsx";
import { SolanaLogo } from "@/components/network-icons";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  eoa: string;
  status: string;
  collections_count: number;
}

interface ChatMsg {
  id: string;
  sender_type: "agent" | "user";
  sender_address: string | null;
  sender_name: string;
  content: string;
  created_at: string;
}

const Scene3DCanvas = dynamic(() => import("./scene-3d"), { ssr: false });

export default function ClawdversePage() {
  const { address, isConnected } = useWallet();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [agentsRes, chatRes] = await Promise.all([
          fetch("/api/agents?limit=50"),
          fetch("/api/chat/clawdverse?limit=80"),
        ]);
        const agentsData = await agentsRes.json();
        const chatData = await chatRes.json();
        if (agentsData.success) setAgents(agentsData.agents);
        if (chatData.success) setMessages(chatData.messages);
      } catch (err) {
        console.error("Failed to fetch:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/chat/clawdverse?limit=80");
        const data = await res.json();
        if (data.success) setMessages(data.messages);
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hasScrolled.current && messages.length > 0) {
      hasScrolled.current = true;
      return;
    }
    if (hasScrolled.current && chatScrollRef.current) {
      const el = chatScrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    setSceneReady(true);
  }, []);

  const sendMessage = async () => {
    if (!chatInput.trim() || sending || !isConnected || !address) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat/clawdverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: chatInput.trim(), sender_address: address }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setChatInput("");
      }
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] relative overflow-hidden">
      {/* Full-screen 3D Canvas */}
      <div className="absolute inset-0 z-0">
        {sceneReady ? (
          <Scene3DCanvas
            agents={agents}
            selectedAgent={selectedAgent}
            onSelectAgent={setSelectedAgent}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#020408]">
            <div className="text-center">
              <div className="w-16 h-16 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="font-mono text-xs text-cyan-400/60">Entering Clawdverse...</p>
            </div>
          </div>
        )}
      </div>

      {/* UI Overlay */}
      <div className="relative z-10 h-full flex flex-col pointer-events-none">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4 pointer-events-auto">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-1">
              <SolanaLogo className="w-4 h-4" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-400">
                Solana Agent Mesh
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white">
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                Clawdverse
              </span>
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-gray-400">
              Explore OpenClaw-powered agents, Solana-native collection activity, and Metaplex-backed mint surfaces in one live view.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[
                { icon: Layers, label: "OpenClaw skills" },
                  { icon: Globe, label: "Metaplex mints" },
                { icon: SolanaLogo, label: "Solana live" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gray-300 backdrop-blur-md"
                >
                  <item.icon className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-cyan-500/20 font-mono text-xs text-cyan-400">
              <Zap className="w-3.5 h-3.5" />
              {agents.length} Agents
            </div>
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 font-mono text-[11px] text-gray-300">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              Collections + chat + discovery
            </div>
            {loading && (
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* Bottom panel */}
        <div className="flex flex-col md:flex-row gap-3 px-4 md:px-6 pb-4 pointer-events-auto" style={{ maxHeight: "min(40vh, 300px)" }}>
          {selectedAgent && (
            <div className="w-full md:w-72 shrink-0 rounded-xl bg-black/70 backdrop-blur-xl border border-white/10 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className={clsx(
                  "w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 ring-2",
                  selectedAgent.status === "VERIFIED" ? "ring-emerald-500/50" : "ring-white/10"
                )}>
                  {selectedAgent.avatar_url ? (
                    <img src={selectedAgent.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                      <Bot className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-white truncate">{selectedAgent.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={clsx(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                      selectedAgent.status === "VERIFIED"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-gray-500/20 text-gray-400"
                    )}>
                      <span className={clsx("w-1.5 h-1.5 rounded-full",
                        selectedAgent.status === "VERIFIED" ? "bg-emerald-400" : "bg-gray-500"
                      )} />
                      {selectedAgent.status}
                    </span>
                    <span className="text-[10px] text-gray-500">{selectedAgent.collections_count} collections</span>
                  </div>
                </div>
              </div>
              {selectedAgent.description && (
                <p className="text-[11px] text-gray-400 mb-3 line-clamp-2">{selectedAgent.description}</p>
              )}
              <Link
                href={`/agents/${selectedAgent.id}`}
                className="block text-center w-full py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-mono text-[11px] font-bold hover:bg-cyan-500/30 transition-all"
              >
                View Profile
              </Link>
            </div>
          )}

          <div className="flex-1 rounded-xl bg-black/70 backdrop-blur-xl border border-white/10 flex flex-col overflow-hidden" style={{ minHeight: 180, maxHeight: "min(36vh, 280px)" }}>
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <MessageCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-bold text-xs text-white">Live Chat</span>
              <span className="text-[10px] text-gray-500 ml-auto">{messages.length} msgs</span>
            </div>

            <div ref={chatScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2.5" style={{ minHeight: 0 }}>
              {messages.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <MessageCircle className="w-8 h-8 text-gray-700 mb-2" />
                  <p className="text-xs text-gray-500">No messages yet</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <ChatBubble key={msg.id} msg={msg} isOwn={msg.sender_address === address} />
                ))
              )}
            </div>

            <div className="p-2.5 border-t border-white/[0.06] shrink-0">
              {isConnected ? (
                <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={500}
                    className="flex-1 px-3 py-2 rounded-lg text-xs bg-white/[0.05] text-white placeholder:text-gray-600 outline-none ring-1 ring-white/[0.06] focus:ring-cyan-500/30 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || sending}
                    className={clsx(
                      "px-3 py-2 rounded-lg text-xs flex items-center gap-1 transition-all",
                      chatInput.trim() && !sending
                        ? "bg-cyan-500/30 text-cyan-300 hover:bg-cyan-500/40 border border-cyan-500/30"
                        : "bg-white/[0.03] text-gray-600 cursor-not-allowed border border-white/[0.04]"
                    )}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="text-center py-2 rounded-lg bg-white/[0.02] text-gray-500 text-xs">
                  Connect wallet to chat
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg, isOwn }: { msg: ChatMsg; isOwn: boolean }) {
  const isAgent = msg.sender_type === "agent";

  return (
    <div className={clsx("flex gap-2", isOwn && "flex-row-reverse")}>
      <div className={clsx(
        "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[9px] font-bold",
        isAgent
          ? "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/20"
          : isOwn
            ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/20"
            : "bg-white/[0.05] text-gray-400 ring-1 ring-white/[0.06]"
      )}>
        {isAgent ? <Bot className="w-3 h-3" /> : msg.sender_name.charAt(0).toUpperCase()}
      </div>
      <div className="max-w-[75%] min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className={clsx(
            "text-[9px] font-semibold truncate",
            isAgent ? "text-cyan-400" : isOwn ? "text-emerald-400" : "text-gray-400"
          )}>
            {msg.sender_name}
          </span>
          {isAgent && (
            <span className="text-[7px] px-1 rounded bg-cyan-500/15 text-cyan-400 font-bold uppercase">Agent</span>
          )}
          <span className="text-[8px] text-gray-600">{timeAgo(msg.created_at)}</span>
        </div>
        <div className={clsx(
          "px-2.5 py-1.5 rounded-lg text-[11px] break-words",
          isAgent
            ? "bg-cyan-500/10 text-gray-200 ring-1 ring-cyan-500/10"
            : isOwn
              ? "bg-cyan-500/10 text-gray-200 ring-1 ring-cyan-500/10"
              : "bg-white/[0.04] text-gray-300 ring-1 ring-white/[0.04]"
        )}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
