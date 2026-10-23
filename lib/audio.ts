import type { Recipe } from "./recipe";
const bass = [
  [36, -1, -1, 43, -1, -1, 46, -1, 36, -1, 43, -1, -1, 39, -1, 34],
  [36, -1, 43, -1, -1, 46, -1, 43, 39, -1, -1, 43, -1, 46, -1, -1],
  [36, -1, 48, -1, 43, -1, -1, 46, 39, -1, 43, -1, 46, -1, 43, -1],
];
const drums = [
  [1, 0, 3, 0, 2, 0, 1, 3, 1, 0, 3, 0, 2, 3, 0, 3],
  [1, 3, 0, 3, 2, 0, 3, 1, 0, 3, 1, 3, 2, 0, 3, 3],
  [1, 3, 3, 0, 2, 3, 0, 3, 1, 0, 3, 1, 2, 0, 3, 3],
];
const leads = [
  [-1, -1, 72, -1, -1, 79, -1, 75, -1, -1, 82, -1, 79, -1, 75, -1],
  [72, -1, -1, 75, -1, -1, 79, -1, 70, -1, -1, 67, -1, -1, 75, -1],
  [79, -1, 75, -1, 72, -1, -1, 70, 67, -1, 70, -1, 75, -1, -1, 72],
];
const chords = [
  [60, 63, 67, 70],
  [60, 63, 67, 74],
  [55, 58, 62, 67],
];
export class BeatEngine {
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  noise: AudioBuffer;
  nodes = new Set<AudioScheduledSourceNode>();
  playing = false;
  timer?: ReturnType<typeof setInterval>;
  frame = 0;
  watchdog?: ReturnType<typeof setTimeout>;
  recipe: Recipe;
  pending?: Recipe;
  step = 0;
  next = 0;
  events: { step: number; time: number; hits: number[] }[] = [];
  constructor(
    recipe: Recipe,
    private onBeat: (step: number, hits: number[]) => void,
    private onApplied: () => void,
    private onError: (message: string) => void,
  ) {
    this.recipe = structuredClone(recipe);
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    this.analyser = this.ctx.createAnalyser();
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.master.gain.value = 0.35;
    this.noise = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate,
      this.ctx.sampleRate,
    );
    let seed = 1729;
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
  }
  update(recipe: Recipe) {
    if (this.playing) this.pending = structuredClone(recipe);
    else this.recipe = structuredClone(recipe);
  }
  volume(n: number) {
    this.master.gain.setTargetAtTime(n / 100, this.ctx.currentTime, 0.03);
  }
  track<T extends AudioScheduledSourceNode>(
    node: T,
    chain: AudioNode[] = [],
  ): T {
    this.nodes.add(node);
    node.onended = () => {
      this.nodes.delete(node);
      node.disconnect();
      chain.forEach((n) => n.disconnect());
    };
    return node;
  }
  tone(
    midi: number,
    t: number,
    dur: number,
    amp: number,
    type: OscillatorType,
    cutoff: number,
  ) {
    const g = this.ctx.createGain(),
      f = this.ctx.createBiquadFilter(),
      o = this.track(this.ctx.createOscillator(), [g, f]);
    o.type = type;
    o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    f.type = "lowpass";
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  hiss(t: number, dur: number, amp: number, high: number) {
    const g = this.ctx.createGain(),
      f = this.ctx.createBiquadFilter(),
      n = this.track(this.ctx.createBufferSource(), [g, f]);
    n.buffer = this.noise;
    f.type = "highpass";
    f.frequency.value = high;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f);
    f.connect(g);
    g.connect(this.master);
    n.start(t);
    n.stop(t + dur);
  }
  drum(hit: number, t: number) {
    if (hit === 1) {
      const g = this.ctx.createGain(),
        o = this.track(this.ctx.createOscillator(), [g]);
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      g.gain.setValueAtTime(0.65, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.23);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.25);
    } else if (hit === 2) {
      this.hiss(t, 0.12, 0.18, 1300);
      this.tone(50, t, 0.09, 0.12, "triangle", 1500);
    } else if (hit === 3) this.hiss(t, 0.035, 0.055, 6500);
  }
  schedule(step: number, time: number) {
    if (step === 0 && this.pending) {
      this.recipe = this.pending;
      this.pending = undefined;
      this.onApplied();
    }
    const r = this.recipe,
      pixel = r.mode === "pixel",
      hits: number[] = [];
    r.foods.forEach((food, i) => {
      if (r.muted[i]) return;
      const v = food.variant;
      if (i === 0 && bass[v][step] >= 0) {
        this.tone(
          bass[v][step],
          time,
          0.22,
          0.25,
          pixel ? "square" : "triangle",
          pixel ? 900 : 500,
        );
        hits.push(i);
      }
      if (i === 1 && drums[v][step]) {
        this.drum(drums[v][step], time);
        hits.push(i);
      }
      if (i === 2 && leads[v][step] >= 0) {
        this.tone(
          leads[v][step],
          time,
          0.25,
          0.075,
          pixel ? "square" : v ? "sine" : "triangle",
          pixel ? 2400 : 1800,
        );
        hits.push(i);
      }
      if (
        i === 3 &&
        ((v !== 1 && step % 8 === 0) || (v === 1 && step % 2 === 0))
      ) {
        if (v === 1)
          this.tone(
            chords[v][(step / 2) % 4],
            time,
            0.24,
            0.06,
            pixel ? "square" : "triangle",
            1800,
          );
        else
          chords[v].forEach((m) =>
            this.tone(m, time, 0.65, 0.035, pixel ? "triangle" : "sine", 1600),
          );
        hits.push(i);
      }
    });
    this.events.push({ step, time, hits });
  }
  tick = () => {
    if (!this.playing) return;
    let count = 0;
    while (this.next < this.ctx.currentTime + 0.1 && count++ < 32) {
      this.schedule(this.step, this.next);
      this.next +=
        (60 / this.recipe.bpm / 4) *
        (this.recipe.mode === "lofi" ? (this.step % 2 ? 0.88 : 1.12) : 1);
      this.step = (this.step + 1) % 16;
    }
  };
  draw = () => {
    if (!this.playing) return;
    let e;
    while (this.events.length && this.events[0].time <= this.ctx.currentTime)
      e = this.events.shift();
    if (e) this.onBeat(e.step, e.hits);
    this.frame = requestAnimationFrame(this.draw);
  };
  async start() {
    await this.ctx.resume();
    if (this.ctx.state !== "running") throw Error("请再次点击播放以启用声音。");
    this.playing = true;
    this.step = 0;
    const started = this.ctx.currentTime;
    this.next = started + 0.06;
    this.timer = setInterval(this.tick, 25);
    this.tick();
    this.draw();
    this.watchdog = setTimeout(() => {
      if (this.playing && this.ctx.currentTime - started < 0.1) {
        this.stop();
        this.onError("当前环境未能输出声音，请在浏览器中打开后重试。");
      }
    }, 1600);
  }
  stop() {
    this.playing = false;
    clearInterval(this.timer);
    clearTimeout(this.watchdog);
    cancelAnimationFrame(this.frame);
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {}
    }
    this.nodes.clear();
    this.events = [];
    if (this.pending) {
      this.recipe = this.pending;
      this.pending = undefined;
    }
    this.onBeat(-1, []);
    this.onApplied();
  }
  close() {
    this.stop();
    void this.ctx.close();
  }
}
