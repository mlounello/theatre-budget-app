import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const schema = "app_theatre_budget";
const sql = `
  select coalesce(json_agg(row_to_json(columns) order by table_name, ordinal_position), '[]'::json)
  from (
    select table_name, column_name, data_type, udt_name, is_nullable, ordinal_position
    from information_schema.columns
    where table_schema = '${schema}'
  ) columns;
`;
const relationshipSql = `
  select coalesce(json_agg(row_to_json(relationships) order by table_name, foreign_key_name), '[]'::json)
  from (
    select
      source.relname as table_name,
      constraint_row.conname as foreign_key_name,
      array(select source_attribute.attname from unnest(constraint_row.conkey) with ordinality keys(attnum, position)
        join pg_attribute source_attribute on source_attribute.attrelid = constraint_row.conrelid and source_attribute.attnum = keys.attnum
        order by keys.position) as columns,
      target.relname as referenced_relation,
      array(select target_attribute.attname from unnest(constraint_row.confkey) with ordinality keys(attnum, position)
        join pg_attribute target_attribute on target_attribute.attrelid = constraint_row.confrelid and target_attribute.attnum = keys.attnum
        order by keys.position) as referenced_columns
    from pg_constraint constraint_row
    join pg_class source on source.oid = constraint_row.conrelid
    join pg_namespace source_schema on source_schema.oid = source.relnamespace
    join pg_class target on target.oid = constraint_row.confrelid
    where constraint_row.contype = 'f' and source_schema.nspname = '${schema}'
  ) relationships;
`;

const raw = execFileSync("psql", [databaseUrl, "-X", "-At", "-c", sql], { encoding: "utf8" }).trim();
const columns = JSON.parse(raw);
const relationshipRaw = execFileSync("psql", [databaseUrl, "-X", "-At", "-c", relationshipSql], { encoding: "utf8" }).trim();
const relationships = JSON.parse(relationshipRaw);
const tables = new Map();
const relationshipsByTable = new Map();
for (const column of columns) {
  const list = tables.get(column.table_name) ?? [];
  list.push(column);
  tables.set(column.table_name, list);
}
for (const relationship of relationships) {
  const list = relationshipsByTable.get(relationship.table_name) ?? [];
  list.push(relationship);
  relationshipsByTable.set(relationship.table_name, list);
}

function tsType(column) {
  const base = (() => {
    if (["int2", "int4", "int8", "float4", "float8", "numeric", "decimal", "money"].includes(column.udt_name)) return "number | string";
    if (column.udt_name === "bool") return "boolean";
    if (column.udt_name === "json" || column.udt_name === "jsonb") return "Json";
    if (column.data_type === "ARRAY") return "unknown[]";
    return "string";
  })();
  return column.is_nullable === "YES" ? `${base} | null` : base;
}

const tableTypes = [...tables.entries()].map(([table, tableColumns]) => {
  const row = tableColumns.map((column) => `          ${JSON.stringify(column.column_name)}: ${tsType(column)};`).join("\n");
  const write = tableColumns.map((column) => `          ${JSON.stringify(column.column_name)}?: ${tsType(column)};`).join("\n");
  const relationTypes = (relationshipsByTable.get(table) ?? []).map((relationship) =>
    `          { foreignKeyName: ${JSON.stringify(relationship.foreign_key_name)}; columns: ${JSON.stringify(relationship.columns)}; isOneToOne: false; referencedRelation: ${JSON.stringify(relationship.referenced_relation)}; referencedColumns: ${JSON.stringify(relationship.referenced_columns)} }`
  ).join(",\n");
  return `      ${JSON.stringify(table)}: {\n        Row: {\n${row}\n        };\n        Insert: {\n${write}\n        };\n        Update: {\n${write}\n        };\n        Relationships: [\n${relationTypes}\n        ];\n      };`;
}).join("\n");

const output = `// Generated from the live ${schema} schema. Run scripts/generate-database-types.mjs to refresh.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\ntype GenericTableDefinition = {\n  Row: Record<string, unknown>;\n  Insert: Record<string, unknown>;\n  Update: Record<string, unknown>;\n  Relationships: Array<{ foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }>;\n};\n\ntype EmptySchema = {\n  Tables: Record<string, GenericTableDefinition>;\n  Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;\n  Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;\n  Enums: Record<string, never>;\n  CompositeTypes: Record<string, never>;\n};\n\nexport type Database = {\n  public: EmptySchema;\n  core: EmptySchema;\n  app_production_management: EmptySchema;\n  ${schema}: {\n    Tables: {\n${tableTypes}\n    } & Record<string, GenericTableDefinition>;\n    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;\n    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;\n    Enums: Record<string, string>;\n    CompositeTypes: Record<string, never>;\n  };\n};\n`;

writeFileSync(new URL("../lib/database.types.ts", import.meta.url), output);
console.log(`Generated ${tables.size} table definitions in lib/database.types.ts.`);
