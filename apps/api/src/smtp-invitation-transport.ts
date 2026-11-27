import nodemailer from 'nodemailer';
import type { InvitationMessage, InvitationTransport, WelcomeMessage } from './invitation-mail.js';

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
  /** Welcome email with the Admin-assigned password; first sign-in forces a password change. */
  async sendWelcome(message: WelcomeMessage): Promise<void> {
    const url = new URL(message.signInUrl);
    if (url.origin !== new URL(this.settings.publicUrl).origin || url.pathname !== '/' || url.search || url.hash ||
      url.username || url.password || !message.password) throw new Error('Invalid welcome delivery payload');
    const transport = this.client();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { transport.close(); reject(new Error('Welcome delivery timed out')); }, 20000);
        timer.unref();
      });
      const name = escapeHtml(message.name), password = escapeHtml(message.password), link = escapeHtml(url.toString());
      const result = await Promise.race([transport.sendMail({
        from: { name: 'Dayari Inventory', address: this.settings.from },
        to: { address: message.to, name: message.name },
        subject: 'Your Dayari Inventory account',
        text: `Hello ${message.name},

Your shop Admin has created a Dayari Inventory account for you.

Email: ${message.to}
Password: ${message.password}

Sign in here: ${url.toString()}

When you first sign in you will be asked to choose your own password. Please do it straight away and delete this email afterwards.

If you did not expect this email, tell your shop Admin.

Dayari Inventory`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#173d32"><h1 style="font-size:24px">Welcome to Dayari Inventory</h1><p>Hello ${name},</p><p>Your shop Admin has created an account for you.</p><table style="border-collapse:collapse;margin:16px 0"><tr><td style="padding:4px 16px 4px 0;color:#5b6b66">Email</td><td style="padding:4px 0"><strong>${escapeHtml(message.to)}</strong></td></tr><tr><td style="padding:4px 16px 4px 0;color:#5b6b66">Password</td><td style="padding:4px 0;font-family:monospace;font-size:16px"><strong>${password}</strong></td></tr></table><p><a href="${link}" style="display:inline-block;background:#17644e;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">Sign in and change your password</a></p><p>When you first sign in you will be asked to choose your own password. Please do it straight away and delete this email afterwards.</p><p>If you did not expect this email, tell your shop Admin.</p><p>Dayari Inventory</p></div>`,
      }), deadline]);
      if (result.rejected.length || !result.accepted.some(address => address.toLowerCase() === message.to.toLowerCase()))
        throw new Error('Welcome recipient was not accepted');
    } catch {
      throw new Error('Welcome email could not be accepted by the mail server');
    } finally {
      if (timer) clearTimeout(timer);
      transport.close();
    }
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
