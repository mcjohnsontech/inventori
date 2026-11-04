import type {Catalogue,OperationalStock} from '@dayari/contracts';
export type StockVariantRow={productId:string;productName:string;productCode?:string|null;variantId:string;variantName:string;usable:string;damaged:string;lots:OperationalStock['lots'];status:'available'|'empty'|'unreceived'};
/** Presentation-only aggregation of one authoritative stock snapshot, within exact variant IDs. */
export function stockOverview(catalogue:Catalogue,stock:OperationalStock):StockVariantRow[]{
 const byVariant=new Map<string,OperationalStock['lots']>();
 const variants=new Map(catalogue.skus.map(sku=>[sku.id,sku.variantId]));
 for(const lot of stock.lots){const variant=variants.get(lot.skuId);if(!variant)continue;const list=byVariant.get(variant)??[];list.push(lot);byVariant.set(variant,list);}
 return catalogue.products.flatMap(product=>product.variants.filter(variant=>!product.attributes.length||Boolean(variant.combinationKey)).map(variant=>{
  const lots=byVariant.get(variant.id)??[];let usable=0n,damaged=0n;
  for(const lot of lots){usable+=BigInt(lot.usable);damaged+=BigInt(lot.damaged);}
  return {productId:product.id,productName:product.name,productCode:product.productCode,variantId:variant.id,variantName:variant.name,usable:usable.toString(),damaged:damaged.toString(),lots,status:usable>0n?'available' as const:lots.length?'empty' as const:'unreceived' as const};
 }));
}
