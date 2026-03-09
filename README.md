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

Scripts are blocked — all rendering happens inside a sandboxed iframe with `allow-same-origin` only.

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

All HTML rendering uses sandboxed iframes (`sandbox="allow-same-origin"`). Scripts, forms, popups, and navigation are blocked. The plugin does not make any network requests.

## Installation

Install manually from the latest GitHub release:

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create a folder `polyglot-renderer` inside your vault's `.obsidian/plugins/` directory.
3. Place the downloaded files in that folder.
4. Enable the plugin in Settings > Community plugins.
