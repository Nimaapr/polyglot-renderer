import { FileView, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type { FormatRenderer } from "registry/format-renderer";
import { inlineAssets } from "asset-inliner";

export class PolyglotFileView extends FileView {
	private renderer: FormatRenderer;
	private viewType: string;
	private hasRegisteredVaultEvents = false;
	private pendingScroll: number | null = null;
	private lastScroll = 0;
	private restoreObserver: ResizeObserver | null = null;

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
		PolyglotFileView.dbg("onOpen | file =", this.file?.path);
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("polyglot-file-view");

		if (!this.hasRegisteredVaultEvents) {
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
		PolyglotFileView.dbg("onLoadFile | file =", file.path);
		await super.onLoadFile(file);
		let content = await this.app.vault.cachedRead(file);
		content = await inlineAssets(content, this.app, file.path);
		this.renderContent(content);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		PolyglotFileView.dbg("onUnloadFile | file =", file.path);
		this.contentEl.empty();
		await super.onUnloadFile(file);
	}

	protected onClose(): Promise<void> {
		PolyglotFileView.dbg("onClose | file =", this.file?.path);
		this.contentEl.empty();
		return Promise.resolve();
	}

	// --- Scroll persistence ---------------------------------------------------
	// The rendered content scrolls inside a sandboxed iframe, so its scroll
	// position is invisible to Obsidian. We track it continuously and feed it
	// through the view-state hooks so Obsidian can save/restore it like it does
	// for Markdown. Survives tab switches and full restarts (persistent state).
	//
	// Key subtlety: when a tab is hidden Obsidian sets the pane to display:none,
	// the iframe collapses to height 0 and fires a scroll event resetting
	// scrollY to 0. We must NOT record that teardown reset, so the tracker only
	// stores the position while the iframe is actually visible (clientHeight>0).

	getState(): Record<string, unknown> {
		const state = super.getState();
		PolyglotFileView.dbg("getState: saving scroll =", this.lastScroll);
		if (this.lastScroll) state.scroll = this.lastScroll;
		return state;
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		PolyglotFileView.dbg("setState received:", JSON.stringify(state));
		// Let FileView load the file first (this triggers onLoadFile).
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
		PolyglotFileView.dbg("captureScrollFromState: state.scroll =", scroll, "(type", typeof scroll, ")");
		if (typeof scroll === "number") {
			this.lastScroll = scroll;
			this.pendingScroll = scroll;
			// Apply now in case the iframe is already loaded; the load listener
			// attached in renderContent covers the not-yet-loaded case.
			this.applyPendingScroll();
		}
	}

	/** Render content and restore the pending scroll once the iframe reloads. */
	private renderContent(content: string): void {
		this.renderer.renderFile(content, this.contentEl);
		const iframe = this.getIframe();
		if (iframe) {
			iframe.addEventListener("load", () => {
				PolyglotFileView.dbg("iframe 'load' | pendingScroll =", this.pendingScroll, "| iframe.clientHeight =", iframe.clientHeight);
				this.attachScrollTracker(iframe);
				this.applyPendingScroll();
			}, { once: true });
		}
	}

	/**
	 * When the tab is switched away, Obsidian hides the pane with display:none
	 * (without reconstructing the view). That collapses the iframe and resets
	 * its internal scroll to 0, and no state hook fires to restore it. Watch the
	 * view container for the hidden→visible transition and re-apply the scroll.
	 */
	private setupVisibilityRestore(): void {
		if (typeof ResizeObserver === "undefined") return;
		let wasHidden = this.contentEl.clientHeight === 0;
		const ro = new ResizeObserver(() => {
			const visible = this.contentEl.clientHeight > 0;
			if (visible && wasHidden && this.lastScroll > 0) {
				PolyglotFileView.dbg("visibility restore -> scroll =", this.lastScroll);
				this.pendingScroll = this.lastScroll;
				this.applyPendingScroll();
			}
			wasHidden = !visible;
		});
		ro.observe(this.contentEl);
		this.register(() => ro.disconnect());
	}

	/**
	 * Continuously record the iframe's scroll position — but only while the
	 * iframe is visible, so the display:none teardown reset (clientHeight 0,
	 * scrollY 0) doesn't clobber the value Obsidian is about to persist.
	 */
	private attachScrollTracker(iframe: HTMLIFrameElement): void {
		const win = iframe.contentWindow;
		if (!win) return;
		win.addEventListener("scroll", () => {
			if (iframe.clientHeight > 0) {
				this.lastScroll = win.scrollY;
			}
		}, true);
	}

	private getIframe(): HTMLIFrameElement | null {
		return this.contentEl.querySelector("iframe");
	}

	/**
	 * Restore the pending scroll. The target document is often still laying out
	 * its full height when this runs — a tall, image-heavy file only reaches its
	 * final height once the (base64-inlined) images finish decoding. So rather
	 * than a fixed frame budget, re-apply the scroll as the content grows (via a
	 * ResizeObserver on the document and image load events) until the target is
	 * actually reached, or a deadline passes.
	 */
	private applyPendingScroll(): void {
		if (this.pendingScroll === null) return;
		const y = this.pendingScroll;

		// Cancel any in-flight restore from a previous call.
		this.restoreObserver?.disconnect();
		this.restoreObserver = null;

		const reach = (): boolean => {
			const win = this.getIframe()?.contentWindow;
			if (!win) return true; // iframe gone — stop trying
			win.scrollTo(0, y);
			return Math.abs(win.scrollY - y) <= 1;
		};

		if (reach()) {
			PolyglotFileView.dbg("applyPendingScroll: reached", y, "immediately");
			return;
		}

		const doc = this.getIframe()?.contentDocument;
		const docEl = doc?.documentElement;
		const deadline = Date.now() + 5000;

		if (docEl && typeof ResizeObserver !== "undefined") {
			const ro = new ResizeObserver(() => {
				if (reach() || Date.now() > deadline) {
					ro.disconnect();
					if (this.restoreObserver === ro) this.restoreObserver = null;
					PolyglotFileView.dbg("applyPendingScroll: settled at", this.getIframe()?.contentWindow?.scrollY, "| target =", y);
				}
			});
			ro.observe(docEl);
			this.restoreObserver = ro;
			this.register(() => ro.disconnect());
		}

		// Also nudge on each image load, in case ResizeObserver batches the reflow.
		const images = doc?.images;
		if (images) {
			for (const img of Array.from(images)) {
				if (!img.complete) img.addEventListener("load", () => reach(), { once: true });
			}
		}
	}

	private static dbg(...args: unknown[]): void {
		console.log("[Polyglot scroll]", ...args);
	}
}
