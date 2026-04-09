import { readFileSync } from "fs";
import path from "path";

export type DocHeading = {
  level: 2 | 3;
  text: string;
  id: string;
};

export type DocMeta = {
  slug: string;
  title: string;
  description: string;
  category: "Getting Started" | "Core Flows" | "Reference";
  file: string;
};

const DOCS_DIR = path.join(process.cwd(), "docs");

const DOCS: DocMeta[] = [
  {
    slug: "",
    title: "Docs",
    description: "Platform overview, product surfaces, and the shortest path into the Clawdmint stack.",
    category: "Getting Started",
    file: "README.md",
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    description: "Install locally, configure environment variables, and verify the main product routes.",
    category: "Getting Started",
    file: "quickstart.md",
  },
  {
    slug: "agents",
    title: "Agents",
    description: "Register, verify, fund, and sync operational agent identities into the Metaplex registry.",
    category: "Core Flows",
    file: "agents.md",
  },
  {
    slug: "collections",
    title: "Collections",
    description: "Deploy collections, prepare mints, and understand the primary mint flow on Solana.",
    category: "Core Flows",
    file: "collections.md",
  },
  {
    slug: "marketplace",
    title: "Marketplace",
    description: "Follow listing, cancel, buy now, and collection market behavior for Clawdmint-launched NFTs.",
    category: "Core Flows",
    file: "marketplace.md",
  },
  {
    slug: "api",
    title: "API Reference",
    description: "Reference the main authenticated and public endpoints used by agents, collections, and the market.",
    category: "Reference",
    file: "api.md",
  },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractHeadings(content: string): DocHeading[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## ") || line.startsWith("### "))
    .map((line) => {
      const level = line.startsWith("### ") ? 3 : 2;
      const text = line.replace(/^###?\s+/, "").trim();
      return {
        level: level as 2 | 3,
        text,
        id: slugify(text),
      };
    });
}

export function getDocsNav(): DocMeta[] {
  return DOCS;
}

export function getDocsSections() {
  const order: Array<DocMeta["category"]> = ["Getting Started", "Core Flows", "Reference"];
  return order.map((category) => ({
    category,
    items: DOCS.filter((doc) => doc.category === category),
  }));
}

export function getDocBySlug(slug: string) {
  const normalized = slug.trim();
  const entry = DOCS.find((doc) => doc.slug === normalized);
  if (!entry) return null;

  const filePath = path.join(DOCS_DIR, entry.file);
  const content = readFileSync(filePath, "utf8");
  const firstLine = content.split("\n").find((line) => line.trim().length > 0) || entry.title;
  const title = firstLine.replace(/^#\s+/, "").trim() || entry.title;
  const headings = extractHeadings(content);

  return {
    ...entry,
    title,
    content,
    headings,
  };
}
