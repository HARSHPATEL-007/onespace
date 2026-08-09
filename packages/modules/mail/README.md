# N0VA MAIL — Quick Start

## 1. Set up environment variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/n0va"

# SMTP (for real email sending)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_SECURE="false"

# AI (optional — enables smart replies, summaries, phishing detection)
OPENAI_API_KEY="sk-..."

# Auth
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
```

## 2. Initialize database

```bash
cd packages/db
pnpm db:push
```

## 3. Start the dev server

```bash
pnpm dev
```

Visit: http://localhost:3000/m/mail

## 4. First-time setup

1. Sign up / sign in
2. Navigate to **Domain & Privacy → Domains**
3. Register a custom domain (e.g., `yourdomain.com`)
4. Configure DNS records (MX → `mx.n0va.io`, SPF, DKIM, DMARC)
5. Verify domain with the **Verify** button
6. Create aliases (e.g., `banking@yourdomain.com`)
7. Start sending and receiving!

## Docker Deployment

```bash
docker-compose up -d
```

## Features

- **Send/Receive** — Real SMTP with MIME message construction
- **Security Pipeline** — SPF/DKIM/DMARC evaluation, anti-spam, antivirus, content sanitization
- **AI Features** — Smart replies, thread summarization, phishing detection
- **Privacy** — Custom domains, alias management, reverse aliases, breach monitoring
- **Team** — Shared mailboxes, internal comments, delegation, email-to-task
- **Compliance** — Audit logging, legal hold, retention policies, export
- **API** — REST endpoints, webhooks, SMTP relay
