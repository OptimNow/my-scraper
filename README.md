# my-scraper
This project is a **lightweight web scraper**, designed to run once (or occasionally) on **Vercel serverless functions**, extract data from a public website, convert it into structured JSON, and upload the results into **Amazon S3** for further processing.

The long-term goal is to **construct a Knowledge Base (KB)** using the scraped JSON files as raw input for embedding and vectorization (e.g., AWS Bedrock, OpenAI, or any vector DB).

The project is intentionally minimalistic and oriented toward automation, portability, and one-shot execution.



## 0. Next Steps

- Implement the scraper logic in `api/scrape_hub.js`. (done)
- Map extracted content to your internal JSON schema. (done)
- Build S3 upload utility in `scripts/run_scrape_batch.js`. (done)
- Generate datasets and upload them.
- Validate quality and standardize metadata.
- Run embeddings to create your Knowledge Base.

------

## 1. Objectives

1. Scrape public entries from a target website (e.g., inefficiencies, best practices, knowledge pages).
2. Normalize each entry into a **clean JSON payload** matching a defined schema.
3. Store the JSON output in **Amazon S3**, not in a traditional database, to keep the workflow simple.
4. Later use the S3 JSON files to build a **searchable vector-based Knowledge Base**.
5. Deploy everything on **Vercel** as a low-cost, low-maintenance, one-time process.

------

## 2. Project Structure

The repository follows a simple layout:

```
my-scraper/
  ├─ api/
  │    └─ scrape_hub.js          # Main Vercel serverless scraper endpoint
  ├─ scripts/
  │    └─ run_scrape_batch.js    # Optional batch scraper (run locally or in CI)
  ├─ config/
  │    └─ s3.config.js           # S3 client configuration (env-based)
  ├─ .gitignore                  # Standard Node.js + env ignores
  ├─ package.json                # Project dependencies & scripts
  ├─ vercel.json                 # Vercel deployment configuration
  └─ README.md                   # This documentation
```

### Relevant files

- `.gitignore` includes Node.js artifacts, env files, AWS config files, and build directories. 
- `package.json` declares dependencies (`node-fetch`, `jsdom`, `aws-sdk`) and simple scripts (`start`, `scrape`). 
- `vercel.json` exposes the `/api/scrape_hub` endpoint as a serverless function. 

------

## 3. How the scraper works

### 3.1. Serverless endpoint

The file:

```
api/scrape_hub.js
```

will:

1. Fetch one page or multiple pages from the target website.

2. Use **JSDOM** (or Cheerio) to parse the HTML.

3. Extract fields such as:

   - id / slug
   - title
   - service category
   - provider
   - inefficiency type
   - explanation
   - detection signals
   - remediation actions
   - documentation links

4. Produce a JSON object that matches your internal schema.

5. Return the JSON when you call the endpoint:

   ```
   https://<your-vercel-deployment>/api/scrape_hub
   ```

### 3.2. Batch script (optional)

The script:

```
scripts/run_scrape_batch.js
```

allows you to:

- Loop over many URLs
- Aggregate results
- Upload them into S3 in one pass
- Or dump them locally for inspection

This script is optional but very useful for development and debugging.

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
