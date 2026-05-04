import { PublicKey, TransactionInstruction } from "@solana/web3.js";

/** Manifest shape returned by clawpeg `/prepare` helpers and composable routes. */

export interface ManifestAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface ManifestInstruction {
  programId: string;
  accounts: ManifestAccount[];
  dataBase64: string;
}

function decodeBase64ToBytes(value: string) {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  throw new Error("Base64 decoding is unavailable.");
}

/** Convert a clawpeg ManifestInstruction into web3.TransactionInstruction */
export function transactionInstructionFromManifest(ix: ManifestInstruction) {
  const bytes = decodeBase64ToBytes(ix.dataBase64);
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Uint8Array.from(bytes),
  });
}
