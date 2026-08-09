"use client";

/**
 * N0VA MAIL — Email Account Setup
 *
 * Production-grade UI for configuring SMTP/IMAP accounts.
 * No demos, no placeholders. Real configuration or clear errors.
 */

import { useState, useCallback } from "react";

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

const PRESET_PROVIDERS: Record<string, { smtp: Omit<SmtpConfig, "user" | "pass">; imap: Omit<ImapConfig, "user" | "pass"> }> = {
  gmail: {
    smtp: { host: "smtp.gmail.com", port: 587, secure: false },
    imap: { host: "imap.gmail.com", port: 993, secure: true },
  },
  outlook: {
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    imap: { host: "outlook.office365.com", port: 993, secure: true },
  },
  yahoo: {
    smtp: { host: "smtp.mail.yahoo.com", port: 587, secure: false },
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
  },
};

export function EmailAccountSetup({ onComplete }: { onComplete: () => void }) {
  const [email, setEmail] = useState("");
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({ host: "", port: 587, user: "", pass: "", secure: false });
  const [imapConfig, setImapConfig] = useState<ImapConfig>({ host: "", port: 993, user: "", pass: "", secure: true });
  const [isDefault, setIsDefault] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ smtp?: { success: boolean; error?: string }; imap?: { success: boolean; error?: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = useCallback((provider: string) => {
    const preset = PRESET_PROVIDERS[provider];
    if (!preset) return;
    setSmtpConfig((c) => ({ ...c, ...preset.smtp }));
    setImapConfig((c) => ({ ...c, ...preset.imap }));
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/mail/accounts", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          smtpConfig: smtpConfig.host ? smtpConfig : undefined,
          imapConfig: imapConfig.host ? imapConfig : undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);

      if (data.smtp && !data.smtp.success) {
        setError(`SMTP: ${data.smtp.error}`);
      } else if (data.imap && !data.imap.success) {
        setError(`IMAP: ${data.imap.error}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!email.trim()) {
      setError("Email address is required");
      return;
    }
    if (!smtpConfig.host && !imapConfig.host) {
      setError("Configure at least SMTP or IMAP");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/mail/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          smtpConfig: smtpConfig.host ? smtpConfig : undefined,
          imapConfig: imapConfig.host ? imapConfig : undefined,
          isDefault,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save account");
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nv-panel nv-account-setup">
      <div className="nv-panel-header">
        <h3>Connect Email Account</h3>
        <span className="nv-text-dim">Configure SMTP for sending and IMAP for receiving emails.</span>
      </div>

      {error && (
        <div className="nv-alert nv-alert-error">
          <span className="nv-alert-icon">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {testResult && !error && (
        <div className="nv-alert nv-alert-success">
          <span className="nv-alert-icon">✓</span>
          <span>
            {testResult.smtp?.success && "SMTP connected. "}
            {testResult.imap?.success && "IMAP connected. "}
            Ready to save.
          </span>
        </div>
      )}

      <div className="nv-form-group">
        <label>Email Address</label>
        <input
          className="nv-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </div>

      <div className="nv-form-section">
        <div className="nv-form-section-header">
          <h4>SMTP (Sending)</h4>
          <select className="nv-select nv-select-sm" onChange={(e) => applyPreset(e.target.value)} value="">
            <option value="">Preset...</option>
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook/365</option>
            <option value="yahoo">Yahoo</option>
          </select>
        </div>
        <div className="nv-form-row">
          <input className="nv-input nv-input-sm" placeholder="SMTP Host" value={smtpConfig.host} onChange={(e) => setSmtpConfig((c) => ({ ...c, host: e.target.value }))} />
          <input className="nv-input nv-input-sm" placeholder="Port" type="number" value={smtpConfig.port} onChange={(e) => setSmtpConfig((c) => ({ ...c, port: Number(e.target.value) }))} />
          <label className="nv-checkbox-label">
            <input type="checkbox" checked={smtpConfig.secure} onChange={(e) => setSmtpConfig((c) => ({ ...c, secure: e.target.checked }))} />
            <span>TLS</span>
          </label>
        </div>
        <div className="nv-form-row">
          <input className="nv-input nv-input-sm" placeholder="Username" value={smtpConfig.user} onChange={(e) => setSmtpConfig((c) => ({ ...c, user: e.target.value }))} />
          <input className="nv-input nv-input-sm" placeholder="Password" type="password" value={smtpConfig.pass} onChange={(e) => setSmtpConfig((c) => ({ ...c, pass: e.target.value }))} />
        </div>
        <p className="nv-text-dim nv-text-sm">For Gmail, use an App Password (not your regular password).</p>
      </div>

      <div className="nv-form-section">
        <div className="nv-form-section-header">
          <h4>IMAP (Receiving)</h4>
        </div>
        <div className="nv-form-row">
          <input className="nv-input nv-input-sm" placeholder="IMAP Host" value={imapConfig.host} onChange={(e) => setImapConfig((c) => ({ ...c, host: e.target.value }))} />
          <input className="nv-input nv-input-sm" placeholder="Port" type="number" value={imapConfig.port} onChange={(e) => setImapConfig((c) => ({ ...c, port: Number(e.target.value) }))} />
          <label className="nv-checkbox-label">
            <input type="checkbox" checked={imapConfig.secure} onChange={(e) => setImapConfig((c) => ({ ...c, secure: e.target.checked }))} />
            <span>SSL</span>
          </label>
        </div>
        <div className="nv-form-row">
          <input className="nv-input nv-input-sm" placeholder="Username" value={imapConfig.user} onChange={(e) => setImapConfig((c) => ({ ...c, user: e.target.value }))} />
          <input className="nv-input nv-input-sm" placeholder="Password" type="password" value={imapConfig.pass} onChange={(e) => setImapConfig((c) => ({ ...c, pass: e.target.value }))} />
        </div>
      </div>

      <label className="nv-checkbox-label">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        <span>Set as default account</span>
      </label>

      <div className="nv-panel-footer">
        <div className="nv-btn-group">
          <button className="nv-btn nv-btn-secondary" onClick={handleTest} disabled={testing || (!smtpConfig.host && !imapConfig.host)}>
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button className="nv-btn nv-btn-primary" onClick={handleSave} disabled={saving || !email.trim()}>
            {saving ? "Saving..." : "Save Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
