(async function() {
    'use strict';
  if (window.location.hostname.trim().length <3) return

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

    let nodeGroups = new Map();
    let translationProgress = { total: 0, completed: 0, failed: 0 };
    let processedTexts = new Set(); // Track already processed texts
    let isProcessing = false; // Prevent concurrent processing
    let scrollTimeout;
    let pendingUpdate = false; // Track if we need to process after current translation finishes
    let updateQueue = []; // Queue for pending updates
window.needReload = false
    console.log('🌐 Page Translator: Starting translation...');


    // Add 10 seconds delay if the page is YouTube
    if (location.hostname.includes('youtube.com')) {
        await new Promise(resolve => setTimeout(resolve, 15000));
    }
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
     * Check if a text node is actually visible to the user
     */
    function isTextNodeVisible(node) {
        const parent = node.parentElement;
        if (!parent) return false;

        // Walk up the DOM tree to check all ancestors for visibility
        let element = parent;
        while (element && element !== document.body) {
            const style = window.getComputedStyle(element);
            
            // Check various ways an element can be hidden
            if (style.display === 'none' || 
                style.visibility === 'hidden' || 
                style.opacity === '0' ||
                style.position === 'fixed' && (style.left === '-9999px' || style.top === '-9999px') ||
                style.textIndent === '-9999px' ||
                style.height === '0px' ||
                style.width === '0px' ||
                style.fontSize === '0px' ||
                style.lineHeight === '0' ||
                style.maxHeight === '0px' ||
                style.clipPath === 'inset(100%)' ||
                style.clip === 'rect(0px, 0px, 0px, 0px)') {
                return false;
            }
            
            element = element.parentElement;
        }

        // Get bounding rectangle of the text's parent element
        const rect = parent.getBoundingClientRect();
        
        // Check if element has meaningful dimensions
        if (rect.width <= 1 || rect.height <= 1) {
            return false;
        }

        // Check if element is actually in the visible viewport (no buffer for stricter checking)
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        
        // Only consider elements that are clearly visible in viewport
        const isInViewport = (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= viewportHeight &&
            rect.right <= viewportWidth &&
            rect.top < viewportHeight - 50 && // Must be at least 50px visible from top
            rect.left < viewportWidth - 50    // Must be at least 50px visible from left
        );

        if (!isInViewport) {
            return false;
        }

        // Additional check: use document.elementFromPoint to see if element is actually visible
        // (not covered by other elements)
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        if (centerX > 0 && centerY > 0 && centerX < viewportWidth && centerY < viewportHeight) {
            const elementAtPoint = document.elementFromPoint(centerX, centerY);
            if (elementAtPoint && (elementAtPoint === parent || parent.contains(elementAtPoint) || elementAtPoint.contains(parent))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get all translatable text nodes from the page (only visible ones)
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

                    // Only include visible text nodes
                    if (!isTextNodeVisible(node)) {
                        return NodeFilter.FILTER_REJECT;
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
        processedTexts.add(originalText); // Mark as processed

        if(window.needReload) {
            window.location.reload();
        }
        const percent = Math.round((translationProgress.completed / translationProgress.total) * 100);
        console.log(`📊 Progress: ${translationProgress.completed}/${translationProgress.total} (${percent}%)`);
    }

    /**
     * Process visible text nodes and translate them
     */
    function processVisibleTexts() {
        if (isProcessing) {
            // If already processing, mark that we need to process again later
            pendingUpdate = true;
            console.log('🔄 Translation in progress, queuing update...');
            return;
        }
        
        isProcessing = true;
        pendingUpdate = false;

        console.log('🔍 Processing visible texts...');

        // Get all visible text nodes
        const textNodes = getTranslatableTextNodes();
        console.log(`📝 Found ${textNodes.length} visible text nodes`);

        if (textNodes.length === 0) {
            isProcessing = false;
            processQueuedUpdates();
            return;
        }

        // Extract unique texts that haven't been processed yet
        const textMap = new Map();
        const newTexts = [];

        textNodes.forEach(node => {
            const text = node.textContent.trim();
            if (shouldTranslateText(text) && !processedTexts.has(text)) {
                if (!textMap.has(text)) {
                    textMap.set(text, []);
                    newTexts.push(text);
                }
                textMap.get(text).push(node);
            }
        });

        if (newTexts.length === 0) {
            console.log('ℹ️ No new visible text to translate');
            isProcessing = false;
            processQueuedUpdates();
            return;
        }

        // Update node groups with new texts
        newTexts.forEach(text => {
            const existingNodes = nodeGroups.get(text) || [];
            const newNodes = textMap.get(text) || [];
            nodeGroups.set(text, [...existingNodes, ...newNodes]);
        });

        translationProgress.total += newTexts.length;
        console.log(`🎯 Translating ${newTexts.length} new unique texts`);

        // Start translation for new texts
        if (typeof TranslateApp !== 'undefined' && TranslateApp.translateArray) {
            TranslateApp.translateArray(JSON.stringify(newTexts));
        } else {
            console.error('❌ TranslateApp not available');
            isProcessing = false;
            processQueuedUpdates();
        }
    }

    /**
     * Process any queued updates after current translation completes
     */
    function processQueuedUpdates() {
        if (pendingUpdate && !isProcessing) {
            console.log('🔄 Processing queued update...');
            setTimeout(() => {
                processVisibleTexts();
            }, 100); // Small delay to avoid rapid successive calls
        }
    }

    /**
     * Handle scroll events with adaptive throttling
     */
    function handleScroll() {
        clearTimeout(scrollTimeout);
        
        // Use different throttling based on whether we're currently processing
        const throttleDelay = isProcessing ? 50 : 150; // Faster when processing to catch queued updates
        
        scrollTimeout = setTimeout(() => {
            processVisibleTexts();
        }, throttleDelay);
    }

    /**
     * Handle immediate UI changes (no throttling)
     */
    function handleImmediateUpdate() {
        // Small delay to allow DOM to settle
        setTimeout(() => {
            processVisibleTexts();
        }, 50);
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
        console.log('🎉 Batch translation completed!');
        console.log(`📈 Stats: ${translationProgress.completed} completed, ${translationProgress.failed} failed out of ${translationProgress.total} total`);
        isProcessing = false; // Allow new processing
        
        // Process any queued updates that happened during translation
        processQueuedUpdates();
    };

    window.onBatchTranslationError = function(error) {
        console.error('❌ Translation error:', error);
        window.needReload = true
        // alert('An error occurred during translation. Please try again later.');
        isProcessing = false; // Allow new processing
        
        // Process any queued updates that happened during translation
        processQueuedUpdates();
    };

    // Process initially visible texts
    processVisibleTexts();

    // Set up event listeners for dynamic translation
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    
    // Handle tab visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Tab became visible - check for new content
            handleImmediateUpdate();
        }
    });

    // Handle window focus changes  
    window.addEventListener('focus', handleImmediateUpdate);
    
    // Handle orientation changes on mobile
    window.addEventListener('orientationchange', () => {
        setTimeout(handleImmediateUpdate, 100); // Wait for orientation to settle
    });

    // Handle common UI framework events that might reveal new content
    const commonUIEvents = ['DOMContentLoaded', 'load', 'popstate', 'hashchange'];
    commonUIEvents.forEach(eventType => {
        window.addEventListener(eventType, handleImmediateUpdate);
    });

    // Handle click events that might reveal new content (like modals, dropdowns, tabs)
    document.addEventListener('click', (event) => {
        // Check if the clicked element might trigger UI changes
        const clickedElement = event.target;
        const triggerSelectors = [
            'button', '[role="button"]', '[role="tab"]', '.tab', '.modal-trigger',
            '.dropdown-toggle', '.accordion-toggle', '.collapse-toggle', 
            '[data-toggle]', '[data-target]', '.btn', 'a[href="#"]'
        ];
        
        if (triggerSelectors.some(selector => clickedElement.matches && clickedElement.matches(selector))) {
            // Delay to allow UI animations to complete
            setTimeout(handleImmediateUpdate, 300);
        }
    });

    // Handle keyboard events that might reveal content (like pressing Enter/Space on interactive elements)
    document.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && 
            event.target.matches && 
            event.target.matches('button, [role="button"], [role="tab"], [tabindex]')) {
            setTimeout(handleImmediateUpdate, 300);
        }
    });

    // Set up IntersectionObserver for better performance (if supported)
    if ('IntersectionObserver' in window) {
        console.log('📡 Setting up IntersectionObserver for dynamic text translation...');
        
        const observer = new IntersectionObserver(
            (entries) => {
                let hasNewVisibleContent = false;
                entries.forEach(entry => {
                    // Only trigger if element is substantially visible (at least 25% visible)
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
                        hasNewVisibleContent = true;
                    }
                });
                
                if (hasNewVisibleContent) {
                    handleScroll(); // Use the same throttled function
                }
            },
            {
                rootMargin: '50px', // Reduced buffer - only start processing 50px before visible
                threshold: [0.25] // Require at least 25% of element to be visible
            }
        );

        // Observe elements that might contain text
        const observeElements = () => {
            const textContainers = document.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, article, section');
            textContainers.forEach(element => {
                observer.observe(element);
            });
        };

        // Initial observation
        observeElements();

        // Enhanced MutationObserver for dynamic content
        const mutationObserver = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            
            mutations.forEach((mutation) => {
                // Handle new nodes being added
                if (mutation.type === 'childList') {
                    // Check if any added nodes contain text or are text containers
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            // Check if it's a text container or has text content
                            if (element.textContent && element.textContent.trim().length > 0) {
                                shouldUpdate = true;
                                observer.observe(element);
                            }
                            // Also observe any text containers within the added node
                            const textContainers = element.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, article, section');
                            textContainers.forEach(container => {
                                if (container.textContent && container.textContent.trim().length > 0) {
                                    observer.observe(container);
                                }
                            });
                        }
                    });
                }
                
                // Handle attribute changes that might affect visibility
                if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    const attributeName = mutation.attributeName;
                    
                    // Style changes that might reveal new content
                    if (attributeName === 'style' || attributeName === 'class') {
                        if (target.textContent && target.textContent.trim().length > 0) {
                            shouldUpdate = true;
                        }
                    }
                }
                
                // Handle character data changes (text content changes)
                if (mutation.type === 'characterData') {
                    shouldUpdate = true;
                }
            });
            
            if (shouldUpdate) {
                handleImmediateUpdate();
            }
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden'],
            characterData: true
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            observer.disconnect();
            mutationObserver.disconnect();
        });
    }

    // Periodic check to catch any missed content (fallback mechanism)
    const periodicCheck = setInterval(() => {
        // Only run periodic check if we're not currently processing and tab is visible
        if (!isProcessing && !document.hidden) {
            console.log('🔄 Periodic check for missed content...');
            processVisibleTexts();
        }
    }, 3000); // Check every 3 seconds

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(periodicCheck);
        clearTimeout(scrollTimeout);
    });

    console.log('✅ Dynamic text translation system initialized');

})();