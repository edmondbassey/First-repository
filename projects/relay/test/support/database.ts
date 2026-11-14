import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { Database, Statement } from "../../lib/service.ts";
class Prepared implements Statement {
  db: DatabaseSync;
  sql: string;
  values: SQLInputValue[];
  constructor(db: DatabaseSync, sql: string, values: SQLInputValue[] = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: unknown[]) {
    return new Prepared(this.db, this.sql, values as SQLInputValue[]);
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.values) as T) ?? null;
  }
  execute() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { results: [], meta: { changes: Number(result.changes) } };
  }
}
export function database() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    raw.exec(
      readFileSync(new URL("../../drizzle/" + file, import.meta.url), "utf8"),
    );
  const db: Database = {
    prepare: (sql) => new Prepared(raw, sql),
    async batch(statements) {
      raw.exec("BEGIN");
      try {
        const results = statements.map((s) => (s as Prepared).execute());
        raw.exec("COMMIT");
        return results;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, raw };
}
