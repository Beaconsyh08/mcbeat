import { McpClient, McpError, ALLOWED } from "@/lib/mcp";
import {
  cookie,
  tokenFrom,
  readBody,
  json,
  failure,
  clearCookie,
} from "@/lib/session";
export async function GET(request: Request) {
  return json({ connected: !!(await tokenFrom(request)) });
}
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (body.disconnect)
      return json({ connected: false }, 200, { "Set-Cookie": clearCookie() });
    const token = body.token?.trim();
    if (
      typeof token !== "string" ||
      token.length < 10 ||
      token.length > 2048 ||
      /[\r\n]/.test(token)
    )
      throw new McpError("请输入有效的麦当劳 MCP Token。", 400);
    const client = new McpClient(token);
    const tools = await client.connect();
    const names = tools
      .filter((t) => (ALLOWED as readonly string[]).includes(t.name))
      .map((t) => t.name);
    if (!names.includes("query-meals"))
      throw new McpError("当前账号未提供菜单查询能力。", 422);
    return json({ connected: true, tools: names }, 200, {
      "Set-Cookie": await cookie(token, request),
    });
  } catch (e) {
    return failure(e);
  }
}
