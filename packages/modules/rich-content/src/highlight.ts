const KW: Record<string, string[]> = {
  typescript: ["const","let","var","function","class","interface","type","import","export","return","if","else","for","while","new","this","extends","async","await","true","false","null","undefined"],
  javascript: ["const","let","var","function","class","import","export","return","if","else","for","while","new","this","async","await","true","false","null","undefined"],
  python: ["def","class","import","from","return","if","elif","else","for","while","try","except","with","as","pass","True","False","None","and","or","not","in","is"],
  go: ["func","package","import","var","const","type","struct","interface","map","chan","go","defer","return","if","else","for","range","switch","case","break","nil","true","false"],
  rust: ["fn","let","mut","const","struct","enum","impl","trait","type","pub","use","match","if","else","for","return","self","true","false","Some","None","Ok","Err"],
  sql: ["SELECT","FROM","WHERE","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","JOIN","ON","GROUP","ORDER","HAVING","LIMIT","AND","OR","NOT","IN","AS"],
};

const TH = { k: "#c678dd", s: "#98c379", n: "#d19a66", c: "#5c6370", f: "#61afef", p: "#abb2bf" };

export function highlightCode(code: string, lang: string): string {
  const kw = KW[lang] ?? [];
  let html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/(\/\/[^\n]*|#.*$)/gm, `<span style="color:${TH.c}">$1</span>`);
  html = html.replace(/(&quot;[^&]*&quot;|'[^']*'|`[^`]*`)/g, `<span style="color:${TH.s}">$1</span>`);
  html = html.replace(/\b(\d+\.?\d*)\b/g, `<span style="color:${TH.n}">$1</span>`);
  for (const word of kw) {
    html = html.replace(new RegExp(`\\b(${word})\\b`, "g"), `<span style="color:${TH.k}">$1</span>`);
  }
  return html;
}

export function renderHighlightedCode(code: string, lang: string, showLineNumbers = true): string {
  const lines = code.split("\n");
  const highlighted = lines.map((line, i) => {
    const num = showLineNumbers ? `<span style="color:#636d83;margin-right:12px;user-select:none">${i + 1}</span>` : "";
    return `<div style="display:flex">${num}<span style="flex:1">${highlightCode(line, lang) || " "}</span></div>`;
  });
  return `<div style="font-family:var(--nv-font-mono);font-size:13px;line-height:1.6;background:var(--nv-color-bg);padding:12px;border-radius:var(--nv-radius-md);overflow-x:auto">${highlighted.join("")}</div>`;
}

export function getSupportedLanguages(): string[] {
  return [...Object.keys(KW), "java", "ruby", "css", "html", "json", "yaml", "markdown", "shell", "text"];
}
