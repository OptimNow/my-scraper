# my-scraper

A **lightweight web scraper** that extracts cloud cost optimization insights from hub.pointfive.co and stores them as structured JSON in **Amazon S3**.

## Quick Start

### Option 1: Web UI (easiest)
1. Visit https://my-scraper-roan.vercel.app
2. Enter a limit (e.g., 50 for 50 entries, or 240 for all)
3. Click "Scrape Now"
4. Click "Save to S3" to upload results

### Option 2: Batch Script (for large batches)
```powershell
# Windows PowerShell
.\scrape_batch.ps1 -Limit 240 -VercelUrl "https://my-scraper-roan.vercel.app"
```

```bash
# Mac/Linux
export SCRAPER_API_URL=https://my-scraper-roan.vercel.app/api/scrape_hub
export S3_BUCKET_NAME=your-bucket-name
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
node scripts/run_scrape_batch.js --limit=240
```

### What Gets Scraped

Each entry includes:
- **id**: Unique inefficiency identifier
- **title**: Inefficiency name
- **url**: Source URL
- **service_category**: AWS service (e.g., EC2, RDS)
- **provider**: Cloud provider (AWS, Azure, GCP)
- **inefficiency_type**: Type of issue (Cost, Performance, etc.)
- **explanation**: Detailed description
- **detection_signals**: How to detect this issue
- **remediation_actions**: How to fix it
- **documentation_links**: Related resources

---

## Overview

This project is designed to run on **Vercel serverless functions**, extract data from hub.pointfive.co, convert it into structured JSON, and upload the results into **Amazon S3** for further processing.

The long-term goal is to **construct a Knowledge Base (KB)** using the scraped JSON files as raw input for embedding and vectorization (e.g., AWS Bedrock, OpenAI, or any vector DB).



## Features

- ✅ **Full pagination support**: Discovers all 240+ inefficiencies across multiple pages
- ✅ **Web UI**: Easy-to-use interface at https://my-scraper-roan.vercel.app
- ✅ **Direct S3 upload**: Save scraped data with one click
- ✅ **Batch script**: Command-line tool for automated scraping
- ✅ **Structured JSON**: Clean, normalized data ready for KB ingestion
- ✅ **Fast scraping**: Optimized delays for maximum throughput
- ✅ **Error handling**: Continues on failures, logs all issues

------

## 1. Objectives

1. Scrape public entries from a target website (e.g., inefficiencies, best practices, knowledge pages).
2. Normalize each entry into a **clean JSON payload** matching a defined schema.
3. Store the JSON output in **Amazon S3**, not in a traditional database, to keep the workflow simple.
4. Later use the S3 JSON files to build a **searchable vector-based Knowledge Base**.
5. Deploy everything on **Vercel** as a low-cost, low-maintenance, one-time process.

------

## Configuration

### Environment Variables

Set these in Vercel Dashboard (Settings → Environment Variables):

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS IAM user access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM user secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `S3_BUCKET_NAME` | S3 bucket for storing results | `optimnow-finops-repo` |
| `AWS_REGION` | AWS region | `us-east-1` |

### IAM Permissions

Your AWS IAM user needs:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

---

## Project Structure

```
my-scraper/
  ├─ api/
  │    ├─ scrape_hub.js          # Main scraper endpoint (GET /api/scrape_hub?limit=N)
  │    └─ save_to_s3.js          # S3 upload endpoint (POST /api/save_to_s3)
  ├─ public/
  │    └─ index.html             # Web UI
  ├─ scripts/
  │    └─ run_scrape_batch.js    # Batch script for CLI usage
  ├─ scrape_batch.ps1            # PowerShell wrapper script
  ├─ package.json                # Dependencies (jsdom, aws-sdk, node-fetch)
  └─ vercel.json                 # Vercel deployment config
``` 

------

## How It Works

### 1. Web UI (Recommended for Most Users)

The web interface at https://my-scraper-roan.vercel.app provides:
- Simple form to enter scraping limit
- Real-time scraping with progress display
- Preview of scraped data in JSON format
- One-click "Save to S3" button
- Visual feedback with statistics (total, success, failed, duration)

**Usage:**
1. Open https://my-scraper-roan.vercel.app in your browser
2. Enter a limit (1-240) or leave blank for default
3. Click "Scrape Now" and wait for results
4. Review the data in the JSON preview
5. Click "Save to S3" to upload to your bucket

### 2. API Endpoint

Direct API access for automation:

```bash
# Scrape first 50 entries
curl "https://my-scraper-roan.vercel.app/api/scrape_hub?limit=50"

# Scrape all entries (240+)
curl "https://my-scraper-roan.vercel.app/api/scrape_hub?limit=240"

# Scrape a specific URL
curl "https://my-scraper-roan.vercel.app/api/scrape_hub?url=https://hub.pointfive.co/inefficiencies/..."
```

**Response format:**
```json
{
  "count": 50,
  "total": 50,
  "failed": 0,
  "items": [
    {
      "id": "aurora-extended-support",
      "title": "Aurora Extended Support",
      "url": "https://hub.pointfive.co/inefficiencies/aurora-extended-support",
      "service_category": "RDS",
      "provider": "AWS",
      "inefficiency_type": "Cost",
      "explanation": "...",
      "detection_signals": ["..."],
      "remediation_actions": ["..."],
      "documentation_links": ["..."]
    }
  ],
  "duration": 45000
}
```

### 3. Batch Script (For Automation)

Use the command-line script to scrape and upload in one step:

```powershell
# Windows PowerShell
.\scrape_batch.ps1 -Limit 240 -VercelUrl "https://my-scraper-roan.vercel.app"
```

```bash
# Mac/Linux
export SCRAPER_API_URL=https://my-scraper-roan.vercel.app/api/scrape_hub
export S3_BUCKET_NAME=optimnow-finops-repo
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=us-east-1
node scripts/run_scrape_batch.js --limit=240
```

The script will:
1. Call the scraper API with your limit
2. Receive all scraped entries
3. Upload a summary file + individual files to S3
4. Log results with structured JSON output

**S3 Output:**
```
s3://your-bucket/Recos/scraper_summary_2025-12-04T12-00-00-000Z.json
s3://your-bucket/Recos/scraped_aurora-extended-support_2025-12-04T12-00-00-000Z.json
s3://your-bucket/Recos/scraped_idle-ec2-instances_2025-12-04T12-00-00-000Z.json
...
```

------

## 4. S3 Storage Workflow

Instead of storing scraped results in a database, the project uses **Amazon S3** for simplicity and transparency:

### Why S3 instead of a database?

- Easy to store raw JSON or NDJSON without schema constraints
- Cheap, scalable, durable
- Perfect for downstream KB pipelines
- Ideal for versioning / snapshots (dates, runs, etc.)

### Typical JSON file naming:

```
s3://my-bucket/scraper/2025-02-21/page-aurora-extended-support.json
s3://my-bucket/scraper/2025-02-21/index.json
```

### Downstream usage:

1. Read JSON files from S3
2. Vectorize (embedding models)
3. Populate your KB (Bedrock KBs, OpenSearch, Pinecone, Qdrant, Chroma, etc.)

------

## 5. Deploying on Vercel

1. Install Vercel CLI (optional):

   ```
   npm i -g vercel
   ```

2. Login:

   ```
   vercel login
   ```

3. Deploy:

   ```
   vercel deploy
   ```

4. After initial deploy, production deploy:

   ```
   vercel --prod
   ```

Vercel will detect the configuration in `vercel.json` and expose the `/api/scrape_hub` endpoint automatically.

------

## 6. Environment Variables

Set these in Vercel Dashboard:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET_NAME`

Your `.gitignore` already ensures `.env` files and config directories are ignored. 

------

## 7. Running locally

Install dependencies:

```
npm install
```

Start dev mode:

```
npm run start
```

Run batch scraper locally:

```
npm run scrape
```



# 8. End-to-End Workflow (from scraping to KB)

This is the practical “how the whole pipeline works” flow:

### Step 1 — Discover the target pages

- Manually identify the URLs you want to scrape (e.g., all inefficiency pages).
- Optionally build a small “URL discovery” function that crawls the index page and extracts links.

### Step 2 — Scrape pages via Vercel Serverless

- Each request to `/api/scrape_hub` fetches one or many pages.
- For one-shot operations: trigger the endpoint manually or via a local script.

### Step 3 — Parse & Normalize HTML

- Use JSDOM or Cheerio to create a DOM.
- Extract the fields defined in your JSON schema (title, description, detection rules…).
- Normalize the data:
  - remove HTML noise
  - standardize newlines, arrays, formatting
  - add metadata (scraped_at, url, slug)

### Step 4 — JSON Output

- Each scraped page becomes one JSON object or one entry in an array.
- Save raw JSON (before cleaning) if needed for debugging.
- Emit the final normalized JSON.

### Step 5 — Upload JSON to Amazon S3

- Use AWS SDK v2 or v3 inside the script or serverless function.

- Use a predictable filename structure:

  ```
  scraper/YYYY-MM-DD/slug.json
  ```

- Keep everything immutable: never overwrite raw versions.

### Step 6 — Build a Knowledge Base from S3

- Later, run an embedding pipeline:
  - Read S3 files
  - Convert each JSON entry to embedding text
  - Use Bedrock, OpenAI, or another embedding model
  - Store vectors in a vector database (or Bedrock KB vector index)
- The KB then becomes queryable:
  - optimization rules
  - inefficiency detection
  - remediation patterns

------

# 9. Attention Points, Pitfalls, and Best Practices

### A. Technical

- **Do not exceed serverless execution time**
   Vercel functions may time out if scraping too many pages in one call; batch into smaller groups.
- **Memory limits**
   Avoid building huge DOMs; keep the batch size reasonable.
- **Keep the scraper “polite”**
   Add delays between requests to avoid triggering anti-bot rules.
- **Logging**
   Log both success and partial failures to S3 or console output.

### B. Security

- **Never commit AWS credentials**
   Your `.gitignore` already protects `.env` and config files.
- Prefer AWS SDK v3 with environment variables in Vercel.
- Narrow IAM permissions:
  - Bucket-only
  - Write-only or write-plus-list

### C. Legal & Ethical

- **Robots.txt check**
   PointFive explicitly allows crawling (User-agent: * Allow: /).
- **Fair-use scraping**
   Limited frequency, single run, no aggressive crawling.
- **Content reuse**
   If reused publicly:
  - re-write
  - summarise
  - merge insights
  - avoid reproducing raw text verbatim

### D. Data Quality

- Scraped content may vary page to page:
  - missing sections
  - inconsistent headings
  - empty lists
- Always validate:
  - required fields
  - optional fields
  - fallback logic
- Keep defensive coding when scraping.

### E. KB Construction

- Normalize terminology before embedding:
  - “Idle EC2”, “Unused EC2”, “Stopped instance” should not create 3 different concepts.
- Consider generating:
  - embeddings for the **full JSON**
  - embeddings for **each section** (explanation, remediation, detection)
  - embeddings for custom summaries
- Use embeddings that handle technical text well (e.g., Titan Embeddings v2, OpenAI text-embedding-3-large).
