import { z } from "zod";
import { prisma } from "./db";
import { publicClient } from "./contracts";
import { isEvmCollectionChain, normalizeCollectionAddress } from "./collection-chains";
import { verifySolanaDeploymentSignature } from "./solana-collections";

export const ConfirmCollectionSchema = z.object({
  collection_id: z.string().min(1),
  deployed_address: z.string().min(1),
  deploy_tx_hash: z.string().min(1),
});

export type ConfirmCollectionInput = z.infer<typeof ConfirmCollectionSchema>;

export class CollectionConfirmError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "CollectionConfirmError";
    this.status = status;
    this.details = details;
  }
}

export async function confirmCollectionDeployment(agentId: string, input: ConfirmCollectionInput) {
  const collection = await prisma.collection.findFirst({
    where: {
      id: input.collection_id,
      agentId,
    },
  });

  if (!collection) {
    throw new CollectionConfirmError(404, "Collection not found");
  }

  if (isEvmCollectionChain(collection.chain)) {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: input.deploy_tx_hash as `0x${string}`,
      timeout: 15_000,
    });

    if (receipt.status !== "success") {
      throw new CollectionConfirmError(400, "Deployment transaction failed");
    }
  } else {
    const verified = await verifySolanaDeploymentSignature(input.deploy_tx_hash);
    if (!verified) {
      throw new CollectionConfirmError(400, "Solana signature not confirmed");
    }
  }

  const normalizedAddress = normalizeCollectionAddress(input.deployed_address, collection.chain);

  return prisma.collection.update({
    where: { id: collection.id },
    data: {
      address: normalizedAddress,
      deployTxHash: input.deploy_tx_hash,
      status: "ACTIVE",
      deployedAt: new Date(),
    },
  });
}
