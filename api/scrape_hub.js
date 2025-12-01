// api/scrape_hub.js
//
// Vercel Node function that scrapes PointFive Cloud Efficiency Hub
// and returns normalized JSON entries.
//
// Important:
//  - Uses native fetch (Node 18+ on Vercel)
//  - Uses JSDOM to parse HTML
//

const { JSDOM } = require("jsdom");
const { URL } = require("url");

const BASE_URL = "https://hub.pointfive.co";

/**
 * Helper to fetch and parse HTML into a DOM
 */
async function fetchHtml(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
  }
  const html = await resp.text();
  return new JSDOM(html);
}

/**
 * Extract all inefficiency detail URLs from the Hub index page.
 * We look for anchor tags whose href contains "/inefficiencies/".
 */
async function extractInefficiencyUrls() {
  const indexUrl = `${BASE_URL}/hub`;
  const dom = await fetchHtml(indexUrl);
  const doc = dom.window.document;

  const links = Array.from(doc.querySelectorAll("a[href]"));
  const urls = new Set();

  for (const a of links) {
    const href = a.getAttribute("href");
    if (!href) continue;
    if (href.includes("/inefficiencies/")) {
      const full = new URL(href, BASE_URL).toString();
      urls.add(full);
    }
  }

  return Array.from(urls).sort();
}

/**
 * Get text of a tag or null if missing
 */
function textOrNull(node) {
  if (!node) return null;
  const txt = node.textContent.trim();
  return txt.length > 0 ? txt : null;
}

/**
 * Best effort helper:
 * find a label like "Service Category" then read the next meaningful sibling text.
 * The exact DOM may require adjustments.
 */
function findFieldValue(doc, fieldLabel) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (!text) continue;
    if (text === fieldLabel) {
      // Try to find something just after this label
      let current = node.parentElement;
      while (current) {
        // go to next element
        current = current.nextElementSibling;
        if (!current) break;
        const val = current.textContent.trim();
        if (val && val !== fieldLabel) {
          return val;
        }
      }
    }
  }
  return null;
}

/**
 * Extract paragraphs following a heading containing headingText
 */
function extractSectionParagraph(doc, headingText) {
  const headings = Array.from(
    doc.querySelectorAll("h1, h2, h3, h4, h5, h6, strong, b")
  );
  let headingNode =
    headings.find((h) =>
      h.textContent.toLowerCase().includes(headingText.toLowerCase())
    ) || null;

  if (!headingNode) return null;

  const texts = [];
  let node = headingNode;

  while ((node = node.nextElementSibling)) {
    const tagName = node.tagName.toLowerCase();

    // Stop when we hit another heading or a section break
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) break;

    if (tagName === "p") {
      const t = node.textContent.trim();
      if (t) texts.push(t);
    }
  }

  return texts.length > 0 ? texts.join("\n\n") : null;
}

/**
 * Extract list items following a heading
 */
function extractSectionList(doc, headingText) {
  const headings = Array.from(
    doc.querySelectorAll("h1, h2, h3, h4, h5, h6, strong, b")
  );
  let headingNode =
    headings.find((h) =>
      h.textContent.toLowerCase().includes(headingText.toLowerCase())
    ) || null;

  if (!headingNode) return [];

  let node = headingNode;
  while ((node = node.nextElementSibling)) {
    const tagName = node.tagName.toLowerCase();

    // Stop when we hit another heading
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) break;

    if (tagName === "ul" || tagName === "ol") {
      const items = Array.from(node.querySelectorAll("li"))
        .map((li) => li.textContent.trim())
        .filter(Boolean);
      if (items.length > 0) return items;
    }
  }

  return [];
}

/**
 * Extract documentation links after a heading like "Relevant Documentation"
 */
function extractDocumentationLinks(doc) {
  const headings = Array.from(
    doc.querySelectorAll("h1, h2, h3, h4, h5, h6, strong, b")
  );
  let headingNode =
    headings.find((h) =>
      h.textContent.toLowerCase().includes("relevant documentation")
    ) || null;

  if (!headingNode) return [];

  const links = [];
  let node = headingNode;

  while ((node = node.nextElementSibling)) {
    const tagName = node.tagName.toLowerCase();
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) break;

    const anchors = Array.from(node.querySelectorAll("a[href]"));
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href) continue;
      const full = new URL(href, BASE_URL).toString();
      const title = a.textContent.trim() || null;
      links.push({ title, url: full });
    }
  }

  return links;
}

/**
 * Construct a slug from URL path
 */
function slugFromUrl(url) {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  return segments[segments.length - 1] || u.hostname;
}

/**
 * Parse one inefficiency detail page into a JSON record
 */
async function parseInefficiencyDetail(url) {
  const dom = await fetchHtml(url);
  const doc = dom.window.document;

  // Title is usually main h1
  const titleNode = doc.querySelector("h1");
  const title = textOrNull(titleNode);

  // Author is often right after the title, if present
  let author = null;
  if (titleNode) {
    let candidate = titleNode.nextElementSibling;
    if (candidate) {
      const text = candidate.textContent.trim();
      if (text && !text.toLowerCase().includes("service category")) {
        author = text;
      }
    }
  }

  const serviceCategory = findFieldValue(doc, "Service Category");
  const cloudProvider = findFieldValue(doc, "Cloud Provider");
  const serviceName = findFieldValue(doc, "Service Name");
  const inefficiencyType = findFieldValue(doc, "Inefficiency Type");

  const explanation = extractSectionParagraph(doc, "Explanation");
  const billingModel = extractSectionParagraph(doc, "Relevant Billing Model");
  const detectionSignals = extractSectionList(doc, "Detection");
  const remediationActions = extractSectionList(doc, "Remediation");
  const documentationLinks = extractDocumentationLinks(doc);

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

  return record;
}

/**
 * Main Vercel handler
 *
 * Query parameters:
 *   limit  - optional integer to limit number of pages scraped
 */
module.exports = async (req, res) => {
  try {
    const limitParam = req.query.limit;
    const limit =
      typeof limitParam === "string" && limitParam.trim() !== ""
        ? parseInt(limitParam, 10)
        : null;

    const urls = await extractInefficiencyUrls();
    const selectedUrls =
      limit && Number.isFinite(limit) && limit > 0
        ? urls.slice(0, limit)
        : urls;

    const results = [];

    for (const url of selectedUrls) {
      try {
        const record = await parseInefficiencyDetail(url);
        results.push(record);
      } catch (err) {
        // Do not fail completely if one page is broken
        console.error(`Error scraping ${url}:`, err.message);
        results.push({
          id: slugFromUrl(url),
          error: true,
          error_message: err.message,
          source: { url, origin: "pointfive_cloud_efficiency_hub" },
          scraped_at: new Date().toISOString()
        });
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ count: results.length, items: results }, null, 2));
  } catch (err) {
    console.error("Fatal scraper error:", err);
    res.status(500).json({ error: true, message: err.message });
  }
};

