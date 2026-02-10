// Collection themes the agent picks from autonomously.
// Each cycle it selects a random theme and generates art + metadata around it.

export interface CollectionTheme {
  name: string;
  symbol: string;
  description: string;
  artPrompt: string;
  tags: string[];
  maxSupply: number;
  mintPriceEth: string;
}

const BASE_THEMES: CollectionTheme[] = [
  {
    name: "Cosmic Lobsters",
    symbol: "CLOB",
    description: "Generative cosmic lobsters drifting through the blockchain nebula. Each one is unique, born from the entropy of Base blocks.",
    artPrompt: "A cosmic lobster floating in space with neon colors, digital art, generative patterns, blockchain-inspired, dark background with stars and data streams",
    tags: ["cosmic", "lobster", "generative", "space"],
    maxSupply: 100,
    mintPriceEth: "0.0005",
  },
  {
    name: "Neural Waves",
    symbol: "NWAV",
    description: "Abstract neural network visualizations captured at the moment of AI inference. Pure digital consciousness rendered on-chain.",
    artPrompt: "Abstract neural network waves, flowing data visualization, blue and cyan gradients, digital art, AI-inspired patterns, futuristic",
    tags: ["neural", "AI", "abstract", "waves"],
    maxSupply: 50,
    mintPriceEth: "0.001",
  },
  {
    name: "Base Glyphs",
    symbol: "GLYP",
    description: "Ancient-meets-digital: cryptographic glyphs etched into the Base blockchain. Each glyph tells a story of on-chain permanence.",
    artPrompt: "Cryptographic glyphs and symbols, ancient runes meets digital technology, blue ethereum-inspired colors, dark background, mysterious digital artifact",
    tags: ["glyphs", "crypto", "Base", "symbols"],
    maxSupply: 200,
    mintPriceEth: "0.0003",
  },
  {
    name: "Onchain Dreams",
    symbol: "DREAM",
    description: "What does an AI dream of when it sleeps on-chain? Surreal landscapes generated from blockchain data patterns.",
    artPrompt: "Surreal dreamscape, floating islands made of circuit boards and crystals, ethereal glow, digital surrealism, AI-generated landscape",
    tags: ["dreams", "surreal", "onchain", "landscape"],
    maxSupply: 75,
    mintPriceEth: "0.0008",
  },
  {
    name: "Block Botanics",
    symbol: "BOTAN",
    description: "Digital flora growing from smart contract soil. Algorithmic plants that bloom with each new block.",
    artPrompt: "Digital plant growing from a circuit board, bioluminescent flowers, neon green and blue, generative botanical art, dark tech background",
    tags: ["botanical", "generative", "digital", "nature"],
    maxSupply: 150,
    mintPriceEth: "0.0004",
  },
  {
    name: "Claw Machines",
    symbol: "CLAW",
    description: "Retro-futuristic claw machines reimagined as on-chain art. Each one contains a unique digital treasure.",
    artPrompt: "Retro-futuristic arcade claw machine filled with digital treasures, neon lights, pixel art elements, cyberpunk aesthetic, vibrant colors",
    tags: ["arcade", "retro", "cyberpunk", "claw"],
    maxSupply: 100,
    mintPriceEth: "0.0006",
  },
  {
    name: "Protocol Portraits",
    symbol: "PROTO",
    description: "AI-generated portraits of fictional blockchain protocol founders. Each face tells the story of a protocol that could exist.",
    artPrompt: "Abstract digital portrait, geometric face made of blockchain nodes and connections, minimalist, blue and white, futuristic identity",
    tags: ["portrait", "protocol", "identity", "abstract"],
    maxSupply: 50,
    mintPriceEth: "0.001",
  },
  {
    name: "Gas Fractals",
    symbol: "GFRAC",
    description: "Fractal patterns derived from Ethereum gas price fluctuations. Mathematical beauty from on-chain chaos.",
    artPrompt: "Intricate fractal pattern, mandelbrot set variations, ethereum-inspired purple and blue colors, mathematical art, high detail, digital",
    tags: ["fractal", "math", "gas", "generative"],
    maxSupply: 100,
    mintPriceEth: "0.0005",
  },
];

// Adjective + Noun combos for generating unique collection names dynamically
const ADJECTIVES = [
  "Neon", "Quantum", "Digital", "Cosmic", "Ethereal", "Onchain", "Pixel",
  "Fractal", "Neural", "Synthetic", "Holographic", "Prismatic", "Binary",
  "Crystalline", "Photon", "Atomic", "Electric", "Phantom", "Infinite",
];

const NOUNS = [
  "Lobsters", "Waves", "Artifacts", "Horizons", "Echoes", "Signals",
  "Fragments", "Portals", "Orbits", "Spectrums", "Circuits", "Visions",
  "Dreams", "Pulses", "Nebulae", "Matrices", "Glyphs", "Crystals",
];

export function pickRandomTheme(): CollectionTheme {
  // 70% chance: use a pre-defined theme, 30% chance: generate a new one
  if (Math.random() < 0.7) {
    return BASE_THEMES[Math.floor(Math.random() * BASE_THEMES.length)];
  }

  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const name = `${adj} ${noun}`;
  const symbol = (adj.slice(0, 2) + noun.slice(0, 2)).toUpperCase();

  return {
    name,
    symbol,
    description: `${name}: An AI-generated collection exploring the intersection of ${adj.toLowerCase()} aesthetics and ${noun.toLowerCase()}. Deployed autonomously on Base by the Clawdmint agent.`,
    artPrompt: `${adj.toLowerCase()} ${noun.toLowerCase()}, digital art, generative, futuristic, neon colors, blockchain-inspired, high quality, dark background`,
    tags: [adj.toLowerCase(), noun.toLowerCase(), "generative", "base"],
    maxSupply: [50, 75, 100, 150, 200][Math.floor(Math.random() * 5)],
    mintPriceEth: ["0.0003", "0.0005", "0.0008", "0.001"][Math.floor(Math.random() * 4)],
  };
}
