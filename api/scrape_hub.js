// api/scrape_hub.js
//
// Vercel serverless function that:
//  - Scrapes hub.pointfive.co/hub to discover inefficiency URLs
//  - Scrapes each inefficiency detail page
//  - Returns normalized JSON entries
//
// Usage examples:
//   /api/scrape_hub                 -> scrape index, first N entries
//   /api/scrape_hub?limit=5         -> scrape first 5 entries
//   /api/scrape_hub?url=...         -> scrape a single inefficiency URL

const { JSDOM } = require("jsdom");

const BASE_URL = "https://hub.pointfive.co";

// Configuration
const REQUEST_DELAY_MS = 300; // Delay between requests to be polite
const FETCH_TIMEOUT_MS = 8000; // Timeout for individual fetches

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
        stack: error.stack,
        name: error.name
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
 * Validate scraped data against expected schema
 */
function validateScrapedData(data) {
  const errors = [];

  if (!data.id || typeof data.id !== 'string') {
    errors.push('Missing or invalid id');
  }

  if (!data.title || typeof data.title !== 'string') {
    errors.push('Missing or invalid title');
  }

  if (data.source?.url && !data.source.url.startsWith('http')) {
    errors.push('Invalid source URL format');
  }

  if (data.documentation_links && Array.isArray(data.documentation_links)) {
    data.documentation_links.forEach((link, idx) => {
      if (link.url && !link.url.startsWith('http')) {
        errors.push(`Invalid documentation link URL at index ${idx}`);
      }
    });
  }

  if (!data.scraped_at || isNaN(Date.parse(data.scraped_at))) {
    errors.push('Missing or invalid scraped_at timestamp');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sleep utility for adding delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Section titles we expect on detail pages
const SECTION_TITLES = [
  "Explanation",
  "Relevant Billing Model",
  "Detection",
  "Remediation",
  "Relevant Documentation"
];

/**
 * Fetch HTML with timeout and return a JSDOM document.
 */
async function fetchDocument(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    logger.info('Fetching document', { url });

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "my-scraper/1.0 (Cloud Cost Optimization Research)"
      }
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }

    const html = await resp.text();
    const dom = new JSDOM(html);

    logger.info('Document fetched successfully', { url, size: html.length });
    return dom.window.document;

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      logger.error('Fetch timeout', error, { url, timeout: FETCH_TIMEOUT_MS });
      throw new Error(`Fetch timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`);
    }

    logger.error('Fetch failed', error, { url });
    throw new Error(`Failed to fetch ${url}: ${error.message}`);
  }
}

/**
 * Build a slug from a URL (last path segment).
 */
function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\/+$/, "").split("/");
    return parts[parts.length - 1];
  } catch (e) {
    return url;
  }
}

/**
 * Schema mapping
 */
function mapToSchema(raw) {
  return {
    id: raw.id ?? null,
    title: raw.title ?? null,
    author: raw.author ?? null,

    service_category: raw.service_category ?? null,
    cloud_provider: raw.cloud_provider ?? null,
    service_name: raw.service_name ?? null,
    inefficiency_type: raw.inefficiency_type ?? null,

    explanation: raw.explanation ?? "",
    billing_model: raw.billing_model ?? "",

    detection_signals: Array.isArray(raw.detection_signals)
      ? raw.detection_signals
      : [],

    remediation_actions: Array.isArray(raw.remediation_actions)
      ? raw.remediation_actions
      : [],

    documentation_links: Array.isArray(raw.documentation_links)
      ? raw.documentation_links
      : [],

    tags: Array.isArray(raw.tags) ? raw.tags : [],

    source: {
      url: raw.source?.url ?? null,
      origin: "pointfive_cloud_efficiency_hub"
    },

    scraped_at: raw.scraped_at ?? new Date().toISOString()
  };
}



/**
 * Utility: trim a text node's value safely.
 */
function textValue(node) {
  if (!node || !node.nodeValue) return "";
  return node.nodeValue.trim();
}

/**
 * Find the value that comes immediately after a label text node.
 * Example in the DOM:
 *   "Service Category"
 *   "Storage"
 */
function findFieldValue(document, labelText) {
  const walker = document.createTreeWalker(
    document.body,
    // Show text nodes (4 = NodeFilter.SHOW_TEXT)
    4
  );

  let seenLabel = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = textValue(node);

    if (!value) continue;

    if (seenLabel) {
      // First non-empty text after the label is our value
      return value;
    }

    if (value === labelText) {
      seenLabel = true;
    }
  }

  return null;
}

/**
 * Extract a section as a single paragraph (Explanation, Billing Model).
 * We locate the heading text, then aggregate following text nodes
 * until we hit another section title.
 */
function extractSectionParagraph(document, headingText) {
  const walker = document.createTreeWalker(document.body, 4); // 4 = NodeFilter.SHOW_TEXT
  let inSection = false;
  const collected = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = textValue(node);
    if (!value) continue;

    if (!inSection) {
      if (value === headingText) {
        inSection = true;
      }
      continue;
    }

    // We are inside the section
    // Stop if we hit another section title
    if (SECTION_TITLES.includes(value) && value !== headingText) {
      break;
    }

    // Skip bullet lines here; they belong to list sections
    // Explanation/Billing Model typically are sentences/paragraphs
    collected.push(value);
  }

  if (!collected.length) return null;

  // Merge and normalize spaces
  return collected.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Extract a section as a list of bullet points (Detection, Remediation).
 * The HTML on the site uses <ul><li> elements for lists.
 */
function extractSectionList(document, headingText) {
  const walker = document.createTreeWalker(document.body, 4); // 4 = NodeFilter.SHOW_TEXT
  let inSection = false;
  let foundHeading = null;

  // First, find the heading
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = textValue(node);
    if (!value) continue;

    if (value === headingText) {
      foundHeading = node;
      break;
    }
  }

  if (!foundHeading) {
    return [];
  }

  // Find the parent element containing the heading
  let container = foundHeading.parentElement;
  while (container && !container.querySelector('ul')) {
    container = container.parentElement;
  }

  if (!container) {
    return [];
  }

  // Find the next <ul> after the heading
  const ul = container.querySelector('ul');
  if (!ul) {
    return [];
  }

  // Extract all <li> items
  const items = [];
  const listItems = ul.querySelectorAll('li');
  listItems.forEach(li => {
    const text = li.textContent.trim();
    if (text) {
      items.push(text);
    }
  });

  return items;
}

/**
 * Extract documentation links that appear after "Relevant Documentation"
 * text node.
 */
function extractDocumentationLinks(document) {
  const walker = document.createTreeWalker(document.body, 4); // 4 = NodeFilter.SHOW_TEXT
  let afterHeading = false;
  const links = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = textValue(node);
    if (!value) continue;

    if (!afterHeading) {
      if (value === "Relevant Documentation") {
        afterHeading = true;
      }
      continue;
    }

    // We are after the "Relevant Documentation" text.
    // Stop if we hit another section title.
    if (SECTION_TITLES.includes(value) && value !== "Relevant Documentation") {
      break;
    }

    // Collect any anchors in the parent / siblings
    const parentEl = node.parentElement;
    if (!parentEl) continue;

    const anchors = parentEl.querySelectorAll("a[href]");
    anchors.forEach(a => {
      const href = a.getAttribute("href");
      if (!href) return;
      const url = href.startsWith("http")
        ? href
        : new URL(href, BASE_URL).toString();

      const title = (a.textContent || "").trim() || null;

      // Avoid duplicates
      if (!links.find(x => x.url === url)) {
        links.push({ title, url });
      }
    });
  }

  return links;
}

/**
 * Parse a single inefficiency detail page and return a normalized record.
 */
async function parseInefficiencyDetail(url) {
  const document = await fetchDocument(url);

  // Title: first H1 or fallback
  let title = null;
  const h1 = document.querySelector("h1");
  if (h1 && h1.textContent) {
    title = h1.textContent.trim();
  } else {
    // Fallback: the first large heading in the page text
    const walker = document.createTreeWalker(document.body, 4); // 4 = NodeFilter.SHOW_TEXT
    while (walker.nextNode()) {
      const value = textValue(walker.currentNode);
      if (value) {
        title = value;
        break;
      }
    }
  }

  // Author: text node immediately after the title
  let author = null;
  if (h1) {
    // Find next non-empty text after h1
    let node = h1.nextSibling;
    while (node) {
      if (node.nodeType === node.TEXT_NODE) {
        const val = textValue(node);
        if (val && !SECTION_TITLES.includes(val)) {
          author = val;
          break;
        }
      }
      if (node.nodeType === node.ELEMENT_NODE) {
        const val = node.textContent && node.textContent.trim();
        if (val && val !== title && !SECTION_TITLES.includes(val)) {
          author = val;
          break;
        }
      }
      node = node.nextSibling;
    }
  }

  const serviceCategory = findFieldValue(document, "Service Category");
  const cloudProvider = findFieldValue(document, "Cloud Provider");
  const serviceName = findFieldValue(document, "Service Name");
  const inefficiencyType = findFieldValue(document, "Inefficiency Type");

  const explanation = extractSectionParagraph(document, "Explanation");
  const billingModel = extractSectionParagraph(document, "Relevant Billing Model");
  const detectionSignals = extractSectionList(document, "Detection");
  const remediationActions = extractSectionList(document, "Remediation");
  const documentationLinks = extractDocumentationLinks(document);

  const record = {
    id: slugFromUrl(url),
    title,
    author,
    service_category: serviceCategory,
    cloud_provider: cloudProvider,
    service_name: serviceName,
    inefficiency_type: inefficiencyType,
    explanation,
    billing_model: billingModel,
    detection_signals: detectionSignals,
    remediation_actions: remediationActions,
    documentation_links: documentationLinks,
    tags: [],
    source: {
      url,
      origin: "pointfive_cloud_efficiency_hub"
    },
    scraped_at: new Date().toISOString()
  };

  return mapToSchema(record);
}

/**
 * Discover inefficiency URLs from the Hub index page.
 */
async function extractInefficiencyUrls(limit) {
  const urlsSet = new Set();

  // The hub uses pagination with pattern: ?ffbc0c57_page=1, ?ffbc0c57_page=2, etc.
  // We'll fetch multiple pages to get all URLs
  const MAX_PAGES = 30; // Safety limit (actual is ~24 pages for 1234 items)

  logger.info('Starting URL extraction from paginated hub');

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const indexUrl = page === 1
        ? `${BASE_URL}/hub`
        : `${BASE_URL}/hub?ffbc0c57_page=${page}`;

      const document = await fetchDocument(indexUrl);
      const anchors = Array.from(document.querySelectorAll("a[href]"));

      let foundOnThisPage = 0;
      anchors.forEach(a => {
        const href = a.getAttribute("href");
        if (!href) return;

        if (href.includes("/inefficiencies/")) {
          const fullUrl = href.startsWith("http")
            ? href
            : new URL(href, BASE_URL).toString();
          urlsSet.add(fullUrl);
          foundOnThisPage++;
        }
      });

      logger.info('Extracted URLs from page', {
        page,
        foundOnPage: foundOnThisPage,
        totalSoFar: urlsSet.size
      });

      // If we found no inefficiency URLs on this page, we've reached the end
      if (foundOnThisPage === 0) {
        logger.info('No more pages to fetch', { lastPage: page });
        break;
      }

      // Polite delay between page fetches
      if (page < MAX_PAGES) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
      }
    } catch (error) {
      logger.error('Error fetching page', error, { page });
      // Continue with other pages
    }
  }

  const urls = Array.from(urlsSet);
  urls.sort(); // deterministic order

  logger.info('URL extraction completed', {
    totalUrls: urls.length,
    sampleUrls: urls.slice(0, 3)
  });

  if (typeof limit === "number" && limit > 0) {
    return urls.slice(0, limit);
  }

  return urls;
}

/**
 * Vercel serverless function handler.
 */
module.exports = async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const urlParam = requestUrl.searchParams.get("url");
    const limitParam = requestUrl.searchParams.get("limit");

    const limit = limitParam ? parseInt(limitParam, 10) : 5; // Reduced default for safety

    logger.info('Scraper request started', {
      requestId,
      urlParam,
      limit,
      singleUrl: !!urlParam
    });

    if (urlParam) {
      // Scrape a single detail page
      try {
        const record = await parseInefficiencyDetail(urlParam);

        const validation = validateScrapedData(record);
        if (!validation.isValid) {
          logger.warn('Data validation warnings', {
            requestId,
            url: urlParam,
            errors: validation.errors
          });
        }

        logger.info('Single URL scraped successfully', {
          requestId,
          url: urlParam,
          duration: Date.now() - startTime
        });

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(JSON.stringify(record, null, 2));
        return;

      } catch (error) {
        logger.error('Failed to scrape single URL', error, { requestId, url: urlParam });
        res.status(500).json({
          error: "Failed to scrape URL",
          url: urlParam,
          details: error.message,
          requestId
        });
        return;
      }
    }

    // Discover inefficiency URLs from the hub index
    let urls;
    try {
      urls = await extractInefficiencyUrls(limit);
      logger.info('URLs discovered', { requestId, count: urls.length, limit });
    } catch (error) {
      logger.error('Failed to discover URLs', error, { requestId });
      res.status(500).json({
        error: "Failed to discover inefficiency URLs",
        details: error.message,
        requestId
      });
      return;
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      // Add polite delay between requests (skip for first request)
      if (i > 0) {
        await sleep(REQUEST_DELAY_MS);
      }

      try {
        logger.info('Scraping URL', { requestId, index: i + 1, total: urls.length, url });

        const record = await parseInefficiencyDetail(url);

        // Validate data
        const validation = validateScrapedData(record);
        if (!validation.isValid) {
          logger.warn('Data validation warnings', {
            requestId,
            url,
            errors: validation.errors
          });
        }

        results.push(record);
        logger.info('URL scraped successfully', { requestId, index: i + 1, url });

      } catch (error) {
        logger.error('Failed to scrape URL', error, { requestId, url, index: i + 1 });

        errors.push({
          url,
          error: error.message,
          index: i + 1
        });

        // Continue with next URL instead of failing completely
        continue;
      }
    }

    const duration = Date.now() - startTime;

    logger.info('Scraping batch completed', {
      requestId,
      total: urls.length,
      successful: results.length,
      failed: errors.length,
      duration
    });

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({
      requestId,
      count: results.length,
      total: urls.length,
      failed: errors.length,
      duration,
      urls,
      items: results,
      errors: errors.length > 0 ? errors : undefined
    }, null, 2));

  } catch (err) {
    logger.error('Unexpected scraper error', err, { requestId });
    res.status(500).json({
      error: "Unexpected scraper error",
      details: err.message,
      requestId
    });
  }
};
