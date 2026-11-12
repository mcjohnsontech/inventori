import { z } from 'zod';
import type { CheckoutReason } from './checkouts.js';
export const ordersQuerySchema=z.object({page:z.coerce.number().int().min(1).max(1000000).default(1),search:z.string().trim().max(120).default(''),orderReference:z.string().trim().min(1).max(120).optional(),checkoutId:z.uuid().optional(),withoutOrder:z.enum(['true']).optional()}).strict();
export type OrderSummary={orderReference:string;totalUnits:number;sessions:number;inProduction:number;completed:number;unresolvedReasons:number;reportedDamage?:number;latestCheckout:string};
export type OrderUnit={checkoutId:string;checkoutLineId:string;acceptedAt:string;employeeName:string;unitId:string;unitCode:string;productName:string;variantName:string;fullSku:string;lotCode:string|null;publicBatchCode:string;state:string;originalReason:CheckoutReason['code']|null;resolvedReason:CheckoutReason['code']|null;exceptionId:string|null;completionId:string|null;damageReported?:boolean};
export type OrdersPage={page:number;pageSize:number;total:number;rows:OrderSummary[];asOf:string;scope:'OWN'|'SHOP'};
export type OrderDetail={page:number;pageSize:number;total:number;summary:OrderSummary|null;rows:OrderUnit[];asOf:string;scope:'OWN'|'SHOP'};
