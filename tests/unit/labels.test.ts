import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import jsQrModule from 'jsqr';
const jsQR=jsQrModule as unknown as (rgba:Uint8ClampedArray,width:number,height:number)=>{data:string}|null;
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { chunkRange,decodeQr,encodeQr,labelProfiles,printJobSchema } from '@dayari/contracts';
import { copiesForChunk,qrGeometry } from '../../apps/api/src/label-pdf.js';
describe('versioned lot QR and label arithmetic',()=>{
 const origin=randomUUID(),lot=randomUUID(),payload=encodeQr(origin,lot);
 it('encodes 71 canonical ASCII bytes, stable across dates and independent origins/lots',()=>{
  expect(payload).toHaveLength(71);expect(payload).toMatch(/^DYI:1:[0-9A-F]{32}:[0-9A-F]{32}$/);expect(decodeQr(payload)).toEqual({originId:origin,lotId:lot});expect(encodeQr(origin.toUpperCase(),lot)).toBe(payload);expect(encodeQr(randomUUID(),lot)).not.toBe(payload);expect(encodeQr(origin,randomUUID())).not.toBe(payload);
 });
 it('rejects malformed UUIDs, controls, aliases, lengths and unsupported versions',()=>{
  for(const text of [payload+'\n',payload.toLowerCase(),payload+'extra',' '+payload,payload.replace('DYI','ＤＹＩ'),payload.replace(/[A-F0-9]$/,'X'),'https://example.com/'+payload,'x'.repeat(129)])expect(()=>decodeQr(text)).toThrow('INVALID_QR');
  expect(()=>decodeQr(payload.replace('DYI:1:','DYI:2:'))).toThrow('UNSUPPORTED_QR_VERSION');
 });
 it('roundtrips a genuine PNG with an independent decoder and four-module quiet zone',async()=>{
  const bytes=await QRCode.toBuffer([{data:payload,mode:'alphanumeric'}],{errorCorrectionLevel:'M',margin:4,scale:6});const image=await loadImage(bytes);const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height);expect(jsQR(rgba.data,image.width,image.height)?.data).toBe(payload);
  const geometry=qrGeometry(payload,4,203);expect(geometry.modules).toBe(33);expect(geometry.quietModules).toBe(4);expect(geometry.moduleMm).toBeGreaterThan(0.4);expect(geometry.areaMm).toBeLessThan(24);
 });
 it('preserves BIGINT counts and stable 500-copy chunks without allocating every unit',()=>{
  expect(chunkRange('9007199254740993','0')).toMatchObject({offset:'0',copies:500,chunks:'18014398509482'});expect(chunkRange('1001','2')).toMatchObject({offset:'1000',copies:1});expect(()=>chunkRange('500','1')).toThrow();
  const line={id:'one',receiptLineId:'x',lotId:lot,purpose:'USABLE' as const,copies:'501',payload,content:{fullCode:'SKU',publicCode:'B',productName:'P',variantName:'V',supplierName:'S',sourceName:'L'}};expect(copiesForChunk({totalCopies:'503',lines:[line,{...line,id:'two',purpose:'DAMAGED_INTAKE',copies:'2'}]},'1').map(x=>x.purpose)).toEqual(['USABLE','DAMAGED_INTAKE','DAMAGED_INTAKE']);
 });
 it('uses explicit A4 trial geometry and bounded meaningful reprints',()=>{
  const p=labelProfiles[0]!;expect(p.columns*p.labelWidthMm+2*p.marginXmm).toBe(210);expect(p.rows*p.labelHeightMm+2*p.marginYmm).toBe(297);expect(p.columns*p.rows).toBe(21);expect(Math.ceil(65/21)).toBe(4);
  expect(printJobSchema.safeParse({kind:'REPRINT',originalJobId:randomUUID(),reason:'Printer jam spoiled labels',lines:[{lotId:lot,purpose:'USABLE',copies:'2'}]}).success).toBe(true);
  for(const copies of ['0','-1','1.5','10001'])expect(printJobSchema.safeParse({kind:'REPRINT',originalJobId:randomUUID(),reason:'Printer jam spoiled labels',lines:[{lotId:lot,purpose:'USABLE',copies}]}).success).toBe(false);
 });
});
