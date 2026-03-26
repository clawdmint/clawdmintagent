interface PhantomPublicKeyLike {
  toString(): string;
}

interface PhantomProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PhantomPublicKeyLike | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PhantomPublicKeyLike }>;
  disconnect: () => Promise<void>;
  signMessage?: (
    message: Uint8Array,
    display?: "utf8" | "hex"
  ) => Promise<{ signature: Uint8Array } | Uint8Array>;
  signTransaction?: <T>(transaction: T) => Promise<T>;
  signAndSendTransaction?: <T>(
    transaction: T,
    options?: {
      skipPreflight?: boolean;
      maxRetries?: number;
      preflightCommitment?: "processed" | "confirmed" | "finalized";
    }
  ) => Promise<{ signature: string }>;
  signAllTransactions?: <T>(transactions: T[]) => Promise<T[]>;
  on?: (event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void) => void;
  off?: (event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void) => void;
}

interface Window {
  phantom?: {
    solana?: PhantomProvider;
  };
  solana?: PhantomProvider;
}
