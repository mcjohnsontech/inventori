import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SMTPServer } from 'smtp-server';
import { generate } from 'selfsigned';
import { invitationConfig, type InvitationMessage } from '../../apps/api/src/invitation-mail.js';
import { SmtpInvitationTransport } from '../../apps/api/src/smtp-invitation-transport.js';

const password = randomBytes(24).toString('hex');
const publicUrl = 'https://staff.fixture.example';
const message = (): InvitationMessage => ({
  invitationId: randomUUID(), deliveryMode: 'smtp', to: 'colleague@fixture.test',
  name: '<script>Example & colleague</script>',
  url: `${publicUrl}/accept-invitation?token=${randomBytes(32).toString('base64url')}`,
});
const env = (): NodeJS.ProcessEnv => ({
  INVITATION_TRANSPORT: 'smtp', INVITATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  INVITATION_LIVE_ENABLED: '1', SMTP_SENDER_VERIFIED: '1', APP_PUBLIC_URL: publicUrl,
  SMTP_USER: 'fixture', SMTP_PASSWORD: password, SMTP_FROM_ADDRESS: 'sender@fixture.test',
});
describe('SMTP invitation configuration', () => {
  it('fails closed without verified sender, explicit activation, credentials and HTTPS URL', () => {
    expect(invitationConfig({})).toBeUndefined();
    for (const key of ['INVITATION_LIVE_ENABLED','SMTP_SENDER_VERIFIED','SMTP_USER','SMTP_PASSWORD','SMTP_FROM_ADDRESS','APP_PUBLIC_URL','INVITATION_ENCRYPTION_KEY']) {
      const settings = env(); delete settings[key]; expect(invitationConfig(settings)).toBeUndefined();
    }
    for (const url of ['http://staff.fixture.example','https://localhost','https://127.0.0.1','https://staff.fixture.example/path','https://user:secret@staff.fixture.example/'])
      expect(invitationConfig({...env(),APP_PUBLIC_URL:url})).toBeUndefined();
    expect(invitationConfig({...env(),SMTP_PORT:'465'})).toBeUndefined();
    expect(invitationConfig({...env(),SMTP_FROM_ADDRESS:'Sender <bad@fixture.test>'})).toBeUndefined();
    const config=invitationConfig(env());expect(config?.transport.mode).toBe('smtp');expect(config?.worker).toBe(true);
  });
  it('keeps isolated mode explicit and never enables live transport by default', () => {
    const config=invitationConfig({...env(),INVITATION_TRANSPORT:'isolated',APP_PUBLIC_URL:'http://127.0.0.1:3101/'});
    expect(config?.transport.mode).toBe('isolated');expect(config?.worker).toBe(false);
  });
});
describe('real SMTP exchange against loopback TLS fixtures only', () => {
  let cert: Awaited<ReturnType<typeof generate>>;
  const servers: SMTPServer[] = [];
  beforeAll(async () => { cert=await generate([{name:'commonName',value:'localhost'}],{algorithm:'sha256',keySize:2048,extensions:[{name:'basicConstraints',cA:true},{name:'subjectAltName',altNames:[{type:2,value:'localhost'},{type:7,ip:'127.0.0.1'}]}]}); });
  afterAll(async () => { for(const server of servers)await new Promise<void>(resolve=>server.close(()=>resolve())); });
  async function fixture(options:{noTls?:boolean;rejectRecipient?:boolean;trust?:boolean}={}) {
    const received:string[]=[],secure:boolean[]=[];
    const server=new SMTPServer({
      key:cert.private,cert:cert.cert,logger:false,authMethods:['PLAIN'],
      ...(options.noTls?{disabledCommands:['STARTTLS']}:{}),
      onAuth(auth,session,done){secure.push(session.secure);if(!session.secure||auth.username!=='fixture'||auth.password!==password)return done(new Error('Authentication denied'));done(null,{user:'fixture'});},
      onRcptTo(_address,_session,done){if(options.rejectRecipient){const error=Object.assign(new Error('Fixture rejected recipient'),{responseCode:550});done(error);}else done();},
      onData(stream,_session,done){let raw='';stream.on('data',data=>{raw+=data.toString();});stream.on('end',()=>{received.push(raw);done();});},
    });
    server.on('error',()=>{});servers.push(server);
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=(server.server.address() as AddressInfo).port;
    return {received,secure,transport:new SmtpInvitationTransport({host:'127.0.0.1',port,user:'fixture',password,from:'sender@fixture.test',publicUrl},options.trust===false?undefined:cert.cert)};
  }
  it('negotiates TLS, authenticates, sends both bodies and keeps the same message identity on retry',async()=>{
    const server=await fixture(),mail=message();await server.transport.verify();expect(server.received).toHaveLength(0);await server.transport.send(mail);await server.transport.send(mail);
    expect(server.secure).toEqual([true,true,true]);expect(server.received).toHaveLength(2);
    for(const raw of server.received){const decoded=raw.replace(/=\r?\n/g,'').replace(/=3D/g,'=');
      const headers=raw.split('\r\n\r\n')[0]!.replace(/\r?\n[ \t]+/g,' ');expect(headers.includes(`Message-ID: <dayari-invitation-${mail.invitationId}@fixture.test>`)).toBe(true);
      expect(decoded).toContain('Content-Type: text/plain');expect(decoded).toContain('Content-Type: text/html');
      expect(decoded.includes(mail.url)).toBe(true);expect(decoded).toContain('&lt;script&gt;Example &amp; colleague&lt;/script&gt;');
      expect(decoded).toContain('24 hours');expect(decoded).not.toContain(password);
    }
  });
  it('refuses plaintext downgrade before sending credentials',async()=>{
    const server=await fixture({noTls:true});await expect(server.transport.send(message())).rejects.toThrow('could not be accepted');expect(server.secure).toEqual([]);expect(server.received).toEqual([]);
  });
  it('refuses an untrusted TLS certificate',async()=>{
    const server=await fixture({trust:false});await expect(server.transport.send(message())).rejects.toThrow('could not be accepted');expect(server.secure).toEqual([]);expect(server.received).toEqual([]);
  });
  it('does not claim delivery after recipient rejection and sanitizes provider errors',async()=>{
    const server=await fixture({rejectRecipient:true}),mail=message();await expect(server.transport.send(mail)).rejects.toThrow('Invitation email could not be accepted by the mail server');expect(server.received).toEqual([]);
  });
  it('will not send an isolated payload or a foreign setup link',async()=>{
    const server=await fixture();await expect(server.transport.send({...message(),deliveryMode:'isolated'})).rejects.toThrow('Invalid invitation');await expect(server.transport.send({...message(),url:'https://foreign.fixture.example/accept-invitation?token='+randomBytes(32).toString('base64url')})).rejects.toThrow('Invalid invitation');expect(server.received).toEqual([]);
  });
});
