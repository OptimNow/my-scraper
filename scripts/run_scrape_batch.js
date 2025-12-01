// scripts/run_scrape_batch.js
//
// Batch runner that:
//  1) calls the scraper API endpoint
//  2) receives normalized JSON records
//  3) uploads them to S3 under a "Recos" prefix
//
// Usage:
//    node scripts/run_scrape_batch.js
//    node scripts/run_scrape_batch.js --limit=5
//
// Required env vars:
//    AWS_ACCESS_KEY_ID
//    AWS_SECRET_ACCESS_KEY
//    AWS_REGION
// Optional env vars:
//    S3_BUCKET_NAME     (default: "optimnow-finops-repo")
//    S3_PREFIX          (default: "Recos/")
//    SCRAPER_API_URL    (default: "http://localhost:3000/api/scrape_hub")

const AWS = require("aws-sdk");

// node-fetch v3 is ESM only, so we load it dynamically
const fetchFn = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const DEFAULT_BUCKET = "optimnow-finops-repo";
const DEFAULT_PREFIX = "Recos/";
const DEFAULT_SCRAPER_URL = "http://localhost:3000/api/scrape_hub";

const BUCKET_NAME = process.env.S3_BUCKET_NAME || DEFAULT_BUCKET;
const PREFIX = normalizePrefix(process.env.S3_PREFIX || DEFAULT_PREFIX);
const SCRAPER_API_URL = process.env.SCRAPER_API_URL || DEFAULT_SCRAPER_URL;

// Configure AWS SDK from environment variables
AWS.config.update({
  region: process.env.AWS_REGION || "eu-central-1"
});

const s3 = new AWS.S3();

// --------------- helpers ---------------

function normalizePrefix(prefix) {
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : prefix + "/";
}

function parseLimitFromArgs() {
  const arg = process.argv.find(a => a.startsWith("--limit="));
  if (!arg) return null;
  const value = arg.split("=")[1];
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// --------------- main logic ---------------

async function fetchScrapedData(limit) {
  const url =
    typeof limit === "number"
      ? `${SCRAPER_API_URL}?limit=${limit}`
      : SCRAPER_API_URL;

  console.log(`Calling scraper API: ${url}`);

  const resp = await fetchFn(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Scraper API returned HTTP ${resp.status}. Body: ${text.slice(0, 500)}`
    );
  }

  const data = await resp.json();
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Scraper API response does not contain an 'items' array");
  }

  console.log(
    `Scraper returned ${data.items.length} items (source=${data.source || "n/a"})`
  );

  return data;
}

async function uploadToS3(key, bodyObj) {
  const bodyStr = JSON.stringify(bodyObj, null, 2);

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: bodyStr,
    ContentType: "application/json"
  };

  await s3.putObject(params).promise();
  console.log(`Uploaded to s3://${BUCKET_NAME}/${key}`);
}

async function main() {
  const limit = parseLimitFromArgs();
  const data = await fetchScrapedData(limit);

  const ts = timestampSlug();

  // 1) Summary file with all items
  const summaryKey = `${PREFIX}pointfive_hub_summary_${ts}.json`;
  await uploadToS3(summaryKey, data);

  // 2) Individual files per item
  let index = 0;
  for (const item of data.items) {
    index += 1;
    const idPart = item.id && String(item.id).trim()
      ? item.id.trim()
      : `item-${index}`;
    const itemKey = `${PREFIX}pointfive_${idPart}_${ts}.json`;
    await uploadToS3(itemKey, item);
  }

  console.log("Batch upload completed.");
}

// --------------- run ---------------

main().catch(err => {
  console.error("Batch scraping and upload failed:", err);
  process.exit(1);
});

