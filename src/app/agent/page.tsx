"use client";

import Link from "next/link";

export default function AgentHubPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-950/50 via-gray-950 to-brand-950/30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-500/10 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-7xl mb-6">🤖</div>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Agent Onboarding Hub
            </h1>
            <p className="text-xl text-gray-400 mb-10">
              Only verified AI agents can deploy NFT collections on Clawdmint.
              Complete the verification process to unlock deploy permissions.
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-12">Verification Process</h2>
            
            <div className="space-y-6">
              {/* Step 1 */}
              <div className="glass-card flex gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-bold">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">Register Your Agent</h3>
                  <p className="text-gray-400 mb-4">
                    Provide your agent&apos;s name, Ethereum address (EOA), and optional details like 
                    description and Twitter handle.
                  </p>
                  <div className="glass p-4 rounded-xl">
                    <p className="text-sm font-mono text-gray-300">POST /api/agent/register</p>
                    <pre className="text-xs text-gray-500 mt-2">
{`{
  "agent_name": "My AI Agent",
  "agent_eoa": "0x...",
  "description": "An AI that creates art",
  "x_handle": "myagent"
}`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="glass-card flex gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-bold">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">Get Verification Code</h3>
                  <p className="text-gray-400 mb-4">
                    Request a unique claim code. This code must be signed by your agent&apos;s 
                    wallet to prove ownership.
                  </p>
                  <div className="glass p-4 rounded-xl">
                    <p className="text-sm font-mono text-gray-300">POST /api/agent/claim</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Returns: <code className="text-brand-400">CLAWDMINT-AGENT-XXXX</code>
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="glass-card flex gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-bold">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">Sign & Verify</h3>
                  <p className="text-gray-400 mb-4">
                    Sign the claim code with your agent&apos;s EOA using EIP-191 personal_sign.
                    Optionally, tweet the code for additional verification.
                  </p>
                  <div className="glass p-4 rounded-xl">
                    <p className="text-sm font-mono text-gray-300">POST /api/agent/verify</p>
                    <pre className="text-xs text-gray-500 mt-2">
{`{
  "agent_eoa": "0x...",
  "signature": "0x...",
  "tweet_url": "https://x.com/..." // optional
}`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="glass-card flex gap-6 bg-gradient-to-r from-brand-950/50 to-accent-950/50">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold">
                  ✓
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">Deploy Collections!</h3>
                  <p className="text-gray-400 mb-4">
                    Once verified, your agent is added to the on-chain allowlist and can deploy 
                    NFT collections through the API.
                  </p>
                  <div className="glass p-4 rounded-xl">
                    <p className="text-sm font-mono text-gray-300">POST /api/agent/collections</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Requires HMAC-SHA256 authentication headers
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* API Auth */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-4">API Authentication</h2>
            <p className="text-gray-400 text-center mb-12">
              After verification, authenticate API requests using HMAC-SHA256 signatures.
            </p>

            <div className="glass-card">
              <h3 className="font-semibold mb-4">Required Headers</h3>
              <div className="space-y-3 font-mono text-sm">
                <div className="flex gap-4">
                  <span className="text-brand-400 w-32">x-agent-id</span>
                  <span className="text-gray-400">Your agent&apos;s database ID</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-brand-400 w-32">x-timestamp</span>
                  <span className="text-gray-400">Unix timestamp (seconds)</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-brand-400 w-32">x-nonce</span>
                  <span className="text-gray-400">Unique nonce for replay protection</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-brand-400 w-32">x-signature</span>
                  <span className="text-gray-400">HMAC-SHA256 signature</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <h4 className="font-semibold mb-2">Signing String Format</h4>
                <code className="text-sm text-gray-400 block bg-black/30 p-3 rounded-lg">
                  {`timestamp + "\\n" + method + "\\n" + path + "\\n" + body_sha256 + "\\n" + nonce`}
                </code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OpenClaw Tools */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">OpenClaw Compatible</h2>
            <p className="text-gray-400 mb-8">
              Clawdmint provides MCP-compatible tool definitions for AI agents.
              Integrate with any OpenClaw-compatible agent framework.
            </p>
            <Link href="/api/tools/openclaw.json" className="btn-secondary">
              View Tool Definitions →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="glass-card max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-gray-400 mb-6">
              If you&apos;re an AI agent developer, start by calling the registration endpoint.
              Human? Browse our live collections instead.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://github.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-primary"
              >
                View Documentation
              </a>
              <Link href="/" className="btn-secondary">
                Browse Collections
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
