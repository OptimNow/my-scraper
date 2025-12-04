// api/save_to_s3.js
//
// Vercel serverless function that saves scraped data to S3
//
// Usage:
//   POST /api/save_to_s3
//   Body: { "data": { scraped data object or array } }
//
// Required env vars:
//    AWS_ACCESS_KEY_ID
//    AWS_SECRET_ACCESS_KEY
//    S3_BUCKET_NAME

const AWS = require("aws-sdk");

/**
 * Structured logger
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
  }
};

/**
 * Generate timestamp slug
 */
function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Normalize S3 prefix
 */
function normalizePrefix(prefix) {
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : prefix + "/";
}

/**
 * Upload to S3
 */
async function uploadToS3(s3, bucketName, key, bodyObj) {
  const bodyStr = JSON.stringify(bodyObj, null, 2);

  const params = {
    Bucket: bucketName,
    Key: key,
    Body: bodyStr,
    ContentType: "application/json"
  };

  await s3.putObject(params).promise();

  logger.info('File uploaded to S3', {
    bucket: bucketName,
    key,
    size: bodyStr.length
  });

  return {
    bucket: bucketName,
    key,
    size: bodyStr.length,
    url: `s3://${bucketName}/${key}`
  };
}

/**
 * Vercel serverless function handler
 */
module.exports = async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: "Method not allowed",
      message: "Use POST to save data to S3"
    });
  }

  // Read environment variables INSIDE the handler (required for Vercel)
  const BUCKET_NAME = process.env.S3_BUCKET_NAME;
  const PREFIX = normalizePrefix(process.env.S3_PREFIX || "Recos/");
  const AWS_REGION = process.env.AWS_REGION || "us-east-1";

  // Configure AWS SDK with credentials from environment
  AWS.config.update({
    region: AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });

  const s3 = new AWS.S3();

  // Validate environment variables
  logger.info('S3 Configuration check', {
    requestId,
    bucketName: BUCKET_NAME || 'NOT_SET',
    hasAwsKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasAwsSecret: !!process.env.AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION
  });

  if (!BUCKET_NAME) {
    logger.error('S3_BUCKET_NAME not configured', null, { requestId });
    return res.status(500).json({
      error: "Server configuration error",
      message: "S3_BUCKET_NAME environment variable is not set. Please configure it in Vercel Settings → Environment Variables",
      requestId
    });
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials not configured', null, { requestId });
    return res.status(500).json({
      error: "Server configuration error",
      message: "AWS credentials are not configured",
      requestId
    });
  }

  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        error: "Missing data",
        message: "Request body must contain a 'data' field",
        requestId
      });
    }

    logger.info('Save to S3 request started', {
      requestId,
      isArray: Array.isArray(data),
      itemCount: Array.isArray(data) ? data.length : 1
    });

    const ts = timestampSlug();
    const prefix = normalizePrefix(PREFIX);
    const uploadedFiles = [];

    // If data is an array (batch), save summary + individual files
    if (Array.isArray(data)) {
      // Summary file
      const summaryKey = `${prefix}scraper_summary_${ts}.json`;
      const summaryResult = await uploadToS3(s3, BUCKET_NAME, summaryKey, {
        count: data.length,
        items: data,
        saved_at: new Date().toISOString(),
        requestId
      });
      uploadedFiles.push(summaryResult);

      // Individual files
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const idPart = item.id && String(item.id).trim()
          ? item.id.trim()
          : `item-${i + 1}`;
        const itemKey = `${prefix}scraped_${idPart}_${ts}.json`;

        try {
          const result = await uploadToS3(s3, BUCKET_NAME, itemKey, item);
          uploadedFiles.push(result);
        } catch (error) {
          logger.error('Failed to upload individual file', error, {
            requestId,
            index: i + 1,
            id: item.id
          });
          // Continue with other files
        }
      }
    } else {
      // Single item
      const idPart = data.id && String(data.id).trim()
        ? data.id.trim()
        : `item-${ts}`;
      const itemKey = `${prefix}scraped_${idPart}_${ts}.json`;
      const result = await uploadToS3(s3, BUCKET_NAME, itemKey, data);
      uploadedFiles.push(result);
    }

    const duration = Date.now() - startTime;

    logger.info('Save to S3 completed', {
      requestId,
      filesUploaded: uploadedFiles.length,
      duration
    });

    res.status(200).json({
      success: true,
      requestId,
      filesUploaded: uploadedFiles.length,
      files: uploadedFiles,
      duration,
      bucket: BUCKET_NAME,
      prefix
    });

  } catch (error) {
    logger.error('Save to S3 failed', error, { requestId });

    res.status(500).json({
      error: "Failed to save to S3",
      message: error.message,
      requestId
    });
  }
};
