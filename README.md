# Systemintegrationsoverblik

Interaktivt værktøj til at kortlægge og visualisere systemintegrationer. Helt gratis, ingen API-nøgler.

## Kom i gang på GitHub Pages

### 1. Opret repository
- Gå til [github.com](https://github.com) og log ind
- Klik **"New repository"** (grøn knap øverst til højre)
- Navngiv det `systemintegration`
- Sæt det til **Public**
- Klik **"Create repository"**

### 2. Upload filerne
Klik **"uploading an existing file"** og træk disse filer/mapper ind:
```
index.html
package.json
vite.config.js
src/
  main.jsx
  App.jsx
.github/
  workflows/
    deploy.yml
```
Klik **"Commit changes"**

### 3. Aktivér GitHub Pages
- Gå til **Settings → Pages**
- Under "Source": vælg **"Deploy from a branch"**
- Branch: **`gh-pages`** / `/ (root)`
- Klik **Save**

### 4. Vent på første deploy
- Gå til **Actions**-fanen
- Vent 1-2 minutter på at bygningen er færdig (grønt flueben)

### Din app er live på:
```
https://[dit-github-brugernavn].github.io/systemintegration/
```

## Lokal udvikling (valgfrit)
```bash
npm install
npm run dev
```
