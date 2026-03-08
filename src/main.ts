import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, PolyglotSettings, PolyglotSettingTab } from "./settings";
import { renderHtmlBlock } from "./renderers/html-renderer";

export default class PolyglotRendererPlugin extends Plugin {
	settings: PolyglotSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PolyglotSettingTab(this.app, this));

		// inline HTML rendering for ```html code blocks
		this.registerMarkdownCodeBlockProcessor("html", (source, el, _ctx) => {
			renderHtmlBlock(source, el, this.settings);
		});
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
