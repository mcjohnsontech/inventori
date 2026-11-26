import { z } from 'zod';
// Decimal NGN strings enter/leave the API; integer kobo is used for all arithmetic.
export const moneySchema=z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/, 'Enter NGN with at most two decimal places');
export const costSchema=z.object({amount:moneySchema,currency:z.literal('NGN'),zeroReason:z.string().trim().max(2000).default('')}).strict().refine(v=>toKobo(v.amount)!==0n||v.zeroReason.length>=10,'Explain a genuine zero-cost acquisition in at least 10 characters');
export function toKobo(value:string):bigint {const negative=value.startsWith('-');const [whole,fraction='']=(negative?value.slice(1):value).split('.');const kobo=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));return negative?-kobo:kobo;}
export function fromKobo(value:bigint):string {const sign=value<0n?'-':'';const n=value<0n?-value:value;return `${sign}${n/100n}.${String(n%100n).padStart(2,'0')}`;}
// Variant's own price (an override of the product price). amount null removes the override,
// so the variant follows its product price again (owner decision 26 Nov 2026).
export const sellingPriceSchema=z.object({variantId:z.uuid(),amount:moneySchema.nullable(),currency:z.literal('NGN'),reason:z.string().trim().min(10).max(2000),previousPriceId:z.uuid().nullable(),confirmed:z.literal(true)}).strict().refine(v=>v.amount!==null||v.previousPriceId!==null,'There is no option price to remove');
// One selling price per product covers all its variants unless a variant has its own price.
export const productPriceSchema=z.object({productId:z.uuid(),amount:moneySchema,currency:z.literal('NGN'),reason:z.string().trim().min(10).max(2000),previousPriceId:z.uuid().nullable(),confirmed:z.literal(true)}).strict();
// Admin adds the purchase cost for a delivery line received without one (owner decision 26 Nov 2026).
export const purchaseCostEntrySchema=z.object({receiptLineId:z.uuid(),amount:moneySchema,currency:z.literal('NGN'),zeroReason:z.string().trim().max(2000).default('')}).strict().refine(v=>toKobo(v.amount)!==0n||v.zeroReason.length>=10,'Explain a genuine zero-cost acquisition in at least 10 characters');
export const missingCostsQuerySchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
export type MissingCostLine={receiptLineId:string;receiptId:string;batchCode:string;deliveredOn:string;acceptedAt:string;supplierName:string;productName:string;variantName:string;fullCode:string;receivedQuantity:string;lastCost:string|null};
export type MissingCostsPage={total:number;page:number;pageSize:number;rows:MissingCostLine[]};
export type PurchaseCostEntryResult={receiptLineId:string;amount:string;currency:'NGN';zeroReason:string;recordedAt:string};
export type ProductPrices={productId:string;productPrice:{id:string;amount:string;recordedAt:string}|null;variants:{variantId:string;name:string;latestRowId:string|null;ownPrice:string|null;effectivePrice:string|null}[]};
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>v>='0001-01-01'&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid date');
export const financialQuerySchema=z.object({from:date.optional(),to:date.optional(),productId:z.uuid().optional(),variantId:z.uuid().optional(),supplierId:z.uuid().optional(),lotId:z.uuid().optional()}).strict().refine(v=>!v.from||!v.to||v.from<=v.to,'From must be before through date');
export type PricePoint={id:string;scope:'PRODUCT'|'VARIANT';variantId:string|null;productId:string;productName:string;variantName:string|null;amount:string|null;currency:'NGN';reason:string;recordedAt:string;actorName:string};
export type FinancialLot={lotId:string;lotCode:string|null;receiptLineId:string;receiptId:string;skuId:string;fullCode:string;productId:string;productName:string;variantId:string;variantName:string;supplierId:string;supplierName:string;batchCode:string;acceptedAt:string;deliveredOn:string;usable:string;damaged:string;unitCost:string|null;zeroReason:string|null;costEnteredLater:boolean;sellingPrice:string|null;priceSource:'VARIANT'|'PRODUCT'|null};
export type Valuation={usableUnits:string;damagedUnits:string;knownCostUnits:string;unknownCostUnits:string;knownDamagedCostUnits:string;unknownDamagedCostUnits:string;pricedUsableUnits:string;profitCoveredUnits:string;usableCostValue:string|null;potentialSellingValue:string|null;potentialGrossProfit:string|null;potentialGrossMargin:string|null;damagedCostExposure:string|null};
export function valueInventory(lots:FinancialLot[]):Valuation {
 let u=0n,d=0n,known=0n,dk=0n,priced=0n,paired=0n,cost=0n,sell=0n,pairCost=0n,pairSell=0n,damage=0n;
 for(const row of lots){const a=BigInt(row.usable),b=BigInt(row.damaged);u+=a;d+=b;
  if(row.unitCost!==null){known+=a;dk+=b;cost+=a*toKobo(row.unitCost);damage+=b*toKobo(row.unitCost);}
  if(row.sellingPrice!==null){priced+=a;sell+=a*toKobo(row.sellingPrice);}
  if(row.unitCost!==null&&row.sellingPrice!==null){paired+=a;pairCost+=a*toKobo(row.unitCost);pairSell+=a*toKobo(row.sellingPrice);}
 }
 return {usableUnits:String(u),damagedUnits:String(d),knownCostUnits:String(known),unknownCostUnits:String(u-known),knownDamagedCostUnits:String(dk),unknownDamagedCostUnits:String(d-dk),pricedUsableUnits:String(priced),profitCoveredUnits:String(paired),usableCostValue:known?fromKobo(cost):u?null:'0.00',potentialSellingValue:priced?fromKobo(sell):u?null:'0.00',potentialGrossProfit:paired?fromKobo(pairSell-pairCost):u?null:'0.00',potentialGrossMargin:pairSell?fromKobo((pairSell-pairCost)*10000n/pairSell):null,damagedCostExposure:dk?fromKobo(damage):d?null:'0.00'};
}
export type FinancialReport={asOf:string;cutoff:string;currency:'NGN';lots:FinancialLot[];summary:Valuation;priceHistory:PricePoint[];purchaseHistory:(FinancialLot&{receivedQuantity:string})[]};
