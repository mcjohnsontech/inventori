import nodemailer from 'nodemailer';
import type { InvitationMessage, InvitationTransport } from './invitation-mail.js';

export type SmtpInvitationSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  publicUrl: string;
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** STARTTLS only. No credentials, message contents or provider errors are logged. */
export class SmtpInvitationTransport implements InvitationTransport {
  readonly mode = 'smtp' as const;
  // A custom trust root is injection-only, for isolated TLS fixtures. Never an env bypass.
  constructor(private readonly settings: SmtpInvitationSettings, private readonly ca?: string) {}
  private client() {
    return nodemailer.createTransport({
      host: this.settings.host, port: this.settings.port,
      secure: false, requireTLS: true, pool: true, maxConnections: 1, maxMessages: 1,
      auth: { user: this.settings.user, pass: this.settings.password },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', ...(this.ca ? { ca: this.ca } : {}) },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000, dnsTimeout: 5000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
  }
  async verify(): Promise<void> {
    const transport = this.client();
    try { await transport.verify(); }
    catch { throw new Error('SMTP connection or authentication failed. No email was sent.'); }
    finally { transport.close(); }
  }
  async send(message: InvitationMessage): Promise<void> {
    const url = new URL(message.url);
    if (message.deliveryMode !== 'smtp' || !message.invitationId ||
      !/^[a-f0-9-]{36}$/i.test(message.invitationId) ||
      url.origin !== new URL(this.settings.publicUrl).origin || url.username || url.password || url.hash ||
      url.searchParams.size !== 1 || url.pathname !== '/accept-invitation' ||
      !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('token') ?? '')) {
      throw new Error('Invalid invitation delivery payload');
    }
    const transport = this.client();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { transport.close(); reject(new Error('Invitation delivery timed out')); }, 45000);
        timer.unref();
      });
      const result = await Promise.race([transport.sendMail({
        from: { name: 'Dayari Inventory', address: this.settings.from },
        to: { address: message.to, name: message.name },
        subject: 'Your Dayari Inventory staff invitation',
        messageId: `<dayari-invitation-${message.invitationId}@${this.settings.from.split('@')[1]}>`,
        text: `Hello ${message.name},\n\nYou have been invited to Dayari Inventory. Set your own password using this link:\n\n${message.url}\n\nThis single-use invitation expires 24 hours after it was created. If it has expired, ask your shop Admin for a new invitation. If you did not expect this invitation, ignore this email.\n\nDayari Inventory`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#173d32"><h1 style="font-size:24px">Welcome to Dayari Inventory</h1><p>Hello ${escapeHtml(message.name)},</p><p>Your shop Admin has invited you to join Dayari Inventory. Choose your own password to get started.</p><p><a href="${escapeHtml(message.url)}" style="display:inline-block;background:#17644e;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">Set up your account</a></p><p>This link works once and expires 24 hours after it was created. Ask your Admin for a new invitation if it expires.</p><p>If you did not expect this invitation, ignore this email.</p><p>Dayari Inventory</p></div>`,
      }), deadline]);
      if (result.rejected.length || !result.accepted.some(address =>
        address.toLowerCase() === message.to.toLowerCase())) {
        throw new Error('Invitation recipient was not accepted');
      }
    } catch {
      throw new Error('Invitation email could not be accepted by the mail server');
    } finally {
      if (timer) clearTimeout(timer);
      transport.close();
    }
  }
}
