import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, PolyglotSettings, PolyglotSettingTab } from "./settings";

export default class PolyglotRendererPlugin extends Plugin {
	settings: PolyglotSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PolyglotSettingTab(this.app, this));

		console.log("Polyglot Renderer loaded");
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
