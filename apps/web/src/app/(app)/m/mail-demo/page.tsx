"use client";

import { useState } from "react";

export default function MailDemoPage() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!to || !subject) return;
    setLoading(true);
    setStatus("Sending...");
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, text: body }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`✅ Sent! Message ID: ${data.messageId}`);
        setTo(""); setSubject(""); setBody("");
      } else {
        setStatus(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setStatus(`❌ Network error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateReceive = async () => {
    setLoading(true);
    setStatus("Simulating inbound email...");
    try {
      const res = await fetch("/api/mail/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "sender@example.com",
          to: "inbox@n0va.io",
          subject: "Test inbound email " + new Date().toLocaleTimeString(),
          text: "This is a test email received via webhook.",
          html: "<p>This is a <strong>test</strong> email received via webhook.</p>",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`✅ Received! Message ID: ${data.messageId}`);
      } else {
        setStatus(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setStatus(`❌ Network error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 40 }}>
      <h1>N0VA MAIL — Demo</h1>
      <p>Send and receive emails via API. Configure SMTP in .env for real delivery.</p>

      <div style={{ background: "var(--nv-color-surface)", padding: 20, borderRadius: 12, marginTop: 20 }}>
        <h2>Send Email</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input className="nv-input" placeholder="To (email)" value={to} onChange={(e) => setTo(e.target.value)} />
          <input className="nv-input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="nv-input" placeholder="Body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="nv-btn nv-btn-primary" onClick={handleSend} disabled={loading}>
            {loading ? "Sending..." : "Send Email"}
          </button>
        </div>
      </div>

      <div style={{ background: "var(--nv-color-surface)", padding: 20, borderRadius: 12, marginTop: 20 }}>
        <h2>Receive Email (Webhook)</h2>
        <p>Simulate an inbound email via webhook integration (Mailgun, SendGrid, etc.)</p>
        <button className="nv-btn nv-btn-secondary" onClick={handleSimulateReceive} disabled={loading}>
          {loading ? "Receiving..." : "Simulate Inbound Email"}
        </button>
      </div>

      {status && (
        <div style={{ background: "var(--nv-color-surface-alt)", padding: 16, borderRadius: 8, marginTop: 20, fontFamily: "monospace", fontSize: 13 }}>
          {status}
        </div>
      )}

      <div style={{ marginTop: 40, padding: 20, background: "var(--nv-color-surface)", borderRadius: 12 }}>
        <h2>API Endpoints</h2>
        <pre style={{ fontSize: 12, background: "var(--nv-color-surface-alt)", padding: 12, borderRadius: 8, overflow: "auto" }}>
{`POST /api/mail/send
  { "to": "user@example.com", "subject": "Hello", "text": "Body" }

POST /api/mail/receive
  { "from": "sender@example.com", "to": "in@n0va.io", "subject": "Hi", "text": "Body" }

GET /api/mail/send
  → { smtpConfigured, host, port, user }`}
        </pre>
      </div>
    </div>
  );
}
