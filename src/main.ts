import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, PolyglotSettings, PolyglotSettingTab } from "./settings";
import { FormatRegistry, viewTypeFor } from "registry/format-registry";
import { PolyglotFileView } from "views/polyglot-file-view";
import { htmlRenderer } from "renderers/html-renderer";
import { handlePaste, findHtmlFiles, handleHtmlFilesPaste } from "paste-handler";
import { processEmbeds, startEmbedObserver } from "embed-processor";

export default class PolyglotRendererPlugin extends Plugin {
	settings: PolyglotSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PolyglotSettingTab(this.app, this));

		// Build format registry
		const registry = new FormatRegistry();
		registry.register(htmlRenderer);

		// Register all format renderers
		for (const renderer of registry.all()) {
			// inline code block rendering
			this.registerMarkdownCodeBlockProcessor(renderer.lang, (source, el, _ctx) => {
				renderer.renderInline(source, el, this.settings);
			});

			// file view for each format
			const viewType = viewTypeFor(renderer.lang);
			this.registerView(
				viewType,
				(leaf: WorkspaceLeaf) => new PolyglotFileView(leaf, renderer, viewType)
			);
			this.registerExtensions(renderer.extensions, viewType);
		}

		// embed post-processor: adds render toggle to ![[file.html]] embeds
		this.registerMarkdownPostProcessor((el, ctx) => {
			processEmbeds(el, this.app, registry, ctx.sourcePath);
		});

		// MutationObserver to catch embeds added/re-rendered during live editing
		const disconnectObserver = startEmbedObserver(this.app, registry);
		this.register(() => disconnectObserver());

		// smart paste handler for HTML content
		this.registerEvent(
			this.app.workspace.on("editor-paste", (evt, editor, info) => {
				handlePaste(evt, editor, info, this.app, this.settings);
			})
		);

		// smart drop handler for HTML files dragged from Finder
		this.registerEvent(
			this.app.workspace.on("editor-drop", (evt, editor, info) => {
				const dataTransfer = evt.dataTransfer;
				if (!dataTransfer) return;

				const htmlFiles = findHtmlFiles(dataTransfer);
				if (htmlFiles.length === 0) return;

				evt.preventDefault();
				void handleHtmlFilesPaste(htmlFiles, editor, info, this.app, this.settings);
			})
		);

		// Only honour messages that come from one of this plugin's own sandboxed
		// iframes. Matching is by frame identity (e.source === contentWindow),
		// which stays readable cross-origin; e.origin is useless here because
		// opaque sandboxed frames all report origin "null". Without this gate,
		// any window could post e.g. polyglot-key and synthesize keystrokes.
		const isPolyglotFrame = (source: MessageEventSource | null): boolean => {
			if (!source) return false;
			const frames = document.querySelectorAll<HTMLIFrameElement>(
				"iframe.polyglot-html-sandbox, iframe.polyglot-html-file-iframe"
			);
			for (let i = 0; i < frames.length; i++) {
				if (frames[i]?.contentWindow === source) return true;
			}
			return false;
		};

		// Listen for link-open requests from sandboxed iframes.
		// Validate the URL scheme and only open http(s), ignoring
		// javascript:, file:, and anything else.
		const onMessage = (e: MessageEvent) => {
			if (!isPolyglotFrame(e.source)) return;
			if (e.data?.type === "polyglot-open-url" && typeof e.data.url === "string") {
				let parsed: URL;
				try {
					parsed = new URL(e.data.url);
				} catch {
					return;
				}
				if (parsed.protocol === "http:" || parsed.protocol === "https:") {
					window.open(e.data.url);
				}
			} else if (e.data?.type === "polyglot-key") {
				// Re-dispatch a shortcut forwarded from a focused sandboxed iframe
				// so the app's global hotkeys (e.g. Ctrl+Tab) still fire — keyboard
				// events otherwise don't cross the frame boundary.
				const k = e.data;
				const evt = new KeyboardEvent("keydown", {
					key: typeof k.key === "string" ? k.key : "",
					code: typeof k.code === "string" ? k.code : "",
					ctrlKey: !!k.ctrlKey,
					metaKey: !!k.metaKey,
					altKey: !!k.altKey,
					shiftKey: !!k.shiftKey,
					bubbles: true,
					cancelable: true,
				});
				// keyCode/which aren't settable via the constructor; some hotkey
				// matchers still read them, so define them from the forwarded value.
				if (typeof k.keyCode === "number") {
					Object.defineProperty(evt, "keyCode", { get: () => k.keyCode });
					Object.defineProperty(evt, "which", { get: () => k.keyCode });
				}
				document.dispatchEvent(evt);
			}
		};
		window.addEventListener("message", onMessage);
		this.register(() => window.removeEventListener("message", onMessage));

		// Ctrl/Cmd+F opens the find bar when an HTML file view is active. This
		// also catches the synthetic Ctrl+F re-dispatched above when focus is
		// inside the iframe.
		const onFindKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "f" || e.key === "F")) {
				const view = this.app.workspace.getActiveViewOfType(PolyglotFileView);
				if (view) {
					e.preventDefault();
					e.stopPropagation();
					view.openFind();
				}
			}
		};
		window.addEventListener("keydown", onFindKey, { capture: true });
		this.register(() => window.removeEventListener("keydown", onFindKey, { capture: true }));

	}

	onunload() {
		console.debug("Polyglot Renderer unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PolyglotSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
