"use client";
import { useState } from "react";

interface RichMessageProps {
  content: string;
  workspaceId: string;
  channelId: string;
}

export function RichMessageRenderer({ content, workspaceId, channelId }: RichMessageProps) {
  const [expandedUrls, setExpandedUrls] = useState<Set<number>>(new Set());

  const toggleUrl = (idx: number) => {
    setExpandedUrls(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith("```") && !inCodeBlock) {
      inCodeBlock = true;
      codeLang = line.slice(3).trim() || "text";
      codeBuffer = [];
      continue;
    }

    if (line.startsWith("```") && inCodeBlock) {
      inCodeBlock = false;
      const code = codeBuffer.join("\n");
      elements.push(
        <CodeBlock key={`code-${i}`} code={code} language={codeLang} />
      );
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    elements.push(<TextLine key={`line-${i}`} line={line} onToggleUrl={toggleUrl} expandedUrls={expandedUrls} />);
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{elements}</div>;
}

function TextLine({ line, onToggleUrl, expandedUrls }: { line: string; onToggleUrl: (idx: number) => void; expandedUrls: Set<number> }) {
  const parts: React.ReactNode[] = [];
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let urlIdx = 0;

  while ((match = urlRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`} dangerouslySetInnerHTML={{ __html: renderInlineFormatting(line.slice(lastIndex, match.index)) }} />);
    }
    const url = match[0];
    const isExpanded = expandedUrls.has(urlIdx);
    parts.push(
      <span key={`url-${urlIdx}`}>
        <a href={url} target="_blank" rel="noopener" style={{ color: "var(--nv-color-primary)", textDecoration: "underline", fontSize: "var(--nv-font-sm)" }} onClick={(e) => { e.preventDefault(); onToggleUrl(urlIdx); }}>
          {url.length > 60 ? url.slice(0, 57) + "..." : url}
        </a>
        {isExpanded && <LinkPreviewCard url={url} />}
      </span>
    );
    lastIndex = match.index + url.length;
    urlIdx++;
  }

  if (lastIndex < line.length) {
    parts.push(<span key={`text-end`} dangerouslySetInnerHTML={{ __html: renderInlineFormatting(line.slice(lastIndex)) }} />);
  }

  return <div style={{ minHeight: 20, fontSize: "var(--nv-font-md)", lineHeight: 1.5 }}>{parts}</div>;
}

function renderInlineFormatting(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="nv-code-inline">$1</code>')
    .replace(/@(\w+)/g, '<span style="color:var(--nv-color-primary);font-weight:600">@$1</span>');
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlighted = highlightHtml(code, language);

  return (
    <div style={{ borderRadius: "var(--nv-radius-md)", overflow: "hidden", background: "var(--nv-color-bg)", border: "1px solid var(--nv-color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", borderBottom: "1px solid var(--nv-color-border)", fontSize: 11, color: "var(--nv-color-text-faint)" }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 600 }}>{language}</span>
        <button onClick={handleCopy} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-sm)", padding: "2px 8px", fontSize: 11, cursor: "pointer", color: "var(--nv-color-text)" }}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div style={{ padding: 12, overflowX: "auto", fontFamily: "var(--nv-font-mono)", fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: highlighted }} />
    </div>
  );
}

function LinkPreviewCard({ url }: { url: string }) {
  return (
    <div style={{ marginTop: 4, padding: "var(--nv-space-2)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-surface-2)", maxWidth: 360 }}>
      <a href={url} target="_blank" rel="noopener" style={{ fontSize: "var(--nv-font-sm)", fontWeight: 600, color: "var(--nv-color-primary)", textDecoration: "none" }}>
        {url.length > 60 ? url.slice(0, 57) + "..." : url}
      </a>
      <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 2 }}>Click to open</div>
    </div>
  );
}

function highlightHtml(code: string, lang: string): string {
  const kw: Record<string, string[]> = { typescript: ["const","let","function","return","if","else","class","import","export"], python: ["def","class","import","return","if","else","for","while"], go: ["func","package","import","return","if","else","for"], rust: ["fn","let","impl","return","if","else","match"], sql: ["SELECT","FROM","WHERE","INSERT","UPDATE","DELETE","JOIN","ON","GROUP","ORDER"] };
  const keywords = kw[lang] ?? [];
  let html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/(\/\/[^\n]*|#.*$)/gm, '<span style="color:#5c6370">$1</span>');
  html = html.replace(/(&quot;[^&]*&quot;|'[^']*'|`[^`]*`)/g, '<span style="color:#98c379">$1</span>');
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#d19a66">$1</span>');
  for (const word of keywords) {
    html = html.replace(new RegExp(`\\b(${word})\\b`, "g"), '<span style="color:#c678dd">$1</span>');
  }
  const lines = html.split("\n");
  return lines.map((line, i) => `<div style="display:flex"><span style="color:#636d83;margin-right:12px;user-select:none;min-width:24px;text-align:right">${i + 1}</span><span style="flex:1">${line || " "}</span></div>`).join("");
}
