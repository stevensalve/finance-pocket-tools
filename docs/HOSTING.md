# Hosting

The toolkit is a folder of static files. "Hosting" means putting them where people can open them. There is nothing to compile and no server-side code, database or secret.

## Option 1 - GitHub Pages (recommended, included)

1. Push the repository to GitHub (your own account or organisation).
2. In the repository: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
3. Push to `main`. The workflow `.github/workflows/pages.yml` runs `node scripts/build-site.mjs` (no dependencies to install), uploads the `_site/` folder and deploys it.
4. Your site appears at `https://<owner>.github.io/<repository>/`.

Notes:

- The workflow needs no tokens or secrets; it uses GitHub's built-in OIDC permissions (`pages: write`, `id-token: write`).
- All links are relative, so the site works under a sub-path such as `/finance-pocket-tools/`.
- To publish a single tool as its own site, use `npm run export-tool` (see [SPLITTING-A-TOOL.md](SPLITTING-A-TOOL.md)).
- Using a custom domain: add a `CNAME` file via the repository's Pages settings.

## Option 2 - Any static host

Run `npm run build`, then upload the `_site/` folder:

| Host                                          | How                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Netlify                                       | Drag `_site/` onto the Netlify dashboard, or connect the repo with build command `node scripts/build-site.mjs` and publish directory `_site` |
| Cloudflare Pages                              | Same settings as Netlify                                                                                                                     |
| Azure Static Web Apps / S3 + CloudFront / GCS | Upload `_site/` as static content                                                                                                            |
| Nginx / Apache / IIS                          | Copy `_site/` into the web root                                                                                                              |

No special headers are required (the CSP is in each page). For extra defence you may also send the same policy as an HTTP header and add `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.

## Option 3 - Inside a company network

- Copy `_site/` to an internal web server or an IIS/Nginx folder. Staff then use a bookmark; nothing leaves the building.
- Or put the repository ZIP on a shared drive and tell people to double-click `index.html`.
- Because nothing calls home, the tools work on air-gapped machines.

## Option 4 - No hosting at all

Download the ZIP, unzip, open `index.html`. This is the "offline" mode in the main README.

## Hosting versus opening from disk

Everything works from `file://`, with two small differences worth knowing:

- **Nothing is stored in the browser**, so a downloaded copy and a hosted copy behave the same. Save work-in-progress to a `.json` file and open it again later.
- **Hosting tools that handle financial data**: the tools never upload data, but if you host them on an intranet make sure only authorised staff can open the pages, and keep the site on HTTPS.

## Checking a deployment

- Open the site, then switch the browser to offline mode (DevTools -> Network -> Offline) and reload. Every tool should still load (after the first visit, a normal HTTP cache is enough; for guaranteed offline use, download the ZIP).
- Open DevTools -> Console: there should be no red errors and no blocked requests.
