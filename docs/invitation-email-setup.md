# Staff email setup

Use **Users & access → Invite staff** to email a secure setup link. The employee sets their own password; no password is emailed. **Create staff account** remains supervised setup without email. Invitations cannot recover an email that already has an account; existing accounts need their existing credentials and administration.

## Private configuration

Brevo is the provisional provider already selected by the owner. In the ignored local `.env`, configure:

| Setting | Value |
|---|---|
| `INVITATION_TRANSPORT` | `smtp` |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` — required STARTTLS |
| `SMTP_USER` / `SMTP_PASSWORD` | Private SMTP login/key supplied by the provider |
| `SMTP_FROM_ADDRESS` | Sender address verified in the provider account; no default or assumed domain |
| `SMTP_SENDER_VERIFIED` | `1` only after verification |
| `APP_PUBLIC_URL` | Actual employee-accessible HTTPS origin; no path/query/credentials |
| `APP_ORIGIN` | The same employee-facing origin, for same-origin POST validation |
| `INVITATION_ENCRYPTION_KEY` | Private canonical base64 encoding of 32 secure random bytes |
| `INVITATION_LIVE_ENABLED` | `1` only when the above are ready |

Sender name is Dayari Inventory. Do not paste keys/passwords into chat or commit `.env`. Keep the encryption key backed up privately while invitations await delivery. Do not generate a new key on every restart: existing pending mail would become unreadable. SMTP mode starts the bounded worker automatically; no separate worker flag is needed. No code or setting bypasses TLS certificate validation.

The recipient URL must actually reach this shop application, with TLS and query-token access-log redaction. A localhost URL cannot work on an employee's device. SMTP does not provide hosting or off-site network access. Configure the reverse proxy/HTTPS and approved public or shop-LAN address separately; no domain or network address is invented by this slice.

Run `npm run mail:check` privately after configuration. It verifies a TLS connection and authentication **without sending an email**; it cannot prove sender ownership, inbox delivery or URL reachability. Restart API and web services after environment changes. Check the returned mode in the invitation administration UI before inviting a real employee.

## Delivery and retry

Invitations commit to the encrypted queue atomically. SMTP sends happen outside database transactions. The worker retries the same link up to five times with backoff. Network failure leaves the staff account inactive/uncreated. The UI distinguishes queued, mail-server accepted, failed and accepted-account states. Mail-server acceptance does not guarantee delivery to the inbox; check spam/provider status when necessary.

An uncertain SMTP outcome may produce duplicate copies of the same invitation, with a stable message ID and single-use token. Explicit Resend revokes the old link and issues another; it never emails a reusable password or modifies an existing account. Isolated/test payloads cannot be delivered after switching to SMTP. Revoke test invitations and review queued work before a live rollout.

## Database

Existing additive migrations 011/012 provide invitation identities, encrypted queue, lifecycle evidence and completeness guards. Owner authorized their local application on 4 November 2026 after private backup. No new migration or stock/account backfill is required for SMTP. Production deployment or migration is not authorized by this local setup.

Library transport reference: [Nodemailer SMTP](https://nodemailer.com/smtp) (required STARTTLS, timeouts and disabled debug/file/URL access).
