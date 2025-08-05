
(async function () {
    'use strict';
          if (window.__myInjectedScriptHasRun__) return;
      window.__myInjectedScriptHasRun__ = true;
    console.log("loaded from js 1",JSON.stringify(TranslateApp))
    
    
const processedNodes = new WeakSet();

function isVisibleInViewport(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    for (const rect of rects) {
        if (
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            rect.right > 0 &&
            rect.left < window.innerWidth
        ) {
            return true;
        }
    }
    return false;
}

function getUnprocessedTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            if (
                !node.parentNode ||
                node.parentNode.closest('script, style, noscript, iframe, svg, canvas, pre, code') ||
                processedNodes.has(node)
            ) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue.trim()) {
            nodes.push(node);
            processedNodes.add(node);
        }
    }
    return nodes;
}

async function translateBatch(nodes) {
    const endpoint = 'https://browser-production-2e20.up.railway.app/translate/batch';
    const texts = nodes.map(node => node.nodeValue);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts, language:'spanish' })
        });
        if (!response.ok) throw new Error(`API error: ${response.statusText}`);
        const data = await response.json();
        if (data.success && data.results) {
            data.results.forEach((result, i) => {
                if (nodes[i].nodeValue !== result.translated && result.translated) {
                    nodes[i].nodeValue = result.translated;
                }
            });
        }
    } catch (err) {
        console.error('Batch request failed:', err);
    }
}

async function translatePageText() {
    const allNodes = getUnprocessedTextNodes(document.body);
    if (allNodes.length === 0) return;

    const visibleNodes = allNodes.filter(isVisibleInViewport);
    const invisibleNodes = allNodes.filter(node => !isVisibleInViewport(node));

    // Prioritize visible content for speed perception
    for (let i = 0; i < visibleNodes.length; i += 50) {
        translateBatch(visibleNodes.slice(i, i + 50));
    }

    // Do the rest after a tiny delay (to keep page responsive)
    setTimeout(() => {
        for (let i = 0; i < invisibleNodes.length; i += 50) {
            translateBatch(invisibleNodes.slice(i, i + 50));
        }
    }, 300);
}

function observeDynamicChanges() {
    let debounceTimeout;

    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            observer.disconnect();
            translatePageText().then(() => observer.observe(document.body, {
                childList: true,
                subtree: true,
            }));
        }, 300);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

translatePageText().then(() => observeDynamicChanges());


 })()