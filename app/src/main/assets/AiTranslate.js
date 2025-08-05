(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        targetLanguage: 'french', // Change this to desired language
        minTextLength: 3,
        maxTextLength: 500,
        excludeSelectors: [
            'script', 'style', 'noscript', 'iframe', 'object', 'embed',
            'code', 'pre', '[contenteditable="false"]', '.notranslate',
            '[translate="no"]', 'input', 'textarea', 'select', 'button'
        ].join(','),
        skipPatterns: [
            /^\s*$/,                    // Empty or whitespace only
            /^[\d\s\-\+\(\)\.]+$/,     // Numbers, dates, phone numbers
            /^[^\w\s]*$/,              // Only special characters
            /^https?:\/\//i,           // URLs
            /^[\w\-\.]+@[\w\-\.]+$/,   // Email addresses
            /^#[\w\-]+$/,              // Hash tags
            /^@[\w\-]+$/,              // Mentions
            /^\$[\d\.,]+$/,            // Prices
            /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // Dates
        ]
    };
return
    let nodeGroups = new Map();
    let translationProgress = { total: 0, completed: 0, failed: 0 };

    console.log('🌐 Page Translator: Starting translation...');

    /**
     * Check if text should be translated
     */
    function shouldTranslateText(text) {
        if (!text || text.length < CONFIG.minTextLength || text.length > CONFIG.maxTextLength) {
            return false;
        }
        return !CONFIG.skipPatterns.some(pattern => pattern.test(text.trim()));
    }

    /**
     * Get all translatable text nodes from the page
     */
    function getTranslatableTextNodes() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    if (node.parentElement?.closest(CONFIG.excludeSelectors)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    if (!shouldTranslateText(node.textContent)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    const parent = node.parentElement;
                    if (parent) {
                        const style = window.getComputedStyle(parent);
                        if (style.display === 'none' || style.visibility === 'hidden') {
                            return NodeFilter.FILTER_REJECT;
                        }
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodes = [];
        let node;
        while (node = walker.nextNode()) {
            nodes.push(node);
        }

        return nodes;
    }

    /**
     * Apply translation to DOM nodes
     */
    function applyTranslation(originalText, translation) {
        const nodes = nodeGroups.get(originalText);
        if (!nodes) return;

        nodes.forEach(node => {
            if (translation && translation.trim()) {
                let cleanTranslation = translation
                    .replace(/^(Here's the translation:|Translation:|Translated text:)\s*/i, '')
                    .replace(/^["']|["']$/g, '')
                    .trim();

                node.textContent = cleanTranslation;
            }
        });

        translationProgress.completed++;

        const percent = Math.round((translationProgress.completed / translationProgress.total) * 100);
        console.log(`📊 Progress: ${translationProgress.completed}/${translationProgress.total} (${percent}%)`);
    }

    // Get all text nodes
    const textNodes = getTranslatableTextNodes();
    console.log(`📝 Found ${textNodes.length} text nodes`);

    if (textNodes.length === 0) {
        console.log('ℹ️ No translatable text found on this page');
        return;
    }

    // Extract unique texts
    const textMap = new Map();
    textNodes.forEach(node => {
        const text = node.textContent.trim();
        if (shouldTranslateText(text)) {
            if (!textMap.has(text)) {
                textMap.set(text, []);
            }
            textMap.get(text).push(node);
        }
    });

    const uniqueTexts = Array.from(textMap.keys());
    nodeGroups = textMap;
    translationProgress.total = uniqueTexts.length;

    console.log(`🎯 Translating ${uniqueTexts.length} unique texts in one batch`);

    if (uniqueTexts.length === 0) {
        console.log('ℹ️ No unique translatable text found');
        return;
    }

    // Global callback functions for Android
    window.onBatchTranslationResult = function(originalText, translation, index, total) {
        if (translation) {
            applyTranslation(originalText, translation);
        } else {
            translationProgress.failed++;
            console.warn(`❌ Translation failed for: "${originalText.substring(0, 50)}..."`);
        }
    };

    window.onBatchTranslationComplete = function() {
        console.log('🎉 Page translation completed!');
        console.log(`📈 Stats: ${translationProgress.completed} completed, ${translationProgress.failed} failed out of ${translationProgress.total} total`);
    };

    window.onBatchTranslationError = function(error) {
        console.error('❌ Translation error:', error);
    };

    // Start translation
    if (typeof TranslateApp !== 'undefined' && TranslateApp.translateArray) {
        TranslateApp.translateArray(JSON.stringify(uniqueTexts));
    } else {
        console.error('❌ TranslateApp not available');
    }

})();