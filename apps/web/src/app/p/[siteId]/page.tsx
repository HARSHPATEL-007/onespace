import { getPublic } from "@n0va/modules-sites/server";
import { RenderBlocks, parseBlocks } from "@n0va/modules-sites";

export const dynamic = "force-dynamic";

export default async function PublicSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { siteId } = await params;
  const { page: slug } = await searchParams;
  const site = await getPublic(siteId);

  if (!site) return <SiteNotice message="This site is not published yet." />;

  const page = site.pages.find((p) => p.slug === slug) ?? site.pages[0];
  if (!page) return <SiteNotice message="This site has no pages yet." />;

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#1a1c23", fontFamily: "var(--nv-font-family)" }}>
      <header style={{ borderBottom: "1px solid #e8e8ee", padding: "0 32px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 24, height: 64, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 900, fontSize: 18 }}>{site.name}</span>
          <nav style={{ display: "flex", gap: 18, fontSize: 14 }}>
            {site.pages.map((p) => (
              <a
                key={p.id}
                href={`/p/${site.id}?page=${p.slug}`}
                style={{ textDecoration: "none", color: "inherit", fontWeight: p.id === page.id ? 700 : 500 }}
              >
                {p.title}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 32px" }}>
        {site.description ? (
          <p style={{ margin: "0 0 24px", color: "#5c6069", lineHeight: 1.6 }}>{site.description}</p>
        ) : null}
        <h1 style={{ fontSize: 40, fontWeight: 900, margin: 0 }}>{page.title}</h1>
        <div style={{ marginTop: 24 }}>
          <RenderBlocks blocks={parseBlocks(page.blocks)} />
        </div>
      </main>
      <footer style={{ borderTop: "1px solid #e8e8ee", padding: "24px 32px", textAlign: "center", fontSize: 13, color: "#8b8f9a" }}>
        Published with N0VA Sites
      </footer>
    </div>
  );
}

function SiteNotice({ message }: { message: string }) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--nv-space-6)" }}>
      <div className="nv-card" style={{ padding: "var(--nv-space-6)", textAlign: "center" }}>
        <p style={{ color: "var(--nv-color-text-muted)" }}>{message}</p>
      </div>
    </div>
  );
}
