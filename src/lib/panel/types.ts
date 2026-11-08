import type { Badge, RuleResult } from "@/lib/rules/evaluate";
import type { Store } from "@/lib/products/stores";

export interface CategoryOption {
  id: string;
  slug: string;
  name: string;
}

export interface QueueOffer {
  id: string;
  createdAt: string;
  productName: string;
  store: Store;
  sourceUrl: string | null;
  categoryId: string | null;
  priceCents: number | null;
  claimedBeforeCents: number | null;
  coupon: string | null;
  conditions: string | null;
  postTitle: string;
  postCondition: string | null;
  affiliateUrl: string | null;
  flags: string[];
  ruleResults: RuleResult[];
  badge: Badge;
  discountVsAvgPct: number | null;
  min90d: number | null;
  avg90d: number | null;
  pricePoints: number;
  possibleDuplicate: { id: string; name: string } | null;
  sendToGeneral: boolean;
}

export interface FailedInput {
  id: string;
  rawText: string;
  error: string | null;
  createdAt: string;
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
