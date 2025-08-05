const resolvers = new Map();
const processedImages = new WeakSet(); // Track images we've already processed
let imageObserver = null; // Global reference for cleanup
let mutationObserver = null; // Global reference for cleanup
let processingQueue = []; // Priority queue for image processing
let isProcessing = false; // Prevent concurrent processing

/**
 * Check if tab is currently visible to avoid wasting resources
 * @returns {boolean} - True if tab is visible
 */
function isTabVisible() {
  return !document.hidden;
}

/**
 * Get image source, handling lazy-loaded images
 * @param {HTMLImageElement} img - The image element
 * @returns {string|null} - Image source or null
 */
function getImageSrc(img) {
  // Check standard src
  if (img.src && img.src !== window.location.href) {
    return img.src;
  }
  
  // Check common lazy loading attributes
  const lazySrcAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-srcset'];
  for (const attr of lazySrcAttrs) {
    const lazySrc = img.getAttribute(attr);
    if (lazySrc) {
      console.log("🔍 Found lazy-loaded image:", lazySrc);
      return lazySrc;
    }
  }
  
  return null;
}

/**
 * Check if an image element is visible to the user
 * @param {HTMLImageElement} img - The image element to check
 * @returns {boolean} - True if the image is visible, false otherwise
 */
function isImageVisible(img) {
  // Don't process if tab is not visible
  if (!isTabVisible()) {
    return false;
  }

  // Check if image has no source (including lazy-loaded)
  const imgSrc = getImageSrc(img);
  if (!imgSrc) {
    console.log("🔍 Image has no src:", img);
    return false;
  }

  // Check if image is hidden by CSS
  const computedStyle = window.getComputedStyle(img);
  if (computedStyle.display === 'none' || 
      computedStyle.visibility === 'hidden' || 
      computedStyle.opacity === '0') {
    console.log("🔍 Image hidden by CSS:", img.src, {
      display: computedStyle.display,
      visibility: computedStyle.visibility,
      opacity: computedStyle.opacity
    });
    return false;
  }

  // Check if image has zero dimensions
  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    console.log("🔍 Image has zero dimensions:", img.src, rect);
    return false;
  }

  // Check if image is within the viewport (visible on screen)
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  
  // Add some buffer to consider images that are just slightly outside viewport
  const buffer = 100; // Increased buffer for better UX
  
  const isInViewport = (
    rect.top >= -buffer &&
    rect.left >= -buffer &&
    rect.bottom <= viewportHeight + buffer &&
    rect.right <= viewportWidth + buffer
  );

  // Check if image is loaded
  const isLoaded = img.complete && img.naturalHeight !== 0;

  console.log("🔍 Visibility check for:", img.src, {
    viewport: { width: viewportWidth, height: viewportHeight },
    rect: rect,
    isInViewport: isInViewport,
    isLoaded: isLoaded,
    complete: img.complete,
    naturalHeight: img.naturalHeight
  });

  return isInViewport && isLoaded;
}

/**
 * Check if an image should be skipped based on keywords and file types
 * @param {string} imageSrc - The image source URL
 * @returns {boolean} - True if image should be skipped
 */
function shouldSkipImage(imageSrc) {
  const skipKeywords = [
    "logo",
    "favicon",
    "icon",
    "brand",
    "sprite",
    "avatar",
  ];
  const lowercasedSrc = imageSrc.toLowerCase();

  if (skipKeywords.some((keyword) => lowercasedSrc.includes(keyword))) {
    return true;
  }
  if (lowercasedSrc.endsWith(".svg") || lowercasedSrc.endsWith(".ico")) {
    return true;
  }
  return false;
}

/**
 * Calculate priority for image processing (closer to viewport center = higher priority)
 * @param {HTMLImageElement} img - The image element
 * @returns {number} - Priority score (lower = higher priority)
 */
function calculateImagePriority(img) {
  const rect = img.getBoundingClientRect();
  const viewportCenterX = window.innerWidth / 2;
  const viewportCenterY = window.innerHeight / 2;
  const imgCenterX = rect.left + rect.width / 2;
  const imgCenterY = rect.top + rect.height / 2;
  
  // Distance from viewport center
  const distance = Math.sqrt(
    Math.pow(imgCenterX - viewportCenterX, 2) + 
    Math.pow(imgCenterY - viewportCenterY, 2)
  );
  
  return distance;
}

/**
 * Process images in priority order (closest to viewport center first)
 */
async function processImageQueue() {
  if (isProcessing || processingQueue.length === 0) {
    return;
  }
  
  isProcessing = true;
  
  // Sort by priority (lower distance = higher priority)
  processingQueue.sort((a, b) => a.priority - b.priority);
  
  while (processingQueue.length > 0 && isTabVisible()) {
    const { image } = processingQueue.shift();
    await processSingleImage(image);
    
    // Add small delay to prevent blocking UI
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  isProcessing = false;
}

/**
 * Add image to processing queue with priority
 * @param {HTMLImageElement} image - The image element to process
 */
function queueImageForProcessing(image) {
  // Check if already queued
  if (processingQueue.some(item => item.image === image)) {
    return;
  }
  
  const priority = calculateImagePriority(image);
  processingQueue.push({ image, priority });
  
  // Start processing queue
  processImageQueue();
}

/**
 * Process a single image for translation
 * @param {HTMLImageElement} image - The image element to process
 */
async function processSingleImage(image) {
  const imageSrc = getImageSrc(image);
  console.log("🔍 Processing image:", imageSrc);
  
  // Skip if already processed
  if (processedImages.has(image)) {
    console.log("⏭️ Skipping already processed image:", imageSrc);
    return;
  }

  // Check visibility
  if (!isImageVisible(image)) {
    console.log("👁️ Image not visible:", imageSrc);
    return;
  }

  // Skip based on keywords and file types
  if (shouldSkipImage(imageSrc)) {
    console.log("🚫 Skipping image based on keywords/filetype:", imageSrc);
    processedImages.add(image); // Mark as processed to avoid checking again
    return;
  }

  console.log("✅ Processing visible image:", imageSrc);
  
  // Mark as processed before starting translation
  processedImages.add(image);

  try {
    // Determine whether to use base64 based on image source
    const useBase64 = shouldUseBase64(imageSrc);
    console.log("📤 Extracting text from image, useBase64:", useBase64);
    
    let [coordinatesData, translationsMap] = await extractImage(
      imageSrc,
      imageSrc,
      useBase64
    );
    
    if (!coordinatesData || coordinatesData.fullText.length < 3) {
      console.log("❌ No sufficient text found in image:", imageSrc);
      return;
    }
    
    console.log("🔤 Found text, starting translation for:", imageSrc);
    await translateImageText(image, coordinatesData, translationsMap);
    console.log("✨ Translation completed for:", imageSrc);
  } catch (error) {
    console.error("💥 Error processing image:", imageSrc, error);
    // Remove from processed set if there was an error, so we can retry later
    processedImages.delete(image);
  }
}

/**
 * Wrapper function for backwards compatibility
 * @param {HTMLImageElement} image - The image element to process
 */
async function processImage(image) {
  queueImageForProcessing(image);
}

/**
 * Process all visible images on the page
 */
async function processVisibleImages() {
  const images = document.querySelectorAll("img");
  console.log("Checking", images.length, "images for visibility");
  
  for (let image of images) {
    await processImage(image);
  }
}

(async function () {
  "use strict";
  if (window.image__myInjectedScriptHasRun__) return;
  window.image__myInjectedScriptHasRun__ = true;

  console.time("loaded from js");
return
  // Process initially visible images
  await processVisibleImages();

  // Set up scroll event listener with throttling for performance
  let scrollTimeout;
  const handleScroll = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(async () => {
      await processVisibleImages();
    }, 250); // Throttle to run max once every 250ms
  };

  // Set up intersection observer for better performance (fallback to scroll if not supported)
  if ('IntersectionObserver' in window) {
    console.log("Setting up IntersectionObserver...");
    
    imageObserver = new IntersectionObserver(
      (entries) => {
        console.log("IntersectionObserver triggered with", entries.length, "entries");
        entries.forEach(async (entry) => {
          console.log("Image intersection:", entry.target.src, "isIntersecting:", entry.isIntersecting);
          if (entry.isIntersecting) {
            await processImage(entry.target);
          }
        });
      },
      {
        rootMargin: '100px', // Start processing images 100px before they become visible
        threshold: 0.1 // Trigger when at least 10% of the image is visible
      }
    );

    // Observe all images on the page
    const observeImages = () => {
      const allImages = document.querySelectorAll('img');
      console.log("Observing", allImages.length, "images");
      
      allImages.forEach(img => {
        // Only observe images that haven't been processed yet
        if (!processedImages.has(img)) {
          console.log("Adding observer to image:", img.src);
          imageObserver.observe(img);
        }
      });
    };

    // Initial observation
    observeImages();

    // Re-observe new images that might be added dynamically
    mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Handle new DOM nodes
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
              if (node.tagName === 'IMG') {
                console.log("New image detected:", getImageSrc(node));
                if (!processedImages.has(node)) {
                  imageObserver.observe(node);
                }
              } else if (node.querySelectorAll) {
                // Check for img elements within added nodes
                const newImages = node.querySelectorAll('img');
                console.log("Found", newImages.length, "new images in added content");
                newImages.forEach(img => {
                  if (!processedImages.has(img)) {
                    imageObserver.observe(img);
                  }
                });
              }
            }
          });
        }
        
        // Handle attribute changes (lazy loading)
        if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
          const img = mutation.target;
          console.log("🔄 Image src changed:", getImageSrc(img));
          
          // Remove from processed set so it can be reprocessed with new src
          if (processedImages.has(img)) {
            processedImages.delete(img);
          }
          
          // Re-observe the image with new src
          if (imageObserver && getImageSrc(img)) {
            imageObserver.observe(img);
          }
        }
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src', 'data-lazy-src', 'data-original'] // Watch for src changes
    });

    console.log("IntersectionObserver setup complete");
  } else {
    console.log("IntersectionObserver not supported, using scroll events");
    // Fallback to scroll events for older browsers
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
  }

  // Also add scroll events even with IntersectionObserver as a backup
  window.addEventListener('scroll', handleScroll, { passive: true });
  console.log("Scroll event listeners added as backup");

  // Add periodic check as additional fallback every 2 seconds
  const periodicInterval = setInterval(async () => {
    if (isTabVisible()) {
      console.log("🔄 Periodic check for new visible images");
      await processVisibleImages();
    }
  }, 2000);

  // Listen for tab visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log("🔇 Tab hidden - pausing image processing");
    } else {
      console.log("🔊 Tab visible - resuming image processing");
      // Resume processing queue when tab becomes visible
      processImageQueue();
    }
  });

  // Cleanup function for better memory management
  window.addEventListener('beforeunload', () => {
    console.log("🧹 Cleaning up image translation resources");
    if (imageObserver) {
      imageObserver.disconnect();
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
    }
    clearInterval(periodicInterval);
    processingQueue.length = 0;
  });

  console.timeEnd("loaded from js");
})();

function imageToBase64(img) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      
      ctx.drawImage(img, 0, 0);
      
      // Convert to base64 (without the data:image/png;base64, prefix)
      const base64 = canvas.toDataURL('image/png').split(',')[1];
      resolve(base64);
    } catch (error) {
      console.error('Error converting image to base64:', error);
      reject(error);
    }
  });
}

// Update the extractImage function to support base64
async function extractImage(imageUrl, requestId, useBase64 = false) {
  console.log("loaded from js 5:", imageUrl, requestId, "useBase64:", useBase64);
  
  if (true) {
    try {
      // Create a new image element to load the image
      const img = new Image();
      img.crossOrigin = "anonymous"; // Handle CORS
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });
      
      // Convert to base64
      const base64String = await imageToBase64(img);
      
      // Call Android method with base64
      AndroidApp.extractTextFromImageBase64(base64String, requestId);
    } catch (error) {
      console.error("Error processing image as base64:", error.message);
      // Fallback to URL method
      // AndroidApp.extractTextFromImage(imageUrl, requestId);
    }
  } else {
    // Original URL method
    // AndroidApp.extractTextFromImage(imageUrl, requestId);
  }

  // Step 2: Wait for extraction result
  let result = await waitForExtraction(requestId);
  console.log("loaded from js 6:", JSON.stringify(result));
  result = JSON.parse(result);

  if (!result || !result.textBlocks || !Array.isArray(result.textBlocks)) {
    console.error("Invalid result format:", result);
    return [null, {}];
  }

  // Step 3: Get the original texts
  const originalTexts = result.textBlocks.map((block) => block.text.trim());

  console.log("loaded from js 6.5:", JSON.stringify(originalTexts));

  const translatedTexts = await translateTexts(originalTexts);
  console.log("images translatedTexts", translatedTexts);

  const translations = {};
  originalTexts.forEach((text, index) => {
    translations[text] = translatedTexts[index] || "";
  });
  console.log("loaded from js 7:", JSON.stringify(translations));
  return [result, translations];
}
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

async function translateTexts(texts) {
  console.log("🌐 Starting batch translation using LlmInferenceManager for", texts.length, "texts");
  
  return new Promise((resolve) => {
    const translations = {};
    let processedCount = 0;
    let totalCount = texts.length;

    if (totalCount === 0) {
      resolve([]);
      return;
    }

    // Global callback functions for Android batch translation
    window.onImageBatchTranslationResult = function(originalText, translation, index, total) {
      console.log(`📝 Image translation result ${index}/${total}:`, originalText.substring(0, 30), "->", translation ? translation.substring(0, 30) : "null");
      
      if (translation) {
        translations[originalText] = translation;
      } else {
        translations[originalText] = "";  // Fallback for failed translations
        console.warn(`❌ Translation failed for: "${originalText.substring(0, 50)}..."`);
      }
      
      processedCount++;
    };

    window.onImageBatchTranslationComplete = function() {
      console.log('🎉 Image batch translation completed!');
      console.log(`📈 Stats: ${processedCount} processed out of ${totalCount} total`);
      
      // Map results back to original order
      const results = texts.map(text => translations[text] || "");
      resolve(results);
    };

    window.onImageBatchTranslationError = function(error) {
      console.error('❌ Image batch translation error:', error);
      // Return empty translations on error
      resolve(texts.map(() => ""));
    };

    // Start batch translation using AndroidApp interface
    if (typeof AndroidApp !== 'undefined' && AndroidApp.translateImageTexts) {
      console.log("📤 Sending texts to AndroidApp for batch translation...");
      AndroidApp.translateImageTexts(JSON.stringify(texts));
    } else {
      console.error('❌ AndroidApp.translateImageTexts not available');
      resolve(texts.map(() => "")); // fallback
    }
  });
}

function translateImageText(imgElement, coordinatesData, translationsMap, options = {}) {
  // Enhanced error handling
  if (!imgElement || !coordinatesData || !translationsMap) {
    console.error("Missing required parameters for translateImageText");
    return Promise.reject(new Error("Missing required parameters"));
  }
  
  if (!coordinatesData.textBlocks || !Array.isArray(coordinatesData.textBlocks)) {
    console.error("Invalid coordinatesData format - textBlocks must be an array");
    return Promise.reject(new Error("Invalid coordinatesData format"));
  }

  // Default options
  const defaultOptions = {
    clearPadding: 5,
    maxFontSize: 60,
    minFontSize: 8,
    defaultTextColor: "#333333",
    autoContrast: true, // Automatically adjust text color based on background
    contrastThreshold: 4.5, // WCAG AA contrast ratio
    addTextStroke: false, // Add subtle stroke for better visibility
    defaultFontFamily: "Arial, sans-serif",
    backgroundSampling: true,
    textAlignment: "left", // "left", "center", "right"
    preserveOriginalStyling: true
  };
  
  const config = { ...defaultOptions, ...options };

  return new Promise((resolve, reject) => {
    // Use a new Image object to ensure it's fully loaded and handle potential CORS issues
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imgElement.src;

    img.onerror = (error) => {
      console.error("Failed to load image for translation.", error);
      reject(error);
    };

    img.onload = () => {
      try {
        // Create a canvas to replace the image
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Set internal canvas dimensions to match the original image's natural size
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Copy original image's styling to the canvas if requested
        if (config.preserveOriginalStyling) {
          canvas.id = imgElement.id;
          canvas.className = imgElement.className;
          
          // Get computed styles from the original image
          const computedStyle = window.getComputedStyle(imgElement);
          const imgRect = imgElement.getBoundingClientRect();
          
          // Copy all non-default styles except those that might conflict with canvas
          const stylesToCopy = window.getComputedStyle(imgElement);
          for (let i = 0; i < stylesToCopy.length; i++) {
            const property = stylesToCopy[i];
            // Skip properties that might cause issues with canvas
            if (!['content', 'counter-increment', 'counter-reset'].includes(property)) {
              canvas.style.setProperty(property, stylesToCopy.getPropertyValue(property));
            }
          }
          
          // Ensure the canvas displays at the same size as the original image
          // This handles cases where the image was scaled via CSS
          if (imgElement.style.width || computedStyle.width !== 'auto') {
            canvas.style.width = computedStyle.width;
          }
          if (imgElement.style.height || computedStyle.height !== 'auto') {
            canvas.style.height = computedStyle.height;
          }
          
          // Preserve responsive behavior if image was using max-width/max-height
          if (computedStyle.maxWidth !== 'none') {
            canvas.style.maxWidth = computedStyle.maxWidth;
          }
          if (computedStyle.maxHeight !== 'none') {
            canvas.style.maxHeight = computedStyle.maxHeight;
          }
        }
canvas.id = imgElement.id;
canvas.className = imgElement.className;

// Get the displayed dimensions of the original image
const imgStyles = window.getComputedStyle(imgElement);
canvas.style.width = imgStyles.width;
canvas.style.height = imgStyles.height;
canvas.style.maxWidth = imgStyles.maxWidth;
canvas.style.maxHeight = imgStyles.maxHeight;

// Copy other important styling
canvas.style.objectFit = imgStyles.objectFit;
canvas.style.border = imgStyles.border;
canvas.style.margin = imgStyles.margin;
canvas.style.padding = imgStyles.padding;
canvas.style.display = imgStyles.display;

        // Draw the original image onto the canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Process and draw the translated text blocks
        processTextBlocks(ctx, coordinatesData, translationsMap, config);

        // Replace the original <img> element with the new <canvas>
        if (imgElement.parentNode) {
          imgElement.parentNode.replaceChild(canvas, imgElement);
          resolve(canvas);
        } else {
          reject(new Error("Image element has no parent node"));
        }
      } catch (error) {
        console.error("Error processing image translation:", error);
        reject(error);
      }
    };
  });

  function processTextBlocks(ctx, data, translations, config) {
    data.textBlocks.forEach((block, index) => {
      try {
        const originalText = block.text.trim();
        const translatedText = translations[originalText];
        const box = parseBoundingBox(block.boundingBox);

        if (translatedText !== undefined && translatedText !== "") {
          // Sample background color for better integration
          const backgroundColor = config.backgroundSampling ? 
            sampleBackgroundColor(ctx, box, config.clearPadding) : null;

          // Clear the area of the original text with background color or transparency
          clearTextArea(ctx, box, config.clearPadding, backgroundColor);

          // Determine text style with automatic contrast adjustment
          const textStyle = determineTextStyle(block, config, backgroundColor);

          // Draw the translated text with enhanced styling
          drawTextInBox(ctx, translatedText, box, textStyle, config);
        } else {
          console.warn(`No translation found for: "${originalText}" (block ${index})`,JSON.stringify(translations));
        }
      } catch (error) {
        console.error(`Error processing text block ${index}:`, error.message);
      }
    });
  }

  /**
   * Sample background color from around the bounding box
   */
  function sampleBackgroundColor(ctx, box, padding) {
    try {
      // Sample from multiple points around the box edges for better color detection
      const samplePoints = [
        { x: Math.max(0, box.x - padding), y: Math.max(0, box.y - padding) },
        { x: Math.min(ctx.canvas.width - 1, box.x + box.width + padding), y: Math.max(0, box.y - padding) },
        { x: Math.max(0, box.x - padding), y: Math.min(ctx.canvas.height - 1, box.y + box.height + padding) },
        { x: Math.min(ctx.canvas.width - 1, box.x + box.width + padding), y: Math.min(ctx.canvas.height - 1, box.y + box.height + padding) }
      ];
      
      let totalR = 0, totalG = 0, totalB = 0, validSamples = 0;
      
      samplePoints.forEach(point => {
        try {
          const imageData = ctx.getImageData(point.x, point.y, 1, 1);
          const [r, g, b] = imageData.data;
          totalR += r;
          totalG += g;
          totalB += b;
          validSamples++;
        } catch (e) {
          // Skip invalid sample points
        }
      });
      
      if (validSamples > 0) {
        const avgR = Math.round(totalR / validSamples);
        const avgG = Math.round(totalG / validSamples);
        const avgB = Math.round(totalB / validSamples);
        return `rgb(${avgR}, ${avgG}, ${avgB})`;
      }
    } catch (error) {
      console.warn("Could not sample background color:", error);
    }
    
    return null; // Fall back to transparent
  }

  /**
   * Clear the text area with background color or transparency
   */
  function clearTextArea(ctx, box, padding, backgroundColor) {
    if (backgroundColor) {
      // Fill with sampled background color
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(
        box.x - padding,
        box.y - padding,
        box.width + 2 * padding,
        box.height + 2 * padding
      );
    } else {
      // Fall back to clearing (transparent)
      ctx.clearRect(
        box.x - padding,
        box.y - padding,
        box.width + 2 * padding,
        box.height + 2 * padding
      );
    }
  }

  /**
   * Calculate luminance of a color for contrast detection
   */
  function getLuminance(r, g, b) {
    // Convert RGB to relative luminance using WCAG formula
    const rsRGB = r / 255;
    const gsRGB = g / 255;
    const bsRGB = b / 255;

    const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  }

  /**
   * Calculate contrast ratio between two colors
   */
  function getContrastRatio(luminance1, luminance2) {
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Parse RGB color string to get RGB values
   */
  function parseRGBColor(colorString) {
    if (!colorString) return null;
    
    const rgbMatch = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3])
      };
    }
    return null;
  }

  /**
   * Get optimal text color based on background color
   */
  function getOptimalTextColor(backgroundColor) {
    const bgColor = parseRGBColor(backgroundColor);
    if (!bgColor) {
      return "#333333"; // Default dark color if we can't parse background
    }

    const bgLuminance = getLuminance(bgColor.r, bgColor.g, bgColor.b);
    
    // Test contrast with white and black text
    const whiteLuminance = 1; // White has luminance of 1
    const blackLuminance = 0; // Black has luminance of 0
    
    const contrastWithWhite = getContrastRatio(bgLuminance, whiteLuminance);
    const contrastWithBlack = getContrastRatio(bgLuminance, blackLuminance);
    
    // WCAG AA standard requires contrast ratio of at least 4.5:1 for normal text
    const minContrast = 4.5;
    
    if (contrastWithWhite >= minContrast && contrastWithWhite > contrastWithBlack) {
      return "#FFFFFF"; // Use white text
    } else if (contrastWithBlack >= minContrast) {
      return "#000000"; // Use black text
    } else {
      // If neither white nor black provides good contrast, choose the better one
      return contrastWithWhite > contrastWithBlack ? "#FFFFFF" : "#000000";
    }
  }

  /**
   * Determine text style based on block data and configuration
   */
  function determineTextStyle(block, config, backgroundColor = null) {
    let textColor = block.textColor || config.defaultTextColor;
    
    // If we have a background color, optimize text color for contrast
    if (backgroundColor && !block.textColor) {
      textColor = getOptimalTextColor(backgroundColor);
    }
    
    return {
      color: textColor,
      fontFamily: block.fontFamily || config.defaultFontFamily,
      fontWeight: block.fontWeight || "normal",
      textAlign: block.textAlign || config.textAlignment,
      maxFontSize: config.maxFontSize,
      minFontSize: config.minFontSize
    };
  }

  /**
   * Parses a boundingBox string "x1,y1,x2,y2" into an object {x, y, width, height}
   */
  function parseBoundingBox(boxString) {
    try {
      const coords = boxString.split(",").map(Number);
      if (coords.length !== 4 || coords.some(isNaN)) {
        throw new Error("Invalid bounding box format");
      }
      const [x1, y1, x2, y2] = coords;
      return { 
        x: Math.min(x1, x2), 
        y: Math.min(y1, y2), 
        width: Math.abs(x2 - x1), 
        height: Math.abs(y2 - y1) 
      };
    } catch (error) {
      console.error("Error parsing bounding box:", boxString, error);
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }

  /**
   * Enhanced text drawing with automatic contrast and optional stroke
   */
  function drawTextInBox(ctx, text, box, style, config) {
    ctx.textBaseline = "top";

    // Helper to get wrapped lines for a given font size
    const getWrappedLines = (textToWrap, maxWidth, font) => {
      ctx.font = font;
      const words = textToWrap.split(" ");
      let lines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width <= maxWidth && testLine.length < 100) { // Prevent extremely long lines
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
          } else {
            // Handle single word that's too long - force break
            lines.push(word);
          }
          currentLine = currentLine ? "" : word;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    let currentFontSize = style.maxFontSize;

    // Find the largest font size that fits both horizontally and vertically
    while (currentFontSize >= style.minFontSize) {
      const font = `${style.fontWeight} ${currentFontSize}px ${style.fontFamily}`;
      const lines = text
        .split("\n")
        .flatMap((paragraph) => getWrappedLines(paragraph, box.width - 4, font)); // Leave small margin
      
      const lineHeight = currentFontSize * 1.2;
      const totalHeight = lines.length * lineHeight;

      // Check if all lines fit within the box width
      ctx.font = font;
      const allLinesFit = lines.every(line => ctx.measureText(line).width <= box.width - 4);

      if (totalHeight <= box.height - 4 && allLinesFit) {
        break; // This font size fits
      }
      currentFontSize -= 1;
    }

    // Ensure minimum font size
    currentFontSize = Math.max(currentFontSize, style.minFontSize);

    // Draw the final, fitted text
    const finalFont = `${style.fontWeight} ${currentFontSize}px ${style.fontFamily}`;
    ctx.font = finalFont;
    const finalLineHeight = currentFontSize * 1.2;
    const finalLines = text
      .split("\n")
      .flatMap((paragraph) => getWrappedLines(paragraph, box.width - 4, finalFont));

    // Calculate vertical centering offset
    const totalTextHeight = finalLines.length * finalLineHeight;
    const verticalOffset = Math.max(0, (box.height - totalTextHeight) / 2);

    // Draw each line with proper alignment and optional stroke for better visibility
    finalLines.forEach((line, index) => {
      let xPosition = box.x + 2; // Small left margin
      
      // Handle text alignment
      if (style.textAlign === "center") {
        const lineWidth = ctx.measureText(line).width;
        xPosition = box.x + (box.width - lineWidth) / 2;
      } else if (style.textAlign === "right") {
        const lineWidth = ctx.measureText(line).width;
        xPosition = box.x + box.width - lineWidth - 2; // Small right margin
      }

      const yPosition = box.y + verticalOffset + (index * finalLineHeight);
      
      // Add subtle stroke for better visibility on complex backgrounds
      if (config.addTextStroke) {
        ctx.strokeStyle = style.color === "#FFFFFF" ? "#000000" : "#FFFFFF";
        ctx.lineWidth = Math.max(1, currentFontSize / 20); // Proportional stroke width
        ctx.strokeText(line, xPosition, yPosition);
      }
      
      // Draw the main text
      ctx.fillStyle = style.color;
      ctx.fillText(line, xPosition, yPosition);
    });
  }
}

/**
 * Helper function to determine when to use base64
 */
function shouldUseBase64(imageUrl) {
  // Use base64 for:
  // 1. Data URLs
  // 2. CORS-restricted images
  // 3. Images from different domains (potential CORS issues)
  
  if (imageUrl.startsWith('data:')) {
    return false; // Already base64, use URL method
  }
  
  try {
    const imgDomain = new URL(imageUrl).hostname;
    const currentDomain = window.location.hostname;
    
    // Use base64 for cross-domain images to avoid CORS issues
    return imgDomain !== currentDomain;
  } catch (error) {
    // If URL parsing fails, default to URL method
    return false;
  }
}