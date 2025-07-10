  function translate(text) {
  return `🔁${text}`; // For testing, add emoji to see what's translated
}

// Translate all visible text nodes on the page
function translatePage() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip empty or whitespace-only nodes
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;

        // Skip if inside <script>, <style>, <noscript>, or hidden
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tag = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript'].includes(tag)) return NodeFilter.FILTER_REJECT;

        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const nodes = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    node.nodeValue = translate(node.nodeValue);
  }
}


window.addEventListener('DOMContentLoaded', function () {
    'use strict';

try {
  if (window.__myInjectedScriptHasRun__) return;

  window.__myInjectedScriptHasRun__ = true;

  console.log("Injected script is running once!", Date.now(), AndroidApp.getUserLanguage());
  // translatePage()
  console.log("worked")
} catch (error) {
  console.log("🚀 ~ error:", error)
  
}

    


})