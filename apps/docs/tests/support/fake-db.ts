// An in-memory stand-in for @repo/database and the drizzle-orm operators, so
// server code runs its real queries against tables held in memory. Nothing
// connects to a database.
//
//   vi.mock("drizzle-orm", async () => (await import("../support/fake-db")).drizzle);
//   vi.mock("@repo/database", async () => (await import("../support/fake-db")).repoDatabase);
//   import { fakeDb } from "../support/fake-db";
//   fakeDb.seed("oauthApp", [{ id: "app_1", ... }]);
//
// Tables are addressed by their export name in packages/database/schema.ts
// ("oauthApp", "qrCode", ...). Column defaults are not known to the fake: set
// them per table with `fakeDb.defaults(table, {...})`.
//
// Supported: select/selectDistinct/selectDistinctOn with from, inner/left joins, where,
// orderBy (asc/desc/column), limit, offset, groupBy with count/sum/max/min,
// correlated exists/inArray subqueries; insert with values, returning,
// onConflictDoNothing/onConflictDoUpdate; update set/where/returning (with
// `sql` increments like sql`${col} + 1`, and json ->> 'key' reads); delete;
// transaction (rolled back when the callback throws); db.query.<table>
// findMany/findFirst without relations. Anything else throws, so a test can never pass
// on a query the fake silently misread.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Row = Record<string, unknown>;
type Ctx = Record<string, Row | null>;

export interface Column {
  __column: true;
  table: string;
  name: string;
}

interface SqlExpr {
  __sql: true;
  strings: readonly string[];
  values: unknown[];
  as?: string;
}

interface Aggregate {
  __aggregate: "count" | "countDistinct" | "sum" | "max" | "min" | "avg";
  column?: unknown;
}

interface Order {
  __order: "asc" | "desc";
  expr: unknown;
}

type Predicate = { __predicate: true; test: (ctx: Ctx) => boolean };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isColumn = (value: unknown): value is Column =>
  isObject(value) && value.__column === true;
const isSql = (value: unknown): value is SqlExpr =>
  isObject(value) && value.__sql === true;
const isAggregate = (value: unknown): value is Aggregate =>
  isObject(value) && typeof value.__aggregate === "string";
const isPredicate = (value: unknown): value is Predicate =>
  isObject(value) && value.__predicate === true;
const isQuery = (value: unknown): value is SelectQuery =>
  isObject(value) && typeof value.__run === "function";

// ─── Storage ────────────────────────────────────────────────────────────────

const tables = new Map<string, Row[]>();
const tableDefaults = new Map<string, () => Row>();
const uniqueKeys = new Map<string, string[][]>();

function rowsOf(table: string): Row[] {
  let rows = tables.get(table);
  if (!rows) {
    rows = [];
    tables.set(table, rows);
  }
  return rows;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const fakeDb = {
  /** Empties every table (defaults and unique keys are kept). */
  reset() {
    tables.clear();
  },
  /** Forgets defaults and unique keys too. */
  resetAll() {
    tables.clear();
    tableDefaults.clear();
    uniqueKeys.clear();
  },
  /** Values a real column default would fill in on insert. */
  defaults(table: string, values: Row | (() => Row)) {
    tableDefaults.set(
      table,
      typeof values === "function" ? values : () => clone(values),
    );
  },
  /** Columns that must be unique together (for inserts and onConflict). */
  unique(table: string, ...columns: string[]) {
    const list = uniqueKeys.get(table) ?? [];
    list.push(columns);
    uniqueKeys.set(table, list);
  },
  seed(table: string, rows: Row[]) {
    for (const row of rows) insertRow(table, row, "error");
  },
  /** The live rows of a table (mutating them changes the table). */
  rows(table: string): Row[] {
    return rowsOf(table);
  },
  find(table: string, match: Row): Row | undefined {
    return rowsOf(table).find((row) =>
      Object.entries(match).every(([key, value]) => same(row[key], value)),
    );
  },
};

// ─── Values and comparison ──────────────────────────────────────────────────

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  return a === b;
}

function comparable(value: unknown): number | string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as number | string;
}

function compare(a: unknown, b: unknown): number {
  const x = comparable(a);
  const y = comparable(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1; // nulls last, like Postgres ascending
  if (y === null) return -1;
  return x < y ? -1 : x > y ? 1 : 0;
}

function evaluate(expr: unknown, ctx: Ctx): unknown {
  if (isColumn(expr)) {
    if (!(expr.table in ctx)) {
      throw new Error(
        `fake-db: column ${expr.table}.${expr.name} is not in this query`,
      );
    }
    return ctx[expr.table]?.[expr.name] ?? null;
  }
  if (isPredicate(expr)) return expr.test(ctx);
  if (isSql(expr)) return evaluateSql(expr, ctx);
  if (isQuery(expr)) return expr.__run(ctx).map((row) => Object.values(row)[0]);
  return expr;
}

/** The few raw-SQL shapes app code uses, recognized by their text. */
function evaluateSql(expr: SqlExpr, ctx: Ctx): unknown {
  const text = expr.strings
    .map((part, i) => (i < expr.values.length ? `${part}$${i}` : part))
    .join("")
    .trim()
    .replace(/\s+/g, " ");
  const v = (i: number) => evaluate(expr.values[i], ctx);
  let match = text.match(/^\$0 ([+-]) (\d+|\$1)$/);
  if (match) {
    const left = Number(v(0) ?? 0);
    const right = match[2] === "$1" ? Number(v(1)) : Number(match[2]);
    return match[1] === "+" ? left + right : left - right;
  }
  match = text.match(/^coalesce\(\$0, (\d+|\$1)\) ([+-]) (\d+|\$\d)$/i);
  if (match) {
    const base = v(0) ?? (match[1] === "$1" ? v(1) : Number(match[1]));
    const delta = match[3]?.startsWith("$")
      ? Number(v(Number(match[3].slice(1))))
      : Number(match[3]);
    return match[2] === "+" ? Number(base) + delta : Number(base) - delta;
  }
  // JSON text extraction: data->>'key', optionally compared with a value.
  match = text.match(/^\$0->>'([\w-]+)'( = \$1)?$/);
  if (match) {
    const json = v(0);
    const field = isObject(json) ? json[match[1] as string] : undefined;
    const value =
      field == null
        ? null
        : typeof field === "object"
          ? JSON.stringify(field)
          : String(field);
    return match[2] ? value !== null && value === String(v(1)) : value;
  }
  if (/^now\(\)$/i.test(text)) return new Date();
  if (text === "1" || text === "true") return text === "1" ? 1 : true;
  if (/^\$0$/.test(text)) return v(0);
  throw new Error(`fake-db: unsupported sql\`${text}\``);
}

function predicate(test: (ctx: Ctx) => boolean): Predicate {
  return { __predicate: true, test };
}

function truthy(expr: unknown, ctx: Ctx): boolean {
  if (expr === undefined) return true;
  return Boolean(evaluate(expr, ctx));
}

function likeRegex(pattern: string, flags: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i] as string;
    if (char === "\\" && i + 1 < pattern.length) {
      source += (pattern[++i] as string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (char === "%") source += ".*";
    else if (char === "_") source += ".";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, flags);
}

// ─── drizzle-orm operators ──────────────────────────────────────────────────

function sqlTag(strings: TemplateStringsArray, ...values: unknown[]): SqlExpr {
  const expr: SqlExpr = { __sql: true, strings: [...strings], values };
  return Object.assign(expr, {
    as(alias: string) {
      expr.as = alias;
      return expr;
    },
    mapWith() {
      return expr;
    },
  });
}
sqlTag.raw = (text: string): SqlExpr => ({
  __sql: true,
  strings: [text],
  values: [],
});

export const drizzle = {
  eq: (a: unknown, b: unknown) =>
    predicate((ctx) => same(evaluate(a, ctx), evaluate(b, ctx))),
  ne: (a: unknown, b: unknown) =>
    predicate((ctx) => !same(evaluate(a, ctx), evaluate(b, ctx))),
  gt: (a: unknown, b: unknown) =>
    predicate((ctx) => {
      const x = evaluate(a, ctx);
      return x != null && compare(x, evaluate(b, ctx)) > 0;
    }),
  gte: (a: unknown, b: unknown) =>
    predicate((ctx) => {
      const x = evaluate(a, ctx);
      return x != null && compare(x, evaluate(b, ctx)) >= 0;
    }),
  lt: (a: unknown, b: unknown) =>
    predicate((ctx) => {
      const x = evaluate(a, ctx);
      return x != null && compare(x, evaluate(b, ctx)) < 0;
    }),
  lte: (a: unknown, b: unknown) =>
    predicate((ctx) => {
      const x = evaluate(a, ctx);
      return x != null && compare(x, evaluate(b, ctx)) <= 0;
    }),
  isNull: (a: unknown) => predicate((ctx) => evaluate(a, ctx) == null),
  isNotNull: (a: unknown) => predicate((ctx) => evaluate(a, ctx) != null),
  and: (...parts: unknown[]) =>
    predicate((ctx) => parts.every((part) => truthy(part, ctx))),
  or: (...parts: unknown[]) =>
    predicate((ctx) =>
      parts.some((part) => part !== undefined && truthy(part, ctx)),
    ),
  not: (part: unknown) => predicate((ctx) => !truthy(part, ctx)),
  inArray: (a: unknown, list: unknown) =>
    predicate((ctx) => {
      const values = evaluate(list, ctx) as unknown[];
      const value = evaluate(a, ctx);
      return values.some((item) => same(item, value));
    }),
  notInArray: (a: unknown, list: unknown) =>
    predicate((ctx) => {
      const values = evaluate(list, ctx) as unknown[];
      const value = evaluate(a, ctx);
      return !values.some((item) => same(item, value));
    }),
  like: (a: unknown, pattern: string) =>
    predicate((ctx) =>
      likeRegex(pattern, "s").test(String(evaluate(a, ctx) ?? "\u0000")),
    ),
  ilike: (a: unknown, pattern: string) =>
    predicate((ctx) => {
      const value = evaluate(a, ctx);
      return value != null && likeRegex(pattern, "is").test(String(value));
    }),
  exists: (query: SelectQuery) =>
    predicate((ctx) => query.__run(ctx).length > 0),
  notExists: (query: SelectQuery) =>
    predicate((ctx) => query.__run(ctx).length === 0),
  count: (column?: unknown): Aggregate => ({ __aggregate: "count", column }),
  countDistinct: (column: unknown): Aggregate => ({
    __aggregate: "countDistinct",
    column,
  }),
  sum: (column: unknown): Aggregate => ({ __aggregate: "sum", column }),
  max: (column: unknown): Aggregate => ({ __aggregate: "max", column }),
  min: (column: unknown): Aggregate => ({ __aggregate: "min", column }),
  avg: (column: unknown): Aggregate => ({ __aggregate: "avg", column }),
  asc: (expr: unknown): Order => ({ __order: "asc", expr }),
  desc: (expr: unknown): Order => ({ __order: "desc", expr }),
  sql: sqlTag,
  // Schema-only helpers some modules import; the fake ignores relations.
  relations: () => ({}),
  getTableColumns: () => {
    throw new Error("fake-db: getTableColumns is not supported");
  },
};

// ─── Queries ────────────────────────────────────────────────────────────────

type Shape = Record<string, unknown>;

interface SelectQuery extends PromiseLike<Row[]> {
  __run: (outer?: Ctx) => Row[];
}

function project(ctx: Ctx, shape: Shape | undefined, base: string): Row {
  if (!shape) {
    const joined = Object.keys(ctx);
    if (joined.length === 1) return clone(ctx[base] as Row);
    return Object.fromEntries(
      joined.map((name) => [name, ctx[name] ? clone(ctx[name]) : null]),
    );
  }
  const out: Row = {};
  for (const [key, expr] of Object.entries(shape)) {
    if (isColumn(expr) || isSql(expr) || isPredicate(expr)) {
      const value = evaluate(expr, ctx);
      out[key] = value instanceof Date ? new Date(value) : clone(value);
    } else if (isObject(expr) && !isAggregate(expr)) {
      out[key] = project(ctx, expr as Shape, base);
    } else {
      out[key] = expr;
    }
  }
  return out;
}

function aggregate(group: Ctx[], agg: Aggregate): unknown {
  const values = agg.column
    ? group.map((ctx) => evaluate(agg.column, ctx)).filter((v) => v != null)
    : group;
  switch (agg.__aggregate) {
    case "count":
      return values.length;
    case "countDistinct":
      return new Set(values.map((v) => JSON.stringify(v))).size;
    case "sum":
      return values.length
        ? values.reduce((total: number, v) => total + Number(v), 0)
        : null;
    case "avg":
      return values.length
        ? values.reduce((total: number, v) => total + Number(v), 0) /
            values.length
        : null;
    case "max":
      return values.length
        ? values.reduce((a, b) => (compare(a, b) >= 0 ? a : b))
        : null;
    case "min":
      return values.length
        ? values.reduce((a, b) => (compare(a, b) <= 0 ? a : b))
        : null;
  }
}

function hasAggregate(shape: Shape | undefined): boolean {
  return Boolean(
    shape &&
      Object.values(shape).some(
        (expr) =>
          isAggregate(expr) ||
          (isObject(expr) &&
            !isColumn(expr) &&
            !isSql(expr) &&
            hasAggregate(expr as Shape)),
      ),
  );
}

function projectGroup(group: Ctx[], shape: Shape, base: string): Row {
  const out: Row = {};
  for (const [key, expr] of Object.entries(shape)) {
    if (isAggregate(expr)) out[key] = aggregate(group, expr);
    else if (isColumn(expr) || isSql(expr))
      out[key] = group[0] ? evaluate(expr, group[0]) : null;
    else if (isObject(expr))
      out[key] = projectGroup(group, expr as Shape, base);
    else out[key] = expr;
  }
  return out;
}

function tableName(table: unknown): string {
  const name = isObject(table) ? table.__table : undefined;
  if (typeof name !== "string") {
    throw new Error("fake-db: expected a table from @repo/database");
  }
  return name;
}

/** `distinct`: true for SELECT DISTINCT, or the DISTINCT ON expressions. */
function select(
  shape?: Shape,
  distinct: boolean | unknown[] = false,
): { from: (t: unknown) => SelectQuery } {
  return {
    from(table: unknown) {
      const base = tableName(table);
      const joins: { table: string; on: unknown; kind: "inner" | "left" }[] =
        [];
      let where: unknown;
      let orders: unknown[] = [];
      let limit = Number.POSITIVE_INFINITY;
      let offset = 0;
      let groupBy: unknown[] | null = null;
      let having: unknown;

      const run = (outer: Ctx = {}): Row[] => {
        let ctxs: Ctx[] = rowsOf(base).map((row) => ({
          ...outer,
          [base]: row,
        }));
        for (const join of joins) {
          const next: Ctx[] = [];
          for (const ctx of ctxs) {
            const matches = rowsOf(join.table)
              .map((row) => ({ ...ctx, [join.table]: row }))
              .filter((joined) => truthy(join.on, joined));
            if (matches.length > 0) next.push(...matches);
            else if (join.kind === "left")
              next.push({ ...ctx, [join.table]: null });
          }
          ctxs = next;
        }
        ctxs = ctxs.filter((ctx) => truthy(where, ctx));

        let out: { ctx: Ctx; row: Row }[];
        if (groupBy || hasAggregate(shape)) {
          const groups = new Map<string, Ctx[]>();
          for (const ctx of ctxs) {
            const key = JSON.stringify(
              (groupBy ?? []).map((expr) => evaluate(expr, ctx)),
            );
            groups.set(key, [...(groups.get(key) ?? []), ctx]);
          }
          if (!groupBy && groups.size === 0) groups.set("[]", []);
          out = [...groups.values()]
            .filter((group) => {
              if (having === undefined) return true;
              if (isSql(having)) {
                const text = having.strings.join("$").replace(/\s+/g, " ");
                if (/^count\(\*\) = \$$/.test(text.trim())) {
                  return group.length === Number(having.values[0]);
                }
                throw new Error(`fake-db: unsupported having ${text}`);
              }
              return truthy(having, group[0] ?? {});
            })
            .map((group) => ({
              ctx: group[0] ?? {},
              row: projectGroup(group, shape ?? {}, base),
            }));
        } else {
          out = ctxs.map((ctx) => ({ ctx, row: project(ctx, shape, base) }));
        }

        if (orders.length > 0) {
          out.sort((a, b) => {
            for (const order of orders) {
              const { expr, dir } =
                isObject(order) && "__order" in order
                  ? {
                      expr: (order as unknown as Order).expr,
                      dir: (order as unknown as Order).__order,
                    }
                  : { expr: order, dir: "asc" as const };
              if (isSql(expr)) {
                const text = expr.strings.join("$").trim();
                if (/^\$ desc nulls last$/i.test(text)) {
                  const x = evaluate(expr.values[0], a.ctx);
                  const y = evaluate(expr.values[0], b.ctx);
                  if (x == null || y == null) {
                    if (x == null && y == null) continue;
                    return x == null ? 1 : -1;
                  }
                  const result = -compare(x, y);
                  if (result !== 0) return result;
                  continue;
                }
                throw new Error(`fake-db: unsupported orderBy sql ${text}`);
              }
              const result = compare(
                evaluate(expr, a.ctx),
                evaluate(expr, b.ctx),
              );
              if (result !== 0) return dir === "desc" ? -result : result;
            }
            return 0;
          });
        }
        if (Array.isArray(distinct)) {
          // DISTINCT ON keeps the first row (in ORDER BY order) of each key.
          const seen = new Set<string>();
          out = out.filter(({ ctx }) => {
            const key = JSON.stringify(
              distinct.map((expr) => evaluate(expr, ctx)),
            );
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        let rows = out.map(({ row }) => row);
        if (distinct === true) {
          const seen = new Set<string>();
          rows = rows.filter((row) => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        return rows.slice(offset, offset + limit);
      };

      const query: SelectQuery & Record<string, unknown> = {
        __run: run,
        innerJoin(t: unknown, on: unknown) {
          joins.push({ table: tableName(t), on, kind: "inner" });
          return query;
        },
        leftJoin(t: unknown, on: unknown) {
          joins.push({ table: tableName(t), on, kind: "left" });
          return query;
        },
        where(p: unknown) {
          where = p;
          return query;
        },
        orderBy(...exprs: unknown[]) {
          orders = exprs.flat();
          return query;
        },
        limit(n: number) {
          limit = n;
          return query;
        },
        offset(n: number) {
          offset = n;
          return query;
        },
        groupBy(...exprs: unknown[]) {
          groupBy = exprs.flat();
          return query;
        },
        having(p: unknown) {
          having = p;
          return query;
        },
        $dynamic() {
          return query;
        },
        as() {
          return query;
        },
        // biome-ignore lint/suspicious/noThenProperty: drizzle queries are awaitable
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => run())
            .then(resolve, reject);
        },
      };
      return query;
    },
  };
}

type ConflictMode = "error" | "nothing" | { set: Row };

function insertRow(table: string, value: Row, mode: ConflictMode): Row | null {
  const defaults = tableDefaults.get(table)?.() ?? {};
  const row: Row = { ...defaults };
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) row[key] = isSql(v) ? evaluateSql(v, {}) : clone(v);
  }
  const rows = rowsOf(table);
  for (const columns of uniqueKeys.get(table) ?? []) {
    const existing = rows.find((other) =>
      columns.every((c) => other[c] != null && same(other[c], row[c])),
    );
    if (!existing) continue;
    if (mode === "nothing") return null;
    if (mode === "error") {
      const error = new Error(
        `duplicate key value violates unique constraint (${table}.${columns.join(",")})`,
      ) as Error & { code: string };
      error.code = "23505";
      throw error;
    }
    applyPatch(table, existing, mode.set);
    return existing;
  }
  rows.push(row);
  return row;
}

function applyPatch(table: string, row: Row, patch: Row) {
  const ctx: Ctx = { [table]: row };
  const next: Row = {};
  for (const [key, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    next[key] = isSql(v) || isColumn(v) ? evaluate(v, ctx) : clone(v);
  }
  Object.assign(row, next);
}

function returningRows(table: string, rows: Row[], shape?: Shape): Row[] {
  return rows.map((row) => project({ [table]: row }, shape, table));
}

function insert(t: unknown) {
  const table = tableName(t);
  return {
    values(input: Row | Row[]) {
      const values = Array.isArray(input) ? input : [input];
      let mode: ConflictMode = "error";
      let shape: Shape | undefined;
      let wantReturning = false;
      const run = () => {
        const written: Row[] = [];
        for (const value of values) {
          const row = insertRow(table, value, mode);
          if (row) written.push(row);
        }
        return wantReturning ? returningRows(table, written, shape) : [];
      };
      const builder = {
        onConflictDoNothing() {
          mode = "nothing";
          return builder;
        },
        onConflictDoUpdate({ set }: { set: Row }) {
          mode = { set };
          return builder;
        },
        returning(s?: Shape) {
          wantReturning = true;
          shape = s;
          return builder;
        },
        // biome-ignore lint/suspicious/noThenProperty: drizzle queries are awaitable
        then(
          resolve: (rows: Row[]) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          return Promise.resolve().then(run).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function update(t: unknown) {
  const table = tableName(t);
  return {
    set(patch: Row) {
      let where: unknown;
      let shape: Shape | undefined;
      let wantReturning = false;
      const run = () => {
        const matched = rowsOf(table).filter((row) =>
          truthy(where, { [table]: row }),
        );
        for (const row of matched) applyPatch(table, row, patch);
        return wantReturning ? returningRows(table, matched, shape) : [];
      };
      const builder = {
        where(p: unknown) {
          where = p;
          return builder;
        },
        returning(s?: Shape) {
          wantReturning = true;
          shape = s;
          return builder;
        },
        // biome-ignore lint/suspicious/noThenProperty: drizzle queries are awaitable
        then(
          resolve: (rows: Row[]) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          return Promise.resolve().then(run).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function remove(t: unknown) {
  const table = tableName(t);
  let where: unknown;
  let shape: Shape | undefined;
  let wantReturning = false;
  const run = () => {
    const rows = rowsOf(table);
    const removed = rows.filter((row) => truthy(where, { [table]: row }));
    tables.set(
      table,
      rows.filter((row) => !removed.includes(row)),
    );
    return wantReturning ? returningRows(table, removed, shape) : [];
  };
  const builder = {
    where(p: unknown) {
      where = p;
      return builder;
    },
    returning(s?: Shape) {
      wantReturning = true;
      shape = s;
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: drizzle queries are awaitable
    then(resolve: (rows: Row[]) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve().then(run).then(resolve, reject);
    },
  };
  return builder;
}

const database = {
  select: (shape?: Shape) => select(shape),
  selectDistinct: (shape?: Shape) => select(shape, true),
  selectDistinctOn: (on: unknown[], shape?: Shape) => select(shape, on),
  insert,
  update,
  delete: remove,
  async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const snapshot = new Map(
      [...tables].map(([name, rows]) => [name, clone(rows)]),
    );
    try {
      return await fn(database);
    } catch (error) {
      tables.clear();
      for (const [name, rows] of snapshot) tables.set(name, rows);
      throw error;
    }
  },
  async batch(queries: PromiseLike<unknown>[]) {
    const results: unknown[] = [];
    for (const query of queries) results.push(await query);
    return results;
  },
  execute() {
    throw new Error("fake-db: db.execute is not supported");
  },
  /**
   * The relational API's findMany/findFirst with `columns`, `where` (a
   * condition or a `(table, operators) => condition` callback), `orderBy`
   * and `limit`. Relations (`with`) are not supported.
   */
  query: new Proxy({} as Record<string, RelationalTable>, {
    get(_target, name): RelationalTable | undefined {
      if (typeof name !== "string" || name === "then") return undefined;
      return {
        findMany: (options) => findRelational(name, options),
        findFirst: async (options) =>
          (await findRelational(name, { ...options, limit: 1 }))[0],
      };
    },
  }),
};

interface RelationalTable {
  findMany: (options?: RelationalOptions) => PromiseLike<Row[]>;
  findFirst: (options?: RelationalOptions) => Promise<Row | undefined>;
}

interface RelationalOptions {
  columns?: Record<string, boolean>;
  where?: unknown;
  orderBy?: unknown;
  limit?: number;
  offset?: number;
  with?: unknown;
}

function findRelational(
  name: string,
  {
    columns,
    where,
    orderBy,
    limit,
    offset,
    with: relations,
  }: RelationalOptions = {},
): PromiseLike<Row[]> {
  if (relations !== undefined) {
    throw new Error("fake-db: relational `with` is not supported");
  }
  const target = repoDatabase[name];
  if (!(isObject(target) && typeof target.__table === "string")) {
    throw new Error(`fake-db: unknown table ${name}`);
  }
  const resolve = (value: unknown) =>
    typeof value === "function" ? value(target, drizzle) : value;
  let shape: Shape | undefined;
  if (columns) {
    const picked = Object.entries(columns).filter(([, on]) => on);
    if (picked.length === 0) {
      throw new Error("fake-db: exclusive `columns` are not supported");
    }
    shape = Object.fromEntries(
      picked.map(([column]) => [column, (target as Shape)[column]]),
    );
  }
  const query = select(shape).from(target) as SelectQuery &
    Record<string, (...args: unknown[]) => SelectQuery>;
  if (where !== undefined) query.where(resolve(where));
  if (orderBy !== undefined) {
    const order = resolve(orderBy);
    query.orderBy(...(Array.isArray(order) ? order : [order]));
  }
  if (limit !== undefined) query.limit(limit);
  if (offset !== undefined) query.offset(offset);
  return query;
}

// ─── The @repo/database module ──────────────────────────────────────────────

function table(name: string) {
  const columns = new Map<string, Column>();
  return new Proxy(
    { __table: name },
    {
      get(target, prop) {
        if (prop === "__table") return target.__table;
        if (typeof prop !== "string" || prop === "then") return undefined;
        let column = columns.get(prop);
        if (!column) {
          column = { __column: true, table: name, name: prop };
          columns.set(prop, column);
        }
        return column;
      },
    },
  );
}

const schemaPath = fileURLToPath(
  new URL("../../../../packages/database/schema.ts", import.meta.url),
);
const schemaSource = readFileSync(schemaPath, "utf8");
const TABLE_NAMES = [
  ...schemaSource.matchAll(/^export const (\w+) = pgTable\(/gm),
].map((match) => match[1] as string);
// The schema's string-list constants (SCAN_DEVICE_TYPES, QR_CODE_KINDS, ...).
const STRING_LISTS = [
  ...schemaSource.matchAll(/^export const (\w+) = \[([^\]]*)\] as const;/gm),
].map((match) => [
  match[1] as string,
  [...(match[2] as string).matchAll(/"([^"]*)"/g)].map((item) => item[1]),
]);

export const repoDatabase: Record<string, unknown> = {
  database,
  eq: drizzle.eq,
  ...Object.fromEntries(STRING_LISTS),
  ...Object.fromEntries(TABLE_NAMES.map((name) => [name, table(name)])),
};
