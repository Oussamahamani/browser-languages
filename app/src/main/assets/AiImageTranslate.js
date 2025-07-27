const resolvers = new Map();

(async function () {
    'use strict';
    if (window.image__myInjectedScriptHasRun__) return;
    window.image__myInjectedScriptHasRun__ = true;

    console.log("loaded from js 1");
    console.time("loaded from js");

    const imageUrl = "https://acropolis-wp-content-uploads.s3.us-west-1.amazonaws.com/02-women-leveling-up-in-STEM.png";
    const requestId = "454545";

    // Step 1: Extract text from image
    AndroidApp.extractTextFromImage(imageUrl, requestId);

    // Step 2: Wait for extraction result
    let result = await waitForExtraction(requestId);
    console.log("loaded from js 6:", JSON.stringify(result));
    result = JSON.parse(result);
    
    if (!result || !result.textBlocks || !Array.isArray(result.textBlocks)) {
      console.error("Invalid result format:", result);
      return;
    }
    
    // Step 3: Get the original texts
    const originalTexts = result.textBlocks.map(block => block.text);
    console.log("loaded from js 6.5:", JSON.stringify(originalTexts));

    // Step 4: Translate the texts
    const translatedTexts = await translateTexts(originalTexts);

    // Step 5: Build final translations map
    const translations = {};
    originalTexts.forEach((text, index) => {
        translations[text] = translatedTexts[index] || "";
    });
    console.log("loaded from js 7:", JSON.stringify(translations));

    console.timeEnd("loaded from js");
})();

// Handles the async wait for Android callback
function waitForExtraction(id) {
    return new Promise((resolve) => {
        resolvers.set(id, resolve);
    });
}

// Android calls this with JSON + ID when finished
function onExtractionResult(result, id) {
    console.log("loaded from js 4 final result onExtractionResult", result);
    const resolver = resolvers.get(id);
    if (resolver) {
        resolver(JSON.stringify(result));
        resolvers.delete(id); // Clean up
    }
}

// Batch translation function
// 🔁 Rewritten translateBatch to just return translated texts array
async function translateTexts(texts) {
    const endpoint = 'https://10.0.2.2:3001/translate/batch';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts })
        });

        if (!response.ok) throw new Error(`API error: ${response.statusText}`);

        const data = await response.json();
        if (data.success && Array.isArray(data.results)) {
            return data.results.map(r => r.translated || "");
        } else {
            console.error("Unexpected response format", data);
            return texts.map(() => ""); // fallback
        }
    } catch (err) {
        console.error("❌ Translation failed:", err);
        return texts.map(() => ""); // fallback
    }
}
