import { InvitationsService } from './invitations.service.js';
import { invitationConfig, type InvitationConfig } from './invitation-mail.js';
import { AvailabilityService } from './availability.service.js';
import { AccountsService } from './accounts.service.js';
import { PublicIdentitiesService } from './public-identities.service.js';
import 'reflect-metadata';
import { HttpException, InternalServerErrorException, BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Module, Param, Post, Query, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PrismaClient } from '@prisma/client';
import type { FastifyReply } from 'fastify';
import { LabelsService } from './labels.service.js';
import { ReceivingService } from './receiving.service.js';
import { CatalogueService } from './catalogue.service.js';

@Controller('v1')
class ApiController {
  constructor(@Inject(InvitationsService) private readonly invitations:InvitationsService,@Inject(AvailabilityService) private readonly availability:AvailabilityService,@Inject(AccountsService) private readonly accounts: AccountsService, @Inject(CatalogueService) private readonly service: CatalogueService, @Inject(ReceivingService) private readonly receiving: ReceivingService, @Inject(LabelsService) private readonly labels: LabelsService, @Inject(PublicIdentitiesService) private readonly identities: PublicIdentitiesService) {}
  @Get('admin/invitations') async invitationsList(@Headers('authorization') auth?:string){return this.invitations.list(await this.service.actor(this.token(auth)));}
  @Post('admin/invitations') async invite(@Body() body:unknown,@Headers('idempotency-key') key:string|undefined,@Headers('authorization') auth?:string){const actor=await this.service.actor(this.token(auth));return this.invitationResult(()=>this.invitations.command(actor,'create',null,key,body));}
  @Post('admin/invitations/:id/:action') async invitationCommand(@Param('id') id:string,@Param('action') action:string,@Body() body:unknown,@Headers('idempotency-key') key:string|undefined,@Headers('authorization') auth?:string){if(action!=='resend'&&action!=='revoke')throw new BadRequestException('Unknown invitation command');const actor=await this.service.actor(this.token(auth));return this.invitationResult(()=>this.invitations.command(actor,action,id,key,body));}
  @Post('invitations/accept') @HttpCode(200) async acceptInvite(@Body() body:unknown,@Headers('idempotency-key') key:string|undefined){return this.invitationResult(()=>this.invitations.accept(body,key));}
  @Get('availability') async available(@Query() query:unknown,@Headers('authorization') auth?:string){return this.availability.list(await this.service.actor(this.token(auth)),query);}
  @Get('account') async account(@Headers('authorization') auth?:string){return this.accounts.own(await this.service.actor(this.token(auth)));}
  @Post('account/password') async password(@Body() body:unknown,@Headers('idempotency-key') key:string|undefined,@Headers('authorization') auth?:string){return this.accounts.changePassword(await this.service.actor(this.token(auth),true),key,body);}
  @Get('admin/users') async users(@Query() query:unknown,@Headers('authorization') auth?:string){return this.accounts.list(await this.service.actor(this.token(auth)),query);}
  @Get('admin/users/:id') async userDetail(@Param('id') id:string,@Headers('authorization') auth?:string){return this.accounts.detail(await this.service.actor(this.token(auth)),id);}
  @Post('admin/users') async createUser(@Body() body:unknown,@Headers('idempotency-key') key:string|undefined,@Headers('authorization') auth?:string){return this.accounts.command(await this.service.actor(this.token(auth)),'create',null,key,body);}
  @Post('admin/users/:id/update') async updateUser(@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:string|undefined,@Headers('authorization') auth?:string){return this.accounts.command(await this.service.actor(this.token(auth)),'update',id,key,body);}
  @Post('admin/users/:id/revoke') async revokeUser(@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:string|undefined,@Headers('authorization') auth?:string){return this.accounts.command(await this.service.actor(this.token(auth)),'revoke',id,key,body);}
  @Get('inventory/products/by-code/:code') async productCode(@Param('code') code:string,@Query() query:unknown,@Headers('authorization') auth?:string){return this.identities.lookup(await this.service.actor(this.token(auth)),'PRODUCT',code,query);}
  @Get('inventory/lots/by-code/:code') async lotCode(@Param('code') code:string,@Query() query:unknown,@Headers('authorization') auth?:string){return this.identities.lookup(await this.service.actor(this.token(auth)),'LOT',code,query);}
  @Get('health') health() { return { status: 'ok', service: 'dayari-api', authority: this.service.mode, cloudSync: 'not-configured' }; }
  @Post('sessions') @HttpCode(200) login(@Body() body: unknown) { return this.service.login(body); }
  @Post('sessions/logout') @HttpCode(200) async logout(@Headers('authorization') authorization?: string) {
    const token = this.token(authorization);
    await this.service.actor(token,true);
    return this.service.logout(token!);
  }
  @Get('me') async me(@Headers('authorization') authorization?: string) {
    const actor = await this.service.actor(this.token(authorization),true);
    return { id: actor.id, name: actor.name, role: actor.role, mustChangePassword:actor.mustChangePassword };
  }
  @Get('admin/shop') async shop(@Headers('authorization') authorization?: string) { return this.service.shopInfo(await this.service.actor(this.token(authorization))); }
  @Get('catalogue') async catalogue(@Headers('authorization') authorization?: string) { return this.service.catalogue(await this.service.actor(this.token(authorization))); }
  @Post('catalogue/:type') async create(@Headers('authorization') authorization: string | undefined, @Headers('idempotency-key') key: string | undefined, @Param('type') type: string, @Body() body: unknown) {
    return this.service.create(await this.service.actor(this.token(authorization)), type, key, body);
  }
  @Get('receiving/options') async receivingOptions(@Headers('authorization') auth?: string) { return this.receiving.options(await this.service.actor(this.token(auth))); }
  @Get('receipts') async receipts(@Headers('authorization') auth?: string) { return this.receiving.list(await this.service.actor(this.token(auth))); }
  @Get('receipts/:id') async receipt(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.receiving.get(await this.service.actor(this.token(auth)), id); }
  @Get('stock/lots/:id') async lotEvidence(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.receiving.lotEvidence(await this.service.actor(this.token(auth)), id); }
  @Get('stock') async stock(@Query() query: unknown, @Headers('authorization') auth?: string) { return this.receiving.stock(await this.service.actor(this.token(auth)), query); }
  @Post('receipts') async receive(@Headers('authorization') auth: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) { return this.receiving.create(await this.service.actor(this.token(auth)), key, body); }
  @Post('qr/resolve') @HttpCode(200) async resolveQr(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.labels.resolve(await this.service.actor(this.token(auth)),body);}
  @Get('qr/manual-sources') async manualSources(@Headers('authorization') auth?:string){return this.labels.manualSources(await this.service.actor(this.token(auth)));}
  @Post('qr/manual') @HttpCode(200) async manualQr(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.labels.manual(await this.service.actor(this.token(auth)),body);}
  @Get('receipts/:id/label-plan') async labelPlan(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.labels.plan(await this.service.actor(this.token(auth)),id);}
  @Get('label-print-jobs') async labelJobs(@Headers('authorization') auth?:string){return this.labels.list(await this.service.actor(this.token(auth)));}
  @Post('label-print-jobs') async newLabelJob(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.labels.create(await this.service.actor(this.token(auth)),key,body);}
  @Post('label-print-jobs/:id/preview') @HttpCode(200) async previewLabels(@Headers('authorization') auth:string|undefined,@Param('id') id:string,@Body() body:unknown,@Res() reply:FastifyReply){const result=await this.labels.preview(await this.service.actor(this.token(auth)),id,body);return reply.type('application/pdf').header('X-Artifact-SHA256',result.hash).send(result.bytes);}
  @Get('label-print-jobs/:id') async labelJob(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.labels.get(await this.service.actor(this.token(auth)),id);}
  @Post('label-print-jobs/:id/artifacts/:chunk') async prepareLabels(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Param('id') id:string,@Param('chunk') chunk:string,@Body() body:unknown){return this.labels.prepare(await this.service.actor(this.token(auth)),id,chunk,key,body);}
  @Get('label-print-jobs/:id/artifacts/:chunk.pdf') async labelPdf(@Headers('authorization') auth:string|undefined,@Param('id') id:string,@Param('chunk') chunk:string,@Res() reply:FastifyReply){const result=await this.labels.pdf(await this.service.actor(this.token(auth)),id,chunk);return reply.type('application/pdf').header('Content-Disposition',`inline; filename="dayari-${id}-${chunk}.pdf"`).header('X-Artifact-SHA256',result.hash).send(result.bytes);}
  @Post('label-print-jobs/:id/events') async labelEvent(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Param('id') id:string,@Body() body:unknown){return this.labels.event(await this.service.actor(this.token(auth)),id,key,body);}
  private async invitationResult(work:()=>Promise<unknown>){try{return await work();}catch(error){if(error instanceof HttpException)throw error;throw new InternalServerErrorException('Invitation could not be saved. Retry the same request.');}}
  private token(header: string | undefined): string | undefined { return header?.startsWith('Bearer ') ? header.slice(7) : undefined; }
}

export async function createApp(db: PrismaClient, originId: string, mode: string, invites:InvitationConfig|undefined=invitationConfig()) {
  @Module({ controllers: [ApiController], providers: [{provide:InvitationsService,useValue:new InvitationsService(db,originId,mode,invites)},{provide:AvailabilityService,useValue:new AvailabilityService(db,originId)},{provide:AccountsService,useValue:new AccountsService(db,originId,mode)}, { provide: PublicIdentitiesService, useValue: new PublicIdentitiesService(db, originId) }, { provide: LabelsService, useValue: new LabelsService(db, originId, mode) }, { provide: ReceivingService, useValue: new ReceivingService(db, originId, mode) }, { provide: CatalogueService, useValue: new CatalogueService(db, originId, mode) }] })
  class AppModule {}
  const adapter = new FastifyAdapter({ bodyLimit: 32000 });
  adapter.getInstance().addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { logger: ['error', 'warn'] });
  await app.init();
  await adapter.getInstance().ready();
  return app;
}
