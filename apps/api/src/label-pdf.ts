import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chunkRange, type LabelJob, type LabelLine } from '@dayari/contracts';
const fontPath = fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url));
const boldPath = fileURLToPath(new URL('../assets/fonts/NotoSans-Bold.ttf', import.meta.url));
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export function rendererVersion() { return `pdfkit-0.20.2-qrcode-1.5.4-v1-${hash(readFileSync(fontPath)).slice(0,16)}-${hash(readFileSync(boldPath)).slice(0,16)}`; }
export const mm = (value: number) => value*72/25.4;
export function qrGeometry(payload: string, dots: number, dpi: number) {
 const symbol = QRCode.create([{data:payload,mode:'alphanumeric'}],{errorCorrectionLevel:'M'});
 const moduleMm=dots*25.4/dpi;
 return { symbol, modules:symbol.modules.size, quietModules:4, moduleMm, areaMm:(symbol.modules.size+8)*moduleMm };
}
export function copiesForChunk(job: Pick<LabelJob,'totalCopies'|'lines'>, index: string): LabelLine[] {
 const range=chunkRange(job.totalCopies,index); let start=BigInt(range.offset); let remaining=range.copies; const result: LabelLine[]=[];
 for(const line of job.lines) {const count=BigInt(line.copies);if(start>=count){start-=count;continue;}const available=count-start;const take=Number(available>BigInt(remaining)?BigInt(remaining):available);for(let i=0;i<take;i++)result.push(line);remaining-=take;start=0n;if(!remaining)break;}
 if(remaining)throw new Error('Manifest count mismatch');return result;
}
function supported(doc: PDFKit.PDFDocument, value: string) {
 // Isolated coverage check against PDFKit's pinned embedded fontkit font. Missing glyphs must never become silent tofu.
 const font=(doc as unknown as {_font:{font:{hasGlyphForCodePoint(code:number):boolean}}})._font.font;
 if([...value].some(character=>!['\n','\r'].includes(character)&&!font.hasGlyphForCodePoint(character.codePointAt(0)!))) throw new Error('The embedded font does not cover this text. A reviewed font/profile is required.');
}
export async function renderLabelPdf(job: LabelJob, chunk: string): Promise<Buffer> {
 if(job.rendererVersion!==rendererVersion())throw new Error('Historical renderer version is unavailable; restore its pinned renderer/fonts before reconstruction');
 const p=job.profile; if(p.pageWidthMm!==210||p.pageHeightMm!==297||p.marginXmm*2+p.columns*p.labelWidthMm>210.001||p.marginYmm*2+p.rows*p.labelHeightMm>297.001)throw new Error('Invalid A4 profile geometry');
 const labels=copiesForChunk(job,chunk); const capacity=p.columns*p.rows;
 const doc=new PDFDocument({autoFirstPage:false,compress:true,info:{Title:`Dayari labels ${job.id} chunk ${chunk}`,Creator:job.rendererVersion,CreationDate:new Date(job.createdAt),ModDate:new Date(job.createdAt)}});
 doc.registerFont('Regular',fontPath);doc.registerFont('Bold',boldPath);
 const buffers:Buffer[]=[];const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',data=>buffers.push(Buffer.from(data)));doc.on('end',()=>resolve(Buffer.concat(buffers)));doc.on('error',reject);});
 const symbols=new Map<string,ReturnType<typeof qrGeometry>>();
 try {
 for(const [index,line] of labels.entries()) {
  const slot=index%capacity;if(!slot)doc.addPage({size:[mm(210),mm(297)],margin:0});
  const x=mm(p.marginXmm+(slot%p.columns)*p.labelWidthMm);const y=mm(p.marginYmm+Math.floor(slot/p.columns)*p.labelHeightMm);
  const qr=symbols.get(line.payload)??qrGeometry(line.payload,p.qrDotsPerModule,p.designDpi);symbols.set(line.payload,qr);
  if(qr.moduleMm<0.4||qr.areaMm>p.labelHeightMm-10)throw new Error('QR does not fit reliably; choose the larger trial profile');
  const qx=x+mm(4),qy=y+mm(2),unit=mm(qr.moduleMm);
  doc.fillColor('white').rect(x,y,mm(p.labelWidthMm),mm(p.labelHeightMm)).fill();
  doc.fillColor('black');for(let row=0;row<qr.modules;row++)for(let col=0;col<qr.modules;col++)if(qr.symbol.modules.get(row,col))doc.rect(qx+(col+4)*unit,qy+(row+4)*unit,unit,unit).fill();
  const tx=qx+mm(qr.areaMm+2),width=x+mm(p.labelWidthMm-4)-tx;
  doc.font('Regular').fontSize(6).text('SKU',tx,y+mm(2),{width,lineBreak:false});
  doc.font('Bold').fontSize(p.fontSize);supported(doc,line.content.fullCode);
  const skuHeight=doc.heightOfString(line.content.fullCode,{width,lineGap:0});
  if(skuHeight>mm(p.labelHeightMm>=45?16:11))throw new Error('Full SKU does not fit this label profile. Choose the larger profile; codes will not be truncated.');
  doc.text(line.content.fullCode,tx,y+mm(4.6),{width,lineGap:0});
  const batchTop=Math.max(17,4.6+skuHeight*25.4/72+1);
  doc.font('Regular').fontSize(6).text('BATCH',tx,y+mm(batchTop),{width,lineBreak:false});
  doc.font('Bold').fontSize(p.fontSize-0.5);supported(doc,line.content.publicCode);
  if(doc.heightOfString(line.content.publicCode,{width})>mm(6))throw new Error('Full batch code does not fit this profile');
  doc.text(line.content.publicCode,tx,y+mm(batchTop+2.5),{width});
  doc.font('Regular').fontSize(7);const descriptor=`${line.content.productName} • ${line.content.variantName} • ${line.content.supplierName} / ${line.content.sourceName}`;supported(doc,descriptor);
  const descWidth=mm(p.labelWidthMm-8);const descHeight=mm(line.purpose==='DAMAGED_INTAKE'?4:7);let text=descriptor;
  while(text&&doc.heightOfString(text,{width:descWidth})>descHeight)text=[...text].slice(0,-2).join('')+'…';
  doc.text(text,x+mm(4),y+mm(Math.max(25,qr.areaMm+4)),{width:descWidth,height:descHeight});
  if(line.purpose==='DAMAGED_INTAKE') {doc.font('Bold').fontSize(6.3).fillColor('black').text('DAMAGED INTAKE — NOT FOR PRODUCTION',x+mm(4),y+mm(p.labelHeightMm-5.5),{width:descWidth,align:'center',height:mm(5)});}
 }
 doc.end();return await done;
 } catch(error) {doc.on('error',()=>{});doc.destroy();throw error;}
}
