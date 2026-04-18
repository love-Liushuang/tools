# Project Map

## Repo shape

- Root package name: `toolbox-site`
- Frontend: `client/` with React 18 + Vite + React Router
- Backend: `server/index.js` with Express
- Root scripts:
  - `npm run dev` -> start server and client together
  - `npm run build` -> build `client/`
  - `npm start` -> serve production app from Node
- Client scripts:
  - `npm --prefix client run dev`
  - `npm --prefix client run build`

## Main integration points

- Tool registry: `client/src/data/tools.js`
  - category list
  - tool card metadata
  - featured tool ids
- Route wiring: `client/src/App.jsx`
  - imports page components
  - defines `/tools/*` routes
  - holds alias redirects
- Shared layout and chrome:
  - `client/src/components/SiteLayout.jsx`
  - `client/src/components/ToolPageShell.jsx`
  - `client/src/components/PageNotice.jsx`
  - `client/src/components/ToastProvider.jsx`
- Shared client helpers:
  - `client/src/lib/tool.js` for `copyText`
  - other tool-specific helpers live under `client/src/lib/*`
- Global styling: `client/src/styles.css`
- Changelog page: `client/src/pages/ChangelogPage.jsx`

## Current tool inventory

### Dev

- `json-formatter` -> `/tools/json-formatter`

### Encode

- `base64` -> `/tools/base64`
- `file-encrypt` -> `/tools/file-encrypt`
- `torrent-magnet` -> `/tools/torrent-magnet`
- `md5` -> `/tools/md5`

### Text

- `text-stats` -> `/tools/text-stats`
- `markdown-editor` -> `/tools/markdown-editor`
- `text-letter` -> `/tools/text-letter`
- `txt-diff` -> `/tools/txt-diff`

### WPS

- `unlock-pdf` -> `/tools/unlock-pdf`

### Invoice

- `invoice-pdf-rename` -> `/tools/invoice-pdf-rename`

### Image

- `image-convert` -> `/tools/image-convert`
- `getgzhtoutu` -> `/tools/getgzhtoutu`
- `svg-base64` -> `/tools/svg-base64`
- `svg-path` -> `/tools/svg-path`
- `svg-preview` -> `/tools/svg-preview`
- `webshot` -> `/tools/webshot`

### Video

- `video-to-gif` -> `/tools/video-to-gif`
- `video-to-gif-single` -> `/tools/video-to-gif-single`

### Emoji

- `emoji-list` -> `/tools/emoji`
- `emoji-topics` -> `/tools/emoji/topics`

### Special pages

- Home page: `/`
- Hot trends page: `/hot`
- Changelog page: `/tools/changelog`
- Not found page: `client/src/pages/NotFoundPage.jsx`

## Usual files to touch by task type

### Add or remove a tool

- `client/src/data/tools.js`
- `client/src/App.jsx`
- `client/src/pages/<ToolName>Page.jsx`
- `client/src/lib/<toolHelper>.js` if needed
- `client/src/styles.css` or a page-local stylesheet if the tool already has one
- `client/src/pages/ChangelogPage.jsx` when the change should be announced

### Update an existing tool

- Start from the page file in `client/src/pages/`
- Read the paired helper under `client/src/lib/` if the page uses one
- Check `styles.css` for shared classes before adding new CSS

### Server-backed features

- `server/index.js`
- related client page or helper that calls `/api/*`

## Notable routing detail

- `InvoiceRenamePage` is lazy-loaded in `client/src/App.jsx`
- Most other pages are imported directly
- Alias redirects are explicit and should stay readable rather than overly abstract
