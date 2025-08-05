package com.cookiegames.smartcookie

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject

class AITranslateInterface(private val view: WebView) {
    // Use a dedicated scope for translations
    private val translationScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @JavascriptInterface
    fun getUserLanguage(): String {
        Log.i("webview", "working")
        return "by world "
    }

    @JavascriptInterface
    fun translateWithId(text: String, id: String) {
        Log.i("LLM_PROMPT", "receiving single request '$text' with id '$id'")

        translationScope.launch {
            try {
                withTimeout(60000) {
                    Log.i("LLM_PROMPT", "Starting translation for id: $id")

                    if (!LlmInferenceManager.isInitialized()) {
                        if (LlmInferenceManager.isInitializing()) {
                            Log.w("LLM_PROMPT", "LlmInferenceManager still initializing, waiting...")
                            sendErrorToJS(id, "LLM is still loading, please wait...")
                        } else {
                            Log.e("LLM_PROMPT", "LlmInferenceManager not initialized")
                            sendErrorToJS(id, "LLM not available")
                        }
                        return@withTimeout
                    }

                    val translated = LlmInferenceManager.translate(text)

                    if (translated != null && translated.isNotBlank()) {
                        Log.i("LLM_PROMPT-translation", "Success for id $id: $translated")
                        sendResultToJS(translated, id)
                    } else {
                        Log.w("LLM_PROMPT-notranslation", "Empty/null translation for id: $id")
                        sendErrorToJS(id, "Empty translation result")
                    }
                }
            } catch (e: TimeoutCancellationException) {
                Log.e("LLM_PROMPT", "Translation timeout for id: $id")
                sendErrorToJS(id, "Translation timeout")
            } catch (e: Exception) {
                Log.e("LLM_PROMPT", "Translation error for id: $id", e)
                sendErrorToJS(id, "Translation error: ${e.message}")
            }
        }
    }

    /**
     * NEW: Translate an array of texts sequentially
     * @param textsJson JSON array of strings to translate
     */
    @JavascriptInterface
    fun translateArray(textsJson: String) {
        Log.i("LLM_PROMPT", "=== BATCH TRANSLATION START ===")
        Log.i("LLM_PROMPT", "Received JSON length: ${textsJson.length}")

        translationScope.launch {
            try {
                Log.i("LLM_PROMPT", "Parsing JSON array...")
                val textsArray = JSONArray(textsJson)
                val totalCount = textsArray.length()

                Log.i("LLM_PROMPT", "Successfully parsed $totalCount texts")
                Log.i("LLM_PROMPT", "Checking LlmInferenceManager initialization...")

                if (!LlmInferenceManager.isInitialized()) {
                    if (LlmInferenceManager.isInitializing()) {
                        Log.w("LLM_PROMPT", "LlmInferenceManager still initializing for batch translation")
                        sendBatchErrorToJS("LLM is still loading, please wait...")
                    } else {
                        Log.e("LLM_PROMPT", "LlmInferenceManager not initialized!")
                        sendBatchErrorToJS("LLM not available")
                    }
                    return@launch
                }

                Log.i("LLM_PROMPT", "LlmInferenceManager is initialized, starting loop...")

                // Process each text sequentially with detailed logging
                for (i in 0 until totalCount) {
                    Log.i("LLM_PROMPT", "=== ITERATION $i START ===")

                    try {
                        val text = textsArray.getString(i)
                        val currentIndex = i + 1

                        Log.i("LLM_PROMPT", "Processing $currentIndex/$totalCount")
                        Log.i("LLM_PROMPT", "Text length: ${text.length}")
                        Log.i("LLM_PROMPT", "Text preview: ${text.take(50)}...")

                        Log.i("LLM_PROMPT", "About to call LlmInferenceManager.translate()...")

                        // Add timeout per translation with more logging
                        val translated = withTimeout(30000) { // Increased to 30 seconds
                            Log.i("LLM_PROMPT", "Inside timeout block, calling translate...")
                            val result = LlmInferenceManager.translate(text)
                            Log.i("LLM_PROMPT", "LlmInferenceManager.translate() returned: ${if (result != null) "SUCCESS (${result.length} chars)" else "NULL"}")
                            result
                        }

                        Log.i("LLM_PROMPT", "Translation completed for $currentIndex/$totalCount")

                        if (translated != null && translated.isNotBlank()) {
                            Log.i("LLM_PROMPT", "Sending success result to JS...")
                            sendBatchResultToJS(text, translated, currentIndex, totalCount)
                            Log.i("LLM_PROMPT", "Success result sent to JS")
                        } else {
                            Log.w("LLM_PROMPT", "Empty translation result for $currentIndex/$totalCount")
                            sendBatchResultToJS(text, null, currentIndex, totalCount)
                        }

                        Log.i("LLM_PROMPT", "Adding delay before next translation...")
                        delay(200) // Increased delay
                        Log.i("LLM_PROMPT", "=== ITERATION $i COMPLETED ===")

                    } catch (e: TimeoutCancellationException) {
                        Log.e("LLM_PROMPT", "=== TIMEOUT in iteration $i ===")
                        Log.e("LLM_PROMPT", "Translation timeout for ${i + 1}/$totalCount")
                        try {
                            val text = textsArray.getString(i)
                            sendBatchResultToJS(text, null, i + 1, totalCount)
                        } catch (ex: Exception) {
                            Log.e("LLM_PROMPT", "Error sending timeout result", ex)
                        }
                    } catch (e: Exception) {
                        Log.e("LLM_PROMPT", "=== ERROR in iteration $i ===", e)
                        Log.e("LLM_PROMPT", "Translation error for ${i + 1}/$totalCount: ${e.message}")
                        try {
                            val text = textsArray.getString(i)
                            sendBatchResultToJS(text, null, i + 1, totalCount)
                        } catch (ex: Exception) {
                            Log.e("LLM_PROMPT", "Error sending error result", ex)
                        }
                    }
                }

                Log.i("LLM_PROMPT", "=== LOOP COMPLETED ===")
                Log.i("LLM_PROMPT", "Sending batch complete signal...")
                sendBatchCompleteToJS()
                Log.i("LLM_PROMPT", "=== BATCH TRANSLATION END ===")

            } catch (e: Exception) {
                Log.e("LLM_PROMPT", "=== FATAL ERROR IN BATCH TRANSLATION ===", e)
                Log.e("LLM_PROMPT", "Error details: ${e::class.simpleName}: ${e.message}")
                Log.e("LLM_PROMPT", "Stack trace: ${e.stackTraceToString()}")
                sendBatchErrorToJS("Fatal batch processing error: ${e.message}")
            }
        }
    }

    private fun sendResultToJS(result: String, id: String) {
        try {
            val jsCode = "onTranslationResult(${JSONObject.quote(result)}, ${JSONObject.quote(id)});"

            view.post {
                Log.i("LLM_PROMPT", "calling JS callback for id: $id")
                view.evaluateJavascript(jsCode) { jsResult ->
                    Log.d("LLM_PROMPT", "JS callback result for $id: $jsResult")
                }
            }
        } catch (e: Exception) {
            Log.e("LLM_PROMPT", "Error sending result to JS for id: $id", e)
        }
    }

    private fun sendErrorToJS(id: String, error: String) {
        try {
            val jsCode = "onTranslationResult(null, ${JSONObject.quote(id)});"
            view.post {
                Log.w("LLM_PROMPT", "sending error to JS for id: $id - $error")
                view.evaluateJavascript(jsCode, null)
            }
        } catch (e: Exception) {
            Log.e("LLM_PROMPT", "Error sending error to JS for id: $id", e)
        }
    }

    private fun sendBatchResultToJS(originalText: String, translation: String?, index: Int, total: Int) {
        try {
            val jsCode = "onBatchTranslationResult(${JSONObject.quote(originalText)}, ${if (translation != null) JSONObject.quote(translation) else "null"}, $index, $total);"

            view.post {
                Log.d("LLM_PROMPT", "Executing JS for result $index/$total")
                view.evaluateJavascript(jsCode) { result ->
                    Log.d("LLM_PROMPT", "JS execution result for $index: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("LLM_PROMPT", "Error sending batch result to JS for index $index", e)
        }
    }


    private fun sendBatchCompleteToJS() {
        try {
            val jsCode = "onBatchTranslationComplete();"
            view.post {
                Log.i("LLM_PROMPT", "Executing batch complete JS")
                view.evaluateJavascript(jsCode) { result ->
                    Log.i("LLM_PROMPT", "Batch complete JS result: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("LLM_PROMPT", "Error sending batch complete to JS", e)
        }
    }


    private fun sendBatchErrorToJS(error: String) {
        try {
            val jsCode = "onBatchTranslationError(${JSONObject.quote(error)});"
            view.post {
                Log.e("LLM_PROMPT", "Executing batch error JS: $error")
                view.evaluateJavascript(jsCode) { result ->
                    Log.e("LLM_PROMPT", "Batch error JS result: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("LLM_PROMPT", "Error sending batch error to JS", e)
        }
    }


    // Clean up when the interface is no longer needed
    fun cleanup() {
        translationScope.cancel()
    }
}