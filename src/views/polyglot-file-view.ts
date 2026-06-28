import { FileView, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type { FormatRenderer } from "registry/format-renderer";
import { inlineAssets } from "asset-inliner";

export class PolyglotFileView extends FileView {
	private renderer: FormatRenderer;
	private viewType: string;
	private hasRegisteredVaultEvents = false;
	private lastScroll = 0;
	private pendingScroll: number | null = null;

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

	protected onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("polyglot-file-view");

		if (!this.hasRegisteredVaultEvents) {
			// The iframe is sandboxed without allow-same-origin, so we can't read
			// its scroll directly; it reports its position to us via postMessage.
			window.addEventListener("message", this.onFrameMessage);
			this.register(() => window.removeEventListener("message", this.onFrameMessage));

			this.setupVisibilityRestore();

			this.registerEvent(
				this.app.vault.on("modify", async (modifiedFile) => {
					if (modifiedFile instanceof TFile && modifiedFile === this.file) {
						let content = await this.app.vault.cachedRead(modifiedFile);
						content = await inlineAssets(content, this.app, modifiedFile.path);
						// Preserve the current scroll across the live reload.
						this.pendingScroll = this.lastScroll;
						this.renderContent(content);
					}
				})
			);
			this.hasRegisteredVaultEvents = true;
		}
		return Promise.resolve();
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		let content = await this.app.vault.cachedRead(file);
		content = await inlineAssets(content, this.app, file.path);
		this.renderContent(content);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.contentEl.empty();
		await super.onUnloadFile(file);
	}

	protected onClose(): Promise<void> {
		this.contentEl.empty();
		return Promise.resolve();
	}

	// --- Scroll persistence ---------------------------------------------------
	// The HTML content scrolls *inside* the sandboxed iframe, whose internal
	// scroll is invisible to Obsidian and resets to 0 when the tab is hidden
	// (display:none collapses the iframe). Because the frame is opaque-origin we
	// cannot touch its scroll from here, so the frame reports its position over
	// postMessage and runs the restore (with abort-on-input + retry) itself. We:
	//   1. cache the reported position while visible (`lastScroll`),
	//   2. feed it through the view-state hooks (deferred reconstruction +
	//      app restart), and
	//   3. ask the frame to restore when it becomes visible again.

	getState(): Record<string, unknown> {
		const state = super.getState();
		if (this.lastScroll) state.scroll = this.lastScroll;
		return state;
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		this.captureScrollFromState(state);
	}

	getEphemeralState(): Record<string, unknown> {
		const state = super.getEphemeralState();
		if (this.lastScroll) state.scroll = this.lastScroll;
		return state;
	}

	setEphemeralState(state: unknown): void {
		super.setEphemeralState(state);
		this.captureScrollFromState(state);
	}

	private captureScrollFromState(state: unknown): void {
		const scroll = (state as { scroll?: unknown } | null)?.scroll;
		if (typeof scroll === "number") {
			this.lastScroll = scroll;
			this.pendingScroll = scroll;
			this.flushPendingScroll();
		}
	}

	private renderContent(content: string): void {
		this.renderer.renderFile(content, this.contentEl);
		const iframe = this.getIframe();
		if (iframe) {
			// Once the fresh frame has loaded its script, ask it to restore.
			iframe.addEventListener("load", () => this.flushPendingScroll(), { once: true });
		}
	}

	/** Cache the scroll position the frame reports, while the view is visible. */
	private onFrameMessage = (e: MessageEvent): void => {
		const iframe = this.getIframe();
		if (!iframe || e.source !== iframe.contentWindow) return;
		const data = e.data as { type?: string; y?: unknown } | null;
		if (data?.type === "polyglot-scroll" && typeof data.y === "number") {
			// The frame suppresses reports during its own restore, and we ignore
			// reports while hidden (the iframe collapses to scroll 0 then), so
			// this is the user's real position.
			if (this.contentEl.clientHeight > 0) {
				this.lastScroll = data.y;
			}
		}
	};

	/**
	 * Ask the frame to restore the saved scroll when the view goes from hidden
	 * back to visible (a plain tab switch hides the pane with display:none
	 * without reconstructing the view, collapsing the iframe and resetting its
	 * scroll).
	 */
	private setupVisibilityRestore(): void {
		if (typeof ResizeObserver === "undefined") return;
		let wasHidden = this.contentEl.clientHeight === 0;
		const ro = new ResizeObserver(() => {
			const visible = this.contentEl.clientHeight > 0;
			if (visible && wasHidden && this.lastScroll > 0) {
				this.requestRestore(this.lastScroll);
			}
			wasHidden = !visible;
		});
		ro.observe(this.contentEl);
		this.register(() => ro.disconnect());
	}

	private flushPendingScroll(): void {
		if (this.pendingScroll !== null) this.requestRestore(this.pendingScroll);
	}

	private requestRestore(y: number): void {
		// postMessage is one of the few APIs allowed cross-origin.
		this.getIframe()?.contentWindow?.postMessage({ type: "polyglot-restore-scroll", y }, "*");
	}

	private getIframe(): HTMLIFrameElement | null {
		return this.contentEl.querySelector("iframe");
	}
}
