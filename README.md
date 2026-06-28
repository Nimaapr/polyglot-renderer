# Polyglot Renderer

An Obsidian plugin that renders HTML code blocks as live sandboxed previews, opens HTML files in a custom view, and provides smart paste handling for HTML content.

## Features

### Inline HTML rendering

Write a fenced `html` code block and see it rendered live in a sandboxed iframe:

````
```html
<h1 style="color: coral;">Hello from HTML</h1>
<p>This renders as a live preview.</p>
```
````

Rendering happens inside a sandboxed iframe (`allow-scripts` only, no `allow-same-origin`). The block's own scripts and CSS run, but the frame is an opaque origin with no access to Obsidian or your vault.

### HTML file view

Open `.html` and `.htm` files directly in Obsidian. Files render in a sandboxed iframe and update live when you edit the source externally.

### Embed rendering

Link to an HTML file with `![[file.html]]` and use the eye toggle button to render it inline without leaving your note.

### Smart paste handling

**Pasting HTML files** (e.g. from Finder): saves them to your vault and inserts embed links so they can be rendered inline with the embed toggle. You can configure where files are saved — current note folder, a default folder, or ask every time.

**Pasting HTML content** (e.g. from a browser): choose to render it as a live HTML block, convert to markdown, or paste as plain text. Configurable to always render, always use Obsidian's default, or ask every time.

## Settings

| Setting | Options | Default |
|---------|---------|---------|
| Enable inline HTML rendering | On / Off | On |
| HTML file paste destination | Ask every time / Current note folder / Default folder | Ask every time |
| Default paste folder | Any vault path | — |
| HTML content paste behavior | Ask every time / Render as HTML block / Obsidian default | Ask every time |

## Security

All HTML rendering uses sandboxed iframes created with `allow-scripts` but **without** `allow-same-origin`. Inline scripts and CSS in the rendered HTML do run, so interactive HTML files work as expected (collapsible sections, table of contents navigation, and so on). Crucially, the frame runs in an opaque origin it cannot escape: it has no access to Obsidian internals, the vault, the file system, or `window.parent`, and cannot perform top-level navigation. External links are opened in your default browser by the plugin, and only `http:` and `https:` links are honoured.

Because the frame is an opaque origin, same-origin browser APIs such as `localStorage` and `sessionStorage` are unavailable (they throw) inside rendered HTML. This is the intended security tradeoff: rendered content is treated as untrusted and kept fully isolated from the host.

## Installation

Install manually from the latest GitHub release:

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create a folder `polyglot-renderer` inside your vault's `.obsidian/plugins/` directory.
3. Place the downloaded files in that folder.
4. Enable the plugin in Settings > Community plugins.
