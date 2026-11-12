import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const allowed = /^(closing-config|closing-issues\/[A-Z_]+\/[0-9a-fA-F-]{36}(?::[UPDCX])?|daily-closings(?:\/(?:preview|[0-9a-fA-F-]{36}(?:\/post-close)?))?|production\/(?:orders|order-detail)|count-config|counts(?:\/[0-9a-fA-F-]{36})?|count-(?:sessions|attempts|observations|results|resolutions)|reports\/(?:config|movements|summary|orders)|completion-config|completion-sessions|completion-options|completions(?:\/(?:preview|[0-9a-fA-F-]{36}))?|authorization-request-config|authorization-requests(?:\/(?:preview|[0-9a-fA-F-]{36}))?|damage-config|damage-(?:reports|reviews)(?:\/(?:preview|[0-9a-fA-F-]{36}))?|reason-reconciliation-config|checkout-reasons(?:\/preview)?|reason-reconciliations(?:\/[0-9a-fA-F-]{36})?|checkout-config|checkouts(?:\/(?:preview|[0-9a-fA-F-]{36}))?|invitations\/accept|admin\/invitations(?:\/[0-9a-fA-F-]{36}\/(?:resend|revoke))?|inventory\/(products|lots|units)\/by-code\/[A-Za-z0-9]{6}|units\/[0-9a-fA-F-]{36}(?:\/tracking)?|unit-observations|qr\/(resolve|manual|manual-sources)|unit-label-config|unit-label-options|unit-label-previews|unit-label-jobs(?:\/[0-9a-fA-F-]{36}(?:\/artifact|\/handoffs|\/artifacts\/[0-9a-fA-F-]{36}\.(?:html|pdf))?)?|label-print-jobs(?:\/[0-9a-fA-F-]{36}(?:\/preview|\/events|\/artifacts\/[0-9]{1,12}(?:\.pdf)?)?)?|receipts\/[0-9a-fA-F-]{36}\/(?:label-plan|units)|receiving\/(options|product-setups)|receipts(?:\/[0-9a-fA-F-]{36})?|stock(?:\/lots\/[0-9a-fA-F-]{36})?|sessions|sessions\/logout|me|availability|account(?:\/password)?|admin\/users(?:\/[0-9a-fA-F-]{36}(?:\/(?:update|revoke))?)?|admin\/shop|catalogue|catalogue\/(products|suppliers|sources|attributes|values|variants|skus|supplier-setups|product-setups))$/;
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join('/');
  if (path.startsWith('invitations/') && request.nextUrl.search) return NextResponse.json({message:'Query credentials rejected'},{status:400});
  if (!allowed.test(path)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const expectedOrigin = process.env.APP_ORIGIN ?? (process.env.NODE_ENV === 'production' ? null : 'http://127.0.0.1:3000');
  if (request.method === 'POST' && !expectedOrigin) return NextResponse.json({ message: 'Shop sign-in is unavailable. Contact your administrator.' }, { status: 503 });
  if (request.method === 'POST' && request.headers.get('origin') !== expectedOrigin) return NextResponse.json({ message: 'Request origin rejected' }, { status: 403 });
  const jar = await cookies();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = jar.get('dayari_session')?.value;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const key = request.headers.get('idempotency-key');
  if (key) headers.set('Idempotency-Key', key);
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && body.length > 32000) return NextResponse.json({ message: 'Request is too large' }, { status: 413 });
  try {
    const upstream = await fetch(`${process.env.API_URL ?? 'http://127.0.0.1:4000'}/v1/${path}${request.nextUrl.search}`, { method: request.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(path.includes('/artifacts/') ? 120000 : 20000) });
    if(upstream.ok && upstream.headers.get('content-type')?.startsWith('application/pdf')) return new NextResponse(await upstream.arrayBuffer(),{headers:{'Content-Type':'application/pdf','Content-Disposition':upstream.headers.get('content-disposition')??'inline','Cache-Control':'private, no-store','X-Artifact-SHA256':upstream.headers.get('x-artifact-sha256')??''}});
    if(upstream.ok && path.startsWith('unit-label-jobs/') && path.endsWith('.html') && upstream.headers.get('content-type')?.startsWith('text/html')) return new NextResponse(await upstream.arrayBuffer(),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':upstream.headers.get('content-security-policy')??"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','X-Artifact-SHA256':upstream.headers.get('x-artifact-sha256')??''}});
    const data = await upstream.json();
    if (path === 'sessions' && upstream.ok) {
      jar.set('dayari_session', data.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 });
      return NextResponse.json({ user: data.user }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (path === 'sessions/logout' || (path === 'account/password' && upstream.ok) || upstream.status === 401) jar.delete('dayari_session');
    return NextResponse.json(data, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ message: 'The shop service is unavailable. Reconnect and retry the same action.' }, { status: 503 });
  }
}
export { handle as GET, handle as POST };
