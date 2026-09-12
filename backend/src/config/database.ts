// Database read/write connection pools (v2.0.0).
//
// Supabase-compatible query builder over raw pg pools.
// All SELECTs route through dbRead (replica when configured), all
// INSERT/UPDATE/DELETE route through dbWrite (primary).
//
// The exported dbRead/dbWrite objects expose the same .from().select().eq()
// chainable API that controllers already use, so zero controller changes needed.
import dotenv from 'dotenv';
import { Pool, QueryResult } from 'pg';
import {
  primaryPool,
  replicaPool,
  isNeonConfigured,
  isReplicaConfigured,
  healthState,
  queryRead as neonQueryRead,
  queryWrite as neonQueryWrite,
} from './neonPool';

dotenv.config();

// ------------------------------------------------------------------ helpers
function escapeIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function parseColumns(selectExpr: string): string {
  if (selectExpr === '*') return '*';
  return selectExpr.split(',').map((c) => c.trim()).map(escapeIdent).join(', ');
}

// Foreign key definitions for PostgREST-style joins
const FK_MAP: Record<string, { table: string; fkCol: string; pkCol: string; alias: string }> = {
  'inventory(name, category)':                { table: 'inventory', fkCol: 'inventory_id', pkCol: 'id', alias: 'inventory' },
  'inventory(name, available_quantity)':      { table: 'inventory', fkCol: 'inventory_id', pkCol: 'id', alias: 'inventory' },
  'inventory(name)':                          { table: 'inventory', fkCol: 'inventory_id', pkCol: 'id', alias: 'inventory' },
  'users(name, email, role)':                 { table: 'users',     fkCol: 'user_id',      pkCol: 'id', alias: 'users' },
  'users(name, email, roll_number)':          { table: 'users',     fkCol: 'user_id',      pkCol: 'id', alias: 'users' },
  'users(name, email)':                       { table: 'users',     fkCol: 'user_id',      pkCol: 'id', alias: 'users' },
};

// ------------------------------------------------------------------ types
interface QueryState {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete';
  columns?: string;
  data?: Record<string, unknown>[];
  updates?: Record<string, unknown>;
  filters: Array<{ type: string; column: string; value: unknown; op?: string }>;
  orderBy?: { column: string; ascending: boolean };
  limitCount?: number;
  singleResult?: boolean;
  maybeSingle?: boolean;
  countOnly?: boolean;
  countExact?: boolean;
  selectOptions?: { count?: string; head?: boolean };
  returnColumns?: string;
}

// ---------------------------------------------------------------- QueryBuilder
class QueryBuilder {
  private state: QueryState;

  constructor(table: string) {
    this.state = { table, operation: 'select', columns: '*', filters: [] };
  }

  select(columns: string = '*', options?: { count?: string; head?: boolean }): this {
    if (this.state.operation === 'select') {
      this.state.columns = columns;
      if (options) {
        this.state.selectOptions = options;
        if (options.head) {
          this.state.countOnly = true;
          this.state.countExact = options.count === 'exact';
        }
      }
    } else {
      this.state.returnColumns = columns;
    }
    return this;
  }

  insert(data: Record<string, unknown>[]): this {
    this.state.operation = 'insert';
    this.state.data = data;
    return this;
  }

  update(data: Record<string, unknown>): this {
    this.state.operation = 'update';
    this.state.updates = data;
    return this;
  }

  delete(): this {
    this.state.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.state.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.state.filters.push({ type: 'neq', column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.state.filters.push({ type: 'gt', column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.state.filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.state.filters.push({ type: 'lt', column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.state.filters.push({ type: 'lte', column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.state.filters.push({ type: 'in', column, value: values });
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.state.filters.push({ type: 'ilike', column, value: pattern });
    return this;
  }

  is(column: string, value: null): this {
    this.state.filters.push({ type: 'is_null', column, value });
    return this;
  }

  not(column: string, op: string, value: unknown): this {
    if (op === 'is' && value === null) {
      this.state.filters.push({ type: 'is_not_null', column, value });
    }
    return this;
  }

  or(filterStr: string): this {
    this.state.filters.push({ type: 'or', column: '', value: filterStr });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.state.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.state.limitCount = count;
    return this;
  }

  single(): Promise<SupabaseResult> {
    this.state.singleResult = true;
    return this.execute();
  }

  maybeSingle(): Promise<SupabaseResult> {
    this.state.maybeSingle = true;
    this.state.singleResult = true;
    return this.execute();
  }

  then<TResult1 = SupabaseResult, TResult2 = never>(
    onFulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onFulfilled, onRejected);
  }

  // Terminal: execute the built query
  async execute(): Promise<SupabaseResult> {
    try {
      switch (this.state.operation) {
        case 'select': return this.executeSelect();
        case 'insert': return this.executeInsert();
        case 'update': return this.executeUpdate();
        case 'delete': return this.executeDelete();
        default: return { data: null, error: { message: 'Unknown operation', code: '' } };
      }
    } catch (err: any) {
      return { data: null, error: { message: err.message, code: err.code || '' } };
    }
  }

  // ------------------------------------------------------------- SELECT
  private async executeSelect(): Promise<SupabaseResult> {
    const { table, columns, filters, orderBy, limitCount, singleResult, countOnly, countExact } = this.state;

    // Handle joins
    const joinEntries = Object.entries(FK_MAP).filter(([key]) => columns?.includes(key));
    const hasJoins = joinEntries.length > 0;

    // Extract base columns (non-join parts)
    let baseColumns = columns || '*';
    const joinParts: string[] = [];

    if (hasJoins) {
      // Parse columns: split by comma, separate join expressions from plain columns
      const parts = columns?.split(',').map((p) => p.trim()) || ['*'];
      const plainCols: string[] = [];
      for (const part of parts) {
        if (FK_MAP[part]) {
          const fk = FK_MAP[part];
          const joinCols = part.slice(part.indexOf('(') + 1, -1).split(',').map((c) => c.trim());
          for (const jc of joinCols) {
            joinParts.push(`${escapeIdent(fk.alias)}.${escapeIdent(jc)} AS ${escapeIdent(`${fk.alias}_${jc}`)}`);
          }
          joinParts.push(`${escapeIdent(fk.alias)}.${escapeIdent(fk.pkCol)} AS ${escapeIdent(`${fk.alias}_${fk.pkCol}`)}`);
        } else {
          plainCols.push(part);
        }
      }
      baseColumns = plainCols.length > 0 ? plainCols.map(escapeIdent).join(', ') : `${escapeIdent(table)}.*`;
    } else {
      baseColumns = columns === '*' ? `${escapeIdent(table)}.*` : parseColumns(columns || '*');
    }

    const allSelectCols = hasJoins
      ? `${baseColumns}, ${joinParts.join(', ')}`
      : (countOnly ? '*' : baseColumns);

    let sql = countOnly
      ? `SELECT COUNT(*) AS total FROM ${escapeIdent(table)}`
      : `SELECT ${allSelectCols} FROM ${escapeIdent(table)}`;

    // Add JOINs
    if (hasJoins) {
      for (const [, fk] of joinEntries) {
        sql += ` LEFT JOIN ${escapeIdent(fk.table)} AS ${escapeIdent(fk.alias)} ON ${escapeIdent(table)}.${escapeIdent(fk.fkCol)} = ${escapeIdent(fk.alias)}.${escapeIdent(fk.pkCol)}`;
      }
    }

    const values: unknown[] = [];
    let paramIdx = 1;
    const whereClauses: string[] = [];

    for (const filter of filters) {
      const clause = this.buildFilterClause(filter, values, paramIdx);
      if (clause) {
        whereClauses.push(clause.sql);
        paramIdx = clause.nextIdx;
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (!countOnly && orderBy) {
      sql += ` ORDER BY ${escapeIdent(table)}.${escapeIdent(orderBy.column)} ${orderBy.ascending ? 'ASC' : 'DESC'}`;
    }

    if (countOnly) {
      const result = await poolQuery(sql, values);
      const total = parseInt(result.rows[0]?.total || '0', 10);
      return { data: null, count: total, error: null };
    }

    if (limitCount !== undefined) {
      sql += ` LIMIT ${Math.max(1, Math.min(limitCount, 1000))}`;
    } else if (singleResult) {
      sql += ` LIMIT 1`;
    }

    const result = await poolQuery(sql, values);

    // Unflatten join columns
    const rows = result.rows.map((row) => this.unflattenRow(row, columns || '*'));

    if (singleResult) {
      if (rows.length === 0) {
        if (this.state.maybeSingle) {
          return { data: null, error: null };
        }
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    }

    return { data: rows, error: null };
  }

  // ------------------------------------------------------------- INSERT
  private async executeInsert(): Promise<SupabaseResult> {
    const { table, data, returnColumns } = this.state;
    if (!data || data.length === 0) {
      return { data: null, error: { message: 'No data provided', code: '' } };
    }

    const row = data[0];
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = cols.map((c) => row[c]);

    const returningCols = returnColumns ? parseColumns(returnColumns) : '*';
    const sql = `INSERT INTO ${escapeIdent(table)} (${cols.map(escapeIdent).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${returningCols}`;

    const result = await poolQuery(sql, values);
    return { data: result.rows[0] || null, error: null };
  }

  // ------------------------------------------------------------- UPDATE
  private async executeUpdate(): Promise<SupabaseResult> {
    const { table, updates, filters, returnColumns, singleResult } = this.state;
    if (!updates) {
      return { data: null, error: { message: 'No updates provided', code: '' } };
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${escapeIdent(col)} = $${paramIdx}`);
      values.push(val);
      paramIdx++;
    }

    let sql = `UPDATE ${escapeIdent(table)} SET ${setClauses.join(', ')}`;

    const whereClauses: string[] = [];
    for (const filter of filters) {
      const clause = this.buildFilterClause(filter, values, paramIdx);
      if (clause) {
        whereClauses.push(clause.sql);
        paramIdx = clause.nextIdx;
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const returningCols = returnColumns ? parseColumns(returnColumns) : '*';
    sql += ` RETURNING ${returningCols}`;

    const result = await poolQuery(sql, values);

    if (singleResult) {
      if (result.rows.length === 0) {
        return { data: null, error: null };
      }
      return { data: result.rows[0], error: null };
    }

    return { data: result.rows, error: null };
  }

  // ------------------------------------------------------------- DELETE
  private async executeDelete(): Promise<SupabaseResult> {
    const { table, filters, returnColumns, singleResult } = this.state;

    let sql = `DELETE FROM ${escapeIdent(table)}`;
    const values: unknown[] = [];
    let paramIdx = 1;
    const whereClauses: string[] = [];

    for (const filter of filters) {
      const clause = this.buildFilterClause(filter, values, paramIdx);
      if (clause) {
        whereClauses.push(clause.sql);
        paramIdx = clause.nextIdx;
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (returnColumns) {
      const returningCols = parseColumns(returnColumns);
      sql += ` RETURNING ${returningCols}`;
      const result = await poolQuery(sql, values);
      if (singleResult) {
        if (result.rows.length === 0) {
          return { data: null, error: null };
        }
        return { data: result.rows[0], error: null, count: result.rowCount ?? 0 };
      }
      return { data: result.rows, error: null, count: result.rowCount ?? 0 };
    }

    const result = await poolQuery(sql, values);
    return { data: null, error: null, count: result.rowCount ?? 0 };
  }

  // ------------------------------------------------------------- filter builder
  private buildFilterClause(
    filter: { type: string; column: string; value: unknown; op?: string },
    values: unknown[],
    startIdx: number,
  ): { sql: string; nextIdx: number } | null {
    let idx = startIdx;

    switch (filter.type) {
      case 'eq':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} = $${idx}`, nextIdx: idx + 1 };
      case 'neq':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} != $${idx}`, nextIdx: idx + 1 };
      case 'gt':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} > $${idx}`, nextIdx: idx + 1 };
      case 'gte':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} >= $${idx}`, nextIdx: idx + 1 };
      case 'lt':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} < $${idx}`, nextIdx: idx + 1 };
      case 'lte':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} <= $${idx}`, nextIdx: idx + 1 };
      case 'ilike':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} ILIKE $${idx}`, nextIdx: idx + 1 };
      case 'in': {
        const arr = filter.value as unknown[];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const placeholders = arr.map(() => { idx++; return `$${idx - 1}`; });
        values.push(...arr);
        return { sql: `${escapeIdent(filter.column)} IN (${placeholders.join(', ')})`, nextIdx: idx };
      }
      case 'is_null':
        return { sql: `${escapeIdent(filter.column)} IS NULL`, nextIdx: idx };
      case 'is_not_null':
        return { sql: `${escapeIdent(filter.column)} IS NOT NULL`, nextIdx: idx };
      case 'or': {
        // Parse Supabase or() syntax: "col1.op1.val1,col2.op2.val2"
        const filterStr = filter.value as string;
        const conditions = this.parseOrFilter(filterStr, values, idx);
        values.push(...conditions.newValues);
        return { sql: `(${conditions.sql})`, nextIdx: idx + conditions.newValues.length };
      }
      default:
        return null;
    }
  }

  private parseOrFilter(
    filterStr: string,
    _existingValues: unknown[],
    startIdx: number,
  ): { sql: string; newValues: unknown[] } {
    const parts = filterStr.split(',');
    const clauses: string[] = [];
    const newValues: unknown[] = [];
    let idx = startIdx;

    for (const part of parts) {
      // Format: column.operator.value
      const dotIdx = part.indexOf('.');
      if (dotIdx === -1) continue;

      const column = part.substring(0, dotIdx);
      const rest = part.substring(dotIdx + 1);

      // Find the operator boundary
      const ops = ['ilike', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
      let matchedOp = '';
      let value = '';

      for (const op of ops) {
        if (rest.startsWith(op + '.')) {
          matchedOp = op;
          value = rest.substring(op.length + 1);
          break;
        }
      }

      if (!matchedOp) continue;

      newValues.push(value);
      switch (matchedOp) {
        case 'ilike':
          clauses.push(`${escapeIdent(column)} ILIKE $${idx}`);
          break;
        case 'eq':
          clauses.push(`${escapeIdent(column)} = $${idx}`);
          break;
        case 'neq':
          clauses.push(`${escapeIdent(column)} != $${idx}`);
          break;
        default:
          clauses.push(`${escapeIdent(column)} ${matchedOp === 'gt' ? '>' : matchedOp === 'gte' ? '>=' : matchedOp === 'lt' ? '<' : '<='} $${idx}`);
      }
      idx++;
    }

    return { sql: clauses.join(' OR '), newValues };
  }

  // ------------------------------------------------------------- unflatten joins
  private unflattenRow(row: Record<string, unknown>, columns: string): Record<string, unknown> {
    if (!columns.includes('(')) return row;

    const result: Record<string, unknown> = {};
    const joinObjects: Record<string, Record<string, unknown>> = {};

    for (const [key, val] of Object.entries(row)) {
      const joinMatch = key.match(/^(\w+)_(.+)$/);
      if (joinMatch) {
        const [, alias, colName] = joinMatch;
        const fkEntry = Object.values(FK_MAP).find((f) => f.alias === alias);
        if (fkEntry) {
          if (!joinObjects[alias]) joinObjects[alias] = {};
          joinObjects[alias][colName] = val;
          continue;
        }
      }
      result[key] = val;
    }

    // Also add base table columns
    for (const [key, val] of Object.entries(row)) {
      if (!key.includes('_')) {
        result[key] = val;
      }
    }

    for (const [alias, obj] of Object.entries(joinObjects)) {
      result[alias] = obj;
    }

    return result;
  }
}

// ---------------------------------------------------------------- pool routing
async function poolQuery(sql: string, values?: unknown[]): Promise<QueryResult> {
  // If Neon is configured, use neonPool routing
  if (isNeonConfigured()) {
    // Determine if this is a read or write
    const upperSql = sql.trim().toUpperCase();
    const isWrite = upperSql.startsWith('INSERT') ||
                    upperSql.startsWith('UPDATE') ||
                    upperSql.startsWith('DELETE') ||
                    upperSql.startsWith('BEGIN') ||
                    upperSql.startsWith('COMMIT') ||
                    upperSql.startsWith('ROLLBACK');

    if (isWrite) {
      return neonQueryWrite(sql, values);
    } else {
      // Reads go to replica if available
      return neonQueryRead(sql, values);
    }
  }

  // Fallback: use primary pool directly (no Neon)
  return primaryPool.query(sql, values);
}

// ----------------------------------------------------- Supabase result type
export interface SupabaseError {
  message: string;
  code: string;
  details?: string;
  hint?: string;
}

export interface SupabaseResult<T = any> {
  data: T | T[] | null;
  error: SupabaseError | null;
  count?: number;
}

// ----------------------------------------------------- compatibility interface
export interface SupabaseCompatibleClient {
  from(table: string): QueryBuilder;
}

// ----------------------------------------------------- export instances
function createClient(): SupabaseCompatibleClient {
  return {
    from(table: string): QueryBuilder {
      return new QueryBuilder(table);
    },
  };
}

export const dbWrite: SupabaseCompatibleClient = createClient();
export const dbRead: SupabaseCompatibleClient = createClient();

export const isReadReplicaConfigured = (): boolean => isReplicaConfigured();

// Re-export pools for direct access if needed
export { primaryPool, replicaPool };
