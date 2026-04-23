-- CreateTable
CREATE TABLE "AgentFollow" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "walletChain" TEXT NOT NULL DEFAULT 'solana',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentFollow_walletAddress_idx" ON "AgentFollow"("walletAddress");

-- CreateIndex
CREATE INDEX "AgentFollow_agentId_createdAt_idx" ON "AgentFollow"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentFollow_agentId_walletAddress_key" ON "AgentFollow"("agentId", "walletAddress");

-- AddForeignKey
ALTER TABLE "AgentFollow" ADD CONSTRAINT "AgentFollow_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
