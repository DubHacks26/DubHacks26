#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

const DEFAULT_CAPTURE_FILE = "sample capture.jsonl";
const TABLE_NAME = "catalog_products";
const BATCH_SIZE = 100;

function usage() {
  console.log(`Usage: npm run import:capture -- [capture-file.jsonl] [--dry-run]

Imports one JSON object per line into public.${TABLE_NAME}. The default file is
"${DEFAULT_CAPTURE_FILE}" in the project root.

Environment:
  NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
  SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)

Examples:
  npm run import:capture -- --dry-run
  npm run import:capture -- "sample capture.jsonl"
  npm run import:capture -- captures/latest.jsonl --dry-run`);
}

function fail(message) {
  throw new Error(message);
}

function parseArguments(args) {
  let fileName;
  let dryRun = false;

  for (const argument of args) {
    if (argument === "--dry-run") {
      dryRun = true;
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

  return { dryRun, filePath: resolve(process.cwd(), fileName || DEFAULT_CAPTURE_FILE) };
}

function requiredText(value, field, lineNumber) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`Line ${lineNumber}: ${field} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalText(value, field, lineNumber) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    fail(`Line ${lineNumber}: ${field} must be a string when present.`);
  }

  return value.trim() || null;
}

function optionalUrl(value, field, lineNumber) {
  const text = optionalText(value, field, lineNumber);
  if (!text) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    fail(`Line ${lineNumber}: ${field} must be a valid URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(`Line ${lineNumber}: ${field} must use http or https.`);
  }

  return url.toString();
}

function requiredTimestamp(value, field, lineNumber, fallback) {
  const text = value ?? fallback;
  if (typeof text !== "string" || text.trim() === "") {
    fail(`Line ${lineNumber}: ${field} must be an ISO timestamp.`);
  }

  const timestamp = new Date(text);
  if (Number.isNaN(timestamp.getTime())) {
    fail(`Line ${lineNumber}: ${field} must be an ISO timestamp.`);
  }

  return timestamp.toISOString();
}

function optionalInteger(value, field, lineNumber) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`Line ${lineNumber}: ${field} must be a non-negative integer when present.`);
  }

  return value;
}

function optionalRating(value, lineNumber) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5) {
    fail(`Line ${lineNumber}: rating must be a number between 0 and 5 when present.`);
  }

  return value;
}

function stringList(value, field, lineNumber) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`Line ${lineNumber}: ${field} must be an array of strings when present.`);
  }

  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function captureToProduct(capture, lineNumber) {
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
    fail(`Line ${lineNumber}: each JSONL line must be an object.`);
  }

  const asin = requiredText(capture.asin, "asin", lineNumber).toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    fail(`Line ${lineNumber}: asin must contain exactly 10 letters or digits.`);
  }

  const capturedAt = requiredTimestamp(capture.capturedAt, "capturedAt", lineNumber);
  const productUrl = optionalUrl(capture.productURL, "productURL", lineNumber);
  if (!productUrl) {
    fail(`Line ${lineNumber}: productURL must be a non-empty URL.`);
  }

  return {
    asin,
    title: requiredText(capture.title, "title", lineNumber),
    brand: optionalText(capture.brand, "brand", lineNumber),
    summary: optionalText(capture.summary, "summary", lineNumber),
    image_url: optionalUrl(capture.imageURL, "imageURL", lineNumber),
    product_url: productUrl,
    price_cents: optionalInteger(capture.priceCents, "priceCents", lineNumber),
    price_text: optionalText(capture.priceText, "priceText", lineNumber),
    rating: optionalRating(capture.rating, lineNumber),
    rating_text: optionalText(capture.ratingText, "ratingText", lineNumber),
    review_count: optionalInteger(capture.reviewCount, "reviewCount", lineNumber),
    review_count_text: optionalText(capture.reviewCountText, "reviewCountText", lineNumber),
    availability: optionalText(capture.availability, "availability", lineNumber),
    capture_source: optionalText(capture.captureSource, "captureSource", lineNumber),
    categories: stringList(capture.categories, "categories", lineNumber),
    tags: stringList(capture.tags, "tags", lineNumber),
    bought_in_past_month: optionalText(capture.boughtInPastMonth, "boughtInPastMonth", lineNumber),
    badge: optionalText(capture.badge, "badge", lineNumber),
    captured_at: capturedAt,
    last_seen_at: requiredTimestamp(capture.lastSeenAt, "lastSeenAt", lineNumber, capturedAt),
  };
}

async function readCaptureFile(filePath) {
  await access(filePath);

  const capturesByAsin = new Map();
  let lineNumber = 0;
  let duplicateCount = 0;
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim() === "") continue;

    let capture;
    try {
      capture = JSON.parse(line);
    } catch (error) {
      fail(`Line ${lineNumber}: invalid JSON (${error.message}).`);
    }

    const product = captureToProduct(capture, lineNumber);
    const existing = capturesByAsin.get(product.asin);
    if (existing) {
      duplicateCount += 1;
    } else {
      capturesByAsin.set(product.asin, product);
    }
  }

  if (capturesByAsin.size === 0) {
    fail("The capture file contains no product records.");
  }

  return { duplicates: duplicateCount, products: [...capturesByAsin.values()] };
}

function getSupabaseClient() {
  loadEnvConfig(process.cwd(), true);

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    fail("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (!serviceRoleKey) {
    fail("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY. Add one to .env.local or export it before importing.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function importProducts(products) {
  const supabase = getSupabaseClient();
  for (let index = 0; index < products.length; index += BATCH_SIZE) {
    const batch = products.slice(index, index + BATCH_SIZE);
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(batch, { ignoreDuplicates: true, onConflict: "asin" });

    if (error) {
      fail(`Supabase rejected records ${index + 1}-${index + batch.length}: ${error.message}`);
    }
  }
}

async function main() {
  const { dryRun, filePath } = parseArguments(process.argv.slice(2));
  const { duplicates, products } = await readCaptureFile(filePath);

  if (dryRun) {
    console.log(`Validated ${products.length} catalog products from ${filePath}.`);
  } else {
    await importProducts(products);
    console.log(`Imported ${products.length} catalog products into public.${TABLE_NAME}.`);
  }

  if (duplicates > 0) {
    console.log(`Skipped ${duplicates} duplicate ASIN${duplicates === 1 ? "" : "s"} from the capture file.`);
  }
}

main().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
});
