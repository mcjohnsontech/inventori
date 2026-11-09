import { CountsService } from './counts.service.js';
import { ReportsService } from './reports.service.js';
import { CompletionsService } from './completions.service.js';
import { AuthorizationRequestsService } from './authorization-requests.service.js';
import { DamageService } from './damage.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { CheckoutsService } from './checkouts.service.js';
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
import { UnitsService } from './units.service.js';
import { UnitTrackingService } from './unit-tracking.service.js';
import { UnitLabelsService } from './unit-labels.service.js';
import { ReceivingService } from './receiving.service.js';
import { CatalogueService } from './catalogue.service.js';

@Controller('v1')
class ApiController {
  constructor(@Inject(CountsService) private readonly counts:CountsService,@Inject(ReportsService) private readonly reports:ReportsService,@Inject(CompletionsService) private readonly completions:CompletionsService,@Inject(AuthorizationRequestsService) private readonly requests:AuthorizationRequestsService,@Inject(DamageService) private readonly damage:DamageService,@Inject(ReconciliationService) private readonly reconciliations:ReconciliationService,@Inject(CheckoutsService) private readonly checkouts:CheckoutsService,@Inject(InvitationsService) private readonly invitations:InvitationsService,@Inject(AvailabilityService) private readonly availability:AvailabilityService,@Inject(AccountsService) private readonly accounts: AccountsService, @Inject(CatalogueService) private readonly service: CatalogueService, @Inject(ReceivingService) private readonly receiving: ReceivingService, @Inject(LabelsService) private readonly labels: LabelsService, @Inject(PublicIdentitiesService) private readonly identities: PublicIdentitiesService, @Inject(UnitsService) private readonly units: UnitsService, @Inject(UnitLabelsService) private readonly unitLabels: UnitLabelsService, @Inject(UnitTrackingService) private readonly tracking: UnitTrackingService) {}
  @Get('count-config') async countConfig(@Headers('authorization') auth:string|undefined){return this.counts.configuration(await this.service.actor(this.token(auth)));}
  @Get('counts') async countList(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.counts.list(await this.service.actor(this.token(auth)),query);}
  @Get('counts/:id') async countDetail(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.counts.get(await this.service.actor(this.token(auth)),id);}
  @Post('count-sessions') async countSession(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.counts.command(await this.service.actor(this.token(auth)),'CountSession',key,body);}
  @Post('count-attempts') async countAttempt(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.counts.command(await this.service.actor(this.token(auth)),'CountAttempt',key,body);}
  @Post('count-observations') async countObservation(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.counts.command(await this.service.actor(this.token(auth)),'CountObservation',key,body);}
  @Post('count-results') async countResult(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.counts.command(await this.service.actor(this.token(auth)),'CountResult',key,body);}
  @Post('count-resolutions') async countResolution(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.counts.command(await this.service.actor(this.token(auth)),'CountResolution',key,body);}
  @Get('reports/config') async reportConfiguration(@Headers('authorization') auth:string|undefined){return this.reports.configuration(await this.service.actor(this.token(auth)));}
  @Get('reports/movements') async movementReport(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.reports.movements(await this.service.actor(this.token(auth)),query);}
  @Get('reports/summary') async periodReport(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.reports.summary(await this.service.actor(this.token(auth)),query);}
  @Get('reports/orders') async orderReport(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.reports.orders(await this.service.actor(this.token(auth)),query);}
  @Get('completion-config') async completionConfiguration(@Headers('authorization') auth:string|undefined){return this.completions.configuration(await this.service.actor(this.token(auth)));}
  @Get('completion-options') async completionOptions(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.completions.options(await this.service.actor(this.token(auth)),query);}
  @Post('completions/preview') @HttpCode(200) async completionPreview(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.completions.preview(await this.service.actor(this.token(auth)),body);}
  @Get('completions') async completionHistory(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.completions.list(await this.service.actor(this.token(auth)),query);}
  @Get('completions/:id') async completionDetail(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.completions.get(await this.service.actor(this.token(auth)),id);}
  @Post('completions') async completeProduction(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.completions.create(await this.service.actor(this.token(auth)),key,body);}
  @Get('authorization-request-config') async requestConfiguration(@Headers('authorization') auth:string|undefined){return this.requests.configuration(await this.service.actor(this.token(auth)));}
  @Post('authorization-requests/preview') @HttpCode(200) async requestPreview(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.requests.preview(await this.service.actor(this.token(auth)),body);}
  @Get('authorization-requests') async requestHistory(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.requests.list(await this.service.actor(this.token(auth)),query);}
  @Get('authorization-requests/:id') async requestDetail(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.requests.get(await this.service.actor(this.token(auth)),id);}
  @Post('authorization-requests') async requestAuthorization(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.requests.create(await this.service.actor(this.token(auth)),key,body);}
  @Get('damage-config') async damageConfiguration(@Headers('authorization') auth:string|undefined){return this.damage.configuration(await this.service.actor(this.token(auth)));}
  @Post('damage-reports/preview') @HttpCode(200) async damagePreview(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.damage.preview(await this.service.actor(this.token(auth)),body);}
  @Post('damage-reviews/preview') @HttpCode(200) async reviewPreview(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.damage.preview(await this.service.actor(this.token(auth)),body,true);}
  @Get('damage-reports') async damageHistory(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.damage.list(await this.service.actor(this.token(auth)),query);}
  @Get('damage-reviews') async damageReviewHistory(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.damage.list(await this.service.actor(this.token(auth)),query,true);}
  @Get('damage-reports/:id') async damageDetail(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.damage.get(await this.service.actor(this.token(auth)),id);}
  @Get('damage-reviews/:id') async damageReviewDetail(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.damage.get(await this.service.actor(this.token(auth)),id,true);}
  @Post('damage-reports') async reportBad(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.damage.create(await this.service.actor(this.token(auth)),key,body);}
  @Post('damage-reviews') async reviewDamage(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.damage.create(await this.service.actor(this.token(auth)),key,body,true);}
  @Get('reason-reconciliation-config') async reasonConfiguration(@Headers('authorization') auth:string|undefined){return this.reconciliations.configuration(await this.service.actor(this.token(auth)));}
  @Post('checkout-reasons/preview') @HttpCode(200) async reasonPreview(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.reconciliations.preview(await this.service.actor(this.token(auth)),body);}
  @Get('checkout-reasons') async reasonQueue(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.reconciliations.list(await this.service.actor(this.token(auth)),query);}
  @Get('reason-reconciliations/:id') async reasonDetail(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.reconciliations.get(await this.service.actor(this.token(auth)),id);}
  @Post('reason-reconciliations') async reconcileReasons(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.reconciliations.reconcile(await this.service.actor(this.token(auth)),key,body);}
  @Get('checkouts') async checkoutHistory(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.checkouts.list(await this.service.actor(this.token(auth)),query);}
  @Get('checkout-config') async checkoutConfiguration(@Headers('authorization') auth:string|undefined){return this.checkouts.configuration(await this.service.actor(this.token(auth)));}
  @Get('checkouts/:id') async checkoutDetail(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.checkouts.get(await this.service.actor(this.token(auth)),id);}
  @Post('checkouts/preview') @HttpCode(200) async checkoutPreview(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.checkouts.preview(await this.service.actor(this.token(auth)),body);}
  @Post('checkouts') async checkoutCreate(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.checkouts.create(await this.service.actor(this.token(auth)),key,body);}
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
  @Get('inventory/units/by-code/:code') async unitCode(@Param('code') code:string,@Query() query:unknown,@Headers('authorization') auth?:string){return this.units.byCode(await this.service.actor(this.token(auth)),code,query);}
  @Get('units/:id') async unitIdentity(@Param('id') id:string,@Headers('authorization') auth?:string){return this.units.byId(await this.service.actor(this.token(auth)),this.service.originId,id);}
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
  @Post('receiving/product-setups') async receivingProduct(@Headers('authorization') auth: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) { return this.service.createReceivingProduct(await this.service.actor(this.token(auth)), key, body); }
  @Get('receipts') async receipts(@Headers('authorization') auth?: string) { return this.receiving.list(await this.service.actor(this.token(auth))); }
  @Get('receipts/:id') async receipt(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.receiving.get(await this.service.actor(this.token(auth)), id); }
  @Get('receipts/:id/units') async receiptUnits(@Param('id') id: string, @Query() query: unknown, @Headers('authorization') auth?: string) { return this.receiving.units(await this.service.actor(this.token(auth)), id, query); }
  @Get('stock/lots/:id') async lotEvidence(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.receiving.lotEvidence(await this.service.actor(this.token(auth)), id); }
  @Get('stock') async stock(@Query() query: unknown, @Headers('authorization') auth?: string) { return this.receiving.stock(await this.service.actor(this.token(auth)), query); }
  @Post('receipts') async receive(@Headers('authorization') auth: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) { return this.receiving.create(await this.service.actor(this.token(auth)), key, body); }
  @Post('qr/resolve') @HttpCode(200) async resolveQr(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.labels.resolve(await this.service.actor(this.token(auth)),body);}
  @Get('qr/manual-sources') async manualSources(@Headers('authorization') auth?:string){return this.labels.manualSources(await this.service.actor(this.token(auth)));}
  @Post('qr/manual') @HttpCode(200) async manualQr(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.labels.manual(await this.service.actor(this.token(auth)),body);}
  @Get('receipts/:id/label-plan') async labelPlan(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.labels.plan(await this.service.actor(this.token(auth)),id);}
  @Get('units/:id/tracking') async unitTracking(@Headers('authorization') auth:string|undefined,@Param('id') id:string,@Query() query:unknown){return this.tracking.tracking(await this.service.actor(this.token(auth)),id,query);}
  @Post('unit-observations') async unitObservation(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.tracking.observe(await this.service.actor(this.token(auth)),key,body);}
  @Get('unit-label-config') async unitLabelConfig(@Headers('authorization') auth?:string){return this.unitLabels.configuration(await this.service.actor(this.token(auth)));}
  @Post('unit-label-previews') @HttpCode(200) async unitLabelPreviews(@Headers('authorization') auth:string|undefined,@Body() body:unknown){return this.unitLabels.previews(await this.service.actor(this.token(auth)),body);}
  @Get('unit-label-jobs/:id/handoffs') async unitLabelRequests(@Headers('authorization') auth:string|undefined,@Param('id') id:string,@Query() query:unknown){return this.unitLabels.requests(await this.service.actor(this.token(auth)),id,query);}
  @Get('unit-label-options') async unitLabelOptions(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.unitLabels.options(await this.service.actor(this.token(auth)),query);}
  @Get('unit-label-jobs') async unitLabelJobs(@Headers('authorization') auth:string|undefined,@Query() query:unknown){return this.unitLabels.list(await this.service.actor(this.token(auth)),query);}
  @Post('unit-label-jobs') async newUnitLabelJob(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Body() body:unknown){return this.unitLabels.create(await this.service.actor(this.token(auth)),key,body);}
  @Get('unit-label-jobs/:id') async unitLabelJob(@Headers('authorization') auth:string|undefined,@Param('id') id:string){return this.unitLabels.get(await this.service.actor(this.token(auth)),id);}
  @Post('unit-label-jobs/:id/artifact') async unitLabelPrepare(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Param('id') id:string,@Body() body:unknown){return this.unitLabels.prepare(await this.service.actor(this.token(auth)),id,key,body);}
  @Get('unit-label-jobs/:id/artifacts/:artifact.html') async unitLabelHtml(@Headers('authorization') auth:string|undefined,@Param('id') id:string,@Param('artifact') artifact:string,@Res() reply:FastifyReply){const result=await this.unitLabels.artifact(await this.service.actor(this.token(auth)),id,artifact,'html');return reply.type('text/html; charset=utf-8').header('Content-Security-Policy',result.csp!).header('Referrer-Policy','no-referrer').header('Cross-Origin-Resource-Policy','same-origin').header('X-Artifact-SHA256',result.hash).send(result.bytes);}
  @Get('unit-label-jobs/:id/artifacts/:artifact.pdf') async unitLabelPdf(@Headers('authorization') auth:string|undefined,@Param('id') id:string,@Param('artifact') artifact:string,@Res() reply:FastifyReply){const result=await this.unitLabels.artifact(await this.service.actor(this.token(auth)),id,artifact,'pdf');return reply.type('application/pdf').header('Content-Disposition',`attachment; filename="dayari-unit-labels-${id}.pdf"`).header('X-Artifact-SHA256',result.hash).send(result.bytes);}
  @Post('unit-label-jobs/:id/handoffs') async unitLabelHandoff(@Headers('authorization') auth:string|undefined,@Headers('idempotency-key') key:string|undefined,@Param('id') id:string,@Body() body:unknown){return this.unitLabels.handoff(await this.service.actor(this.token(auth)),id,key,body);}
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
  const units=new UnitsService(db,originId);
  @Module({ controllers: [ApiController], providers: [{provide:CountsService,useValue:new CountsService(db,originId,mode)},{provide:ReportsService,useValue:new ReportsService(db,originId)},{provide:CompletionsService,useValue:new CompletionsService(db,originId,mode)},{provide:AuthorizationRequestsService,useValue:new AuthorizationRequestsService(db,originId,mode)},{provide:DamageService,useValue:new DamageService(db,originId,mode)},{provide:ReconciliationService,useValue:new ReconciliationService(db,originId,mode)},{provide:CheckoutsService,useValue:new CheckoutsService(db,originId,mode)},{provide:InvitationsService,useValue:new InvitationsService(db,originId,mode,invites)},{provide:AvailabilityService,useValue:new AvailabilityService(db,originId)},{provide:AccountsService,useValue:new AccountsService(db,originId,mode)}, { provide: PublicIdentitiesService, useValue: new PublicIdentitiesService(db, originId) }, {provide:UnitsService,useValue:units},{provide:UnitTrackingService,useValue:new UnitTrackingService(db,originId,mode,units)},{provide:UnitLabelsService,useValue:new UnitLabelsService(db,originId,mode)}, { provide: LabelsService, useValue: new LabelsService(db, originId, mode, units) }, { provide: ReceivingService, useValue: new ReceivingService(db, originId, mode) }, { provide: CatalogueService, useValue: new CatalogueService(db, originId, mode) }] })
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
