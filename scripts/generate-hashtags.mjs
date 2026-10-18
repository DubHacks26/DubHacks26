#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { embedCatalogProduct } from "../lib/product-embeddings.mjs";

const { loadEnvConfig } = nextEnv;

const DEFAULT_CAPTURE_FILE = "sample capture.jsonl";
const TABLE_NAME = "catalog_products";
const SELECT_BATCH_SIZE = 100;
const TARGET_MIN_HASHTAGS = 5;
const MIN_ACCEPTED_HASHTAGS = 1;
const MAX_HASHTAGS = 15;

const hashtagResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "product_hashtags",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        hashtags: {
          type: "array",
          minItems: MIN_ACCEPTED_HASHTAGS,
          maxItems: MAX_HASHTAGS,
          items: { type: "string" },
        },
      },
      required: ["hashtags"],
    },
  },
};

function fail(message) {
  throw new Error(message);
}

function usage() {
  console.log(`Usage: npm run generate:hashtags -- [capture-file.jsonl] [options]

Reads products from a JSONL capture and writes generated hashtag lists to
public.${TABLE_NAME}. Each product must already have been imported by ASIN.

Options:
  --dry-run        Generate and validate hashtags without updating Supabase.
  --force          Regenerate rows that already have generated hashtags.
  --limit <count>  Process at most this many products.
  --help, -h       Show this help.

Environment:
  NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
  SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)
  LMSTUDIO_BASE_URL (default: http://127.0.0.1:1234/v1)
  LMSTUDIO_MODEL (optional; auto-detects the first loaded model when omitted)
  LMSTUDIO_API_TOKEN (optional; only if your LM Studio server requires one)

Examples:
  npm run generate:hashtags -- "sample capture.jsonl" --dry-run
  npm run generate:hashtags -- captures/latest.jsonl
  npm run generate:hashtags -- --force --limit 10`);
}

function parseArguments(args) {
  let fileName;
  let dryRun = false;
  let force = false;
  let limit;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--force") {
      force = true;
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
    force,
    limit,
    filePath: resolve(process.cwd(), fileName || DEFAULT_CAPTURE_FILE),
  };
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

function stringList(value, field, lineNumber) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`Line ${lineNumber}: ${field} must be an array of strings when present.`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function captureToPromptInput(capture, lineNumber) {
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
    fail(`Line ${lineNumber}: each JSONL line must be an object.`);
  }

  const asin = requiredText(capture.asin, "asin", lineNumber).toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    fail(`Line ${lineNumber}: asin must contain exactly 10 letters or digits.`);
  }

  return {
    asin,
    title: requiredText(capture.title, "title", lineNumber),
    brand: optionalText(capture.brand, "brand", lineNumber),
    summary: optionalText(capture.summary, "summary", lineNumber),
    categories: stringList(capture.categories, "categories", lineNumber),
    sourceTags: stringList(capture.tags, "tags", lineNumber),
  };
}

function isNewerCapture(candidate, current) {
  const candidateTime = new Date(candidate.lastSeenAt || 0).getTime();
  const currentTime = new Date(current.lastSeenAt || 0).getTime();
  return candidateTime >= currentTime;
}

async function readCaptureFile(filePath) {
  await access(filePath);

  const productsByAsin = new Map();
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let lineNumber = 0;
  let duplicateCount = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim() === "") continue;

    let capture;
    try {
      capture = JSON.parse(line);
    } catch (error) {
      fail(`Line ${lineNumber}: invalid JSON (${error.message}).`);
    }

    const product = captureToPromptInput(capture, lineNumber);
    product.lastSeenAt = capture.lastSeenAt;
    const current = productsByAsin.get(product.asin);
    if (current) {
      duplicateCount += 1;
      if (isNewerCapture(product, current)) productsByAsin.set(product.asin, product);
    } else {
      productsByAsin.set(product.asin, product);
    }
  }

  if (productsByAsin.size === 0) {
    fail("The capture file contains no product records.");
  }

  return { duplicates: duplicateCount, products: [...productsByAsin.values()] };
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) {
    fail("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY. Add one to .env.local or export it before generating hashtags.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function trimForPrompt(value, maxLength) {
  if (!value) return null;
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function productPrompt(product) {
  return JSON.stringify({
    title: trimForPrompt(product.title, 300),
    brand: trimForPrompt(product.brand, 100),
    summary: trimForPrompt(product.summary, 1_200),
    categories: product.categories.slice(0, 12),
    source_tags: product.sourceTags.slice(0, 12),
  });
}

function normalizeHashtags(value) {
  if (!Array.isArray(value)) fail("LM Studio returned a hashtags value that is not an array.");

  const hashtags = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate
      .trim()
      .toLowerCase()
      .replace(/^#+/, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized || normalized.length > 48) continue;

    const hashtag = `#${normalized}`;
    if (!hashtags.includes(hashtag)) hashtags.push(hashtag);
  }

  if (hashtags.length < MIN_ACCEPTED_HASHTAGS) {
    fail("LM Studio returned no valid hashtags.");
  }

  return hashtags.slice(0, MAX_HASHTAGS);
}

function lmStudioBaseUrl() {
  const baseUrl = process.env.LMSTUDIO_BASE_URL || "http://127.0.0.1:1234/v1";
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      fail("LMSTUDIO_BASE_URL must use http or https.");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    fail("LMSTUDIO_BASE_URL must be a valid URL.");
  }
}

function lmStudioHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (process.env.LMSTUDIO_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.LMSTUDIO_API_TOKEN}`;
  }
  return headers;
}

async function fetchJson(url, options) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(120_000) });
  } catch (error) {
    fail(`Could not reach LM Studio at ${url}: ${error.message}`);
  }

  const body = await response.text();
  if (!response.ok) {
    fail(`LM Studio returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    fail("LM Studio returned invalid JSON.");
  }
}

async function detectModel(baseUrl) {
  if (process.env.LMSTUDIO_MODEL) return process.env.LMSTUDIO_MODEL;

  const models = await fetchJson(`${baseUrl}/models`, { headers: lmStudioHeaders() });
  const model = models?.data?.find((item) => typeof item?.id === "string")?.id;
  if (!model) {
    fail("LM Studio did not report a loaded model. Load one in LM Studio or set LMSTUDIO_MODEL.");
  }
  console.log(`Using auto-detected LM Studio model: ${model}`);
  return model;
}

async function generateHashtags(baseUrl, model, product) {
  const payload = {
    model,
    messages: [
      {
        role: "system",
        content: `Generate ${TARGET_MIN_HASHTAGS}-${MAX_HASHTAGS} useful e-commerce discovery hashtags from only the supplied product data. Return lowercase ASCII hashtags using # and underscores, such as #smart_home. Include product type, key capabilities, relevant context, and brand only when helpful. Do not invent compatibility, awards, materials, or certifications.`,
      },
      { role: "user", content: productPrompt(product) },
    ],
    response_format: hashtagResponseFormat,
    temperature: 0.2,
    max_tokens: 160,
    stream: false,
  };

  const response = await fetchJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: lmStudioHeaders(),
    body: JSON.stringify(payload),
  });
  const content = response?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  if (!text) fail("LM Studio returned no message content.");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("LM Studio did not return a JSON hashtag response. Use an instruction model that supports structured output.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("LM Studio returned a JSON response that is not an object.");
  }

  return normalizeHashtags(parsed.hashtags);
}

async function readExistingProducts(supabase, asins) {
  const products = new Map();
  for (let index = 0; index < asins.length; index += SELECT_BATCH_SIZE) {
    const batch = asins.slice(index, index + SELECT_BATCH_SIZE);
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("asin, hashtags")
      .in("asin", batch);
    if (error) {
      fail(`Supabase could not read ${TABLE_NAME}. Apply the database migration first: ${error.message}`);
    }
    for (const product of data || []) products.set(product.asin, product);
  }
  return products;
}

async function updateHashtags(supabase, asin, hashtags) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ hashtags })
    .eq("asin", asin);
  if (error) fail(`Supabase could not update ${asin}: ${error.message}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  loadEnvConfig(process.cwd(), true);

  const { duplicates, products: capturedProducts } = await readCaptureFile(options.filePath);
  const products = options.limit ? capturedProducts.slice(0, options.limit) : capturedProducts;
  const supabase = getSupabaseClient();
  const existingProducts = await readExistingProducts(supabase, products.map((product) => product.asin));
  const missingAsins = products.filter((product) => !existingProducts.has(product.asin)).map((product) => product.asin);
  if (missingAsins.length > 0) {
    fail(`Missing ${missingAsins.length} catalog row(s). Run npm run import:capture -- "${options.filePath}" first. Missing ASINs: ${missingAsins.slice(0, 10).join(", ")}`);
  }

  const pendingProducts = products.filter((product) => {
    const generated = existingProducts.get(product.asin)?.hashtags;
    return options.force || !Array.isArray(generated) || generated.length === 0;
  });

  console.log(`${pendingProducts.length} of ${products.length} product(s) need hashtag generation.`);
  if (pendingProducts.length === 0) return;

  const baseUrl = lmStudioBaseUrl();
  const model = await detectModel(baseUrl);
  let completed = 0;
  for (const product of pendingProducts) {
    const hashtags = await generateHashtags(baseUrl, model, product);
    completed += 1;
    if (options.dryRun) {
      console.log(`[dry run] ${product.asin}: ${hashtags.join(" ")}`);
    } else {
      if (JSON.stringify(existingProducts.get(product.asin)?.hashtags) === JSON.stringify(hashtags)) {
        console.log(`[${completed}/${pendingProducts.length}] ${product.asin}: hashtags unchanged`);
        continue;
      }
      await updateHashtags(supabase, product.asin, hashtags);
      try {
        await embedCatalogProduct(supabase, { asin: product.asin, hashtags });
      } catch (error) {
        // The migration leaves this product pending for the resumable backfill.
        console.error(`Embedding ${product.asin} failed: ${error.message}`);
      }
      console.log(`[${completed}/${pendingProducts.length}] ${product.asin}: ${hashtags.join(" ")}`);
    }
  }

  if (duplicates > 0) {
    console.log(`Used the newest input for ${duplicates} duplicate ASIN${duplicates === 1 ? "" : "s"}.`);
  }
  console.log(options.dryRun ? "Dry run complete; no database rows were changed." : "Hashtag generation complete.");
}

main().catch((error) => {
  console.error(`Hashtag generation failed: ${error.message}`);
  process.exitCode = 1;
});
