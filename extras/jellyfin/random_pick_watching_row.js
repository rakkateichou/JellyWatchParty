(function () {
    "use strict";

    if (window.__jfRandomPickWatchingRow) return;
    window.__jfRandomPickWatchingRow = true;

    const GROUP_CLASS = "jfRandomPickGroup";
    const STYLE_ID = "jfRandomPickWatchingRowStyles";
    let scheduled = 0;
    let requestNumber = 0;
    const sectionStates = new WeakMap();
    let metadataContext = "";
    let seriesByItem = new Map();

    function normalizeId(value) {
        const id = String(value || "").replace(/-/g, "").toLowerCase();
        return /^[a-f0-9]{32}$/.test(id) ? id : "";
    }

    function watchingSnapshot() {
        const api = window.ApiClient;
        const userId = api?.getCurrentUserId?.() || "";
        const server = api?.serverAddress?.() || window.location.origin;
        const ids = new Set();
        // Use the cards in the actual home sections, including cards currently
        // offscreen in the horizontal scroller. Episodes must exclude their
        // series too, since Random Pick offers movies and whole series.
        document.querySelectorAll("#homeTab .verticalSection").forEach(section => {
            if (section.hidden || section.classList.contains("hide") || section.classList.contains(GROUP_CLASS)) return;
            const isResume = section.querySelector(":scope > h2")
                && section.querySelector('.itemsContainer[data-monitor*="videoplayback"]');
            const isNextUp = section.querySelector('a[href*="type=nextup"]');
            if (!isResume && !isNextUp) return;
            section.querySelectorAll(".itemsContainer > .card[data-id]").forEach(card => {
                if (card.closest(`.${GROUP_CLASS}`)) return;
                const id = normalizeId(card.dataset.id);
                if (id) ids.add(id);
            });
        });
        const itemIds = [...ids].sort();
        const context = JSON.stringify([server, userId]);
        return { userId, itemIds, context, key: JSON.stringify([context, itemIds]) };
    }

    async function watchingExclusions(api, snapshot) {
        if (metadataContext !== snapshot.context) {
            metadataContext = snapshot.context;
            seriesByItem = new Map();
        }
        const cache = seriesByItem;
        const missing = snapshot.itemIds.filter(id => !cache.has(id));
        if (missing.length) {
            const result = await api.getItems(snapshot.userId, {
                Ids: missing.join(","),
                EnableImages: false,
                EnableUserData: false
            });
            if (!Array.isArray(result?.Items)) throw new Error("Could not check watching titles");
            result.Items.forEach(item => {
                const id = normalizeId(item.Id);
                if (id) cache.set(id, normalizeId(item.SeriesId));
            });
        }
        const excluded = new Set(snapshot.itemIds);
        snapshot.itemIds.forEach(id => {
            const seriesId = cache.get(id);
            if (seriesId) excluded.add(seriesId);
        });
        // Keep long-running Jellyfin tabs from retaining every past episode.
        while (cache.size > 256) cache.delete(cache.keys().next().value);
        return excluded;
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #homeTab .${GROUP_CLASS} .jfRandomPickTitle {
                display: flex;
                align-items: center;
                gap: .35rem;
                margin: 0 !important;
            }
            #homeTab .${GROUP_CLASS} .jfRandomPickShuffle {
                width: 2.4rem;
                height: 2.4rem;
                margin-left: .1rem;
                color: inherit;
            }
            #homeTab .${GROUP_CLASS} .jfRandomPickShuffle .material-icons {
                font-size: 1.35rem;
            }
            #homeTab .${GROUP_CLASS}.is-loading .jfRandomPickShuffle {
                opacity: .38;
                pointer-events: none;
            }
            #homeTab .${GROUP_CLASS} .jfRandomPickSkeleton .cardScalable {
                overflow: hidden;
                border-radius: var(--cardBorderRadius, .55rem);
                background: rgba(255,255,255,.055);
            }
            #homeTab .${GROUP_CLASS} .jfRandomPickSkeleton .cardScalable::after {
                content: "";
                position: absolute;
                inset: 0;
                background: linear-gradient(100deg, transparent 25%, rgba(255,255,255,.10) 46%, transparent 67%);
                background-size: 220% 100%;
                animation: jfRandomPickShimmer 1.35s linear infinite;
            }
            #homeTab .${GROUP_CLASS} .jfRandomPickFallback {
                position: absolute;
                inset: 0;
                display: grid;
                place-items: center;
                color: rgba(255,255,255,.76);
                background: linear-gradient(135deg, rgba(84,68,151,.78), rgba(29,102,139,.72));
            }
            #homeTab .${GROUP_CLASS} .jfRandomPickFallback .material-icons { font-size: 3rem; }
            @keyframes jfRandomPickShimmer { to { background-position: -220% 0; } }
        `;
        document.head.appendChild(style);
    }

    function imageUrl(item) {
        const api = window.ApiClient;
        if (!api || !item || !item.Id) return "";
        const imageTags = item.ImageTags || {};
        let type = "";
        let tag = "";
        let suffix = "";
        if (imageTags.Thumb) {
            type = "Thumb";
            tag = imageTags.Thumb;
        } else if (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags[0]) {
            type = "Backdrop";
            tag = item.BackdropImageTags[0];
            suffix = "/0";
        } else if (imageTags.Primary) {
            type = "Primary";
            tag = imageTags.Primary;
        } else {
            return "";
        }
        const server = typeof api.serverAddress === "function"
            ? api.serverAddress().replace(/\/$/, "")
            : window.location.origin;
        const query = new URLSearchParams({
            fillWidth: "440",
            fillHeight: "248",
            quality: "96",
            tag
        });
        return `${server}/Items/${encodeURIComponent(item.Id)}/Images/${type}${suffix}?${query}`;
    }

    function renderCard(item) {
        const id = escapeHtml(item.Id);
        const name = escapeHtml(item.Name || "Random pick");
        const type = item.Type === "Series" ? "Series" : "Movie";
        const isFolder = type === "Series" ? "true" : "false";
        const href = `#/details?id=${encodeURIComponent(item.Id)}`;
        const image = imageUrl(item);
        const subtitle = item.ProductionYear ? `${type} · ${item.ProductionYear}` : type;
        const art = image
            ? `<a href="${href}" data-action="link" class="cardImageContainer cardContent itemAction" aria-label="${name}" role="img" style="background-image:url('${escapeHtml(image)}')"></a>`
            : `<a href="${href}" data-action="link" class="cardImageContainer cardContent itemAction" aria-label="${name}"><span class="jfRandomPickFallback"><span class="material-icons" aria-hidden="true">shuffle</span></span></a>`;

        return `
            <div data-id="${id}" data-isfolder="${isFolder}" data-type="${type}"
                 data-mediatype="Video" data-context="home"
                 class="card overflowBackdropCard card-hoverable">
                <div class="cardBox cardBox-bottompadded">
                    <div class="cardScalable">
                        <div class="cardPadder cardPadder-overflowBackdrop"></div>
                        ${art}
                        <div class="cardOverlayContainer itemAction" data-action="link">
                            <button is="paper-icon-button-light"
                                    class="cardOverlayButton cardOverlayButton-hover itemAction paper-icon-button-light cardOverlayFab-primary"
                                    data-action="resume" title="Play">
                                <span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover play_arrow" aria-hidden="true"></span>
                            </button>
                        </div>
                    </div>
                    <div class="cardText cardTextCentered cardText-first"><bdi>
                        <a href="${href}" data-id="${id}" data-type="${type}" data-isfolder="${isFolder}"
                           class="itemAction textActionButton" title="${name}" data-action="link">${name}</a>
                    </bdi></div>
                    <div class="cardText cardTextCentered cardText-secondary"><bdi>${escapeHtml(subtitle)}</bdi></div>
                </div>
            </div>`;
    }

    function loadingCard() {
        return `
            <div class="card overflowBackdropCard jfRandomPickSkeleton" aria-hidden="true">
                <div class="cardBox cardBox-bottompadded">
                    <div class="cardScalable"><div class="cardPadder cardPadder-overflowBackdrop"></div></div>
                    <div class="cardText cardTextCentered cardText-first">&nbsp;</div>
                    <div class="cardText cardTextCentered cardText-secondary">&nbsp;</div>
                </div>
            </div>`;
    }

    async function loadRandomPick(section) {
        if (!section || section.classList.contains("is-loading")) return;
        const thisRequest = ++requestNumber;
        const snapshot = watchingSnapshot();
        sectionStates.set(section, snapshot.key);
        const container = section.querySelector(".itemsContainer");
        section.classList.add("is-loading");
        container.innerHTML = loadingCard();

        try {
            const api = window.ApiClient;
            if (!api || typeof api.getItems !== "function" || typeof api.getCurrentUserId !== "function") {
                throw new Error("Jellyfin API is not ready");
            }
            if (!snapshot.userId) throw new Error("Jellyfin user is not ready");
            const excluded = await watchingExclusions(api, snapshot);
            const result = await api.getItems(snapshot.userId, {
                Recursive: true,
                IncludeItemTypes: "Movie,Series",
                SortBy: "Random",
                Limit: 1,
                ExcludeItemIds: [...excluded].join(","),
                IsVirtualItem: false,
                Fields: "PrimaryImageAspectRatio,ProductionYear,ImageTags,BackdropImageTags"
            });
            if (thisRequest !== requestNumber || !section.isConnected) return;
            // Home sections load independently and may change while either API
            // request is in flight. Never paint a pick using an older snapshot.
            if (watchingSnapshot().key !== snapshot.key) return;
            const item = result && Array.isArray(result.Items) ? result.Items[0] : null;
            if (!item) {
                container.innerHTML = '<div class="cardText">No other movies or series to pick.</div>';
                return;
            }
            if (excluded.has(normalizeId(item.Id))) throw new Error("The selected title is already in a watching section");
            container.innerHTML = renderCard(item);
            const row = section.closest(".jfUnifiedWatching");
            if (row) row.hidden = false;
        } catch (error) {
            if (thisRequest !== requestNumber || !section.isConnected) return;
            console.warn("[Random Pick] Could not load a title:", error);
            container.innerHTML = `
                <div class="card overflowBackdropCard">
                    <div class="cardBox cardBox-bottompadded">
                        <div class="cardScalable">
                            <div class="cardPadder cardPadder-overflowBackdrop"></div>
                            <button type="button" class="cardImageContainer cardContent jfRandomPickRetry" title="Try again">
                                <span class="jfRandomPickFallback"><span class="material-icons" aria-hidden="true">refresh</span></span>
                            </button>
                        </div>
                        <div class="cardText cardTextCentered cardText-first">Try another pick</div>
                        <div class="cardText cardTextCentered cardText-secondary">Movie or series</div>
                    </div>
                </div>`;
            container.querySelector(".jfRandomPickRetry")?.addEventListener("click", () => loadRandomPick(section), { once: true });
        } finally {
            if (thisRequest === requestNumber && section.isConnected) {
                section.classList.remove("is-loading");
                schedule();
            }
        }
    }

    function addRandomPick(viewport) {
        if (!viewport || viewport.querySelector(`:scope > .${GROUP_CLASS}`)) return;
        const section = document.createElement("section");
        section.className = `verticalSection jfWatchingGroup ${GROUP_CLASS}`;
        section.innerHTML = `
            <div class="sectionTitleContainer">
                <h2 class="sectionTitle sectionTitle-cards jfRandomPickTitle">Random Pick</h2>
                <button type="button" class="paper-icon-button-light jfRandomPickShuffle"
                        title="Another random pick" aria-label="Another random pick">
                    <span class="material-icons shuffle" aria-hidden="true"></span>
                </button>
            </div>
            <div class="emby-scroller">
                <div is="emby-itemscontainer" class="itemsContainer"></div>
            </div>`;
        viewport.appendChild(section);
        section.querySelector(".jfRandomPickShuffle").addEventListener("click", () => loadRandomPick(section));
        loadRandomPick(section);
    }

    function sync() {
        scheduled = 0;
        const viewport = document.querySelector("#homeTab .jfWatchingViewport");
        if (!viewport) return;
        const section = viewport.querySelector(`:scope > .${GROUP_CLASS}`);
        if (!section) addRandomPick(viewport);
        else if (sectionStates.get(section) !== watchingSnapshot().key) loadRandomPick(section);
    }

    function schedule() {
        if (!scheduled) scheduled = requestAnimationFrame(sync);
    }

    function initialize() {
        injectStyles();
        new MutationObserver(schedule).observe(document.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ["class", "hidden", "data-id"]
        });
        schedule();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
