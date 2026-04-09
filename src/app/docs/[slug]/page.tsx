import Link from "next/link";
import { notFound } from "next/navigation";
import { clsx } from "clsx";
import { getDocBySlug, getDocsSections } from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown";

export default function DocDetailPage({ params }: { params: { slug: string } }) {
  const doc = getDocBySlug(params.slug);
  if (!doc) return notFound();

  const sections = getDocsSections();
  const related = sections
    .find((section) => section.category === doc.category)
    ?.items.filter((item) => item.slug !== doc.slug)
    .slice(0, 3) ?? [];
  const html = renderMarkdown(doc.content);

  return (
    <div className="min-h-screen docs-shell">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg" />
      </div>

      <div className="container mx-auto px-4 py-8 relative">
        <div className="mx-auto max-w-[1480px] docs-layout">
          <aside className="docs-sidebar docs-sticky">
            <div className="docs-sidebar-card">
              <p className="docs-kicker">Documentation</p>
              <h2 className="docs-sidebar-title">Clawdmint Docs</h2>
              <p className="docs-sidebar-copy">Reference the live product surface, not a disconnected spec.</p>
            </div>

            {sections.map((section) => (
              <div key={section.category} className="docs-sidebar-group">
                <p className="docs-sidebar-label">{section.category}</p>
                <nav className="docs-nav-list">
                  {section.items.map((item) => {
                    const href = item.slug ? `/docs/${item.slug}` : "/docs";
                    const active = item.slug === params.slug;
                    return (
                      <Link key={item.file} href={href} className={clsx("docs-nav-item", active && "active")}>
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
            <header className="docs-page-header docs-page-header-compact">
              <div className="docs-breadcrumbs">
                <Link href="/docs">Docs</Link>
                <span>/</span>
                <span>{doc.title}</span>
              </div>
              <div className="docs-page-hero docs-page-hero-tight">
                <div>
                  <p className="docs-kicker">{doc.category}</p>
                  <h1 className="docs-page-title">{doc.title}</h1>
                  <p className="docs-page-copy">{doc.description}</p>
                </div>
                {doc.headings.length > 0 && (
                  <div className="docs-section-pills">
                    {doc.headings.filter((heading) => heading.level === 2).map((heading) => (
                      <a key={heading.id} href={`#${heading.id}`} className="docs-section-pill">
                        {heading.text}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </header>

            <div className="docs-detail-grid docs-detail-grid-tight">
              <section className="docs-article-card">
                <article className="docs-content" dangerouslySetInnerHTML={{ __html: html }} />
              </section>

              <aside className="docs-right-rail docs-sticky docs-right-offset">
                <div className="docs-outline-card">
                  <p className="docs-outline-label">On this page</p>
                  {doc.headings.length > 0 ? (
                    <nav className="docs-outline-list">
                      {doc.headings.map((heading) => (
                        <a
                          key={heading.id}
                          href={`#${heading.id}`}
                          className={clsx("docs-outline-item", heading.level === 3 && "nested")}
                        >
                          {heading.text}
                        </a>
                      ))}
                    </nav>
                  ) : (
                    <p className="docs-outline-empty">This page is short and does not expose sub-sections yet.</p>
                  )}
                </div>

                {related.length > 0 && (
                  <div className="docs-outline-card docs-related-card">
                    <p className="docs-outline-label">Related guides</p>
                    <div className="docs-outline-list">
                      {related.map((item) => (
                        <Link key={item.file} href={`/docs/${item.slug}`} className="docs-outline-item">
                          {item.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
