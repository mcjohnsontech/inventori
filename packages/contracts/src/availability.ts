import {z} from 'zod';
export const availabilityQuery=z.object({q:z.string().trim().max(160).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),productId:z.uuid().optional(),lotId:z.uuid().optional()}).strict();
export type AvailableLot={lotId:string;lotCode:string|null;productId:string;productCode:string|null;productName:string;variantId:string;variantName:string;skuId:string;fullSku:string;batchId:string;publicBatchCode:string;usable:string};
export type AvailabilityPage={lots:AvailableLot[];total:number;page:number;pageSize:number;originId:string;dataAsOf:string};
