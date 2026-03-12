interface PhantomPublicKeyLike {
  toString(): string;
}

interface PhantomProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PhantomPublicKeyLike | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PhantomPublicKeyLike }>;
  disconnect: () => Promise<void>;
  on?: (event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void) => void;
  off?: (event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void) => void;
}

interface Window {
  phantom?: {
    solana?: PhantomProvider;
  };
  solana?: PhantomProvider;
}
