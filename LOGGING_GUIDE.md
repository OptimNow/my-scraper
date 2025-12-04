# Guide de Logging Structuré

## 📊 Vue d'Ensemble

Le scraper utilise maintenant un **logging structuré au format JSON** pour faciliter le monitoring, le debugging et l'analyse des données.

---

## 🎯 Avantages du Logging Structuré

### Avant (Console.log classique)
```
Calling scraper API: http://...
Uploaded to s3://bucket/key
Scraper error: TypeError: Cannot read property...
```

**Problèmes:**
- ❌ Difficile à parser automatiquement
- ❌ Pas de timestamp précis
- ❌ Pas de contexte (requestId, duration, etc.)
- ❌ Difficile à filtrer ou analyser

### Après (JSON structuré)
```json
{"level":"info","timestamp":"2025-02-04T10:30:00.123Z","message":"Calling scraper API","url":"http://...","limit":5}
{"level":"info","timestamp":"2025-02-04T10:30:03.456Z","message":"File uploaded to S3","bucket":"my-bucket","key":"Recos/xxx","size":1234}
{"level":"error","timestamp":"2025-02-04T10:30:05.789Z","message":"Scraper error","error":{"message":"Cannot read property...","stack":"...","name":"TypeError"}}
```

**Avantages:**
- ✅ Facile à parser (JSON standard)
- ✅ Timestamps ISO 8601 précis
- ✅ Métadonnées riches (requestId, duration, counts)
- ✅ Facile à filtrer avec jq, grep, ou outils d'analyse

---

## 📝 Format des Logs

Tous les logs suivent ce format de base:

```json
{
  "level": "info|warn|error",
  "timestamp": "ISO 8601 datetime",
  "message": "Human readable message",
  ...metadata
}
```

### Niveaux de Log

| Niveau | Usage | Exemple |
|--------|-------|---------|
| `info` | Opérations normales | "Scraping URL", "File uploaded" |
| `warn` | Situations inhabituelles mais non bloquantes | "Data validation warnings", "Some files failed" |
| `error` | Erreurs nécessitant attention | "Fetch timeout", "Upload failed" |

---

## 🔍 Exemples de Logs par Opération

### 1. Requête API Scraper

**Démarrage:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T10:30:00.123Z",
  "message": "Scraper request started",
  "requestId": "a7c3f2",
  "urlParam": null,
  "limit": 5,
  "singleUrl": false
}
```

**Fetch d'une page:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T10:30:01.456Z",
  "message": "Fetching document",
  "url": "https://hub.pointfive.co/hub/inefficiencies/..."
}
```

**Succès:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T10:30:02.789Z",
  "message": "Document fetched successfully",
  "url": "https://...",
  "size": 45678
}
```

**Validation warning:**
```json
{
  "level": "warn",
  "timestamp": "2025-02-04T10:30:03.012Z",
  "message": "Data validation warnings",
  "requestId": "a7c3f2",
  "url": "https://...",
  "errors": ["Missing or invalid title"]
}
```

**Completion:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T10:30:05.345Z",
  "message": "Scraping batch completed",
  "requestId": "a7c3f2",
  "total": 5,
  "successful": 5,
  "failed": 0,
  "duration": 5222
}
```

### 2. Erreur de Scraping

**Timeout:**
```json
{
  "level": "error",
  "timestamp": "2025-02-04T10:30:08.678Z",
  "message": "Fetch timeout",
  "error": {
    "message": "Fetch timeout after 8000ms: https://...",
    "stack": "Error: Fetch timeout...\n    at fetchDocument...",
    "name": "Error"
  },
  "url": "https://...",
  "timeout": 8000
}
```

**Erreur HTTP:**
```json
{
  "level": "error",
  "timestamp": "2025-02-04T10:30:10.901Z",
  "message": "Fetch failed",
  "error": {
    "message": "Failed to fetch https://...: HTTP 503 Service Unavailable",
    "stack": "Error: Failed to fetch...",
    "name": "Error"
  },
  "url": "https://..."
}
```

### 3. Script Batch

**Initialisation:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T11:00:00.000Z",
  "message": "Batch script initialized",
  "bucket": "my-bucket",
  "prefix": "Recos/",
  "region": "eu-central-1",
  "scraperUrl": "http://localhost:3000/api/scrape_hub"
}
```

**Appel API:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T11:00:01.234Z",
  "message": "Calling scraper API",
  "url": "http://localhost:3000/api/scrape_hub?limit=5",
  "limit": 5
}
```

**Réponse API:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T11:00:05.678Z",
  "message": "Scraper API response received",
  "itemCount": 5,
  "totalUrls": 5,
  "failed": 0,
  "requestId": "a7c3f2"
}
```

**Upload S3:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T11:00:06.789Z",
  "message": "File uploaded to S3",
  "bucket": "my-bucket",
  "key": "Recos/pointfive_hub_summary_2025-02-04T11-00-00-000Z.json",
  "size": 12345
}
```

**Completion:**
```json
{
  "level": "info",
  "timestamp": "2025-02-04T11:00:15.012Z",
  "message": "Batch upload completed",
  "totalItems": 5,
  "uploaded": 6,
  "failed": 0,
  "duration": 15012,
  "bucket": "my-bucket",
  "prefix": "Recos/"
}
```

---

## 🛠️ Utilisation des Logs

### Filtrage avec grep

**Voir uniquement les erreurs:**
```bash
vercel logs | grep '"level":"error"'
```

**Voir un requestId spécifique:**
```bash
vercel logs | grep '"requestId":"a7c3f2"'
```

**Voir les timeouts:**
```bash
vercel logs | grep 'timeout'
```

### Parsing avec jq

**Extraire tous les messages d'erreur:**
```bash
vercel logs | jq 'select(.level == "error") | .message'
```

**Compter les succès vs échecs:**
```bash
vercel logs | jq 'select(.message == "Scraping batch completed") | {successful, failed}'
```

**Voir la durée moyenne:**
```bash
vercel logs | jq 'select(.duration) | .duration' | awk '{sum+=$1; count++} END {print sum/count}'
```

**Voir tous les URLs scrapées:**
```bash
vercel logs | jq 'select(.message == "URL scraped successfully") | .url'
```

### Analyse avec Node.js

**Script d'analyse simple:**
```javascript
const fs = require('fs');
const logs = fs.readFileSync('logs.json', 'utf8')
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

// Statistiques
const errors = logs.filter(l => l.level === 'error').length;
const warnings = logs.filter(l => l.level === 'warn').length;
const successes = logs.filter(l => l.message === 'URL scraped successfully').length;

console.log({ errors, warnings, successes });

// Durée moyenne
const durations = logs
  .filter(l => l.duration)
  .map(l => l.duration);
const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

console.log({ avgDuration });
```

### Monitoring avec outils tiers

**DataDog, New Relic, Splunk:**
```javascript
// Les logs JSON structurés sont automatiquement parsés
// Vous pouvez créer des dashboards et alertes basés sur:
// - error.message contient "timeout"
// - duration > 5000
// - failed > 0
```

---

## 🔧 Personnalisation

### Ajouter des champs custom

Si vous voulez ajouter des informations supplémentaires:

```javascript
logger.info('Custom operation', {
  customField1: 'value1',
  customField2: 42,
  customField3: { nested: 'object' }
});
```

Résultat:
```json
{
  "level": "info",
  "timestamp": "...",
  "message": "Custom operation",
  "customField1": "value1",
  "customField2": 42,
  "customField3": {"nested": "object"}
}
```

### Changer le format

Pour passer à un format différent (ex: logfmt):

```javascript
const logger = {
  info: (msg, meta = {}) => {
    const parts = [`level=info`, `msg="${msg}"`];
    for (const [k, v] of Object.entries(meta)) {
      parts.push(`${k}="${v}"`);
    }
    console.log(parts.join(' '));
  }
};
```

---

## 📊 Métriques Importantes à Surveiller

### Performance
- `duration` - Temps total de l'opération (ms)
- `size` - Taille des fichiers (bytes)
- `timeout` - Timeouts observés

### Fiabilité
- `successful` / `failed` - Ratio de succès
- `error.message` - Types d'erreurs fréquents
- `validation.errors` - Qualité des données

### Utilisation
- `requestId` - Volume de requêtes
- `limit` - Paramètres utilisés
- `itemCount` - Données produites

---

## 🚨 Alertes Recommandées

### Erreurs critiques
```javascript
if (log.level === 'error' && log.message.includes('S3')) {
  // Alert: S3 upload failures
}

if (log.level === 'error' && log.message.includes('timeout')) {
  // Alert: High number of timeouts
}
```

### Dégradation de performance
```javascript
if (log.duration && log.duration > 8000) {
  // Alert: Slow operations
}

if (log.failed && log.failed > log.successful * 0.2) {
  // Alert: High failure rate (>20%)
}
```

---

## 📚 Ressources

- [JSON Lines format](http://jsonlines.org/)
- [jq manual](https://stedolan.github.io/jq/manual/)
- [Structured Logging Best Practices](https://www.loggly.com/blog/structured-logging-best-practices/)
- [Vercel Logging](https://vercel.com/docs/observability/runtime-logs)

---

**💡 Tip:** Activez le logging structuré dans vos outils de monitoring pour profiter pleinement de ces données !
