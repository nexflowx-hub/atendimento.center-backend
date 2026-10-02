const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('pgsql-parser');
const order = require('../database/atlas-v2-migration-order.json');
const migrationDir = path.join(__dirname, '../database/migrations');

for (const filename of order) {
  test(`PostgreSQL grammar parses ${filename} without database access`, async () => {
    const sql = fs.readFileSync(path.join(migrationDir, filename), 'utf8');
    const result = await parse(sql);
    assert.ok(result.stmts.length > 0);
  });
  test(`staging catalog verification parses for ${filename}`, async () => {
    const sql = fs.readFileSync(path.join(__dirname, '../database/verification', filename), 'utf8');
    const parsed = await parse(sql);
    assert.ok(parsed.stmts.length > 0);
    assert.ok(parsed.stmts.every(statement => statement.stmt.SelectStmt), 'verification must be read-only SELECT statements');
  });
}

test('manifest covers every Atlas V2 migration with FK/schema dependencies satisfied in order', () => {
  assert.deepEqual([...order].sort(), fs.readdirSync(migrationDir).filter(f => f.startsWith('20261001_')).sort());
  const baseline = fs.readFileSync(path.join(migrationDir, '20260928_atlas_platform_foundation_v1.sql'), 'utf8');
  const tables = new Set([...baseline.matchAll(/create table if not exists\s+([\w.]+)/gi)].map(m => m[1]));
  const schemas = new Set([...baseline.matchAll(/create schema if not exists\s+(\w+)/gi)].map(m => m[1]));
  assert.match(baseline, /create or replace function core\.set_updated_at\(\)/);
  for (const filename of order) {
    const sql = fs.readFileSync(path.join(migrationDir, filename), 'utf8');
    for (const statement of sql.split(';')) {
      const schema = statement.match(/create schema if not exists\s+(\w+)/i);
      if (schema) schemas.add(schema[1]);
      const table = statement.match(/create table if not exists\s+([\w.]+)/i);
      if (table) {
        assert.ok(schemas.has(table[1].split('.')[0]), `${filename}: missing schema for ${table[1]}`);
        tables.add(table[1]); // Self-referencing FK is valid inside CREATE TABLE.
      }
      for (const match of statement.matchAll(/references\s+([\w.]+)\s*\(/gi)) {
        assert.ok(tables.has(match[1]), `${filename}: missing FK target ${match[1]}`);
      }
      const altered = statement.match(/^\s*(?:--[^\n]*\n\s*)*alter table\s+([\w.]+)/i);
      if (altered) assert.ok(tables.has(altered[1]), `${filename}: missing ALTER target ${altered[1]}`);
    }
    // Replay patterns are guards, not a substitute for staging execution.
    assert.doesNotMatch(sql, /create table\s+(?!if not exists)/i);
    assert.doesNotMatch(sql, /create (?:unique )?index\s+(?!if not exists)/i);
  }
});

test('knowledge generated vector uses fixed text-search configuration and GIN index', () => {
  const sql = fs.readFileSync(path.join(migrationDir, '20261001_atlas_runtime_v2_slice6_knowledge.sql'), 'utf8');
  assert.match(sql, /to_tsvector\('simple', coalesce\(content, ''\)\)/);
  assert.match(sql, /\) stored/);
  assert.match(sql, /using gin\(search_vector\)/);
});

test('optional seed parses and references a pre-existing internal organization', async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../database/seeds/20261001_atlas_internal_org_v1.sql'), 'utf8');
  assert.ok((await parse(sql)).stmts.length > 0);
  assert.match(sql, /where slug = 'atlas-internal'/);
});
