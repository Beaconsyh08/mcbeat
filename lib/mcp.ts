// This transport can contact only the official endpoint, using four read-only tools.
export const MCP_URL = "https://mcp.mcd.cn";
export const ALLOWED = [
  "query-nearby-stores",
  "query-meals",
  "query-meal-detail",
  "calculate-price",
] as const;
export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  description?: string;
};
export type Tool = {
  name: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
};
export class McpError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function validateArgs(
  schema: JsonSchema,
  value: unknown,
  path = "参数",
): void {
  if (schema.enum && !schema.enum.includes(value))
    throw new McpError(`${path}不符合接口要求。`, 400);
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new McpError(`${path}格式错误。`, 400);
    const obj = value as Record<string, unknown>;
    for (const k of schema.required || [])
      if (obj[k] === undefined)
        throw new McpError(`当前接口需要额外参数 ${k}，请更新适配器。`, 422);
    for (const [k, v] of Object.entries(obj))
      if (schema.properties?.[k])
        validateArgs(schema.properties[k], v, `${path}.${k}`);
  }
  if (schema.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? 1000)
    )
      throw new McpError(`${path}数量不符合要求。`, 400);
    if (schema.items)
      for (const v of value) validateArgs(schema.items, v, path);
  }
  if (
    (schema.type === "string" && typeof value !== "string") ||
    (schema.type === "boolean" && typeof value !== "boolean")
  )
    throw new McpError(`${path}类型不匹配。`, 400);
  if (schema.type === "number" || schema.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isInteger(value)) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity)
    )
      throw new McpError(`${path}数值不符合要求。`, 400);
  }
}
export function unwrapResult(result: any) {
  if (result?.isError)
    throw new McpError("麦当劳接口未能完成查询，请检查门店与餐品后重试。");
  let body = result?.structuredContent;
  if (!body) {
    for (const c of result?.content ?? []) {
      if (c.type === "text") {
        try {
          const parsed = JSON.parse(c.text);
          if (typeof parsed.success === "boolean") body = parsed;
        } catch {}
      }
    }
  }
  if (body?.success !== true)
    throw new McpError(
      "麦当劳未返回成功结果；请检查 Token、门店营业状态或餐品供应。",
    );
  return body.data;
}
export class McpClient {
  private session?: string;
  private protocol = "2025-03-26";
  private id = 0;
  tools: Tool[] = [];
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async rpc(
    method: string,
    params: unknown = {},
    notification = false,
  ): Promise<any> {
    const id = ++this.id;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await this.fetcher(MCP_URL, {
        method: "POST",
        redirect: "manual",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": this.protocol,
          ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...(notification ? {} : { id }),
          method,
          params,
        }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new McpError(
          response.status === 401 || response.status === 403
            ? "麦当劳拒绝了连接，请确认 Token 有效。"
            : `麦当劳服务暂时无法访问（HTTP ${response.status}）。`,
          response.status === 401 || response.status === 403 ? 401 : 502,
        );
      const sid = response.headers.get("Mcp-Session-Id");
      if (sid) this.session = sid;
      if (notification) {
        await response.body?.cancel();
        return;
      }
      let message: any;
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) throw new McpError("麦当劳响应为空。");
        const decoder = new TextDecoder();
        let buffer = "",
          size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > 4_000_000) throw new McpError("麦当劳响应过大。");
            buffer += decoder.decode(chunk.value, { stream: true });
            buffer = buffer.replaceAll("\r\n", "\n");
            let end;
            while ((end = buffer.indexOf("\n\n")) >= 0) {
              const event = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = event
                .split("\n")
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).trimStart())
                .join("\n");
              if (data) {
                const parsed = JSON.parse(data);
                if (parsed.id === id) {
                  message = parsed;
                  break;
                }
              }
            }
            if (message) break;
          }
        } finally {
          await reader.cancel();
        }
      } else {
        const text = await response.text();
        if (text.length > 4_000_000) throw new McpError("麦当劳响应过大。");
        message = JSON.parse(text);
      }
      if (message?.error)
        throw new McpError("麦当劳 MCP 返回协议错误，请重新连接。");
      if (message?.id !== id || !message?.result)
        throw new McpError("麦当劳响应格式不受支持。");
      return message.result;
    } catch (e) {
      if (e instanceof McpError) throw e;
      throw new McpError("麦当劳连接超时或响应不可读，请稍后重试。");
    } finally {
      clearTimeout(timeout);
    }
  }
  async connect() {
    const init = await this.rpc("initialize", {
      protocolVersion: this.protocol,
      capabilities: {},
      clientInfo: { name: "mcbeat", version: "0.1.0" },
    });
    if (init.protocolVersion) this.protocol = init.protocolVersion;
    await this.rpc("notifications/initialized", {}, true);
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const list = await this.rpc("tools/list", cursor ? { cursor } : {});
      if (!Array.isArray(list.tools))
        throw new McpError("无法读取麦当劳工具列表。");
      this.tools.push(...list.tools);
      cursor = list.nextCursor;
      if (!cursor) break;
    }
    return this.tools;
  }
  async call(name: string, args: Record<string, unknown>) {
    if (!(ALLOWED as readonly string[]).includes(name))
      throw new McpError("此操作不在 McBeat 的查询范围内。", 403);
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) throw new McpError(`当前麦当劳服务未提供 ${name}。`, 422);
    validateArgs(tool.inputSchema, args);
    return unwrapResult(
      await this.rpc("tools/call", { name, arguments: args }),
    );
  }
}
export function normalizeMenu(data: any) {
  if (!data?.meals || typeof data.meals !== "object")
    throw new McpError("菜单结构已变更，无法读取餐品。");
  return Object.entries(data.meals)
    .filter(([, m]: any) => m && typeof m.name === "string")
    .slice(0, 500)
    .map(([code, m]: any) => ({
      code,
      name: String(m.name).slice(0, 80),
      category:
        data.categories?.find((c: any) =>
          c.meals?.some((p: any) => String(p.code) === code),
        )?.name || "其他",
      displayPrice: typeof m.currentPrice === "string" ? m.currentPrice : null,
      conditional: !!m.canWithOrder || !!m.withOrder || !!m.discountType,
    }));
}
function defaults(modification: any) {
  const values = [];
  for (const item of modification?.items ?? [])
    for (const v of item.values ?? []) {
      if (v.selectedQuantity > 0)
        values.push({
          code: v.code,
          key: v.selectedKey,
          quantity: v.selectedQuantity,
        });
      else if (v.unselectedKey)
        values.push({ code: v.code, key: v.unselectedKey, quantity: 0 });
    }
  return values.length ? { values } : undefined;
}
export type Selection = { round: string; code: string; quantity: number };
export function buildItem(detail: any, selections?: Selection[]) {
  if (!detail?.code) throw new McpError("无法读取餐品详情。");
  const item: any = { productCode: String(detail.code), quantity: 1 };
  const modification = defaults(detail.modification);
  if (modification) item.modification = modification;
  if (detail.rounds?.length) {
    item.roundList = detail.rounds.map((round: any) => {
      const chosen = selections
        ? selections.filter((s) => s.round === String(round.id))
        : (round.choices ?? [])
            .filter((c: any) => c.isDefault === 1 && c.quantity > 0)
            .map((c: any) => ({ code: String(c.code), quantity: c.quantity }));
      const total = chosen.reduce(
        (a: number, s: Selection) => a + s.quantity,
        0,
      );
      if (
        total < (round.minQuantity ?? round.quantity ?? 1) ||
        total > (round.maxQuantity ?? round.quantity ?? 1) ||
        new Set(chosen.map((s: Selection) => s.code)).size !== chosen.length
      )
        throw new McpError("套餐选项数量不符合要求，请重新选择。", 400);
      return {
        round: String(round.id),
        comboItemList: chosen.map((s: Selection) => {
          const choice = round.choices.find(
            (c: any) => String(c.code) === s.code,
          );
          if (
            !choice ||
            !Number.isInteger(s.quantity) ||
            s.quantity < 1 ||
            (choice.maxQuantity >= 0 && s.quantity > choice.maxQuantity)
          )
            throw new McpError("套餐包含无效选项。", 400);
          const modification = defaults(choice.modification);
          return {
            code: s.code,
            quantity: s.quantity,
            ...(modification ? { modification } : {}),
          };
        }),
      };
    });
    if (
      selections?.some(
        (s) => !detail.rounds.some((r: any) => String(r.id) === s.round),
      )
    )
      throw new McpError("套餐轮次已变化，请重新选择。", 400);
  } else if (selections?.length)
    throw new McpError("此餐品不支持套餐选项。", 400);
  return item;
}
export function normalizeQuote(data: any, items: any[], schema?: JsonSchema) {
  const priceSchema = schema?.properties?.data?.properties?.price;
  const unitKnown = priceSchema?.description?.includes("分");
  if (!unitKnown)
    throw new McpError("当前接口未明确核价金额单位，无法安全展示报价。", 422);
  if (
    !Number.isInteger(data?.price) ||
    data.price < 0 ||
    !Array.isArray(data.productList)
  )
    throw new McpError("核价结果不完整。");
  const expected = new Map<string, number>();
  for (const x of items)
    expected.set(
      x.productCode,
      (expected.get(x.productCode) ?? 0) + x.quantity,
    );
  const actual = new Map<string, number>();
  for (const x of data.productList)
    actual.set(
      String(x.productCode),
      (actual.get(String(x.productCode)) ?? 0) + x.quantity,
    );
  if (
    expected.size !== actual.size ||
    [...expected].some(([c, q]) => actual.get(c) !== q)
  )
    throw new McpError("核价回显与餐盘不一致，请重新查询。");
  return {
    cents: data.price,
    quotedAt: new Date().toISOString(),
    products: data.productList.map((p: any) => ({
      name: String(p.productName),
      quantity: p.quantity,
    })),
    notice: "本次门店报价，未创建订单。实际结算以麦当劳为准。",
  };
}
