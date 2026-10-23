import test from "node:test";
import assert from "node:assert/strict";
import {
  freshRecipe,
  encodeRecipe,
  decodeRecipe,
  remixRecipe,
} from "../lib/recipe.ts";
import {
  McpClient,
  MCP_URL,
  unwrapResult,
  validateArgs,
  buildItem,
  normalizeQuote,
  normalizeMenu,
} from "../lib/mcp.ts";
test("shared Unicode score reproduces every audible setting; remix leaves original intact", () => {
  const original = freshRecipe();
  original.title = "朋友的咖啡 ☕";
  original.mode = "pixel";
  original.bpm = 108;
  original.muted[1] = true;
  original.foods[2] = {
    name: "无糖可乐",
    source: "mcd",
    variant: 2,
    code: "drink",
    selections: [{ round: "1", code: "zero", quantity: 1 }],
  };
  const restored = decodeRecipe(encodeRecipe(original));
  assert.deepEqual(restored, original);
  const remix = remixRecipe(restored);
  remix.foods[1].name = "麦乐鸡";
  assert.notEqual(remix.id, original.id);
  assert.equal(remix.parent.id, original.id);
  assert.equal(original.foods[1].name, "中薯条");
});
test("share parser rejects credentials, unsupported sound packs and oversized payloads", () => {
  assert.throws(() =>
    encodeRecipe({ ...freshRecipe(), token: "must-not-share" }),
  );
  assert.throws(() => encodeRecipe({ ...freshRecipe(), pack: "unknown" }));
  assert.throws(() => decodeRecipe("a".repeat(6001)));
  assert.throws(() => decodeRecipe("%%bad"));
});
test("business failure and missing success never become a successful empty menu", () => {
  for (const result of [
    { isError: true },
    { structuredContent: { success: false, data: [] } },
    { structuredContent: { data: [] } },
  ])
    assert.throws(() => unwrapResult(result));
  assert.deepEqual(
    unwrapResult({ structuredContent: { success: true, data: [1] } }),
    [1],
  );
});
test("live argument schemas reject missing fields and wrong enum/types", () => {
  const schema = {
    type: "object",
    required: ["code"],
    properties: {
      code: { type: "string" },
      kind: { type: "integer", enum: [1, 2] },
    },
  };
  assert.throws(() => validateArgs(schema, {}));
  assert.throws(() => validateArgs(schema, { code: 11 }));
  assert.throws(() => validateArgs(schema, { code: "1", kind: 3 }));
  validateArgs(schema, { code: "1", kind: 1 });
});
const detail = {
  code: "combo",
  rounds: [
    {
      id: 1,
      minQuantity: 1,
      maxQuantity: 1,
      choices: [
        { code: "coke", quantity: 1, isDefault: 1, maxQuantity: -1 },
        { code: "zero", quantity: 0, isDefault: 0, maxQuantity: -1 },
      ],
    },
  ],
};
test("combo defaults and replacements preserve the official round structure", () => {
  assert.deepEqual(buildItem(detail), {
    productCode: "combo",
    quantity: 1,
    roundList: [{ round: "1", comboItemList: [{ code: "coke", quantity: 1 }] }],
  });
  const item = buildItem(detail, [{ round: "1", code: "zero", quantity: 1 }]);
  assert.equal(item.roundList[0].comboItemList[0].code, "zero");
  for (const selections of [
    [],
    [{ round: "1", code: "alien", quantity: 1 }],
    [{ round: "1", code: "coke", quantity: 2 }],
    [
      { round: "1", code: "coke", quantity: 1 },
      { round: "9", code: "x", quantity: 1 },
    ],
  ])
    assert.throws(() => buildItem(detail, selections));
});
const amountSchema = {
  properties: {
    data: { properties: { price: { description: "总价，单位：分" } } },
  },
};
test("quote uses confirmed cents and matches returned codes and quantities", () => {
  const items = [
    { productCode: "a", quantity: 1 },
    { productCode: "a", quantity: 1 },
  ];
  const data = {
    price: 11450,
    productList: [{ productCode: "a", quantity: 2, productName: "测试餐品" }],
  };
  assert.equal(normalizeQuote(data, items, amountSchema).cents, 11450);
  assert.throws(() => normalizeQuote(data, items));
  assert.throws(() =>
    normalizeQuote({ ...data, price: null }, items, amountSchema),
  );
  assert.throws(() =>
    normalizeQuote(
      { ...data, productList: [{ productCode: "wrong", quantity: 2 }] },
      items,
      amountSchema,
    ),
  );
});
test("menu keys remain product codes; promotional display price does not become a quote", () => {
  const rows = normalizeMenu({
    categories: [{ name: "测试", meals: [{ code: "123" }] }],
    meals: { 123: { name: "测试餐品", currentPrice: "49.9", withOrder: {} } },
  });
  assert.deepEqual(rows[0], {
    code: "123",
    name: "测试餐品",
    category: "测试",
    displayPrice: "49.9",
    conditional: true,
  });
});
test("Streamable HTTP carries negotiated headers, parses fragmented SSE, and blocks writes", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    assert.equal(url, MCP_URL);
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.Authorization, "Bearer fixture-only");
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.method === "initialize")
      return Response.json(
        {
          jsonrpc: "2.0",
          id: body.id,
          result: { protocolVersion: "2025-06-18" },
        },
        { headers: { "Mcp-Session-Id": "fixture-session" } },
      );
    assert.equal(init.headers["Mcp-Session-Id"], "fixture-session");
    assert.equal(init.headers["MCP-Protocol-Version"], "2025-06-18");
    if (body.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    const result =
      body.method === "tools/list"
        ? {
            tools: [
              {
                name: "query-meals",
                inputSchema: {
                  type: "object",
                  required: ["storeCode"],
                  properties: { storeCode: { type: "string" } },
                },
              },
            ],
          }
        : { structuredContent: { success: true, data: { ok: true } } };
    const text = `event: message\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result })}\r\n\r\n`;
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(text.slice(0, 26)));
          controller.enqueue(encoder.encode(text.slice(26)));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };
  const client = new McpClient("fixture-only", fetcher);
  await client.connect();
  assert.deepEqual(await client.call("query-meals", { storeCode: "test" }), {
    ok: true,
  });
  await assert.rejects(() => client.call("create-order", {}));
  assert.equal(calls.filter((c) => c.method === "tools/call").length, 1);
});

test('matching prefers existing real items and keeps unavailable voices empty', async () => {
  const { matchTray } = await import('../lib/menu.ts');
  const meal=(code,name,conditional=false)=>({code,name,category:'fixture',displayPrice:null,conditional});
  const menu=[meal('fish','麦香鱼'),meal('big','巨无霸'),meal('fries','薯条'),meal('cola','可乐'),meal('bundle','巨无霸套餐'),meal('paid','麦旋风',true)];
  const picks=matchTray(menu,[{name:'巨无霸'},{name:'中薯条'},{name:'无糖可乐'},{name:'圆筒冰淇淋'}]);
  assert.deepEqual(picks.map(m=>m?.code??null),['big','fries','cola',null]);
  assert.equal(matchTray(menu,[{name:'旧名称',code:'fish'},{name:'薯条'},{name:'可乐'},{name:'甜品'}])[0].code,'fish');
});
