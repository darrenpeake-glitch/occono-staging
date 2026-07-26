# Occono website

Production website for [Occono](https://www.occono.co.uk/), an independent web studio serving small businesses in Devon, Cornwall and across the UK.

## Production

- Live domain: `https://www.occono.co.uk/`
- Hosting: GitHub Pages
- Default branch: `main`
- Contact-form backend: Google Apps Script
- Enquiry delivery: Google Sheets and Google Workspace Gmail

## Structure

- `index.html` — main studio website
- `assets/` — shared styles, scripts and brand assets
- `case-studies/` — portfolio case studies
- `marine/`, `garage/`, `stays/`, `restaurant/`, `builder/`, `shop/` — noindexed concept websites
- `privacy.html`, `cookies.html`, `accessibility.html`, `website-terms.html` — public information pages
- `sitemap.xml`, `robots.txt`, `CNAME` — search and domain configuration

## Deployment

Changes pushed to `main` are published by GitHub Pages. Keep the `CNAME` file set to `www.occono.co.uk`.

## Contact form

The public form submits JSON to the deployed Google Apps Script endpoint in `assets/site.js`. The endpoint URL is public by design; validation, spam filtering and delivery controls belong in the Apps Script backend.

## Portfolio disclosure

Concept websites are clearly labelled and excluded from search indexing. They demonstrate design and development capability and are not represented as commissioned client work.
