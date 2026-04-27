(function () {
    'use strict';
    let apiKey = null;
    let currentImageUrl = null;

    async function waitForElement(selector) {
        return new Promise(resolve => {
            const intervalId = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) { clearInterval(intervalId); resolve(element); }
            }, 100); 
        });
    }

    async function getSettings() {
        try {
            const query = `{ configuration { plugins } }`;
            const res = await fetch('/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
            const result = await res.json();
            const plugins = result.data?.configuration?.plugins || {};
            apiKey = plugins['tmdb-backdrop']?.tmdbapikey || plugins['tmdb-backdrop']?.TmdbApiKey;
        } catch (e) { console.error("TMDB Plugin: Settings failed", e); }
    }

    const injectBaseStyles = () => {
        if (document.getElementById('tmdb-base-style')) return;
        const style = document.createElement('style');
        style.id = 'tmdb-base-style';
        style.innerHTML = `
            #group-page::before, #group-page::after {
                content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                z-index: -1; background-size: cover; background-attachment: fixed;
                background-position: center; transition: opacity 1.2s ease-in-out;
                opacity: 0; pointer-events: none;
            }
            /* .tmdb-active controls the initial fade-in from Stash background */
            .tmdb-active #group-page { background: transparent !important; }
            .tmdb-active #group-page .background-image-container { display: none !important; }
            .tmdb-active #group-page .detail-header, 
            .tmdb-active #group-page .filtered-list-toolbar, 
            .tmdb-active #group-page .card {
                background-color: transparent !important; box-shadow: none !important;
            }
            .tmdb-active #group-page .detail-body nav { border-bottom: none !important; }
        `;
        document.head.appendChild(style);
    };
	
    let activeLayer = 'before'; // Keep track of which layer is currently visible

    const updateBackdrop = async (tmdbUrl) => {
        if (!apiKey) await getSettings();
        if (!apiKey || !tmdbUrl) return;

        const idMatch = tmdbUrl.match(/(movie|tv|collection)\/(\d+)/);
        if (!idMatch) return;
        const [_, type, tmdbId] = idMatch;

        try {
            const response = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=${apiKey}`);
            const data = await response.json();
            
            if (data.backdrops?.length > 0) {
                const randomPath = data.backdrops[Math.floor(Math.random() * data.backdrops.length)].file_path;
                const imageUrl = `https://image.tmdb.org/t/p/original${randomPath}`;
                
                if (imageUrl === currentImageUrl && document.body.classList.contains('tmdb-active')) return;

                const img = new Image();
                img.src = imageUrl;
                await img.decode();

                let dynamicStyle = document.getElementById('tmdb-dynamic-image');
                if (!dynamicStyle) {
                    dynamicStyle = document.createElement('style');
                    dynamicStyle.id = 'tmdb-dynamic-image';
                    document.head.appendChild(dynamicStyle);
                }

                injectBaseStyles();
                const isAlreadyActive = document.body.classList.contains('tmdb-active');

                if (!isAlreadyActive) {
                    // INITIAL LOAD
                    dynamicStyle.innerHTML = `
                        #group-page::before { background-image: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url("${imageUrl}"); opacity: 1 !important; }
                        #group-page::after { opacity: 0 !important; }
                    `;
                    document.body.classList.add('tmdb-active');
                    activeLayer = 'before';
                } else {
                    // SUBPAGE NAVIGATION (CROSS-FADE)
                    const nextLayer = activeLayer === 'before' ? 'after' : 'before';
                    
                    // We update the styles so the 'next' layer gets the new image and fades in,
                    // while the 'current' layer fades out but KEEPS its old image during the transition.
                    dynamicStyle.innerHTML = `
                        #group-page::${activeLayer} { background-image: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url("${currentImageUrl}"); opacity: 0 !important; }
                        #group-page::${nextLayer} { background-image: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url("${imageUrl}"); opacity: 1 !important; }
                    `;
                    activeLayer = nextLayer;
                }

                currentImageUrl = imageUrl;
            } else {
                clearUI();
            }
        } catch (e) { 
            console.error("TMDB Plugin Error:", e);
            clearUI();
        }
    };

    function clearUI() {
        document.body.classList.remove('tmdb-active');
        currentImageUrl = null;
        const dynamic = document.getElementById('tmdb-dynamic-image');
        if (dynamic) dynamic.remove();
    }

    async function updateDOM() {
        const match = window.location.pathname.match(/\/groups\/(\d+)/);
        if (!match) { clearUI(); return; }
        const groupId = match[1];
        await waitForElement('#group-page');
        const gRes = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `query FindGroup($id: ID!) { findGroup(id: $id) { urls } }`, variables: { id: groupId } })
        });
        const gResult = await gRes.json();
        const urls = gResult.data?.findGroup?.urls || [];
        const tmdbUrl = urls.find(u => u.toLowerCase().includes('themoviedb.org'));
        if (tmdbUrl) { updateBackdrop(tmdbUrl); } else { clearUI(); }
    }

    const observeUrlChange = () => {
        let oldHref = document.location.href;
        const observer = new MutationObserver(() => {
            if (oldHref !== document.location.href) { oldHref = document.location.href; updateDOM(); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    };

    updateDOM();
    observeUrlChange();
})();
