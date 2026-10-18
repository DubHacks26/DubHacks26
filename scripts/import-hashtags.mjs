#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

const DEFAULT_CAPTURE_FILE = "amazon-capture-2026-10-18T03-19-49-888Z.jsonl";
const TABLE_NAME = "catalog_products";
const SELECT_BATCH_SIZE = 100;
const UPDATE_CONCURRENCY = 25;
const MIN_HASHTAGS = 5;
const MAX_HASHTAGS = 20;
const HASHTAG_PATTERN = /^#[a-z0-9]+(?:_[a-z0-9]+)*$/;

function fail(message) {
  throw new Error(message);
}

function usage() {
  console.log(`Usage: npm run import:hashtags -- [capture-file.jsonl] [options]

Updates only the hashtags column in public.${TABLE_NAME} from a JSONL capture.
The ASINs must already exist in the catalog. The default file is
"${DEFAULT_CAPTURE_FILE}" in the project root.

Options:
  --dry-run        Validate the file and catalog ASINs without updating rows.
  --limit <count>  Process at most this many unique ASINs.
  --help, -h       Show this help.

Environment:
  NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
  SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)

Examples:
  npm run import:hashtags -- --dry-run
  npm run import:hashtags -- amazon-capture-2026-10-18T00-01-48-213Z.jsonl
  npm run import:hashtags -- captures/latest.jsonl --limit 100`);
}

function parseArguments(args) {
  let fileName;
  let dryRun = false;
  let limit;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--limit") {
      const value = args[index + 1];
      if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
        fail("--limit requires a positive integer.");
      }
      limit = Number(value);
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    } else if (argument.startsWith("-")) {
      fail(`Unknown option: ${argument}`);
    } else if (fileName) {
      fail("Provide only one capture file.");
    } else {
      fileName = argument;
    }
  }

  return {
    dryRun,
    limit,
    filePath: resolve(process.cwd(), fileName || DEFAULT_CAPTURE_FILE),
  };
}

function requiredAsin(value, lineNumber) {
  if (typeof value !== "string" || !/^[a-z0-9]{10}$/i.test(value.trim())) {
    fail(`Line ${lineNumber}: asin must contain exactly 10 letters or digits.`);
  }
  return value.trim().toUpperCase();
}

function validateHashtags(value, lineNumber) {
  if (!Array.isArray(value) || value.length < MIN_HASHTAGS || value.length > MAX_HASHTAGS) {
    fail(`Line ${lineNumber}: hashtags must be an array containing ${MIN_HASHTAGS}-${MAX_HASHTAGS} tags.`);
  }

  const hashtags = value.map((tag) => {
    if (typeof tag !== "string" || !HASHTAG_PATTERN.test(tag)) {
      fail(`Line ${lineNumber}: hashtags must use lowercase ASCII #tags with underscores.`);
    }
    return tag;
  });

  if (new Set(hashtags).size !== hashtags.length) {
    fail(`Line ${lineNumber}: hashtags must not contain duplicates.`);
  }

  return hashtags;
}

async function readHashtagFile(filePath, limit) {
  await access(filePath);

  const rowsByAsin = new Map();
  let lineNumber = 0;
  let duplicateCount = 0;
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim() === "") continue;

    let item;
    try {
      item = JSON.parse(line);
    } catch (error) {
      fail(`Line ${lineNumber}: invalid JSON (${error.message}).`);
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(`Line ${lineNumber}: each JSONL line must be an object.`);
    }

    const asin = requiredAsin(item.asin, lineNumber);
    const hashtags = validateHashtags(item.hashtags, lineNumber);
    if (rowsByAsin.has(asin)) duplicateCount += 1;
    rowsByAsin.set(asin, { asin, hashtags });
  }

  const rows = [...rowsByAsin.values()];
  if (rows.length === 0) fail("The hashtag file contains no product records.");
  return { duplicateCount, rows: limit ? rows.slice(0, limit) : rows };
}

function getSupabaseClient() {
  loadEnvConfig(process.cwd(), true);
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) {
    fail("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY. Add one to .env.local or export it before importing hashtags.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findMissingAsins(supabase, asins) {
  const found = new Set();
  for (let index = 0; index < asins.length; index += SELECT_BATCH_SIZE) {
    const batch = asins.slice(index, index + SELECT_BATCH_SIZE);
    const { data, error } = await supabase.from(TABLE_NAME).select("asin").in("asin", batch);
    if (error) fail(`Supabase could not read ${TABLE_NAME}: ${error.message}`);
    for (const row of data || []) found.add(row.asin);
  }
  return asins.filter((asin) => !found.has(asin));
}

async function updateRow(supabase, row) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ hashtags: row.hashtags })
    .eq("asin", row.asin)
    .select("asin");
  if (error) fail(`Supabase could not update ${row.asin}: ${error.message}`);
  if (!data || data.length !== 1) fail(`Supabase updated no catalog row for ${row.asin}.`);
}

async function updateHashtags(supabase, rows) {
  let completed = 0;
  for (let index = 0; index < rows.length; index += UPDATE_CONCURRENCY) {
    const batch = rows.slice(index, index + UPDATE_CONCURRENCY);
    await Promise.all(batch.map((row) => updateRow(supabase, row)));
    completed += batch.length;
    console.log(`Updated ${completed}/${rows.length} catalog rows.`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { duplicateCount, rows } = await readHashtagFile(options.filePath, options.limit);

  if (options.dryRun) {
    console.log(`Validated ${rows.length} hashtag updates from ${options.filePath}.`);
  } else {
    const supabase = getSupabaseClient();
    const missingAsins = await findMissingAsins(supabase, rows.map((row) => row.asin));
    if (missingAsins.length > 0) {
      fail(`Missing ${missingAsins.length} catalog row(s): ${missingAsins.slice(0, 10).join(", ")}`);
    }
    await updateHashtags(supabase, rows);
    console.log(`Updated hashtags for ${rows.length} catalog products in public.${TABLE_NAME}.`);
  }

  if (duplicateCount > 0) {
    console.log(`Used the last occurrence for ${duplicateCount} duplicate ASIN${duplicateCount === 1 ? "" : "s"}.`);
  }
  if (options.dryRun) console.log("Dry run complete; no database rows were changed.");
}

main().catch((error) => {
  console.error(`Hashtag import failed: ${error.message}`);
  process.exitCode = 1;
});
