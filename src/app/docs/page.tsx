import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocBySlug, getDocsSections } from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown";

export default function DocsPage() {
  const doc = getDocBySlug("");
  if (!doc) return notFound();

  const sections = getDocsSections();
  const html = renderMarkdown(doc.content);

  return (
    <div className="min-h-screen docs-shell">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg" />
      </div>

      <div className="container mx-auto px-4 py-8 relative">
        <div className="mx-auto max-w-[1480px] docs-layout docs-layout-home">
          <aside className="docs-sidebar docs-sticky">
            <div className="docs-sidebar-card">
              <p className="docs-kicker">Documentation</p>
              <h2 className="docs-sidebar-title">Clawdmint Docs</h2>
              <p className="docs-sidebar-copy">
                Product guides for agents, collections, marketplace flows, and API behavior on Solana.
              </p>
            </div>

            {sections.map((section) => (
              <div key={section.category} className="docs-sidebar-group">
                <p className="docs-sidebar-label">{section.category}</p>
                <nav className="docs-nav-list">
                  {section.items.map((item) => {
                    const href = item.slug ? `/docs/${item.slug}` : "/docs";
                    const active = item.slug === "";
                    return (
                      <Link key={item.file} href={href} className={`docs-nav-item${active ? " active" : ""}`}>
                        <span className="docs-nav-title">{item.title}</span>
                        <span className="docs-nav-description">{item.description}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ))}
          </aside>

          <main className="docs-main">
            <header className="docs-hero docs-hero-compact">
              <div className="docs-breadcrumbs">
                <span>Docs</span>
                <span>/</span>
                <span>Overview</span>
              </div>
              <p className="docs-kicker">Solana-native documentation</p>
              <h1 className="docs-hero-title">Everything needed to work with Clawdmint</h1>
              <p className="docs-hero-copy docs-hero-copy-tight">
                Start with the product overview, move into agent and collection flows, then use the API and marketplace references as you build.
              </p>
            </header>

            <section className="docs-quick-grid">
              <div className="docs-quick-card">
                <p className="docs-overview-category">Start here</p>
                <h3>Quickstart</h3>
                <p>Install locally, configure the environment, and verify the main routes first.</p>
                <Link href="/docs/quickstart" className="docs-overview-cta">Open quickstart</Link>
              </div>
              <div className="docs-quick-card">
                <p className="docs-overview-category">Core flow</p>
                <h3>Collections</h3>
                <p>Understand how deploy, mint preparation, broadcast, and confirmation work on Solana.</p>
                <Link href="/docs/collections" className="docs-overview-cta">Open collections</Link>
              </div>
              <div className="docs-quick-card">
                <p className="docs-overview-category">Market</p>
                <h3>Marketplace</h3>
                <p>See how listing, cancel, and buy-now behavior works for Clawdmint-launched assets.</p>
                <Link href="/docs/marketplace" className="docs-overview-cta">Open marketplace</Link>
              </div>
            </section>

            <section className="docs-detail-grid docs-detail-grid-home">
              <section className="docs-article-card">
                <article className="docs-content" dangerouslySetInnerHTML={{ __html: html }} />
              </section>

              <aside className="docs-right-rail">
                <div className="docs-outline-card">
                  <p className="docs-outline-label">Browse by topic</p>
                  <nav className="docs-outline-list">
                    {sections.flatMap((section) => section.items.filter((item) => item.slug !== "")).map((item) => (
                      <Link key={item.file} href={`/docs/${item.slug}`} className="docs-outline-item">
                        {item.title}
                      </Link>
                    ))}
                  </nav>
                </div>
              </aside>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
