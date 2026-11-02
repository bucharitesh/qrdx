// An in-memory stand-in for the Upstash client that @repo/rate-limit exports
// as `redis`: the few string and sorted-set commands app code uses, plus
// pipeline()/multi(). Values come back the way Upstash deserializes them
// (numbers for scores, parsed JSON where it parses). `failing = true` makes
// every command reject, like an unreachable Upstash. Nothing touches the
// network.
//
//   const state = vi.hoisted(() => ({ redis: null as FakeRedis | null }));
//   vi.mock("@repo/rate-limit", async () => {
//     const { FakeRedis } = await import("../support/fake-redis");
//     state.redis = new FakeRedis();
//     return { redis: state.redis };
//   });

type Bound = number | "-inf" | "+inf";

const parse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const bound = (value: Bound) =>
  value === "-inf"
    ? Number.NEGATIVE_INFINITY
    : value === "+inf"
      ? Number.POSITIVE_INFINITY
      : value;

export class FakeRedis {
  strings = new Map<string, string>();
  sets = new Map<string, Map<string, number>>();
  /** Seconds, as last set by expire / set ex */
  ttl = new Map<string, number>();
  failing = false;
  /** Command names in call order (pipelined ones included). */
  calls: string[] = [];

  reset() {
    this.strings.clear();
    this.sets.clear();
    this.ttl.clear();
    this.failing = false;
    this.calls = [];
  }

  /** Members of a sorted set, lowest score first. */
  members(key: string): [string, number][] {
    return [...(this.sets.get(key) ?? new Map())].sort((a, b) => a[1] - b[1]);
  }

  private run<T>(name: string, apply: () => T): T {
    this.calls.push(name);
    if (this.failing) throw new Error("fake-redis: unreachable");
    return apply();
  }

  private ops = {
    set: (key: string, value: string, opts?: { ex?: number }) => {
      this.strings.set(key, value);
      if (opts?.ex) this.ttl.set(key, opts.ex);
      return "OK";
    },
    get: (key: string) => {
      const value = this.strings.get(key);
      return value === undefined ? null : parse(value);
    },
    mget: (...keys: string[]) => keys.map((key) => this.ops.get(key)),
    zadd: (key: string, ...items: unknown[]) => {
      const set = this.sets.get(key) ?? new Map<string, number>();
      let added = 0;
      for (const item of items) {
        const { score, member } = item as { score: number; member: string };
        if (typeof score !== "number") {
          throw new Error("fake-redis: zadd options aren't supported");
        }
        if (!set.has(member)) added++;
        set.set(member, score);
      }
      this.sets.set(key, set);
      return added;
    },
    zscore: (key: string, member: string) =>
      this.sets.get(key)?.get(member) ?? null,
    zrange: (
      key: string,
      start: number,
      stop: number,
      opts?: { withScores?: boolean },
    ) => {
      const all = this.members(key);
      const slice = all.slice(start, stop === -1 ? undefined : stop + 1);
      return opts?.withScores ? slice.flat() : slice.map(([member]) => member);
    },
    zrem: (key: string, ...members: string[]) => {
      const set = this.sets.get(key);
      let removed = 0;
      for (const member of members) if (set?.delete(member)) removed++;
      if (set?.size === 0) this.sets.delete(key);
      return removed;
    },
    zremrangebyscore: (key: string, min: Bound, max: Bound) => {
      const set = this.sets.get(key);
      let removed = 0;
      for (const [member, score] of set ?? []) {
        if (score >= bound(min) && score <= bound(max)) {
          set?.delete(member);
          removed++;
        }
      }
      if (set?.size === 0) this.sets.delete(key);
      return removed;
    },
    expire: (key: string, seconds: number) => {
      if (!(this.strings.has(key) || this.sets.has(key))) return 0;
      this.ttl.set(key, seconds);
      return 1;
    },
  };

  set = async (...args: Parameters<FakeRedis["ops"]["set"]>) =>
    this.run("set", () => this.ops.set(...args));
  get = async (key: string) => this.run("get", () => this.ops.get(key));
  mget = async (...keys: string[]) =>
    this.run("mget", () => this.ops.mget(...keys));
  zadd = async (key: string, ...items: unknown[]) =>
    this.run("zadd", () => this.ops.zadd(key, ...items));
  zscore = async (key: string, member: string) =>
    this.run("zscore", () => this.ops.zscore(key, member));
  zrange = async (...args: Parameters<FakeRedis["ops"]["zrange"]>) =>
    this.run("zrange", () => this.ops.zrange(...args));
  zrem = async (key: string, ...members: string[]) =>
    this.run("zrem", () => this.ops.zrem(key, ...members));
  zremrangebyscore = async (key: string, min: Bound, max: Bound) =>
    this.run("zremrangebyscore", () =>
      this.ops.zremrangebyscore(key, min, max),
    );
  expire = async (key: string, seconds: number) =>
    this.run("expire", () => this.ops.expire(key, seconds));

  pipeline = () => this.batch();
  /** MULTI/EXEC: applied together, after every command was queued. */
  multi = () => this.batch();

  private batch() {
    const queued: (() => unknown)[] = [];
    const ops = this.ops as Record<string, (...args: unknown[]) => unknown>;
    const chain: Record<string, unknown> = {
      exec: async () => {
        if (queued.length === 0) throw new Error("Pipeline is empty");
        return this.run("exec", () => queued.map((apply) => apply()));
      },
    };
    for (const name of Object.keys(ops)) {
      chain[name] = (...args: unknown[]) => {
        queued.push(() => {
          this.calls.push(name);
          return ops[name]?.(...args);
        });
        return chain;
      };
    }
    return chain;
  }
}
