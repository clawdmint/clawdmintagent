-- AlterTable
ALTER TABLE "Agent"
ADD COLUMN     "ownerWalletAddress" TEXT,
ADD COLUMN     "ownerWalletChain" TEXT DEFAULT 'solana',
ADD COLUMN     "studioEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openclawAgentId" TEXT,
ADD COLUMN     "openclawWorkspacePath" TEXT,
ADD COLUMN     "openclawWorkspaceVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "openclawStatus" TEXT DEFAULT 'inactive',
ADD COLUMN     "openclawChatEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "persona" TEXT,
ADD COLUMN     "soulProfile" JSONB;

-- CreateTable
CREATE TABLE "AgentSkillInstall" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSkillInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStudioSession" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "ownerWalletAddress" TEXT NOT NULL,
    "title" TEXT,
    "openclawSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStudioSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStudioMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "eventType" TEXT DEFAULT 'text',
    "toolName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStudioMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStudioRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB,
    "output" JSONB,
    "txHash" TEXT,
    "externalRunId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentStudioRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_openclawAgentId_key" ON "Agent"("openclawAgentId");

-- CreateIndex
CREATE INDEX "Agent_ownerWalletAddress_idx" ON "Agent"("ownerWalletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkillInstall_agentId_skillKey_key" ON "AgentSkillInstall"("agentId", "skillKey");

-- CreateIndex
CREATE INDEX "AgentSkillInstall_agentId_enabled_idx" ON "AgentSkillInstall"("agentId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStudioSession_openclawSessionId_key" ON "AgentStudioSession"("openclawSessionId");

-- CreateIndex
CREATE INDEX "AgentStudioSession_agentId_createdAt_idx" ON "AgentStudioSession"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentStudioSession_ownerWalletAddress_updatedAt_idx" ON "AgentStudioSession"("ownerWalletAddress", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentStudioMessage_sessionId_createdAt_idx" ON "AgentStudioMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentStudioRun_agentId_createdAt_idx" ON "AgentStudioRun"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentStudioRun_sessionId_createdAt_idx" ON "AgentStudioRun"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentStudioRun_status_idx" ON "AgentStudioRun"("status");

-- AddForeignKey
ALTER TABLE "AgentSkillInstall" ADD CONSTRAINT "AgentSkillInstall_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStudioSession" ADD CONSTRAINT "AgentStudioSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStudioMessage" ADD CONSTRAINT "AgentStudioMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentStudioSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStudioRun" ADD CONSTRAINT "AgentStudioRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStudioRun" ADD CONSTRAINT "AgentStudioRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentStudioSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
