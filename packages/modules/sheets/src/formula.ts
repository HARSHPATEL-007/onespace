export function colName(c: number): string {
  let s = "";
  let n = c;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]!.toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2]!, 10) - 1 };
}

function getRaw(data: unknown[][], col: number, row: number): string {
  const v = data[row]?.[col];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toNumber(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function expandRange(a: string, b: string): Array<{ col: number; row: number }> {
  const ca = parseCellRef(a);
  const cb = parseCellRef(b);
  if (!ca || !cb) return [];
  const cols = ca.col < cb.col ? [ca.col, cb.col] : [cb.col, ca.col];
  const rows = ca.row < cb.row ? [ca.row, cb.row] : [cb.row, ca.row];
  const out: Array<{ col: number; row: number }> = [];
  for (let r = rows[0]!; r <= rows[1]!; r++) {
    for (let c = cols[0]!; c <= cols[1]!; c++) out.push({ col: c, row: r });
  }
  return out;
}

function resolve(data: unknown[][], col: number, row: number): string {
  const v = getRaw(data, col, row);
  if (v.startsWith("=")) return evalFormula(v, data).value;
  return v;
}

function evalArith(expr: string, data: unknown[][]): string {
  // Tokenize: numbers, cell refs, operators, parentheses, string literals.
  const tokens: Array<{ t: "num" | "ref" | "op" | "str"; v: string }> = [];
  const re = /\s*(\$?[A-Za-z]+\$?\d+|[-+*/%()&]|"(?:[^"]|"")*"|-?\d*\.?\d+)\s*/g;
  let last = "";
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(expr)) !== null) {
    if (m.index !== consumed) break; // unknown char -> bail
    consumed = re.lastIndex;
    const tok = m[1]!;
    if (parseCellRef(tok)) tokens.push({ t: "ref", v: tok });
    else if (/^[-+*/%()&]$/.test(tok)) tokens.push({ t: "op", v: tok });
    else if (tok.startsWith('"')) tokens.push({ t: "str", v: tok.slice(1, -1) });
    else if (/^-?\d*\.?\d+$/.test(tok)) tokens.push({ t: "num", v: tok });
    else { last = tok; break; }
  }
  if (consumed !== expr.trim().length) return "#ERROR?";
  void last;

  // Resolve refs to numbers when possible.
  const resolved: string[] = [];
  for (const tk of tokens) {
    if (tk.t === "ref") {
      const p = parseCellRef(tk.v)!;
      const v = resolve(data, p.col, p.row);
      const n = toNumber(v);
      resolved.push(n !== null ? String(n) : JSON.stringify(v));
    } else if (tk.t === "str") {
      resolved.push(JSON.stringify(tk.v));
    } else {
      resolved.push(tk.v);
    }
  }

  // Build a safe arithmetic expression: only numbers and ops remain.
  const src = resolved.join(" ");
  if (!/^[\d\s.+\-*/%()&"']+$/.test(src)) return "#ERROR?";
  const sanitized = src.replace(/[^0-9+\-*/().%&\s"]/g, "").replace(/"/g, "");
  try {
    const value = Function(`"use strict"; return (${sanitized});`)() as unknown;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return String(value ?? "");
  } catch {
    return "#ERROR?";
  }
}

/**
 * Evaluate a sheet formula (must start with "=").
 * Supports SUM/AVERAGE/COUNT/MIN/MAX/COUNTA over ranges or single cells,
 * and arithmetic / string concatenation expressions with cell references.
 */
export function evalFormula(formula: string, data: unknown[][]): { value: string; error: string | null } {
  let expr = formula.trim();
  if (!expr.startsWith("=")) return { value: expr, error: null };
  expr = expr.slice(1).trim();
  if (expr === "") return { value: "", error: null };

  const fnMatch = /^(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX)\((.*)\)$/i.exec(expr);
  if (fnMatch) {
    const fn = fnMatch[1]!.toUpperCase();
    const args = fnMatch[2]!.split(",").map((a) => a.trim());
    const cells: Array<{ col: number; row: number }> = [];
    const literals: string[] = [];
    for (const arg of args) {
      if (arg === "") continue;
      const range = /^(\$?[A-Za-z]+\$?\d+):(\$?[A-Za-z]+\$?\d+)$/.exec(arg);
      if (range) cells.push(...expandRange(range[1]!, range[2]!));
      else if (parseCellRef(arg)) cells.push(parseCellRef(arg)!);
      else if (/^-?\d*\.?\d+$/.test(arg)) literals.push(arg);
    }
    const values = cells.map((c) => resolve(data, c.col, c.row));
    const nums = [...values, ...literals].map(toNumber).filter((n): n is number => n !== null);
    switch (fn) {
      case "SUM":
        return { value: String(nums.reduce((a, b) => a + b, 0)), error: null };
      case "AVERAGE":
        if (nums.length === 0) return { value: "#DIV/0!", error: "empty range" };
        return { value: String(nums.reduce((a, b) => a + b, 0) / nums.length), error: null };
      case "COUNT":
        return { value: String(nums.length), error: null };
      case "COUNTA":
        return { value: String(values.filter((v) => v !== "").length), error: null };
      case "MIN":
        if (nums.length === 0) return { value: "#NUM!", error: "empty range" };
        return { value: String(Math.min(...nums)), error: null };
      case "MAX":
        if (nums.length === 0) return { value: "#NUM!", error: "empty range" };
        return { value: String(Math.max(...nums)), error: null };
      default:
        return { value: "#NAME?", error: "unknown function" };
    }
  }

  if (/^[A-Za-z]+\(.*\)$/.test(expr)) return { value: "#NAME?", error: "unknown function" };

  const v = evalArith(expr, data);
  return { value: v, error: v.startsWith("#") ? v : null };
}

/** Display string for a raw cell value (computes formulas). */
export function cellDisplay(raw: string, data: unknown[][]): string {
  if (raw.startsWith("=")) return evalFormula(raw, data).value;
  return raw;
}
