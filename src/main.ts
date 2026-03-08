import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, PolyglotSettings, PolyglotSettingTab } from "./settings";
import { renderHtmlBlock } from "renderers/html-renderer";
import { HtmlFileView, VIEW_TYPE_HTML } from "views/html-file-view";
import { handlePaste } from "paste-handler";

export default class PolyglotRendererPlugin extends Plugin {
	settings: PolyglotSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PolyglotSettingTab(this.app, this));

		// inline HTML rendering for ```html code blocks
		this.registerMarkdownCodeBlockProcessor("html", (source, el, _ctx) => {
			renderHtmlBlock(source, el, this.settings);
		});

		// custom file view for .html files
		this.registerView(
			VIEW_TYPE_HTML,
			(leaf: WorkspaceLeaf) => new HtmlFileView(leaf)
		);
		this.registerExtensions(["html", "htm"], VIEW_TYPE_HTML);

		// smart paste handler for HTML content
		this.registerEvent(
			this.app.workspace.on("editor-paste", (evt, editor, info) => {
				handlePaste(evt, editor, info, this.app);
			})
		);

	}

	onunload() {
		console.log("Polyglot Renderer unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PolyglotSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
