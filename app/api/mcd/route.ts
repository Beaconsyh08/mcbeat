import { z } from "zod";
import {
  McpClient,
  McpError,
  normalizeMenu,
  buildItem,
  normalizeQuote,
} from "@/lib/mcp";
import { tokenFrom, readBody, json, failure } from "@/lib/session";
const text = z.string().trim().min(1).max(80);
const selection = z
  .object({
    round: text,
    code: text,
    quantity: z.number().int().min(1).max(20),
  })
  .strict();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stores"), city: text, keyword: text }).strict(),
  z.object({ action: z.literal("menu"), storeCode: text }).strict(),
  z
    .object({ action: z.literal("detail"), storeCode: text, code: text })
    .strict(),
  z
    .object({
      action: z.literal("quote"),
      storeCode: text,
      items: z
        .array(
          z
            .object({
              code: text,
              selections: z.array(selection).max(30).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(4),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    const raw = await readBody(request);
    const token = await tokenFrom(request);
    if (!token)
      throw new McpError("请先连接麦当劳，或重新连接已过期的会话。", 401);
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      throw new McpError("请求内容不完整，请重新选择。", 400);
    const body = parsed.data,
      client = new McpClient(token);
    await client.connect();
    if (body.action === "stores") {
      const data = await client.call("query-nearby-stores", {
        city: body.city,
        keyword: body.keyword,
        searchType: 2,
        beType: 1,
      });
      if (!Array.isArray(data)) throw new McpError("门店响应格式已变化。");
      return json({
        stores: data
          .slice(0, 30)
          .map((s: any) => ({
            code: String(s.storeCode),
            name: String(s.storeName),
            address: String(s.address ?? ""),
            open: s.businessStatus === true,
          })),
      });
    }
    const base = { storeCode: body.storeCode, orderType: 1, beType: 1 };
    if (body.action === "menu")
      return json({
        menu: normalizeMenu(await client.call("query-meals", base)),
        fetchedAt: new Date().toISOString(),
      });
    if (body.action === "detail") {
      const d = await client.call("query-meal-detail", {
        ...base,
        code: body.code,
      });
      if (String(d?.code) !== body.code)
        throw new McpError("餐品详情回显不一致。");
      return json({
        detail: {
          code: String(d.code),
          name: String(d.name),
          rounds: (d.rounds ?? []).map((r: any) => ({
            id: String(r.id),
            name: String(r.name),
            min: r.minQuantity ?? r.quantity ?? 1,
            max: r.maxQuantity ?? r.quantity ?? 1,
            choices: (r.choices ?? []).map((c: any) => ({
              code: String(c.code),
              name: String(c.name),
              quantity: c.isDefault === 1 ? c.quantity : 0,
              max: c.maxQuantity ?? -1,
              diffPrice: String(c.diffPrice ?? ""),
            })),
          })),
        },
      });
    }
    const items = [];
    for (const requested of body.items) {
      const detail = await client.call("query-meal-detail", {
        ...base,
        code: requested.code,
      });
      if (String(detail?.code) !== requested.code)
        throw new McpError("餐品详情回显不一致。");
      items.push(buildItem(detail, requested.selections));
    }
    const quote = await client.call("calculate-price", {
      ...base,
      items,
      needTableware: false,
    });
    return json({
      quote: normalizeQuote(
        quote,
        items,
        client.tools.find((t) => t.name === "calculate-price")?.outputSchema,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
