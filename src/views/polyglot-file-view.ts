import { FileView, TFile, WorkspaceLeaf } from "obsidian";
import type { FormatRenderer } from "registry/format-renderer";

export class PolyglotFileView extends FileView {
	private renderer: FormatRenderer;
	private viewType: string;
	private hasRegisteredVaultEvents = false;

	constructor(leaf: WorkspaceLeaf, renderer: FormatRenderer, viewType: string) {
		super(leaf);
		this.renderer = renderer;
		this.viewType = viewType;
	}

	getViewType(): string {
		return this.viewType;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Preview";
	}

	getIcon(): string {
		return this.renderer.icon;
	}

	canAcceptExtension(extension: string): boolean {
		return this.renderer.extensions.includes(extension);
	}

	protected async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("polyglot-file-view");

		if (!this.hasRegisteredVaultEvents) {
			this.registerEvent(
				this.app.vault.on("modify", async (modifiedFile) => {
					if (modifiedFile instanceof TFile && modifiedFile === this.file) {
						const content = await this.app.vault.cachedRead(modifiedFile);
						this.renderer.renderFile(content, this.contentEl);
					}
				})
			);
			this.hasRegisteredVaultEvents = true;
		}
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		const content = await this.app.vault.cachedRead(file);
		this.renderer.renderFile(content, this.contentEl);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.contentEl.empty();
		await super.onUnloadFile(file);
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
