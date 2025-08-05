package com.cookiegames.smartcookie

import android.annotation.SuppressLint
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.json.JSONArray
import org.json.JSONObject

// Data class representing the expected JSON structure from ImageTextAnalyzer
// This is needed to parse the result.
//@Serializable
//data class RecognizedTextData(
//    val fullText: String
//)

class AiImageTranslateInterface(private val view: WebView) {

    // A single instance of the JSON parser for efficiency
    private val jsonParser = Json { ignoreUnknownKeys = true }
    
    // Use a dedicated scope for translations
    private val translationScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Translate an array of texts using LlmInferenceManager (batch processing)
     * @param textsJson JSON array of strings to translate
     */
    @JavascriptInterface
    fun translateImageTexts(textsJson: String) {
        Log.i("IMAGE_TRANSLATE", "=== BATCH IMAGE TRANSLATION START ===")
        Log.i("IMAGE_TRANSLATE", "Received JSON length: ${textsJson.length}")

        translationScope.launch {
            try {
                Log.i("IMAGE_TRANSLATE", "Parsing JSON array...")
                val textsArray = JSONArray(textsJson)
                val totalCount = textsArray.length()

                Log.i("IMAGE_TRANSLATE", "Successfully parsed $totalCount texts for image translation")
                Log.i("IMAGE_TRANSLATE", "Checking LlmInferenceManager initialization...")

                if (!LlmInferenceManager.isInitialized()) {
                    if (LlmInferenceManager.isInitializing()) {
                        Log.w("IMAGE_TRANSLATE", "LlmInferenceManager still initializing for batch image translation")
                        sendBatchErrorToJS("LLM is still loading, please wait...")
                    } else {
                        Log.e("IMAGE_TRANSLATE", "LlmInferenceManager not initialized!")
                        sendBatchErrorToJS("LLM not available")
                    }
                    return@launch
                }

                Log.i("IMAGE_TRANSLATE", "LlmInferenceManager is initialized, starting batch image translation...")

                // Process each text sequentially with detailed logging
                for (i in 0 until totalCount) {
                    Log.i("IMAGE_TRANSLATE", "=== IMAGE TRANSLATION ITERATION $i START ===")

                    try {
                        val text = textsArray.getString(i)
                        val currentIndex = i + 1

                        Log.i("IMAGE_TRANSLATE", "Processing $currentIndex/$totalCount")
                        Log.i("IMAGE_TRANSLATE", "Text length: ${text.length}")
                        Log.i("IMAGE_TRANSLATE", "Text preview: ${text.take(50)}...")

                        Log.i("IMAGE_TRANSLATE", "About to call LlmInferenceManager.translate()...")

                        // Add timeout per translation
                        val translated = withTimeout(30000) { // 30 seconds timeout
                            Log.i("IMAGE_TRANSLATE", "Inside timeout block, calling translate...")
                            val result = LlmInferenceManager.translate(text)
                            Log.i("IMAGE_TRANSLATE", "LlmInferenceManager.translate() returned: ${if (result != null) "SUCCESS (${result.length} chars)" else "NULL"}")
                            result
                        }

                        Log.i("IMAGE_TRANSLATE", "Translation completed for $currentIndex/$totalCount")

                        if (translated != null && translated.isNotBlank()) {
                            Log.i("IMAGE_TRANSLATE", "Sending success result to JS...")
                            sendImageBatchResultToJS(text, translated, currentIndex, totalCount)
                            Log.i("IMAGE_TRANSLATE", "Success result sent to JS")
                        } else {
                            Log.w("IMAGE_TRANSLATE", "Empty translation result for $currentIndex/$totalCount")
                            sendImageBatchResultToJS(text, null, currentIndex, totalCount)
                        }

                        Log.i("IMAGE_TRANSLATE", "Adding delay before next translation...")
                        delay(200) // Small delay between translations
                        Log.i("IMAGE_TRANSLATE", "=== IMAGE TRANSLATION ITERATION $i COMPLETED ===")

                    } catch (e: TimeoutCancellationException) {
                        Log.e("IMAGE_TRANSLATE", "=== TIMEOUT in iteration $i ===")
                        Log.e("IMAGE_TRANSLATE", "Translation timeout for ${i + 1}/$totalCount")
                        try {
                            val text = textsArray.getString(i)
                            sendImageBatchResultToJS(text, null, i + 1, totalCount)
                        } catch (ex: Exception) {
                            Log.e("IMAGE_TRANSLATE", "Error sending timeout result", ex)
                        }
                    } catch (e: Exception) {
                        Log.e("IMAGE_TRANSLATE", "=== ERROR in iteration $i ===", e)
                        Log.e("IMAGE_TRANSLATE", "Translation error for ${i + 1}/$totalCount: ${e.message}")
                        try {
                            val text = textsArray.getString(i)
                            sendImageBatchResultToJS(text, null, i + 1, totalCount)
                        } catch (ex: Exception) {
                            Log.e("IMAGE_TRANSLATE", "Error sending error result", ex)
                        }
                    }
                }

                Log.i("IMAGE_TRANSLATE", "=== LOOP COMPLETED ===")
                Log.i("IMAGE_TRANSLATE", "Sending batch complete signal...")
                sendImageBatchCompleteToJS()
                Log.i("IMAGE_TRANSLATE", "=== BATCH IMAGE TRANSLATION END ===")

            } catch (e: Exception) {
                Log.e("IMAGE_TRANSLATE", "=== FATAL ERROR IN BATCH IMAGE TRANSLATION ===", e)
                Log.e("IMAGE_TRANSLATE", "Error details: ${e::class.simpleName}: ${e.message}")
                Log.e("IMAGE_TRANSLATE", "Stack trace: ${e.stackTraceToString()}")
                sendBatchErrorToJS("Fatal batch processing error: ${e.message}")
            }
        }
    }

@JavascriptInterface
    fun extractTextFromImage(url: String, id: String) {
        Log.i("webview", "Received translation request for ID: $id")

        // Launch a coroutine on a background thread for network operations
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // 1. Analyze the image from the provided URL to get a JSON string
                val recognizedJson = ImageTextAnalyzer.analyzeImageFromUrl(url)
                    Log.i("extraction-result", recognizedJson)

                val jsCode = """onExtractionResult(${recognizedJson}, ${quoted(id)})"""

                // 5. Execute the JavaScript on the main thread to update the UI
                view.post {
                    view.evaluateJavascript(jsCode, null)
                }

            } catch (e: Exception) {
               
            }
        }
    } 
@JavascriptInterface
fun extractTextFromImageBase64(base64String: String, id: String) {
    Log.i("webview", "extracting text from base64 image")

    CoroutineScope(Dispatchers.IO).launch {
        try {
            val result = ImageTextAnalyzer.analyzeImageFromBase64(base64String)
            Log.i("webview", "Base64 image analysis completed")

            val jsCode = """onExtractionResult($result, ${quoted(id)})"""

            view.post {
                Log.i("webview", "calling onExtractionResult for base64")
                view.evaluateJavascript(jsCode, null)
            }
        } catch (e: Exception) {
            Log.e("webview", "Error analyzing base64 image: ${e.message}", e)
            
            // Return empty result on error
            val errorResult = """{"fullText":"","textBlocks":[]}"""
            val jsCode = """onExtractionResult($errorResult, ${quoted(id)})"""
            
            view.post {
                view.evaluateJavascript(jsCode, null)
            }
        }
    }
}

    private fun sendImageBatchResultToJS(originalText: String, translation: String?, index: Int, total: Int) {
        try {
            val jsCode = "onImageBatchTranslationResult(${JSONObject.quote(originalText)}, ${if (translation != null) JSONObject.quote(translation) else "null"}, $index, $total);"

            view.post {
                Log.d("IMAGE_TRANSLATE", "Executing JS for image result $index/$total")
                view.evaluateJavascript(jsCode) { result ->
                    Log.d("IMAGE_TRANSLATE", "JS execution result for image $index: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("IMAGE_TRANSLATE", "Error sending image batch result to JS for index $index", e)
        }
    }

    private fun sendImageBatchCompleteToJS() {
        try {
            val jsCode = "onImageBatchTranslationComplete();"
            view.post {
                Log.i("IMAGE_TRANSLATE", "Executing image batch complete JS")
                view.evaluateJavascript(jsCode) { result ->
                    Log.i("IMAGE_TRANSLATE", "Image batch complete JS result: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("IMAGE_TRANSLATE", "Error sending image batch complete to JS", e)
        }
    }

    private fun sendBatchErrorToJS(error: String) {
        try {
            val jsCode = "onImageBatchTranslationError(${JSONObject.quote(error)});"
            view.post {
                Log.e("IMAGE_TRANSLATE", "Executing image batch error JS: $error")
                view.evaluateJavascript(jsCode) { result ->
                    Log.e("IMAGE_TRANSLATE", "Image batch error JS result: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("IMAGE_TRANSLATE", "Error sending image batch error to JS", e)
        }
    }

    // Clean up when the interface is no longer needed
    fun cleanup() {
        translationScope.cancel()
    }

    /**
     * Wraps a string in quotes and escapes any internal quotes for safe
     * injection into a JavaScript string.
     */
    private fun quoted(text: String): String {
        return "'${text.replace("'", "\\'")}'"
    }
}