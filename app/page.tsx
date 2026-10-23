"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  Play,
  Pause,
  ArrowUpRight,
  ArrowRight,
  Disc3,
  Shuffle,
  Bookmark,
  Check,
  Copy,
  X,
  Link2,
  Search,
  Volume2,
  Unplug,
  Music2,
} from "lucide-react";
import { BeatEngine } from "@/lib/audio";
import { matchTray, mealsForTrack } from "@/lib/menu";
import {
  freshRecipe,
  decodeRecipe,
  encodeRecipe,
  recipeSchema,
  remixRecipe,
  palette,
  icons,
  roles,
  labels,
  textures,
  variantFor,
  type Recipe,
  type Food,
} from "@/lib/recipe";
type Store = { code: string; name: string; address: string; open: boolean };
type Meal = {
  code: string;
  name: string;
  category: string;
  displayPrice: string | null;
  conditional: boolean;
};
type Choice = {
  code: string;
  name: string;
  quantity: number;
  max: number;
  diffPrice: string;
};
type Detail = {
  code: string;
  name: string;
  rounds: {
    id: string;
    name: string;
    min: number;
    max: number;
    choices: Choice[];
  }[];
};
type Quote = {
  cents: number;
  quotedAt: string;
  products: { name: string; quantity: number }[];
  notice: string;
};
const DRAFT = "mcbeat.draft.v1",
  SHELF = "mcbeat.shelf.v1";
async function request(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await response.json()) as any;
  if (!response.ok) throw Error(data.error || "暂时无法连接，请重试。");
  return data;
}
function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Home() {
  const [recipe, setRecipe] = useState<Recipe | null>(null),
    [listening, setListening] = useState(false),
    [shared, setShared] = useState(false),
    [playing, setPlaying] = useState(false),
    [beat, setBeat] = useState(-1),
    [hits, setHits] = useState<number[]>([]),
    [pending, setPending] = useState(false),
    [volume, setVolume] = useState(35),
    [message, setMessage] = useState("先听一遍，再把可乐换成咖啡。"),
    [error, setError] = useState("");
  const [modal, setModal] = useState<"share" | "library" | "menu" | null>(null),
    [saved, setSaved] = useState<Recipe[]>([]),
    [shareURL, setShareURL] = useState(""),
    [copied, setCopied] = useState(false),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [menuError, setMenuError] = useState("");
  const [city, setCity] = useState(""),
    [keyword, setKeyword] = useState(""),
    [stores, setStores] = useState<Store[]>([]),
    [store, setStore] = useState<Store | null>(null),
    [menu, setMenu] = useState<Meal[]>([]),
    [filter, setFilter] = useState(""),
    [target, setTarget] = useState(0),
    [detail, setDetail] = useState<Detail | null>(null),
    [quote, setQuote] = useState<Quote | null>(null);
  const tokenInput = useRef<HTMLInputElement>(null),
    engine = useRef<BeatEngine | null>(null),
    recipeRef = useRef<Recipe | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    try {
      const hash = new URLSearchParams(location.hash.slice(1));
      const encoded = hash.get("mix");
      if (encoded) {
        const r = decodeRecipe(encoded);
        setRecipe(r);
        setShared(true);
        setMessage("朋友的餐盘已就位。先听，再接着改编。");
      } else {
        let r: Recipe;
        try {
          r = recipeSchema.parse(
            JSON.parse(localStorage.getItem(DRAFT) || "null"),
          );
        } catch {
          r = freshRecipe();
        }
        setRecipe(r);
      }
      try {
        setSaved(
          (JSON.parse(localStorage.getItem(SHELF) || "[]") as unknown[])
            .map((r) => recipeSchema.parse(r))
            .slice(0, 30),
        );
      } catch {
        /* A broken local shelf does not prevent playback. */
      }
    } catch (e) {
      setError((e as Error).message);
      setRecipe(freshRecipe());
    }
    void request("/api/session")
      .then((d) => setConnected(d.connected))
      .catch(() => {});
    const hide = () => {
      if (document.hidden) {
        engine.current?.stop();
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      engine.current?.close();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => {
    const navigate = () => {
      try {
        const encoded = new URLSearchParams(location.hash.slice(1)).get("mix");
        if (!encoded) return;
        const next = decodeRecipe(encoded);
        engine.current?.stop();
        setPlaying(false);
        setRecipe(next);
        setShared(true);
        setModal(null);
        setError("");
        setMessage("朋友的餐盘已就位。先听，再接着改编。");
      } catch (e) {
        setError((e as Error).message);
      }
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    recipeRef.current = recipe;
    if (!recipe) return;
    if (!shared) {
      try {
        localStorage.setItem(DRAFT, JSON.stringify(recipe));
      } catch {
        setMessage("浏览器无法保存草稿，请复制分享链接留存。");
      }
    }
    engine.current?.update(recipe);
    if (engine.current?.playing) setPending(true);
    setQuote(null);
  }, [recipe, shared]);
  useEffect(() => {
    if (quote)
      document.querySelector(".quote")?.scrollIntoView({ block: "nearest" });
  }, [quote]);

  function change(patch: Partial<Recipe>) {
    if (shared || !recipe) return;
    setRecipe({ ...recipe, ...patch });
    setError("");
  }
  function changeFood(i: number, food: Food) {
    if (!recipe) return;
    const foods = [...recipe.foods] as Recipe["foods"];
    foods[i] = food;
    change({ foods });
    setMessage(
      playing ? "新餐品将在下一小节接上。" : "餐品已更换，听听这次的节奏。",
    );
  }
  async function togglePlay() {
    if (!recipe) return;
    if (playing) {
      engine.current?.stop();
      setPlaying(false);
      return;
    }
    setListening(true);
    try {
      if (!engine.current)
        engine.current = new BeatEngine(
          recipe,
          (s, h) => {
            if (mounted.current) {
              setBeat(s);
              setHits(h);
            }
          },
          () => {
            if (mounted.current) setPending(false);
          },
          (msg) => {
            if (mounted.current) {
              setError(msg);
              setPlaying(false);
            }
          },
        );
      engine.current.update(recipe);
      engine.current.volume(volume);
      await engine.current.start();
      setPlaying(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setListening(false);
    }
  }
  function startRemix() {
    if (!recipe) return;
    engine.current?.stop();
    setPlaying(false);
    setRecipe(remixRecipe(recipe));
    setShared(false);
    history.replaceState(null, "", location.pathname);
    setMessage("这是你的版本了。换一道菜，接着演奏。");
  }
  function save() {
    if (!recipe) return;
    const next = [
      structuredClone(recipe),
      ...saved.filter((r) => r.id !== recipe.id),
    ].slice(0, 30);
    try {
      localStorage.setItem(SHELF, JSON.stringify(next));
      setSaved(next);
      setMessage("已放进我的唱片架，仅保存在这台设备。");
    } catch {
      setError("本地保存失败，请通过分享链接留存。");
    }
  }
  function share() {
    if (!recipe) return;
    try {
      setShareURL(
        `${location.origin}${location.pathname}#mix=${encodeRecipe(recipe)}`,
      );
      setCopied(false);
      setModal("share");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareURL);
      setCopied(true);
    } catch {
      setMessage("请长按或选中链接，手动复制。");
    }
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMenuError("");
    try {
      await action();
    } catch (e) {
      setMenuError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    const token = tokenInput.current?.value ?? "";
    await run(async () => {
      await request("/api/session", { token });
      setConnected(true);
      if (tokenInput.current) tokenInput.current.value = "";
      setMessage("已连接真实麦当劳 MCP。请选择门店读取当日菜单。");
    });
  }
  async function disconnect() {
    await run(async () => {
      await request("/api/session", { disconnect: true });
      setConnected(false);
      setStores([]);
      setStore(null);
      setMenu([]);
      setDetail(null);
      setQuote(null);
    });
  }
  async function searchStores() {
    await run(async () => {
      const d = await request("/api/mcd", { action: "stores", city, keyword });
      setStores(d.stores);
      if (!d.stores.length)
        setMenuError("没有找到门店，换一个地标或商圈试试。");
    });
  }
  async function chooseStore(s: Store) {
    await run(async () => {
      const d = await request("/api/mcd", {
        action: "menu",
        storeCode: s.code,
      });
      setStore(s);
      setMenu(d.menu);
      setDetail(null);
      setQuote(null);
      setFilter("");
    });
  }
  async function chooseMeal(m: Meal) {
    if (!store) return;
    await run(async () => {
      const d = await request("/api/mcd", {
        action: "detail",
        storeCode: store.code,
        code: m.code,
      });
      setDetail(d.detail);
    });
  }
  function foodFromDetail(d: Detail): Food {
    const selections = d.rounds.flatMap((r) =>
      r.choices
        .filter((c) => c.quantity > 0)
        .map((c) => ({ round: r.id, code: c.code, quantity: c.quantity })),
    );
    return {
      name:
        d.rounds.length === 1 && selections.length === 1
          ? (d.rounds[0].choices.find((c) => c.code === selections[0].code)
              ?.name ?? d.name)
          : d.name,
      code: d.code,
      source: "mcd",
      variant: variantFor(d.code + selections.map((s) => s.code).join("-")),
      ...(selections.length ? { selections } : {}),
    };
  }
  function addMeal() {
    if (!detail) return;
    changeFood(target, foodFromDetail(detail));
    setDetail(null);
    setModal(null);
  }
  async function fillRealTray() {
    if (!store || !recipe || shared || busy) return;
    const currentRecipeId = recipe.id;
    await run(async () => {
      const candidates = matchTray(menu, recipe.foods);
      const results = await Promise.allSettled(
        candidates.map(async (meal, i) => {
          if (!meal) throw Error("这个声部暂时没有合适的餐品");
          const data = await request("/api/mcd", {
            action: "detail",
            storeCode: store.code,
            code: meal.code,
          });
          const d: Detail = data.detail;
          if (recipe.foods[i].name.includes("无糖"))
            for (const round of d.rounds) {
              const zero = round.choices.find((c) => c.name.includes("无糖"));
              if (zero && round.min === 1 && round.max === 1)
                round.choices.forEach((c) => {
                  c.quantity = c.code === zero.code ? 1 : 0;
                });
            }
          if (
            !d.rounds.every((r) => {
              const total = r.choices.reduce((n, c) => n + c.quantity, 0);
              return total >= r.min && total <= r.max;
            })
          )
            throw Error("该餐品需手动选择套餐选项");
          return foodFromDetail(d);
        }),
      );
      if (recipeRef.current?.id !== currentRecipeId) return;
      const foods = [...recipeRef.current.foods] as Recipe["foods"];
      const missing: number[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") foods[i] = result.value;
        else missing.push(i);
      });
      if (missing.length === 4)
        throw Error("这家门店的餐品未能加载，请重试或手动选择。");
      setRecipe((current) =>
        current?.id === currentRecipeId ? { ...current, foods } : current,
      );
      if (missing.length)
        setMenuError(
          `已换入 ${4 - missing.length} 份真实餐品；${missing.map((i) => roles[i]).join("、")}暂未匹配，保留原餐品，请手动选择。`,
        );
      else {
        setModal(null);
        setMessage("四条声部已全部换成真实门店餐品，可以直接演奏或核价。");
      }
    });
  }
  async function selectFood(i: number, value: string) {
    if (value.startsWith("live:")) {
      const meal = menu.find((m) => m.code === value.slice(5));
      if (meal) {
        setTarget(i);
        setDetail(null);
        setModal("menu");
        await chooseMeal(meal);
      }
    } else {
      const variant = Number(value);
      if (Number.isInteger(variant) && variant >= 0 && variant < 3)
        changeFood(i, { name: palette[i][variant], variant, source: "demo" });
    }
  }
  async function getQuote() {
    if (!recipe || !store) return;
    await run(async () => {
      const d = await request("/api/mcd", {
        action: "quote",
        storeCode: store.code,
        items: recipe.foods
          .filter((f) => f.source === "mcd" && f.code)
          .map((f) => ({ code: f.code, selections: f.selections })),
      });
      setQuote(d.quote);
    });
  }
  function mealDrawer(i: number) {
    setTarget(i);
    setDetail(null);
    setMenuError("");
    setModal("menu");
  }
  if (!recipe)
    return (
      <main className="loading">
        <Disc3 size={40} />
        <p>餐盘正在就位…</p>
      </main>
    );
  const realCount = recipe.foods.filter((f) => f.source === "mcd").length;
  const detailValid = detail?.rounds.every((r) => {
    const n = r.choices.reduce((sum, c) => sum + c.quantity, 0);
    return n >= r.min && n <= r.max;
  });
  return (
    <div
      className="app"
      data-playing={playing}
      data-step={beat}
      data-recipe-id={recipe.id}
    >
      <header className="topbar">
        <a className="logo" href="/" aria-label="McBeat 首页">
          <span className="logo-mark">
            <Music2 size={21} />
          </span>
          McBeat<span className="logo-period">.</span>
        </a>
        <nav>
          <button className="text-button" onClick={() => setModal("library")}>
            <Disc3 size={17} />
            <span>我的唱片架</span>
            <b>{saved.length}</b>
          </button>
          <button
            className={`connection ${connected ? "connected" : ""}`}
            onClick={() => mealDrawer(0)}
          >
            <span className="status-dot" />
            {connected ? "麦当劳已连接" : "连接麦当劳"}
            <ArrowUpRight size={14} />
          </button>
        </nav>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">MAKE A MEAL. MAKE A BEAT.</p>
            <h1>
              {shared ? (
                "这顿节奏，传给你了。"
              ) : (
                <>
                  今天这顿，<em>有点节奏。</em>
                </>
              )}
            </h1>
            <p className="subtitle">
              把餐盘变成一首歌。换一道菜，让节奏换个口味。
            </p>
          </div>
          <div className="intro-stamp" aria-hidden="true">
            <span>FRESHLY MIXED</span>
            <Disc3 size={26} />
            <span>SERVED WITH BEATS</span>
          </div>
        </section>
        {error && (
          <div className="alert" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="关闭提示">
              <X size={16} />
            </button>
          </div>
        )}
        {shared && (
          <div className="remix-banner">
            <div>
              <span className="eyebrow">FROM A FRIEND</span>
              <strong>《{recipe.title}》</strong>
              <span>乐谱快照 · 无需登录即可试听</span>
            </div>
            <button className="primary" onClick={startRemix}>
              <Shuffle size={17} />
              接着改编
              <ArrowRight size={17} />
            </button>
          </div>
        )}
        <section className="studio" aria-label="餐盘混音台">
          <div className="studio-heading">
            <div className="track-title">
              <span className="tiny-record" />
              <input
                aria-label="作品名称"
                value={recipe.title}
                maxLength={40}
                readOnly={shared}
                onChange={(e) => {
                  if (e.target.value.trim()) change({ title: e.target.value });
                }}
              />
              <span className="edition">VOL. 01</span>
            </div>
            <div className="studio-actions">
              <button className="text-button" onClick={save}>
                <Bookmark size={16} />
                <span>保存</span>
              </button>
              <button className="share-button" onClick={share}>
                分享这顿
                <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
          {recipe.parent && (
            <p className="provenance">
              改编自《{recipe.parent.title}》 · 这是独立保存的新版本
            </p>
          )}
          <div className="transport">
            <button
              className="play"
              onClick={togglePlay}
              disabled={listening}
              aria-pressed={playing}
            >
              {playing ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
              {listening ? "准备声音…" : playing ? "暂停演奏" : "开始演奏"}
            </button>
            <div className="mode" aria-label="音乐风格">
              <button
                disabled={shared}
                aria-pressed={recipe.mode === "lofi"}
                onClick={() => change({ mode: "lofi" })}
              >
                松弛 Lo-fi
              </button>
              <button
                disabled={shared}
                aria-pressed={recipe.mode === "pixel"}
                onClick={() => change({ mode: "pixel" })}
              >
                像素 8-bit
              </button>
            </div>
            <label className="tempo">
              <span>速度</span>
              <input
                type="range"
                aria-label="速度 BPM"
                min="76"
                max="124"
                step="4"
                disabled={shared}
                value={recipe.bpm}
                onChange={(e) => change({ bpm: +e.target.value })}
              />
              <output>
                {recipe.bpm} <small>BPM</small>
              </output>
            </label>
          </div>
          <div className="tray">
            <div className="tray-caption">
              <span>
                <span className="status-dot" />
                {realCount
                  ? `${realCount} 份真实菜单餐品`
                  : "离线试玩 · 尚未选择门店餐品"}
              </span>
              <button
                className="tray-source-action"
                disabled={shared || busy}
                onClick={() =>
                  store && connected ? void fillRealTray() : mealDrawer(0)
                }
              >
                {store && connected
                  ? "用真实菜单配满餐盘"
                  : "选门店，换成真实餐品"}
                <ArrowUpRight size={12} />
              </button>
            </div>
            <div className="foods">
              {recipe.foods.map((food, i) => (
                <article
                  key={i}
                  className={`food food-${i} ${recipe.muted[i] ? "muted" : ""} ${hits.includes(i) ? "hit" : ""}`}
                >
                  <div className="food-heading">
                    <span>
                      0{i + 1} / {labels[i]}
                    </span>
                    <button
                      className="mute"
                      disabled={shared}
                      aria-pressed={recipe.muted[i]}
                      aria-label={`${recipe.muted[i] ? "开启" : "静音"}${roles[i]}`}
                      onClick={() => {
                        const muted = [...recipe.muted] as Recipe["muted"];
                        muted[i] = !muted[i];
                        change({ muted });
                      }}
                    >
                      {recipe.muted[i] ? "OFF" : "ON"}
                    </button>
                  </div>
                  <button
                    className="dish"
                    disabled={shared}
                    onClick={() => {
                      const muted = [...recipe.muted] as Recipe["muted"];
                      muted[i] = !muted[i];
                      change({ muted });
                    }}
                    aria-label={`${food.name}，${recipe.muted[i] ? "开启" : "关闭"}${roles[i]}`}
                  >
                    <span className="dish-art" aria-hidden="true">
                      <span>
                        {i === 2 && food.variant === 1
                          ? "☕"
                          : i === 3 && food.variant === 1
                            ? "🥧"
                            : i === 1 && food.variant === 1
                              ? "🍗"
                              : icons[i]}
                      </span>
                    </span>
                    <strong>{food.name}</strong>
                    <span className="texture">
                      {roles[i]} · {textures[i][food.variant]}
                    </span>
                  </button>
                  <div className="mini-wave" aria-hidden="true">
                    {Array.from({ length: 16 }, (_, s) => (
                      <i
                        key={s}
                        className={s === beat ? "current" : ""}
                        style={{
                          height: `${7 + ((s * 7 + food.variant * 11 + i * 3) % 18)}px`,
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className={`food-source ${food.source === "mcd" ? "is-real" : ""}`}
                  >
                    {food.source === "mcd" ? "真实餐品" : "离线试玩"}
                  </span>
                  <select
                    aria-label={`更换${roles[i]}餐品`}
                    disabled={shared || busy}
                    value={
                      food.source === "mcd" ? `live:${food.code}` : food.variant
                    }
                    onChange={(e) => void selectFood(i, e.target.value)}
                  >
                    {food.source === "mcd" && (
                      <option value={`live:${food.code}`}>{food.name}</option>
                    )}
                    {connected && store && (
                      <optgroup label="本店真实菜单">
                        {mealsForTrack(menu, i)
                          .filter((m) => m.code !== food.code)
                          .map((m) => (
                            <option key={m.code} value={`live:${m.code}`}>
                              {m.name}
                            </option>
                          ))}
                      </optgroup>
                    )}
                    <optgroup label="离线试玩">
                      {palette[i].map((f, v) => (
                        <option key={v} value={v}>
                          {f}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    disabled={shared}
                    className="real-menu"
                    onClick={() => mealDrawer(i)}
                  >
                    从真实菜单换一道
                    <ArrowUpRight size={13} />
                  </button>
                </article>
              ))}
            </div>
            <div className="sequencer" aria-hidden="true">
              {Array.from({ length: 16 }, (_, i) => (
                <span key={i} className={beat === i ? "active" : ""} />
              ))}
            </div>
            <div className="timeline">
              <span>01 — 16 / LOOP</span>
              <span>
                {pending ? "下一小节接上新编曲…" : "自动对拍 · C 小调"}
              </span>
              <span>PACK / 001</span>
            </div>
          </div>
          <div className="studio-bottom">
            <p role="status" aria-live="polite">
              {message}
            </p>
            <label>
              <Volume2 size={15} />
              <input
                aria-label="音量"
                type="range"
                min="0"
                max="70"
                value={volume}
                onChange={(e) => {
                  setVolume(+e.target.value);
                  engine.current?.volume(+e.target.value);
                }}
              />
            </label>
          </div>
        </section>
        <section className="after-studio">
          <div className="how">
            <span className="step-number">01</span>
            <p>
              <strong>先听一口</strong>
              <span>四道餐品，四条声部</span>
            </p>
            <span className="dashed" />
            <span className="step-number">02</span>
            <p>
              <strong>换个口味</strong>
              <span>换菜、静音，找到你的节奏</span>
            </p>
            <span className="dashed" />
            <span className="step-number">03</span>
            <p>
              <strong>传给朋友</strong>
              <span>同一份乐谱，下一段新灵感</span>
            </p>
          </div>
          <button className="menu-callout" onClick={() => mealDrawer(0)}>
            <span className="small-icon">🍽️</span>
            <span>
              <strong>想把这顿变成真的？</strong>
              <small>连接门店菜单 · 查看实时核价</small>
            </span>
            <ArrowUpRight size={20} />
          </button>
        </section>
      </main>
      <footer>
        <span>McBeat · 独立创意作品，非麦当劳官方应用</span>
        <span>
          Made to be remixed. <span className="footer-dot">●</span>
        </span>
      </footer>
      {modal === "share" && (
        <Dialog title="把这顿节奏传出去" onClose={() => setModal(null)}>
          <div className="album">
            <div className={`vinyl ${playing ? "spinning" : ""}`}>
              <div>{icons[0]}</div>
            </div>
            <p className="eyebrow">MCBEAT / RECIPE MIX</p>
            <h3>{recipe.title}</h3>
            <p>
              {recipe.bpm} BPM · {recipe.mode === "lofi" ? "Lo-fi" : "8-bit"} ·{" "}
              {recipe.muted.filter((x) => !x).length} 条声部
            </p>
            <div className="album-foods">
              {recipe.foods.map((f, i) => (
                <span key={i}>{f.name}</span>
              ))}
            </div>
          </div>
          <p className="dialog-help">
            朋友打开链接就能听。点击「接着改编」，便会拥有自己的版本。
          </p>
          <label className="field">
            <span>乐谱链接</span>
            <input
              aria-label="分享链接"
              value={shareURL}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="dialog-actions">
            <button className="primary" onClick={copy}>
              {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
              {copied ? "已复制链接" : "复制分享链接"}
            </button>
            {typeof navigator !== "undefined" && !!navigator.share && (
              <button
                className="secondary"
                onClick={() =>
                  void navigator
                    .share({
                      title: `McBeat · ${recipe.title}`,
                      text: "这顿节奏，换你接着改编。",
                      url: shareURL,
                    })
                    .catch(() => {})
                }
              >
                系统分享
                <ArrowUpRight size={16} />
              </button>
            )}
          </div>
          <p className="fineprint">
            只分享餐品与编曲，不包含账号、门店位置或
            Token。链接包含完整乐谱，请勿截断。
          </p>
        </Dialog>
      )}
      {modal === "library" && (
        <Dialog title="我的唱片架" onClose={() => setModal(null)}>
          <p className="dialog-help">保存在这台设备上的小灵感。</p>
          {saved.length === 0 ? (
            <div className="empty">
              <Disc3 size={38} />
              <h3>第一张唱片，等你开饭</h3>
              <p>调好餐盘后，点击「保存」。</p>
            </div>
          ) : (
            <div className="library">
              {saved.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    engine.current?.stop();
                    setPlaying(false);
                    setRecipe(r);
                    setShared(false);
                    history.replaceState(null, "", location.pathname);
                    setModal(null);
                    setMessage("已载入唱片。");
                  }}
                >
                  <span className="library-art">
                    {r.mode === "lofi" ? "☕" : "🎮"}
                  </span>
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {r.bpm} BPM · {r.foods.map((f) => f.name).join(" / ")}
                    </small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          )}
        </Dialog>
      )}
      {modal === "menu" && (
        <Dialog
          title={detail ? "给这道菜调个口味" : "真实餐品，真实节奏"}
          wide
          onClose={() => {
            setModal(null);
          }}
        >
          <div className="menu-topline">
            <span className={`connection ${connected ? "connected" : ""}`}>
              <span className="status-dot" />
              {connected ? "已连接麦当劳 MCP" : "尚未连接"}
            </span>
            <span>当前加入：{roles[target]}声部</span>
            {connected && (
              <button
                className="text-button"
                disabled={busy}
                onClick={disconnect}
              >
                <Unplug size={14} />
                断开
              </button>
            )}
          </div>
          {!connected ? (
            <div className="connect-form">
              <div className="connect-symbol">
                <Link2 size={30} />
              </div>
              <h3>让真实菜单加入你的乐队</h3>
              <p>
                打开麦当劳开放平台 → 手机号登录 → 控制台 → 激活 → 同意协议并复制
                Token。
              </p>
              <a
                href="https://open.mcd.cn/mcp"
                target="_blank"
                rel="noreferrer"
                className="external"
              >
                打开麦当劳 MCP 平台
                <ArrowUpRight size={15} />
              </a>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void connect();
                }}
              >
                <label className="field">
                  <span>MCP Token</span>
                  <input
                    ref={tokenInput}
                    type="password"
                    autoComplete="off"
                    aria-label="麦当劳 MCP Token"
                    placeholder="仅用于本次连接"
                    required
                    maxLength={2048}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  {busy ? "正在验证真实连接…" : "连接麦当劳"}
                  <ArrowRight size={16} />
                </button>
              </form>
              <p className="fineprint">
                连接有效期 1 小时。凭据加密保存在 HttpOnly 会话 Cookie
                中；不写入乐谱或浏览器本地存储。
              </p>
            </div>
          ) : (
            <>
              {!detail && (
                <>
                  <form
                    className="store-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void searchStores();
                    }}
                  >
                    <label className="field">
                      <span>城市</span>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="如：上海"
                        required
                        maxLength={40}
                      />
                    </label>
                    <label className="field">
                      <span>地标 / 商圈</span>
                      <input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="如：人民广场"
                        required
                        maxLength={80}
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={busy}
                      aria-label="搜索门店"
                    >
                      <Search size={18} />
                    </button>
                  </form>
                  {stores.length > 0 && (
                    <div className="stores">
                      {stores.map((s) => (
                        <button
                          className={store?.code === s.code ? "selected" : ""}
                          key={s.code}
                          disabled={busy || !s.open}
                          onClick={() => void chooseStore(s)}
                        >
                          <strong>{s.name}</strong>
                          <small>
                            {s.address}
                            {!s.open ? " · 当前不可用" : ""}
                          </small>
                          {store?.code === s.code && <Check size={16} />}
                        </button>
                      ))}
                    </div>
                  )}
                  {store && (
                    <>
                      <div className="menu-section-head">
                        <div>
                          <p className="eyebrow">CURRENT MENU</p>
                          <h3>{store.name}</h3>
                        </div>
                        <label className="search-food">
                          <Search size={16} />
                          <input
                            aria-label="搜索餐品"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="找点什么？"
                          />
                        </label>
                      </div>
                      <div className="fill-tray">
                        <div>
                          <strong>用这家店，配一盘真实节奏</strong>
                          <p>
                            优先匹配当前餐品，缺货时选择同类餐品。不会创建订单。
                          </p>
                        </div>
                        <button
                          className="primary"
                          disabled={busy || shared}
                          onClick={() => void fillRealTray()}
                        >
                          用真实菜单配满餐盘
                          <ArrowRight size={16} />
                        </button>
                      </div>
                      <p className="fineprint">
                        菜单展示价可能含优惠条件，实际价格请核价。每个声部对应 1
                        份餐品或套餐。
                      </p>
                      <div className="menu-list">
                        {menu
                          .filter((m) =>
                            `${m.name}${m.category}`.includes(filter),
                          )
                          .map((m) => (
                            <button
                              key={m.code}
                              disabled={busy || shared}
                              onClick={() => void chooseMeal(m)}
                            >
                              <span className="menu-food-icon">
                                {icons[target]}
                              </span>
                              <span>
                                <strong>{m.name}</strong>
                                <small>
                                  {m.category}
                                  {m.conditional ? " · 有优惠条件" : ""}
                                </small>
                              </span>
                              <span className="price">
                                {m.displayPrice ? `¥${m.displayPrice}` : "查看"}
                                <ArrowUpRight size={13} />
                              </span>
                            </button>
                          ))}
                      </div>
                      <div className="quote-area">
                        <div>
                          <strong>
                            这顿真实餐品{realCount ? ` · ${realCount} 份` : ""}
                          </strong>
                          <p>
                            {realCount
                              ? "按当前门店，重新核对餐品和套餐选项。"
                              : "配满真实餐盘，或先从菜单选一道菜。"}
                          </p>
                        </div>
                        <button
                          className="secondary"
                          disabled={busy || !realCount}
                          onClick={() => void getQuote()}
                        >
                          核价{realCount ? `（${realCount} 份）` : ""}
                        </button>
                      </div>
                      {quote && (
                        <div className="quote" role="status">
                          <div>
                            <span>麦当劳实时核价</span>
                            <strong>¥{(quote.cents / 100).toFixed(2)}</strong>
                          </div>
                          <p>
                            {quote.products
                              .map((p) => `${p.name} × ${p.quantity}`)
                              .join(" · ")}
                          </p>
                          <small>
                            {quote.notice}
                            {realCount < 4 ? " 离线试玩餐品未计入。" : ""}
                          </small>
                        </div>
                      )}
                    </>
                  )}
                  {!store && stores.length === 0 && (
                    <div className="empty">
                      <span className="empty-emoji">🍽️</span>
                      <h3>选一家店，开一场小演出</h3>
                      <p>菜单与报价会随门店、供应时间变化。</p>
                    </div>
                  )}
                </>
              )}
              {detail && (
                <div className="detail">
                  <button
                    className="text-button"
                    onClick={() => setDetail(null)}
                  >
                    ← 返回菜单
                  </button>
                  <h3>{detail.name}</h3>
                  {detail.rounds.length === 0 ? (
                    <p className="dialog-help">
                      这是一道单品，将为{roles[target]}声部带来新的声音。
                    </p>
                  ) : (
                    detail.rounds.map((r, ri) => (
                      <div className="round" key={r.id}>
                        <h4>
                          {r.name}
                          <span>
                            选 {r.min === r.max ? r.min : `${r.min}–${r.max}`}{" "}
                            份
                          </span>
                        </h4>
                        {r.choices.map((c, ci) => (
                          <label key={c.code}>
                            <span>
                              {c.name}
                              <small>{c.diffPrice}</small>
                            </span>
                            <input
                              aria-label={`${r.name} ${c.name}数量`}
                              type="number"
                              min="0"
                              max={c.max < 0 ? r.max : Math.min(c.max, r.max)}
                              value={c.quantity}
                              onChange={(e) => {
                                const d = structuredClone(detail);
                                d.rounds[ri].choices[ci].quantity = Math.max(
                                  0,
                                  Math.min(r.max, Math.floor(+e.target.value)),
                                );
                                setDetail(d);
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    ))
                  )}
                  <button
                    className="primary"
                    disabled={busy || !detailValid || shared}
                    onClick={addMeal}
                  >
                    加入{roles[target]}声部
                    <Music2 size={17} />
                  </button>
                  {!detailValid && (
                    <p className="fineprint">请让每一组的选项数量满足要求。</p>
                  )}
                </div>
              )}
            </>
          )}
          {busy && (
            <p className="busy" role="status">
              <span className="status-dot" />
              正在向麦当劳查询…
            </p>
          )}
          {menuError && (
            <div className="alert" role="alert">
              {menuError}
            </div>
          )}
          {shared && connected && (
            <p className="dialog-help">
              可以为朋友的真实餐品重新核价。要换餐品，请先点击「接着改编」。
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
