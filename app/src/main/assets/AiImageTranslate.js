const resolvers = new Map();

(async function () {
  "use strict";
  if (window.image__myInjectedScriptHasRun__) return;
  window.image__myInjectedScriptHasRun__ = true;

  console.log("loaded from js 1");
  console.time("loaded from js");
  let images = document.querySelectorAll("img");

  for (let image of images) {
    let imageSrc = image.src;
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
      continue; // Skip this image
    }
    if (skipKeywords.endsWith(".svg") || skipKeywords.endsWith(".ico")) {
      continue;
    }
    console.log("loaded from js 2:", imageSrc);

    let [coordinatesData, translationsMap] = await extractImage(
      imageSrc,
      imageSrc
    );
    if (coordinatesData.fullText.length < 3) continue;
    translateImageText(image, coordinatesData, translationsMap);
  }
  console.timeEnd("loaded from js");
})();

async function extractImage(imageUrl, requestId) {
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
  const originalTexts = result.textBlocks.map((block) => block.text);
  console.log("loaded from js 6.5:", JSON.stringify(originalTexts));

  // Step 4: Translate the texts
  const translatedTexts = await translateTexts(originalTexts);

  // Step 5: Build final translations map
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
  const endpoint = "https://10.0.2.2:3001/translate/batch";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });

    if (!response.ok) throw new Error(`API error: ${response.statusText}`);

    const data = await response.json();
    if (data.success && Array.isArray(data.results)) {
      return data.results.map((r) => r.translated || "");
    } else {
      console.error("Unexpected response format", data);
      return texts.map(() => ""); // fallback
    }
  } catch (err) {
    console.error("❌ Translation failed:", err);
    return texts.map(() => ""); // fallback
  }
}

function translateImageText(imgElement, coordinatesData, translationsMap) {
  // Use a new Image object to ensure it's fully loaded and handle potential CORS issues.
  const img = new Image();
  img.crossOrigin = "Anonymous"; // Necessary for drawing images from other domains onto canvas.
  img.src = imgElement.src;

  img.onerror = (error) => {
    console.error("Failed to load image for translation.", error);
  };

  img.onload = () => {
    // Create a canvas to replace the image
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Match canvas dimensions to the original image
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Optional: copy original image's styling to the canvas
    canvas.id = imgElement.id;
    canvas.className = imgElement.className;
    canvas.style.cssText = imgElement.style.cssText;

    // Draw the original image onto the canvas
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Process and draw the translated text blocks
    processTextBlocks(ctx, coordinatesData, translationsMap);

    // Replace the original <img> element with the new <canvas>
    if (imgElement.parentNode) {
      imgElement.parentNode.replaceChild(canvas, imgElement);
    }
  };

  function processTextBlocks(ctx, data, translations) {
    const clearPadding = 5; // Extra pixels to clear around the bounding box

    data.textBlocks.forEach((block) => {
      const originalText = block.text.trim();
      const translatedText = translations[originalText];
      const box = parseBoundingBox(block.boundingBox);

      if (translatedText !== undefined) {
        // Erase the area of the original text.
        // Note: This works best on simple backgrounds. For complex images,
        // this might leave a blank rectangle. Advanced inpainting would be needed for seamless results.
        ctx.clearRect(
          box.x - clearPadding,
          box.y - clearPadding,
          box.width + 2 * clearPadding,
          box.height + 2 * clearPadding
        );

        // Draw the translated text, dynamically adjusting font size to fit.
        drawTextInBox(ctx, translatedText, box, "#333333", 60); // Start with a max font size of 60
      } else {
        console.warn(`No translation found for: "${originalText}"`);
      }
    });
  }

  /**
   * Parses a boundingBox string "x1,y1,x2,y2" into an object {x, y, width, height}.
   */
  function parseBoundingBox(boxString) {
    const [x1, y1, x2, y2] = boxString.split(",").map(Number);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  /**
   * Draws text within a bounding box, handling word wrapping and dynamic font resizing.
   */
  function drawTextInBox(ctx, text, box, color, maxFontSize) {
    ctx.fillStyle = color;
    ctx.textBaseline = "top";

    // Helper to get wrapped lines for a given font size
    const getWrappedLines = (textToWrap, maxWidth, font) => {
      ctx.font = font;
      const words = textToWrap.split(" ");
      let lines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    let currentFontSize = maxFontSize;

    // Find the largest font size that fits vertically
    while (currentFontSize > 5) {
      // Minimum font size of 5px
      const font = `${currentFontSize}px sans-serif`;
      const lines = text
        .split("\n")
        .flatMap((p) => getWrappedLines(p, box.width, font));
      const lineHeight = currentFontSize * 1.2;
      const totalHeight = lines.length * lineHeight;

      if (totalHeight <= box.height) {
        break; // This font size fits
      }
      currentFontSize -= 1;
    }

    // Draw the final, fitted text
    const finalFont = `${currentFontSize}px sans-serif`;
    const finalLineHeight = currentFontSize * 1.2;
    const finalLines = text
      .split("\n")
      .flatMap((p) => getWrappedLines(p, box.width, finalFont));

    let yOffset = 0;
    for (const line of finalLines) {
      ctx.fillText(line, box.x, box.y + yOffset);
      yOffset += finalLineHeight;
    }
  }
}
