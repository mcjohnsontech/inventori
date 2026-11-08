import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defaultSheetStart,planUnitLabelSheets,type SheetStart,type UnitLabelJob,type UnitLabelLine } from '@dayari/contracts';
import { mm,qrGeometry } from './label-pdf-v1.js';
const regular=readFileSync(new URL('../assets/fonts/NotoSans-Regular.ttf',import.meta.url));
const bold=readFileSync(new URL('../assets/fonts/NotoSans-Bold.ttf',import.meta.url));
const hash=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
export const unitRendererVersion=`unit-label-v1-qrcode-1.5.4-pdfkit-0.20.2-${hash(regular).slice(0,16)}-${hash(bold).slice(0,16)}`;
const metrics=new PDFDocument({margin:0});metrics.on('data',()=>{});metrics.registerFont('Regular',regular);metrics.registerFont('Bold',bold);
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function measure(value:string,font:string,size:number){
 metrics.font(font).fontSize(size);
 const coverage=(metrics as unknown as {_font:{font:{hasGlyphForCodePoint(n:number):boolean}}})._font.font;
 if([...value].some(c=>!coverage.hasGlyphForCodePoint(c.codePointAt(0)!)))throw Error('The embedded font does not cover this label text; a reviewed font/profile is required');
 return metrics.widthOfString(value);
}
function wrap(value:string,size:number,width:number,maxLines:number){
 const lines:string[]=[];let line='';
 for(const c of value){if(measure(line+c,'Regular',size)>width){if(!line)throw Error('Label text does not fit');lines.push(line);line=c;}else line+=c;}
 if(line)lines.push(line);if(lines.length>maxLines)throw Error('The complete SKU does not fit this profile. Choose the larger profile; identities will not be truncated.');return lines;
}
function shorten(value:string,size:number,width:number){
 if(measure(value,'Regular',size)<=width)return value;
 const chars=[...value];let low=0,high=chars.length;
 while(low<high){const mid=Math.ceil((low+high)/2);if(measure(chars.slice(0,mid).join('')+'…','Regular',size)<=width)low=mid;else high=mid-1;}
 return chars.slice(0,low).join('')+'…';
}
type PrintInput=Pick<UnitLabelJob,'id'|'profile'|'rendererVersion'|'createdAt'|'lines'|'manifestHash'>;
export const unitSheetPlan=planUnitLabelSheets;
function layout(line:UnitLabelLine,job:Pick<UnitLabelJob,'profile'>){
 const p=job.profile,large=p.labelHeightMm>=40,padding=3,qr=qrGeometry(line.payload,p.qrDotsPerModule,p.designDpi),tx=padding+qr.areaMm+2,width=mm(p.labelWidthMm-padding-tx);
 if(qr.moduleMm<0.4||qr.areaMm>p.labelHeightMm-11||width<mm(25))throw Error('QR quiet zone or identity text does not fit this profile');
 const codeSize=large?20:16,skuSize=large?10:8.5,smallSize=large?8:7.5,descSize=large?8:7;
 const lot='LOT '+(line.content.lotCode??'Unassigned')+(line.content.productCode?' · '+line.content.productCode:'');
 if(measure(line.content.unitCode,'Bold',codeSize)>width||measure(lot,'Regular',smallSize)>width||measure(line.content.publicBatchCode,'Regular',smallSize)>width)throw Error('Complete Unit/Lot/Batch identity does not fit the profile');
 const sku=wrap(line.content.fullSku,skuSize,width,2);
 const descriptor=shorten(`${line.content.productName} · ${line.content.variantName} · ${line.content.supplierName} / ${line.content.sourceName}`,descSize,mm(p.labelWidthMm-2*padding));
 return {qr,padding,tx,width,codeSize,skuSize,smallSize,descSize,sku,lot,descriptor,codeY:1.2,skuY:large?12:9.8,lotY:large?23:19,batchY:large?27:23,descY:large?35:27,warningY:p.labelHeightMm-4,warningHeight:3.2};
}
export function preflightUnitLabels(job:Pick<UnitLabelJob,'profile'|'lines'>){
 const plan=unitSheetPlan(job);for(const line of job.lines)layout(line,job);return plan;
}
function svg(qr:ReturnType<typeof qrGeometry>){
 let path='';for(let y=0;y<qr.modules;y++)for(let x=0;x<qr.modules;x++)if(qr.symbol.modules.get(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.modules+8} ${qr.modules+8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
// Runs only in an authenticated print document. A parent click may place a
// one-use intent in the popup's same-origin sessionStorage; refresh never prints.
const nativeScript=String.raw`
(()=>{const b=document.body,button=document.getElementById('device-print'),status=document.getElementById('print-status');let busy=false;const intentKey='dayari:unitPrintIntent:'+b.dataset.artifactId;let intent=null;try{intent=JSON.parse(sessionStorage.getItem(intentKey)||'null');sessionStorage.removeItem(intentKey);}catch{};
async function print(){if(busy)return;busy=true;button.disabled=true;try{await document.fonts.ready;const meResponse=await fetch('/api/me',{cache:'no-store'});if(!meResponse.ok)throw Error('Sign in again before printing.');const me=await meResponse.json();const key='dayari:unitPrintAttempt:'+me.id+':'+b.dataset.artifactId;let attempt=null;try{attempt=JSON.parse(sessionStorage.getItem(key)||'null');}catch{};
const response=await fetch('/api/unit-label-jobs/'+b.dataset.jobId,{cache:'no-store'});if(!response.ok)throw Error('The label job is unavailable.');const job=await response.json();if(!job.artifact||job.artifact.id!==b.dataset.artifactId||job.manifestHash!==b.dataset.manifestHash)throw Error('Prepared label identity mismatch.');
if(!attempt||attempt.completed){if(job.handoffs.length&&!confirm('This set has already been sent to a print dialog. Another copy may create duplicate stickers. Check existing output before continuing.'))return;attempt={attemptId:crypto.randomUUID(),key:crypto.randomUUID(),completed:false};sessionStorage.setItem(key,JSON.stringify(attempt));}
const handoff=await fetch('/api/unit-label-jobs/'+job.id+'/handoffs',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:JSON.stringify({attemptId:attempt.attemptId})});if(!handoff.ok){const error=await handoff.json().catch(()=>({}));throw Error(typeof error.message==='string'?error.message:'Print request could not be recorded. Retry this same window.');}attempt.completed=true;sessionStorage.setItem(key,JSON.stringify(attempt));status.textContent='Device dialog requested. Check output; select saved Unit Codes for replacement labels.';window.print();
}catch(error){status.textContent=error.message||'Printing could not be started. Retry explicitly.';}finally{busy=false;button.disabled=false;}}
button.addEventListener('click',print);document.fonts.ready.then(async()=>{button.disabled=false;if(intent&&intent.artifactId===b.dataset.artifactId&&Date.now()-intent.at<60000){try{const me=await fetch('/api/me',{cache:'no-store'}).then(r=>r.json());if(me.id===intent.actorId)print();else status.textContent='Use the current signed-in account to request printing explicitly.';}catch{status.textContent='Check the shop connection, then request printing explicitly.';}}});})();`;
export function unitArtifactCsp(html:string){const hashes=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>`'sha256-${createHash('sha256').update(match[1]!).digest('base64')}'`);return `default-src 'none'; script-src ${hashes.join(' ')||"'none'"}; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'`;}
export async function renderUnitLabels(job:PrintInput,artifactId:string,start:SheetStart){
 if(job.rendererVersion!==unitRendererVersion)throw Error('Restore the retained unit-label renderer before reconstruction');
 const plan=unitSheetPlan(job,start);for(const line of job.lines)layout(line,job);
 const doc=new PDFDocument({autoFirstPage:false,compress:true,info:{Title:'Dayari unit labels '+job.id,Creator:unitRendererVersion,CreationDate:new Date(job.createdAt),ModDate:new Date(job.createdAt)}});
 doc.registerFont('Regular',regular);doc.registerFont('Bold',bold);const buffers:Buffer[]=[];
 const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',data=>buffers.push(Buffer.from(data)));doc.on('end',()=>resolve(Buffer.concat(buffers)));doc.on('error',reject);});
 const pages:string[][]=Array.from({length:plan.pages},()=>[]);
 try{
  for(let page=0;page<plan.pages;page++){
   doc.addPage({size:[mm(job.profile.pageWidthMm),mm(job.profile.pageHeightMm)],margin:0});
   for(const cell of plan.labels.filter(cell=>cell.sheet===page)){
    const line=job.lines.find(line=>line.id===cell.line.id)!,l=layout(line,job),x=mm(cell.x),y=mm(cell.y);
    doc.fillColor('white').rect(x,y,mm(cell.width),mm(cell.height)).fill();doc.fillColor('black');
    const unit=mm(l.qr.moduleMm);for(let row=0;row<l.qr.modules;row++)for(let col=0;col<l.qr.modules;col++)if(l.qr.symbol.modules.get(row,col))doc.rect(x+mm(l.padding)+(col+4)*unit,y+mm(2)+(row+4)*unit,unit,unit).fill();
    const elements=[`<div class="qr" style="left:${l.padding}mm;top:2mm;width:${l.qr.areaMm}mm;height:${l.qr.areaMm}mm">${svg(l.qr)}</div>`];
    const text=(value:string,left:number,top:number,size:number,boldFont=false,width=l.width)=>{
     doc.font(boldFont?'Bold':'Regular').fontSize(size).fillColor('black').text(value,x+mm(left),y+mm(top),{width,lineBreak:false});
     elements.push(`<div style="position:absolute;left:${left}mm;top:${top}mm;width:${width}pt;font-size:${size}pt;font-weight:${boldFont?700:400};white-space:pre">${escape(value)}</div>`);
    };
    text(line.content.unitCode,l.tx,l.codeY,l.codeSize,true);
    l.sku.forEach((part,index)=>text(part,l.tx,l.skuY+index*l.skuSize*1.45*25.4/72,l.skuSize));
    text(l.lot,l.tx,l.lotY,l.smallSize);text(line.content.publicBatchCode,l.tx,l.batchY,l.smallSize);
    text(l.descriptor,l.padding,l.descY,l.descSize,false,mm(cell.width-2*l.padding));
    if(line.purpose==='DAMAGED_INTAKE'){
     const warning='DAMAGED INTAKE - NOT FOR PRODUCTION';doc.fillColor('black').rect(x+mm(l.padding),y+mm(l.warningY),mm(cell.width-2*l.padding),mm(l.warningHeight)).fill();
     doc.fillColor('white').font('Bold').fontSize(6.3).text(warning,x+mm(l.padding),y+mm(l.warningY+0.25),{width:mm(cell.width-2*l.padding),align:'center',lineBreak:false});
     elements.push(`<div style="position:absolute;left:${l.padding}mm;top:${l.warningY}mm;width:${cell.width-2*l.padding}mm;height:${l.warningHeight}mm;background:black;color:white;text-align:center;font-size:6.3pt;font-weight:700;line-height:${l.warningHeight}mm">${warning}</div>`);
    }
    pages[page]!.push(`<section class="label" aria-label="Individual unit label" data-unit-code="${line.content.unitCode}" style="left:${cell.x}mm;top:${cell.y}mm;width:${cell.width}mm;height:${cell.height}mm">${elements.join('')}</section>`);
   }
  }
  doc.end();const pdf=await done;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dayari individual unit labels</title><style>
@font-face{font-family:DayariUnit;src:url(data:font/ttf;base64,${regular.toString('base64')}) format('truetype');font-weight:400}@font-face{font-family:DayariUnit;src:url(data:font/ttf;base64,${bold.toString('base64')}) format('truetype');font-weight:700}
*{box-sizing:border-box}body{margin:0;background:#edf0e9;color:#101910;font-family:DayariUnit,sans-serif}.controls{padding:16px;background:white;position:sticky;top:0;z-index:5;border-bottom:1px solid #ccd5cc}button{padding:12px 18px;background:#00543e;color:white;border:0;border-radius:8px;font:inherit;cursor:pointer}button:disabled{opacity:.6}p{font-size:13px}.page{position:relative;background:white;width:${job.profile.pageWidthMm}mm;height:${job.profile.pageHeightMm}mm;margin:12px auto;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.label{position:absolute;color:black;background:white;break-inside:avoid;line-height:1.4}.print-pages{overflow:auto;max-width:100vw}.qr{position:absolute}.qr svg{display:block;width:100%;height:100%}@page{size:${job.profile.pageWidthMm}mm ${job.profile.pageHeightMm}mm;margin:0}@media print{body{background:white}.controls{display:none}.print-pages{overflow:visible;max-width:none}.page{margin:0}}
</style></head><body data-job-id="${job.id}" data-artifact-id="${artifactId}" data-manifest-hash="${job.manifestHash}"><header class="controls"><button id="device-print" disabled>Open device print dialog</button><p id="print-status" role="status">Use actual size / 100%, with browser headers and footers disabled. Physical output is not confirmed automatically.</p></header><div class="print-pages">${pages.map((labels,index)=>`<main class="page" aria-label="Sheet ${index+1}">${labels.join('')}</main>`).join('')}</div><script>${nativeScript}</script></body></html>`;
  return {html,pdf,htmlHash:hash(html),pdfHash:hash(pdf),pages:plan.pages};
 }catch(error){doc.on('error',()=>{});doc.destroy();throw error;}
}
