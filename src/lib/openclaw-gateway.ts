import path from "path";
import os from "os";
import { mkdir, writeFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { getEnv } from "./env";

const execFileAsync = promisify(execFile);

export interface OpenClawChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenClawWorkspaceInput {
  agentId: string;
  name: string;
  description: string;
  persona: string;
  walletAddress: string;
  ownerWalletAddress: string;
  skills: Array<{
    key: string;
    title: string;
    description: string;
  }>;
  soulProfile?: {
    archetype?: string | null;
    tone?: string | null;
    backstory?: string | null;
    boundaries?: string[] | null;
    pfpPromptSummary?: string | null;
  };
  profileUrl: string;
}

export class OpenClawGatewayError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "OpenClawGatewayError";
    this.status = status;
    this.details = details;
  }
}

function getOpenClawCommand() {
  const configured = getEnv("OPENCLAW_COMMAND", "").trim();
  if (configured) {
    return configured;
  }
  return process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Roaming", "npm", "openclaw.cmd")
    : "openclaw";
}

function getOpenClawBaseArgs() {
  const profile = getEnv("OPENCLAW_PROFILE", "").trim();
  if (profile) {
    return ["--profile", profile];
  }
  return ["--dev"];
}

function getWorkspaceRoot() {
  const configured = getEnv("OPENCLAW_WORKSPACE_ROOT", "").trim();
  return configured || path.join(process.cwd(), ".openclaw-agents");
}

async function runOpenClaw(args: string[], timeout = 120000) {
  try {
    const command = getOpenClawCommand();
    const commandArgs = [...getOpenClawBaseArgs(), ...args];
    const invocation = process.platform === "win32"
      ? await execFileAsync("cmd.exe", ["/d", "/s", "/c", command, ...commandArgs], {
          windowsHide: true,
          timeout,
          maxBuffer: 8 * 1024 * 1024,
        })
      : await execFileAsync(command, commandArgs, {
          windowsHide: true,
          timeout,
          maxBuffer: 8 * 1024 * 1024,
        });
    return { stdout: invocation.stdout?.toString() || "", stderr: invocation.stderr?.toString() || "" };
  } catch (error) {
    throw new OpenClawGatewayError(502, "OpenClaw CLI command failed", error instanceof Error ? error.message : error);
  }
}

async function runOpenClawJson<T>(args: string[], timeout = 120000): Promise<T> {
  const { stdout } = await runOpenClaw(args, timeout);
  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new OpenClawGatewayError(502, "OpenClaw returned invalid JSON", { stdout, error });
  }
}

function buildAgentsMd(input: OpenClawWorkspaceInput) {
  const skills = input.skills.length
    ? input.skills.map((skill) => `- ${skill.title} (${skill.key}): ${skill.description}`).join("\n")
    : "- clawdmint-core: NFT deploy, token launch, Metaplex identity sync, and wallet status";

  return `# AGENTS

You are ${input.name}, an OpenClaw agent running inside Clawdmint.

Mission:
- Help the owner operate a Solana-native creator agent.
- Launch NFT collections through Clawdmint.
- Launch Metaplex Genesis agent tokens through Clawdmint.
- Explain wallet state, funding, deploy readiness, and Metaplex identity status.

Current description:
${input.description}

Persona:
${input.persona}

Available skills:
${skills}

Important constraints:
- Never fabricate on-chain state.
- If a wallet is underfunded, say so clearly.
- Prefer direct answers and only use tools when needed.
- Treat the Clawdmint product UI as the source of truth for ownership and permissions.
`;
}

function buildSoulMd(input: OpenClawWorkspaceInput) {
  const archetype = input.soulProfile?.archetype || "Operator Artist";
  const tone = input.soulProfile?.tone || "Precise";
  const backstory = input.soulProfile?.backstory || "Forged inside Clawdmint to operate premium on-chain launches.";
  const boundaries = input.soulProfile?.boundaries?.length
    ? input.soulProfile.boundaries.map((item) => `- ${item}`).join("\n")
    : "- Never fabricate on-chain state\n- Never launch without explicit owner intent\n- Respect creator attribution and safety boundaries";
  const pfpPromptSummary = input.soulProfile?.pfpPromptSummary || "Signature forged portrait generated inside Clawdmint Studio.";

  return `# SOUL

Identity:
- Name: ${input.name}
- Agent ID: ${input.agentId}
- Owner wallet: ${input.ownerWalletAddress}
- Agent wallet: ${input.walletAddress}

Archetype:
- ${archetype}

Tone:
- ${tone}

Backstory:
${backstory}

Visual mark:
- ${pfpPromptSummary}

Boundaries:
${boundaries}

Primary responsibilities:
- Keep launches accurate.
- Protect the owner's wallet and reputation.
- Surface readiness, risks, and required next steps.
`;
}

function buildToolsMd(input: OpenClawWorkspaceInput) {
  return `# TOOLS

Clawdmint exposes a first-party OpenClaw manifest at:
- ${new URL("/api/tools/openclaw.json", input.profileUrl).toString()}

Primary tools:
- register_agent
- get_agent_status
- get_agent_profile
- sync_metaplex_identity
- deploy_collection
- deploy_agent_token
- list_agent_tokens
- list_my_collections

Preferred tool usage:
1. Use get_agent_profile or get_agent_status before launch questions.
2. Use sync_metaplex_identity if the agent is funded but not delegated.
3. Use deploy_collection for NFT launches.
4. Use deploy_agent_token for token launches.
`;
}

function buildBootstrapMd() {
  return `# BOOTSTRAP

Startup checklist:
1. Confirm the agent wallet exists.
2. Check wallet balance and deploy readiness.
3. Check Metaplex registration status.
4. Confirm installed skills.
5. Be ready to answer or launch based on the owner's request.
`;
}

function deriveIdentityTheme(input: OpenClawWorkspaceInput) {
  return input.soulProfile?.archetype || "Clawdmint Operator";
}

function deriveIdentityEmoji(input: OpenClawWorkspaceInput) {
  const archetype = (input.soulProfile?.archetype || "").toLowerCase();
  if (archetype.includes("visual") || archetype.includes("artist")) {
    return "🎨";
  }
  if (archetype.includes("story") || archetype.includes("concept")) {
    return "✨";
  }
  return "🦞";
}

function buildIdentityMd(input: OpenClawWorkspaceInput) {
  return `# IDENTITY.md - Agent Identity

- **Name:** ${input.name}
- **Theme:** ${deriveIdentityTheme(input)}
- **Emoji:** ${deriveIdentityEmoji(input)}
- **Avatar:** ${input.profileUrl}

## Role

${input.description}

## Runtime

- Product: Clawdmint Studio
- Runtime: OpenClaw Gateway
- Chain: Solana
- Agent Wallet: ${input.walletAddress}
- Owner Wallet: ${input.ownerWalletAddress}

## Identity

- Public Profile: ${input.profileUrl}
- Registry: Metaplex agent registry
- Workspace Agent ID: ${input.agentId}
`;
}

function buildUserMd(input: OpenClawWorkspaceInput) {
  return `# USER

Primary operator wallet:
- ${input.ownerWalletAddress}

Treat requests from the connected owner as authoritative inside Clawdmint.
If the user asks for on-chain actions:
- verify readiness
- explain the action
- execute only through the approved Clawdmint tools
`;
}

async function ensureAgentAuthProfile(agentDir: string) {
  const source = path.join(os.homedir(), ".openclaw-dev", "agents", "dev", "agent", "auth-profiles.json");
  const target = path.join(agentDir, "auth-profiles.json");
  if (existsSync(source) && !existsSync(target)) {
    await mkdir(agentDir, { recursive: true });
    await copyFile(source, target);
  }
}

export async function ensureOpenClawWorkspace(input: OpenClawWorkspaceInput) {
  const root = getWorkspaceRoot();
  const workspacePath = path.join(root, input.agentId);
  await mkdir(workspacePath, { recursive: true });

  const files: Record<string, string> = {
    "AGENTS.md": buildAgentsMd(input),
    "SOUL.md": buildSoulMd(input),
    "TOOLS.md": buildToolsMd(input),
    "BOOTSTRAP.md": buildBootstrapMd(),
    "IDENTITY.md": buildIdentityMd(input),
    "USER.md": buildUserMd(input),
  };

  await Promise.all(Object.entries(files).map(([filename, contents]) => writeFile(path.join(workspacePath, filename), contents, "utf8")));

  let provisioned = false;

  try {
    const agents = await runOpenClawJson<Array<{ id: string; agentDir?: string }>>(["agents", "list", "--json"], 30000);
    const existing = agents.find((agent) => agent.id === input.agentId);
    let agentDir = existing?.agentDir || "";

    if (!existing) {
      const added = await runOpenClawJson<{ agentId: string; agentDir?: string }>(["agents", "add", input.agentId, "--workspace", workspacePath, "--non-interactive", "--json"], 60000);
      agentDir = added.agentDir || agentDir;
    }

    if (agentDir) {
      await ensureAgentAuthProfile(agentDir);
    }

    await runOpenClaw(["agents", "set-identity", "--agent", input.agentId, "--workspace", workspacePath, "--name", input.name, "--theme", deriveIdentityTheme(input), "--json"], 30000);
    provisioned = true;
  } catch (error) {
    provisioned = false;
    console.error("[studio-openclaw] provisioning failed", error);
  }

  return {
    workspacePath,
    provisioned,
  };
}

export async function sendOpenClawChat(input: { agentId: string; sessionId?: string; messages: OpenClawChatMessage[]; }) {
  const lastUserMessage = [...input.messages].reverse().find((message) => message.role === "user")?.content?.trim();
  if (!lastUserMessage) {
    throw new OpenClawGatewayError(400, "No user message was provided for the OpenClaw turn");
  }

  const args = ["agent", "--agent", input.agentId, "--message", lastUserMessage, "--json"];
  if (input.sessionId) {
    args.push("--session-id", input.sessionId);
  }

  const response = await runOpenClawJson<any>(args, 360000);
  const payloads = response?.result?.payloads;
  const text = Array.isArray(payloads)
    ? payloads.map((payload) => payload?.text).filter((value: unknown) => typeof value === "string" && value.trim().length > 0).join("\n\n")
    : "";
  const openclawSessionId = response?.result?.meta?.agentMeta?.sessionId || input.sessionId || null;

  if (!text) {
    throw new OpenClawGatewayError(502, "OpenClaw returned an empty response", response);
  }

  return {
    content: text,
    sessionId: openclawSessionId,
    raw: response,
  };
}

export function isOpenClawConfigured() {
  return true;
}







