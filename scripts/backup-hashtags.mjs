#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

const TABLE_NAME = "catalog_products";
const PAGE_SIZE = 500;

function fail(message) {
  throw new Error(message);
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(process.cwd(), "backups", `catalog-products-hashtags-${timestamp}.jsonl`);
}

function usage() {
  console.log(`Usage: npm run backup:hashtags -- [output.jsonl] [options]

Backs up catalog rows that already have a non-empty hashtags array from
public.${TABLE_NAME}. The default output is a timestamped file in backups/.

Options:
  --dry-run        Count rows without writing a backup file.
  --help, -h       Show this help.

Environment:
  NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
  SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)

Examples:
  npm run backup:hashtags
  npm run backup:hashtags -- backups/before-hashtag-import.jsonl
  npm run backup:hashtags -- --dry-run`);
}

function parseArguments(args) {
  let outputPath;
  let dryRun = false;
  for (const argument of args) {
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    } else if (argument.startsWith("-")) {
      fail(`Unknown option: ${argument}`);
    } else if (outputPath) {
      fail("Provide only one output file.");
    } else {
      outputPath = argument;
    }
  }
  return { dryRun, outputPath: resolve(process.cwd(), outputPath || defaultOutputPath()) };
}

function getSupabaseClient() {
  loadEnvConfig(process.cwd(), true);
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) {
    fail("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY. Add one to .env.local or export it before backing up hashtags.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readHashtagRows(supabase) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .order("asin", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) fail(`Supabase could not read ${TABLE_NAME}: ${error.message}`);

    for (const row of data || []) {
      if (Array.isArray(row.hashtags) && row.hashtags.length > 0) rows.push(row);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const supabase = getSupabaseClient();
  const rows = await readHashtagRows(supabase);

  if (options.dryRun) {
    console.log(`Found ${rows.length} catalog rows with non-empty hashtags.`);
    console.log("Dry run complete; no backup file was written.");
    return;
  }

  try {
    await access(options.outputPath);
    fail(`Refusing to overwrite existing backup: ${options.outputPath}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await mkdir(dirname(options.outputPath), { recursive: true });
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(options.outputPath, content ? `${content}\n` : "", { encoding: "utf8", flag: "wx" });
  console.log(`Backed up ${rows.length} catalog rows with hashtags to ${options.outputPath}.`);
}

main().catch((error) => {
  console.error(`Hashtag backup failed: ${error.message}`);
  process.exitCode = 1;
});
