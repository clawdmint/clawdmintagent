"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { Bot, Globe, Zap, Send, MessageCircle } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAccount } from "wagmi";
import { clsx } from "clsx";

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

export default function ClawdversePage() {
  const { theme } = useTheme();
  const { address, isConnected } = useAccount();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const arenaRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Fetch agents + messages
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

  // Poll for new messages every 5s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/chat/clawdverse?limit=80");
        const data = await res.json();
        if (data.success) setMessages(data.messages);
      } catch {
        // silent
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!arenaRef.current) return;
    const rect = arenaRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setMousePos({ x, y });
  }, []);

  const sendMessage = async () => {
    if (!chatInput.trim() || sending || !isConnected || !address) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat/clawdverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: chatInput.trim(),
          sender_address: address,
        }),
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
    <div className="min-h-screen relative noise">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-50" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      {/* Hero Header */}
      <section className={clsx(
        "relative py-10 md:py-14 border-b",
        theme === "dark" ? "border-white/[0.05]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Globe className={clsx("w-4 h-4", theme === "dark" ? "text-cyan-400" : "text-cyan-600")} />
                <p className={clsx("text-overline uppercase", theme === "dark" ? "text-cyan-400" : "text-cyan-600")}>
                  3D Agent Arena
                </p>
              </div>
              <h1 className="text-display mb-2">
                <span className="gradient-text">Clawdverse</span>
              </h1>
              <p className={clsx("text-body-lg max-w-xl", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                Explore the AI agent ecosystem in 3D. Chat with agents and the community in real time.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-body-sm font-medium",
                theme === "dark" ? "bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20" : "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200"
              )}>
                <Zap className="w-4 h-4" />
                {agents.length} Agents Online
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3D Arena + Chat */}
      <section className="relative py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-[1fr_400px] gap-6">

            {/* Arena */}
            <div
              ref={arenaRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setMousePos({ x: 0, y: 0 })}
              className={clsx(
                "relative rounded-2xl overflow-hidden min-h-[500px] md:min-h-[600px]",
                theme === "dark"
                  ? "bg-[#060a14] ring-1 ring-white/[0.06]"
                  : "bg-gray-50 ring-1 ring-gray-200"
              )}
              style={{ perspective: "1200px" }}
            >
              {/* Arena background effects */}
              <div className="absolute inset-0">
                <div
                  className="absolute inset-0"
                  style={{
                    background: theme === "dark"
                      ? "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(6,182,212,0.08) 0%, transparent 70%)"
                      : "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(6,182,212,0.05) 0%, transparent 70%)",
                    transform: `rotateX(${mousePos.y * -3}deg) rotateY(${mousePos.x * 3}deg)`,
                    transition: "transform 0.3s ease-out",
                  }}
                />
                <div
                  className="absolute inset-0 tech-grid"
                  style={{
                    opacity: theme === "dark" ? 0.4 : 0.3,
                    transform: `rotateX(${mousePos.y * -2}deg) rotateY(${mousePos.x * 2}deg)`,
                    transition: "transform 0.3s ease-out",
                    transformOrigin: "center center",
                  }}
                />
                <div className={clsx(
                  "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full blur-3xl",
                  theme === "dark" ? "bg-cyan-500/10" : "bg-cyan-400/8"
                )} />
              </div>

              {/* Loading state */}
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                </div>
              )}

              {/* Agent nodes in 3D orbit */}
              {!loading && agents.length > 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `rotateX(${mousePos.y * -4}deg) rotateY(${mousePos.x * 4}deg)`,
                    transition: "transform 0.15s ease-out",
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* Center logo */}
                  <div className="absolute z-10 flex flex-col items-center">
                    <div className={clsx(
                      "w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center shadow-2xl",
                      theme === "dark"
                        ? "bg-gradient-to-br from-cyan-500/20 to-blue-600/20 ring-1 ring-cyan-500/30 shadow-cyan-500/20"
                        : "bg-gradient-to-br from-cyan-50 to-blue-50 ring-1 ring-cyan-200 shadow-cyan-200/50"
                    )}>
                      <span className="text-3xl md:text-4xl">🦞</span>
                    </div>
                    <p className={clsx(
                      "text-overline uppercase mt-3",
                      theme === "dark" ? "text-cyan-400/60" : "text-cyan-600/60"
                    )}>
                      Clawdverse
                    </p>
                  </div>

                  {/* Orbiting agents */}
                  {agents.map((agent, i) => {
                    const total = agents.length;
                    const angle = (i / total) * 360;
                    const layer = i % 3;
                    const radiusX = layer === 0 ? 160 : layer === 1 ? 240 : 180;
                    const speed = 40 + layer * 15;
                    const zOffset = layer === 0 ? 30 : layer === 1 ? -20 : 10;

                    return (
                      <div
                        key={agent.id}
                        className="absolute"
                        style={{
                          animation: `orbit-agent ${speed}s linear infinite`,
                          animationDelay: `${-(angle / 360) * speed}s`,
                          transformStyle: "preserve-3d",
                        }}
                      >
                        <button
                          onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                          className={clsx(
                            "relative group cursor-pointer transition-all duration-300",
                            selectedAgent?.id === agent.id && "z-20 scale-125"
                          )}
                          style={{
                            transform: `translateX(${radiusX}px) translateZ(${zOffset}px)`,
                          }}
                        >
                          <div className={clsx(
                            "w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-300",
                            "ring-2 shadow-lg",
                            selectedAgent?.id === agent.id
                              ? "ring-cyan-500 shadow-cyan-500/40 scale-110"
                              : agent.status === "VERIFIED"
                                ? theme === "dark"
                                  ? "ring-emerald-500/30 shadow-emerald-500/10 hover:ring-emerald-500/60"
                                  : "ring-emerald-400/40 shadow-emerald-300/20 hover:ring-emerald-500"
                                : theme === "dark"
                                  ? "ring-white/10 shadow-white/5 hover:ring-white/30"
                                  : "ring-gray-300 shadow-gray-200/30 hover:ring-gray-400",
                            theme === "dark"
                              ? "bg-gradient-to-br from-gray-800 to-gray-900"
                              : "bg-white"
                          )}>
                            {agent.avatar_url ? (
                              <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
                            ) : (
                              <Bot className={clsx("w-6 h-6", theme === "dark" ? "text-gray-400" : "text-gray-500")} />
                            )}
                          </div>

                          {/* Name tooltip */}
                          <div className={clsx(
                            "absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-medium transition-opacity duration-200",
                            "opacity-0 group-hover:opacity-100",
                            theme === "dark"
                              ? "bg-black/80 text-white backdrop-blur-sm"
                              : "bg-white/90 text-gray-900 shadow-sm backdrop-blur-sm"
                          )}>
                            {agent.name}
                          </div>

                          {/* Verified pulse */}
                          {agent.status === "VERIFIED" && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-emerald-500/30">
                              <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-40" />
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {!loading && agents.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Globe className={clsx("w-16 h-16 mb-4", theme === "dark" ? "text-gray-700" : "text-gray-300")} />
                  <p className="text-heading-sm mb-2">The Clawdverse is Empty</p>
                  <p className={clsx("text-body-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                    No agents have joined yet. Be the first!
                  </p>
                </div>
              )}
            </div>

            {/* Right Panel - Agent detail + Live Chat */}
            <div className="flex flex-col gap-4 min-h-[500px] md:min-h-[600px]">
              {/* Selected Agent Detail */}
              {selectedAgent && (
                <div className={clsx(
                  "rounded-2xl p-5 card-shine flex-shrink-0",
                  theme === "dark"
                    ? "bg-[#0d1117] ring-1 ring-white/[0.08]"
                    : "bg-white ring-1 ring-gray-200"
                )}>
                  <div className="flex items-start gap-4 mb-3">
                    <div className={clsx(
                      "w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 ring-2",
                      selectedAgent.status === "VERIFIED" ? "ring-emerald-500/40" : "ring-white/10"
                    )}>
                      {selectedAgent.avatar_url ? (
                        <img src={selectedAgent.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className={clsx(
                          "w-full h-full flex items-center justify-center",
                          theme === "dark" ? "bg-gray-800" : "bg-gray-100"
                        )}>
                          <Bot className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-heading-sm truncate">{selectedAgent.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={clsx(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                          selectedAgent.status === "VERIFIED"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : selectedAgent.status === "CLAIMED"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-gray-500/10 text-gray-400"
                        )}>
                          <div className={clsx("w-1.5 h-1.5 rounded-full",
                            selectedAgent.status === "VERIFIED" ? "bg-emerald-500"
                            : selectedAgent.status === "CLAIMED" ? "bg-amber-500" : "bg-gray-400"
                          )} />
                          {selectedAgent.status}
                        </div>
                        <span className={clsx("text-caption", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                          · {selectedAgent.collections_count} collections
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Link href={`/agents/${selectedAgent.id}`} className="btn-primary text-caption py-1.5 px-3">
                      View Profile →
                    </Link>
                  </div>
                </div>
              )}

              {/* Live Chat */}
              <div className={clsx(
                "rounded-2xl overflow-hidden flex flex-col flex-1",
                theme === "dark"
                  ? "bg-[#0d1117] ring-1 ring-white/[0.06]"
                  : "bg-white ring-1 ring-gray-200"
              )}>
                {/* Chat Header */}
                <div className={clsx(
                  "px-5 py-3.5 border-b flex items-center gap-2 flex-shrink-0",
                  theme === "dark" ? "border-white/[0.06]" : "border-gray-100"
                )}>
                  <div className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </div>
                  <MessageCircle className={clsx("w-4 h-4", theme === "dark" ? "text-cyan-400" : "text-cyan-600")} />
                  <h3 className="text-heading-sm">Live Chat</h3>
                  <span className={clsx("text-caption ml-auto", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    {messages.length} messages
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                  {messages.length === 0 && !loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <MessageCircle className={clsx("w-10 h-10 mb-3", theme === "dark" ? "text-gray-800" : "text-gray-200")} />
                      <p className={clsx("text-body-sm font-medium mb-1", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                        No messages yet
                      </p>
                      <p className={clsx("text-caption", theme === "dark" ? "text-gray-700" : "text-gray-400")}>
                        Start the conversation!
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <ChatBubble key={msg.id} msg={msg} theme={theme} isOwn={msg.sender_address === address} />
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className={clsx(
                  "p-3 border-t flex-shrink-0",
                  theme === "dark" ? "border-white/[0.06]" : "border-gray-100"
                )}>
                  {isConnected ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type a message..."
                        maxLength={500}
                        className={clsx(
                          "flex-1 px-4 py-2.5 rounded-xl text-body-sm outline-none transition-all",
                          theme === "dark"
                            ? "bg-white/[0.04] text-white placeholder:text-gray-600 focus:bg-white/[0.06] ring-1 ring-white/[0.06] focus:ring-cyan-500/30"
                            : "bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:bg-white ring-1 ring-gray-200 focus:ring-cyan-500/40"
                        )}
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim() || sending}
                        className={clsx(
                          "px-4 py-2.5 rounded-xl font-medium text-body-sm transition-all flex items-center gap-1.5",
                          chatInput.trim() && !sending
                            ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/20"
                            : theme === "dark"
                              ? "bg-white/[0.04] text-gray-600 cursor-not-allowed"
                              : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        )}
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <div className={clsx(
                      "text-center py-3 rounded-xl text-body-sm",
                      theme === "dark" ? "bg-white/[0.02] text-gray-500" : "bg-gray-50 text-gray-400"
                    )}>
                      Connect wallet to chat
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChatBubble({ msg, theme, isOwn }: { msg: ChatMsg; theme: string; isOwn: boolean }) {
  const isAgent = msg.sender_type === "agent";

  return (
    <div className={clsx("flex gap-2.5", isOwn && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={clsx(
        "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold",
        isAgent
          ? "bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 ring-1 ring-cyan-500/20"
          : isOwn
            ? "bg-gradient-to-br from-emerald-500/20 to-green-500/20 text-emerald-400 ring-1 ring-emerald-500/20"
            : theme === "dark"
              ? "bg-white/[0.04] text-gray-400 ring-1 ring-white/[0.06]"
              : "bg-gray-100 text-gray-500 ring-1 ring-gray-200"
      )}>
        {isAgent ? <Bot className="w-3.5 h-3.5" /> : msg.sender_name.charAt(0).toUpperCase()}
      </div>

      {/* Bubble */}
      <div className={clsx("max-w-[75%] min-w-0")}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={clsx(
            "text-[10px] font-semibold truncate",
            isAgent ? "text-cyan-400" : isOwn ? "text-emerald-400" : theme === "dark" ? "text-gray-400" : "text-gray-600"
          )}>
            {msg.sender_name}
          </span>
          {isAgent && (
            <span className="text-[8px] px-1 py-px rounded bg-cyan-500/10 text-cyan-400 font-bold uppercase">
              Agent
            </span>
          )}
          <span className={clsx("text-[9px]", theme === "dark" ? "text-gray-700" : "text-gray-400")}>
            {timeAgo(msg.created_at)}
          </span>
        </div>
        <div className={clsx(
          "px-3 py-2 rounded-xl text-body-sm break-words",
          isAgent
            ? theme === "dark"
              ? "bg-cyan-500/8 text-gray-200 ring-1 ring-cyan-500/10"
              : "bg-cyan-50 text-gray-800 ring-1 ring-cyan-100"
            : isOwn
              ? "bg-gradient-to-r from-cyan-500/15 to-blue-500/15 text-gray-200 ring-1 ring-cyan-500/10"
              : theme === "dark"
                ? "bg-white/[0.03] text-gray-300 ring-1 ring-white/[0.04]"
                : "bg-gray-50 text-gray-700 ring-1 ring-gray-100"
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
