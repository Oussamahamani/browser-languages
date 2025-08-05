package com.cookiegames.smartcookie

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.*
import android.speech.tts.TextToSpeech

class AiYouTubeTranslateInterface(private val view: WebView) {

    private val coroutineScope = CoroutineScope(Dispatchers.Main)
    // Use a dedicated scope for translations
    private val translationScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Prevent multiple batch translations from running simultaneously
    @Volatile
    private var isTranslating = false

    @JavascriptInterface
    fun getUserLanguage(): String {
        Log.i("webview", "getUserLanguage called")
        return "by world"
    }

    @JavascriptInterface
    fun initializeTTS() {
        Log.i("webview", "initializeTTS called")
        coroutineScope.launch {
            val success = TextToSpeechManager.initialize(view.context)
            if (success) {
                // Notify JavaScript that TTS is ready
                view.post {
                    view.evaluateJavascript("window.ttsInitialized && window.ttsInitialized(true);", null)
                }
                Log.d("TTS_Interface", "TTS initialized successfully")
            } else {
                view.post {
                    view.evaluateJavascript("window.ttsInitialized && window.ttsInitialized(false);", null)
                }
                Log.e("TTS_Interface", "TTS initialization failed")
            }
        }
    }

    @JavascriptInterface
    fun speak(text: String) {
        Log.i("webview", "speak called with text: $text")
        TextToSpeechManager.speak(text)
    }

    @JavascriptInterface
    fun speakWithCallback(text: String, callbackName: String) {
        Log.i("webview", "speakWithCallback called with text: $text")
        TextToSpeechManager.speak(text) {
            // Call JavaScript callback when speech is done
            view.post {
                view.evaluateJavascript("window.$callbackName && window.$callbackName();", null)
            }
        }
    }

    @JavascriptInterface
    fun stopSpeaking() {
        Log.i("webview", "stopSpeaking called")
        TextToSpeechManager.stop()
    }

    @JavascriptInterface
    fun isSpeaking(): Boolean {
        val speaking = TextToSpeechManager.isSpeaking()
        Log.i("webview", "isSpeaking called, result: $speaking")
        return speaking
    }

    @JavascriptInterface
    fun setLanguage(languageCode: String): Boolean {
        Log.i("webview", "setLanguage called with: $languageCode")
        val locale = when (languageCode.lowercase()) {
            "en", "english" -> Locale.US
            "ar", "arabic" -> Locale("ar")
            "es", "spanish" -> Locale("es")
            "fr", "french" -> Locale.FRENCH
            "de", "german" -> Locale.GERMAN
            "it", "italian" -> Locale.ITALIAN
            "pt", "portuguese" -> Locale("pt")
            "ru", "russian" -> Locale("ru")
            "ja", "japanese" -> Locale.JAPANESE
            "ko", "korean" -> Locale.KOREAN
            "zh", "chinese" -> Locale.CHINESE
            else -> {
                // Try to parse as locale string (e.g., "en-US", "ar-SA")
                try {
                    if (languageCode.contains("-")) {
                        val parts = languageCode.split("-")
                        Locale(parts[0], parts[1])
                    } else {
                        Locale(languageCode)
                    }
                } catch (e: Exception) {
                    Log.e("TTS_Interface", "Invalid language code: $languageCode", e)
                    Locale.US // fallback to English
                }
            }
        }
        return TextToSpeechManager.setLanguage(locale)
    }

    @JavascriptInterface
    fun setSpeechRate(rate: Float) {
        Log.i("webview", "setSpeechRate called with rate: $rate")
        TextToSpeechManager.setSpeechRate(rate)
    }

    @JavascriptInterface
    fun setPitch(pitch: Float) {
        Log.i("webview", "setPitch called with pitch: $pitch")
        TextToSpeechManager.setPitch(pitch)
    }

    @JavascriptInterface
    fun getAvailableLanguages(): String {
        Log.i("webview", "getAvailableLanguages called")
        val languages = TextToSpeechManager.getAvailableLanguages()
        return if (languages != null) {
            languages.joinToString(",") { "${it.language}-${it.country}" }
        } else {
            ""
        }
    }

    @JavascriptInterface
    fun isLanguageAvailable(languageCode: String): Boolean {
        Log.i("webview", "isLanguageAvailable called with: $languageCode")
        val locale = try {
            if (languageCode.contains("-")) {
                val parts = languageCode.split("-")
                Locale(parts[0], parts[1])
            } else {
                Locale(languageCode)
            }
        } catch (e: Exception) {
            Log.e("TTS_Interface", "Invalid language code: $languageCode", e)
            return false
        }
        return TextToSpeechManager.isLanguageAvailable(locale)
    }

    /**
     * Translate an array of texts sequentially for YouTube captions
     * @param textsJson JSON array of strings to translate
     */
    @JavascriptInterface
    fun translateArray(textsJson: String) {
        Log.i("YOUTUBE_TRANSLATE", "=== BATCH TRANSLATION START ===")
        Log.i("YOUTUBE_TRANSLATE", "Received JSON length: ${textsJson.length}")
        
        if (isTranslating) {
            Log.w("YOUTUBE_TRANSLATE", "Translation already in progress, ignoring new request")
            sendBatchErrorToJS("Translation already in progress")
            return
        }
        
        isTranslating = true

        translationScope.launch {
            try {
                Log.i("YOUTUBE_TRANSLATE", "Parsing JSON array...")
                val textsArray = JSONArray(textsJson)
                val totalCount = textsArray.length()

                Log.i("YOUTUBE_TRANSLATE", "Successfully parsed $totalCount texts")
                Log.i("YOUTUBE_TRANSLATE", "Checking LlmInferenceManager initialization...")

                if (!LlmInferenceManager.isInitialized()) {
                    if (LlmInferenceManager.isInitializing()) {
                        Log.w("YOUTUBE_TRANSLATE", "LlmInferenceManager still initializing for batch translation")
                        sendBatchErrorToJS("LLM is still loading, please wait...")
                    } else {
                        Log.e("YOUTUBE_TRANSLATE", "LlmInferenceManager not initialized!")
                        sendBatchErrorToJS("LLM not available")
                    }
                    return@launch
                }

                Log.i("YOUTUBE_TRANSLATE", "LlmInferenceManager is initialized, starting loop...")

                // Process each text sequentially with detailed logging
                for (i in 0 until totalCount) {
                    Log.i("YOUTUBE_TRANSLATE", "=== ITERATION $i START ===")

                    try {
                        val text = textsArray.getString(i)
                        val currentIndex = i + 1

                        Log.i("YOUTUBE_TRANSLATE", "Processing $currentIndex/$totalCount")
                        Log.i("YOUTUBE_TRANSLATE", "Text length: ${text.length}")
                        Log.i("YOUTUBE_TRANSLATE", "Text preview: ${text.take(50)}...")

                        Log.i("YOUTUBE_TRANSLATE", "About to call LlmInferenceManager.translate()...")

                        // Add timeout per translation with more logging
                        Log.i("YOUTUBE_TRANSLATE", "BEFORE calling translateToLanguage for iteration $i")
                        Log.i("YOUTUBE_TRANSLATE", "Original text: '$text'")
                        val translated = withTimeout(30000) { // 30 seconds timeout
                            Log.i("YOUTUBE_TRANSLATE", "Inside timeout block, calling translate...")
                            val result = LlmInferenceManager.translateToLanguage(text, "arabic", "youtube-translator")
                            Log.i("YOUTUBE_TRANSLATE", "LlmInferenceManager.translate() FINISHED - Result: ${if (result != null) "SUCCESS (${result.length} chars): '$result'" else "NULL"}")
                            result
                        }
                        Log.i("YOUTUBE_TRANSLATE", "AFTER withTimeout for iteration $i - Result: ${if (translated != null) "SUCCESS (${translated.length} chars)" else "NULL"}")

                        Log.i("YOUTUBE_TRANSLATE", "Translation completed for $currentIndex/$totalCount")

                        if (translated != null && translated.isNotBlank()) {
                            Log.i("YOUTUBE_TRANSLATE", "Sending success result to JS...")
                            sendBatchResultToJS(text, translated, currentIndex, totalCount)
                            Log.i("YOUTUBE_TRANSLATE", "Success result sent to JS")
                        } else {
                            Log.w("YOUTUBE_TRANSLATE", "Empty translation result for $currentIndex/$totalCount")
                            sendBatchResultToJS(text, null, currentIndex, totalCount)
                        }

                        Log.i("YOUTUBE_TRANSLATE", "Adding delay before next translation...")
                        delay(200) // Small delay between translations
                        Log.i("YOUTUBE_TRANSLATE", "=== ITERATION $i COMPLETED ===")

                    } catch (e: TimeoutCancellationException) {
                        Log.e("YOUTUBE_TRANSLATE", "=== TIMEOUT in iteration $i ===")
                        Log.e("YOUTUBE_TRANSLATE", "Translation timeout for ${i + 1}/$totalCount")
                        try {
                            val text = textsArray.getString(i)
                            sendBatchResultToJS(text, null, i + 1, totalCount)
                        } catch (ex: Exception) {
                            Log.e("YOUTUBE_TRANSLATE", "Error sending timeout result", ex)
                        }
                    } catch (e: Exception) {
                        Log.e("YOUTUBE_TRANSLATE", "=== ERROR in iteration $i ===", e)
                        Log.e("YOUTUBE_TRANSLATE", "Translation error for ${i + 1}/$totalCount: ${e.message}")
                        try {
                            val text = textsArray.getString(i)
                            sendBatchResultToJS(text, null, i + 1, totalCount)
                        } catch (ex: Exception) {
                            Log.e("YOUTUBE_TRANSLATE", "Error sending error result", ex)
                        }
                    }
                }

                Log.i("YOUTUBE_TRANSLATE", "=== LOOP COMPLETED ===")
                Log.i("YOUTUBE_TRANSLATE", "Sending batch complete signal...")
                sendBatchCompleteToJS()
                Log.i("YOUTUBE_TRANSLATE", "=== BATCH TRANSLATION END ===")

            } catch (e: Exception) {
                Log.e("YOUTUBE_TRANSLATE", "=== FATAL ERROR IN BATCH TRANSLATION ===", e)
                Log.e("YOUTUBE_TRANSLATE", "Error details: ${e::class.simpleName}: ${e.message}")
                Log.e("YOUTUBE_TRANSLATE", "Stack trace: ${e.stackTraceToString()}")
                sendBatchErrorToJS("Fatal batch processing error: ${e.message}")
            } finally {
                isTranslating = false
                Log.i("YOUTUBE_TRANSLATE", "Translation flag reset")
            }
        }
    }

    private fun sendBatchResultToJS(originalText: String, translation: String?, index: Int, total: Int) {
        try {
            val jsCode = "onBatchTranslationResult(${JSONObject.quote(originalText)}, ${if (translation != null) JSONObject.quote(translation) else "null"}, $index, $total);"

            view.post {
                Log.d("YOUTUBE_TRANSLATE", "Executing JS for result $index/$total")
                view.evaluateJavascript(jsCode) { result ->
                    Log.d("YOUTUBE_TRANSLATE", "JS execution result for $index: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("YOUTUBE_TRANSLATE", "Error sending batch result to JS for index $index", e)
        }
    }

    private fun sendBatchCompleteToJS() {
        try {
            val jsCode = "onBatchTranslationComplete();"
            view.post {
                Log.i("YOUTUBE_TRANSLATE", "Executing batch complete JS")
                view.evaluateJavascript(jsCode) { result ->
                    Log.i("YOUTUBE_TRANSLATE", "Batch complete JS result: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("YOUTUBE_TRANSLATE", "Error sending batch complete to JS", e)
        }
    }

    private fun sendBatchErrorToJS(error: String) {
        try {
            val jsCode = "onBatchTranslationError(${JSONObject.quote(error)});"
            view.post {
                Log.e("YOUTUBE_TRANSLATE", "Executing batch error JS: $error")
                view.evaluateJavascript(jsCode) { result ->
                    Log.e("YOUTUBE_TRANSLATE", "Batch error JS result: $result")
                }
            }
        } catch (e: Exception) {
            Log.e("YOUTUBE_TRANSLATE", "Error sending batch error to JS", e)
        }
    }

    // Clean up when the interface is no longer needed
    fun cleanup() {
        translationScope.cancel()
    }

}