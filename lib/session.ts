import { env } from "cloudflare:workers";
import { McpError } from "./mcp";
const NAME = "mcbeat_session";
const base64 = (v: Uint8Array) =>
  btoa(Array.from(v, (c) => String.fromCharCode(c)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const bytes = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
async function key() {
  const value = (env as unknown as Record<string, string>).MCBEAT_SESSION_KEY;
  if (!/^[a-f0-9]{64}$/.test(value ?? ""))
    throw new McpError("服务端连接密钥尚未配置。", 503);
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(value.match(/../g)!, (h) => parseInt(h, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function cookie(token: string, request: Request) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new TextEncoder().encode(
    JSON.stringify({ token, expires: Date.now() + 60 * 60 * 1000 }),
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(),
    body,
  );
  return `${NAME}=${base64(iv)}.${base64(new Uint8Array(encrypted))}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function tokenFrom(request: Request): Promise<string | null> {
  const c = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(NAME + "="))
    ?.slice(NAME.length + 1);
  if (!c) return null;
  try {
    const [iv, data] = c.split(".");
    const decoded = JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes(iv) },
          await key(),
          bytes(data),
        ),
      ),
    );
    return decoded.expires > Date.now() && typeof decoded.token === "string"
      ? decoded.token
      : null;
  } catch {
    return null;
  }
}
export function clearCookie() {
  return `${NAME}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`;
}
export async function readBody(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new McpError("仅接受本页面发起的请求。", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new McpError("请求格式错误。", 400);
  const text = await request.text();
  if (text.length > 12000) throw new McpError("请求过大。", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new McpError("请求格式错误。", 400);
  }
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof McpError
          ? error.message
          : "请求无法完成，请稍后重试。",
    },
    error instanceof McpError ? error.status : 500,
  );
}
