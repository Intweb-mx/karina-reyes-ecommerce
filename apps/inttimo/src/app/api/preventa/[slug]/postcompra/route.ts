import type { NextRequest } from "next/server";
import { savePostPurchaseAnswersService } from "@/server/presale/postPurchase";
import { clientIp, getDb, handle, toResponse } from "@/server/presale/runtime";

export async function POST(request: NextRequest) {
  return handle("presale_post_purchase", async () => {
    const body = await request.json().catch(() => null);
    return toResponse(await savePostPurchaseAnswersService({ db: getDb() }, { body, clientIp: clientIp(request) }));
  });
}
