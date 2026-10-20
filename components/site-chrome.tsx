import Link from "next/link";
import { WORKFLOW_URL } from "@/lib/site";

function WaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12h2l2-6 3 12 3-16 3 18 3-12 2 4h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ArrowOutIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 5h5v5M19 5l-8 8M19 14v5H5V5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppHeader({ siteName, docs = false }: { siteName: string; docs?: boolean }) {
  return (
    <header className="page-wrap topbar">
      <Link className="brand" href="/" aria-label={`${siteName} 首页`}>
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">
          {siteName}
          <small>AI Music Studio</small>
        </span>
      </Link>
      <nav className="nav-links" aria-label="主导航">
        <Link className="nav-link" href="/" aria-current={docs ? undefined : "page"}>
          <WaveIcon />
          <span>工作室</span>
        </Link>
        <Link className="nav-link" href="/docs" aria-current={docs ? "page" : undefined}>
          <LinkIcon />
          <span>API 文档</span>
        </Link>
      </nav>
    </header>
  );
}

export function AppFooter({ siteName }: { siteName: string }) {
  return (
    <footer className="page-wrap footer">
      <span>© {new Date().getFullYear()} {siteName} · 每个灵感都值得被听见</span>
      <div className="footer-links">
        <a href={WORKFLOW_URL} target="_blank" rel="noreferrer">
          RunningHub 工作流
          <ArrowOutIcon />
        </a>
        <Link href="/docs">API</Link>
        <a href="/docs#providers">提供商配置</a>
      </div>
    </footer>
  );
}