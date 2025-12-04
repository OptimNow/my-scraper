# Checklist Pré-Déploiement

## ✅ Tests Locaux

### 1. Installation et Vérification
```bash
# Installer les dépendances
[ ] npm install

# Vérifier que package-lock.json est créé
[ ] ls package-lock.json

# Vérifier la syntaxe
[ ] node -c api/scrape_hub.js
[ ] node -c scripts/run_scrape_batch.js
```

### 2. Configuration Locale
```bash
# Copier le fichier d'exemple
[ ] cp .env.example .env

# Éditer .env avec vos vraies credentials
[ ] nano .env  # ou votre éditeur préféré

# Vérifier que .env n'est PAS tracké par git
[ ] git status | grep -q ".env" && echo "ERREUR: .env est tracké!" || echo "OK"
```

### 3. Test de l'API en Local
```bash
# Démarrer le serveur de développement Vercel
[ ] vercel dev
# (doit afficher "Ready! Available at http://localhost:3000")

# Dans un autre terminal, tester une requête simple
[ ] curl "http://localhost:3000/api/scrape_hub?limit=1" | jq

# Vérifier la réponse JSON contient:
[ ] - requestId
[ ] - count
[ ] - items array
[ ] - logging structuré visible dans les logs du serveur
```

### 4. Test du Script Batch
```bash
# S'assurer que le serveur local tourne
[ ] (vercel dev dans un terminal)

# Configurer les variables d'environnement
[ ] export AWS_ACCESS_KEY_ID=xxx
[ ] export AWS_SECRET_ACCESS_KEY=xxx
[ ] export S3_BUCKET_NAME=your-test-bucket
[ ] export SCRAPER_API_URL=http://localhost:3000/api/scrape_hub

# Tester avec limite de 1
[ ] node scripts/run_scrape_batch.js --limit=1

# Vérifier les fichiers dans S3
[ ] aws s3 ls s3://your-test-bucket/Recos/
```

---

## 🚀 Déploiement Vercel

### 5. Configuration Vercel
```bash
# Se connecter à Vercel (si pas déjà fait)
[ ] vercel login

# Lier le projet (si pas déjà fait)
[ ] vercel link
```

### 6. Variables d'Environnement Vercel
Dans le dashboard Vercel (https://vercel.com/dashboard):

[ ] Aller dans Project Settings > Environment Variables
[ ] Ajouter AWS_ACCESS_KEY_ID (Production)
[ ] Ajouter AWS_SECRET_ACCESS_KEY (Production)
[ ] Ajouter S3_BUCKET_NAME (Production)
[ ] Ajouter AWS_REGION (Production, optionnel)
[ ] Ajouter S3_PREFIX (Production, optionnel)

### 7. Déploiement
```bash
# Déployer en production
[ ] vercel --prod

# Noter l'URL de déploiement
[ ] URL: _________________________________

# Attendre la fin du build (environ 1-2 minutes)
```

### 8. Tests de Production
```bash
# Tester l'endpoint de production
[ ] curl "https://your-app.vercel.app/api/scrape_hub?limit=1" | jq

# Vérifier la réponse contient des données valides
[ ] Pas d'erreur 500
[ ] JSON bien formé
[ ] items array non vide

# Tester avec une URL spécifique
[ ] curl "https://your-app.vercel.app/api/scrape_hub?url=https://hub.pointfive.co/hub/inefficiencies/..." | jq
```

### 9. Test du Batch Script en Production
```bash
# Configurer l'URL de production
[ ] export SCRAPER_API_URL=https://your-app.vercel.app/api/scrape_hub
[ ] export AWS_ACCESS_KEY_ID=xxx
[ ] export AWS_SECRET_ACCESS_KEY=xxx
[ ] export S3_BUCKET_NAME=your-prod-bucket

# Lancer un petit batch de test
[ ] node scripts/run_scrape_batch.js --limit=2

# Vérifier les fichiers dans S3 de production
[ ] aws s3 ls s3://your-prod-bucket/Recos/ --recursive | tail -10
```

---

## 📊 Vérifications Post-Déploiement

### 10. Monitoring des Logs
```bash
# Voir les logs Vercel
[ ] vercel logs --follow

# Vérifier qu'il n'y a pas d'erreurs
[ ] Rechercher "error" dans les logs
[ ] Vérifier que le logging structuré fonctionne (JSON)
```

### 11. Vérification des Données S3
```bash
# Télécharger un fichier de test
[ ] aws s3 cp s3://your-bucket/Recos/pointfive_xxx.json test.json

# Vérifier le contenu
[ ] cat test.json | jq

# Vérifier les champs requis
[ ] cat test.json | jq 'has("id", "title", "source", "scraped_at")'
```

### 12. Tests de Charge (Optionnel)
```bash
# Tester avec limite plus élevée
[ ] curl "https://your-app.vercel.app/api/scrape_hub?limit=5"

# Vérifier que ça ne timeout pas (< 10s sur free tier)
[ ] Mesurer le temps de réponse

# Si timeout, réduire la limite par défaut davantage
```

---

## 🛡️ Sécurité

### 13. Vérifications de Sécurité
[ ] .env est dans .gitignore et NON commité
[ ] Les credentials AWS ont les permissions minimales (S3 PutObject seulement)
[ ] Le bucket S3 n'est pas public
[ ] Les logs ne contiennent PAS de credentials
[ ] User-Agent est approprié (pas example.com)

---

## 📝 Documentation

### 14. Mise à Jour de la Documentation
[ ] README.md est à jour avec les nouvelles features
[ ] Variables d'environnement documentées
[ ] Exemples de commandes testés et fonctionnels
[ ] Limites connues documentées (timeout Vercel, etc.)

---

## ✅ Validation Finale

Si toutes les cases sont cochées:

- ✅ Code fonctionne localement
- ✅ Code fonctionne en production
- ✅ Données arrivent correctement dans S3
- ✅ Logging structuré fonctionne
- ✅ Gestion d'erreurs testée
- ✅ Pas de secrets exposés
- ✅ Documentation à jour

**🎉 VOTRE SCRAPER EST PRÊT POUR LA PRODUCTION ! 🎉**

---

## 🆘 Troubleshooting

### Problèmes Courants

**Erreur: "Missing required environment variables"**
- Solution: Vérifier que AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, et S3_BUCKET_NAME sont définis

**Erreur: "Fetch timeout after 8000ms"**
- Solution: Le site hub.pointfive.co est peut-être lent, augmenter FETCH_TIMEOUT_MS dans api/scrape_hub.js

**Erreur: "Vercel Function Timeout (10s)"**
- Solution: Réduire la limite par défaut (actuellement 5), ou upgrader vers Vercel Pro (60s timeout)

**Erreur: "Access Denied" lors de l'upload S3**
- Solution: Vérifier les permissions IAM de votre utilisateur AWS

**Pas de données dans S3**
- Solution: Vérifier les logs Vercel, vérifier BUCKET_NAME, vérifier les credentials AWS

---

## 📞 Support

- Documentation Vercel: https://vercel.com/docs
- Documentation AWS S3: https://docs.aws.amazon.com/s3/
- Issues GitHub: Créer une issue dans votre repo
