import { z } from 'zod';
import { decodeQr, encodeQr, labelProfiles, type LabelProfile } from './labels.js';
import { defaultSheetStart,planLabelSheets,type SheetStart } from './label-layout.js';
const uuid=z.uuid().transform(value=>value.toLowerCase());
const readable=/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
export function encodeUnitQr(originId:string,unitId:string){return encodeQr(originId,unitId).replace('DYI:1:','DYI:2:');}
export function decodeInventoryQr(payload:unknown):{version:1;originId:string;lotId:string}|{version:2;originId:string;unitId:string}{
 if(typeof payload==='string'&&payload.startsWith('DYI:2:')){const value=decodeQr(payload.replace('DYI:2:','DYI:1:'));return {version:2,originId:value.originId,unitId:value.lotId};}
 const value=decodeQr(payload);return {version:1,...value};
}
export const unitLabelProfiles:readonly LabelProfile[]=labelProfiles.filter(profile=>profile.layoutVersion===2).map(profile=>({...profile,id:'unit-'+profile.id}));
export const unitLabelProfileSchema=z.enum(['unit-a4-70x35-v2','unit-a4-90x45-v2']);
const ids=z.array(uuid).min(1).max(500).refine(values=>new Set(values).size===values.length,'Select each physical unit once');
export const unitLabelPreviewSchema=z.object({unitIds:ids}).strict();
export const unitLabelJobSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('INITIAL'),unitIds:ids,profileId:unitLabelProfileSchema}).strict(),
 z.object({kind:z.literal('REPRINT'),originalJobId:uuid,lineIds:ids,reason:z.string().trim().min(10).max(1000).refine(value=>/\p{L}/u.test(value))}).strict(),
]);
export const unitLabelOptionsSchema=z.object({page:z.coerce.number().int().min(1).max(1_000_000).default(1),receiptId:uuid.optional(),lotId:uuid.optional(),query:z.string().trim().max(120).default(''),mode:z.enum(['INITIAL','REPRINT']).default('INITIAL')}).strict();
export const unitLabelHandoffSchema=z.object({attemptId:uuid}).strict();
export const unitExactCodeSchema=z.string().trim().toUpperCase().regex(readable);
export type UnitIdentityLookup={payloadVersion:2;originId:string;unitId:string;unitCode:string;lotId:string;lotCode:string|null;productId:string;productCode:string|null;productName:string;variantId:string;variantName:string;skuId:string;fullSku:string;batchId:string;publicBatchCode:string;availability:'USABLE'|'UNAVAILABLE';dataAsOf:string;state?:string;condition?:string;supplierName?:string;sourceName?:string;receivedAt?:string};
export type UnitLabelContent={unitCode:string;productCode:string|null;lotCode:string|null;fullSku:string;publicBatchCode:string;productName:string;variantName:string;supplierName:string;sourceName:string};
export type UnitLabelLine={id:string;unitId:string;lotId:string;receiptLineId:string;ordinal:number;purpose:'USABLE'|'DAMAGED_INTAKE';payload:string;content:UnitLabelContent;originalLineId:string|null};
export type UnitLabelJob={id:string;originId:string;kind:'INITIAL'|'REPRINT';originalJobId:string|null;reason:string;profile:LabelProfile;rendererVersion:string;manifestHash:string;totalLabels:number;createdAt:string;lines:UnitLabelLine[];artifact:{id:string;htmlHash:string;pdfHash:string;createdAt:string;pages:number}|null;handoffCount:number;handoffs:{id:string;artifactId:string;attemptId:string;recordedAt:string}[]};
export type UnitLabelOption={unitId:string;unitCode:string;lotId:string;lotCode:string|null;receiptId:string;productName:string;variantName:string;fullSku:string;publicBatchCode:string;initialPurpose:'USABLE'|'DAMAGED_INTAKE';currentState:string;claimedLineId:string|null;claimedJobId:string|null};
export type UnitLabelOptions={originId:string;units:UnitLabelOption[];total:number;page:number;pageSize:number;profiles:readonly LabelProfile[]};
export type UnitLabelPreview={unitId:string;lotId:string;receiptLineId:string;purpose:'USABLE'|'DAMAGED_INTAKE';payload:string;content:UnitLabelContent;currentState:string;claimedLineId:string|null;claimedJobId:string|null};
export function planUnitLabelSheets(job:Pick<UnitLabelJob,'profile'|'lines'>,start:SheetStart=defaultSheetStart){
 return planLabelSheets({profile:job.profile,totalCopies:String(job.lines.length),lines:job.lines.map(line=>({id:line.id,receiptLineId:line.receiptLineId,lotId:line.lotId,purpose:line.purpose,copies:'1',payload:line.payload,content:{fullCode:line.content.fullSku,publicCode:line.content.publicBatchCode,productName:line.content.productName,variantName:line.content.variantName,supplierName:line.content.supplierName,sourceName:line.content.sourceName}}))},'0',start);
}
