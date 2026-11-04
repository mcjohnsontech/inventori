import 'dotenv/config';
import { invitationConfig } from '../apps/api/src/invitation-mail.js';
import { SmtpInvitationTransport } from '../apps/api/src/smtp-invitation-transport.js';

const config = invitationConfig();
if (!config || !(config.transport instanceof SmtpInvitationTransport)) {
  console.error('SMTP invitations are not configured. Set the private SMTP credentials, verified sender, HTTPS APP_PUBLIC_URL, encryption key and explicit enable flags described in docs/invitation-email-setup.md. No email was sent.');
  process.exitCode = 1;
} else {
  try {
    await config.transport.verify();
    console.info('SMTP TLS connection and authentication succeeded. No email was sent. Sender ownership and employee URL reachability must still be verified separately.');
  } catch {
    console.error('SMTP check failed. Check provider credentials, network access and TLS configuration privately. No email was sent.');
    process.exitCode = 1;
  }
}
