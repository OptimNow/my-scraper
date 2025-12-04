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
//    S3_BUCKET_NAME         (your S3 bucket name)
// Optional env vars:
//    AWS_REGION             (default: "eu-central-1")
//    S3_PREFIX              (default: "Recos/")
//    SCRAPER_API_URL        (default: "http://localhost:3000/api/scrape_hub")

const AWS = require("aws-sdk");

// node-fetch v3 is ESM only, so we load it dynamically
const fetchFn = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const DEFAULT_PREFIX = "Recos/";
const DEFAULT_SCRAPER_URL = "http://localhost:3000/api/scrape_hub";

/**
 * Structured logger for batch script
 */
const logger = {
  info: (msg, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      message: msg,
      ...meta
    }));
  },
  error: (msg, error = null, meta = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      message: msg,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : null,
      ...meta
    }));
  },
  warn: (msg, meta = {}) => {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      message: msg,
      ...meta
    }));
  }
};

/**
 * Validate required environment variables
 */
function validateEnvironment() {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const missing = [];

  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Please set them before running this script.'
    );
  }

  // Warn if S3_BUCKET_NAME is not set
  if (!process.env.S3_BUCKET_NAME) {
    logger.warn('S3_BUCKET_NAME not set, using default', {
      bucket: 'optimnow-finops-repo',
      recommendation: 'Set S3_BUCKET_NAME environment variable for your bucket'
    });
  }
}

// Validate environment before proceeding
validateEnvironment();

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
if (!BUCKET_NAME) {
  throw new Error(
    'S3_BUCKET_NAME environment variable is required. ' +
    'Please set it to your S3 bucket name before running this script.'
  );
}

const PREFIX = normalizePrefix(process.env.S3_PREFIX || DEFAULT_PREFIX);
const SCRAPER_API_URL = process.env.SCRAPER_API_URL || DEFAULT_SCRAPER_URL;

// Configure AWS SDK from environment variables
AWS.config.update({
  region: process.env.AWS_REGION || "eu-central-1"
});

const s3 = new AWS.S3();

logger.info('Batch script initialized', {
  bucket: BUCKET_NAME,
  prefix: PREFIX,
  region: process.env.AWS_REGION || "eu-central-1",
  scraperUrl: SCRAPER_API_URL
});

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

  logger.info('Calling scraper API', { url, limit });

  try {
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

    logger.info('Scraper API response received', {
      itemCount: data.items.length,
      totalUrls: data.total || data.items.length,
      failed: data.failed || 0,
      requestId: data.requestId
    });

    return data;
  } catch (error) {
    logger.error('Failed to fetch scraped data', error, { url });
    throw error;
  }
}

async function uploadToS3(key, bodyObj) {
  const bodyStr = JSON.stringify(bodyObj, null, 2);

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: bodyStr,
    ContentType: "application/json"
  };

  try {
    await s3.putObject(params).promise();
    logger.info('File uploaded to S3', {
      bucket: BUCKET_NAME,
      key,
      size: bodyStr.length
    });
  } catch (error) {
    logger.error('Failed to upload to S3', error, { bucket: BUCKET_NAME, key });
    throw error;
  }
}

async function main() {
  const startTime = Date.now();

  try {
    const limit = parseLimitFromArgs();
    logger.info('Starting batch process', { limit });

    const data = await fetchScrapedData(limit);

    const ts = timestampSlug();

    // 1) Summary file with all items
    logger.info('Uploading summary file');
    const summaryKey = `${PREFIX}pointfive_hub_summary_${ts}.json`;
    await uploadToS3(summaryKey, data);

    // 2) Individual files per item
    logger.info('Uploading individual files', { count: data.items.length });
    let index = 0;
    let uploadedCount = 0;
    let failedCount = 0;

    for (const item of data.items) {
      index += 1;
      const idPart = item.id && String(item.id).trim()
        ? item.id.trim()
        : `item-${index}`;
      const itemKey = `${PREFIX}pointfive_${idPart}_${ts}.json`;

      try {
        await uploadToS3(itemKey, item);
        uploadedCount++;
      } catch (error) {
        failedCount++;
        logger.error('Failed to upload individual file', error, { index, id: item.id });
        // Continue with other files
      }
    }

    const duration = Date.now() - startTime;

    logger.info('Batch upload completed', {
      totalItems: data.items.length,
      uploaded: uploadedCount + 1, // +1 for summary
      failed: failedCount,
      duration,
      bucket: BUCKET_NAME,
      prefix: PREFIX
    });

    if (failedCount > 0) {
      logger.warn('Some files failed to upload', { failedCount });
      process.exit(1);
    }

  } catch (error) {
    logger.error('Batch process failed', error);
    throw error;
  }
}

// --------------- run ---------------

main().catch(err => {
  logger.error("Batch scraping and upload failed", err);
  process.exit(1);
});

