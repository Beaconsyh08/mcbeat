import { z } from "zod";
export const roles = ["贝斯", "鼓组", "旋律", "和声"];
export const labels = ["BASS", "DRUMS", "LEAD", "CHORDS"];
export const icons = ["🍔", "🍟", "🥤", "🍦"];
export const palette = [
  ["巨无霸", "麦香鱼", "板烧鸡腿堡"],
  ["中薯条", "麦乐鸡", "薯饼"],
  ["无糖可乐", "美式咖啡", "鲜煮咖啡"],
  ["圆筒冰淇淋", "苹果派", "奥利奥麦旋风"],
];
export const textures = [
  ["圆润低音", "轻盈拨弦", "跳跃贝斯"],
  ["松弛切分", "弹跳鼓点", "清脆碎拍"],
  ["气泡合成器", "温暖电钢琴", "轻快短音"],
  ["柔软长和弦", "明亮琶音", "漂浮和声"],
];
const foodSchema = z
  .object({
    name: z.string().min(1).max(80),
    variant: z.number().int().min(0).max(2),
    source: z.enum(["demo", "mcd"]),
    code: z.string().max(80).optional(),
    selections: z
      .array(
        z
          .object({
            round: z.string().max(80),
            code: z.string().max(80),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .max(30)
      .optional(),
  })
  .strict();
export const recipeSchema = z
  .object({
    v: z.literal(1),
    pack: z.literal("mcbeat-1"),
    id: z.string().regex(/^[a-zA-Z0-9_-]{6,40}$/),
    title: z.string().trim().min(1).max(40),
    mode: z.enum(["lofi", "pixel"]),
    bpm: z.number().int().min(76).max(124),
    foods: z.tuple([foodSchema, foodSchema, foodSchema, foodSchema]),
    muted: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean()]),
    parent: z
      .object({ id: z.string().max(40), title: z.string().max(40) })
      .strict()
      .optional(),
  })
  .strict();
export type Recipe = z.infer<typeof recipeSchema>;
export type Food = z.infer<typeof foodSchema>;
export const makeId = () =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 16);
export function freshRecipe(): Recipe {
  return {
    v: 1,
    pack: "mcbeat-1",
    id: makeId(),
    title: "午后开饭",
    mode: "lofi",
    bpm: 96,
    foods: palette.map((p) => ({
      name: p[0],
      variant: 0,
      source: "demo",
    })) as Recipe["foods"],
    muted: [false, false, false, false],
  };
}
export function encodeRecipe(recipe: Recipe): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(recipeSchema.parse(recipe)),
  );
  const encoded = btoa(
    Array.from(bytes, (x) => String.fromCharCode(x)).join(""),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  if (encoded.length > 6000)
    throw Error("这份乐谱的套餐选项过多，请减少选项后分享。");
  return encoded;
}
export function decodeRecipe(value: string): Recipe {
  if (value.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw Error("分享链接不完整，请让朋友重新发送。");
  try {
    return recipeSchema.parse(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(
            atob(value.replaceAll("-", "+").replaceAll("_", "/")),
            (c) => c.charCodeAt(0),
          ),
        ),
      ),
    );
  } catch {
    throw Error("这份乐谱无法读取，或使用了尚未支持的声音版本。");
  }
}
export function remixRecipe(r: Recipe): Recipe {
  return {
    ...structuredClone(r),
    id: makeId(),
    title: r.title.slice(0, 32) + " · Remix",
    parent: { id: r.id, title: r.title },
  };
}
export function variantFor(code: string) {
  let n = 0;
  for (const c of code) n = (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0;
  return n % 3;
}
