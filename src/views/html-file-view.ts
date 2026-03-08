import { FileView, TFile, WorkspaceLeaf } from "obsidian";
import { buildSandboxDocument } from "renderers/html-renderer";

export const VIEW_TYPE_HTML = "polyglot-html-view";

export class HtmlFileView extends FileView {
	private iframe: HTMLIFrameElement | null = null;
	private hasRegisteredVaultEvents = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_HTML;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "HTML Preview";
	}

	getIcon(): string {
		return "code";
	}

	canAcceptExtension(extension: string): boolean {
		return extension === "html" || extension === "htm";
	}

	protected async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("polyglot-html-view");

		this.iframe = contentEl.createEl("iframe", {
			cls: "polyglot-html-file-iframe",
		});
		this.iframe.setAttribute("sandbox", "allow-same-origin");
		this.iframe.setAttribute("referrerpolicy", "no-referrer");
		this.iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";

		if (!this.hasRegisteredVaultEvents) {
			this.registerEvent(
				this.app.vault.on("modify", async (modifiedFile) => {
					if (modifiedFile instanceof TFile && modifiedFile === this.file) {
						await this.renderFile(modifiedFile);
					}
				})
			);
			this.hasRegisteredVaultEvents = true;
		}
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		await this.renderFile(file);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		if (this.iframe) {
			this.iframe.srcdoc = "";
		}
		await super.onUnloadFile(file);
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
		this.iframe = null;
	}

	private async renderFile(file: TFile): Promise<void> {
		if (!this.iframe) return;
		const content = await this.app.vault.cachedRead(file);
		this.iframe.srcdoc = buildSandboxDocument(content);
	}
}
