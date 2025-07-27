package com.cookiegames.smartcookie

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.*
import android.speech.tts.TextToSpeech

class AiYouTubeTranslateInterface(private val view: WebView) {

    private val coroutineScope = CoroutineScope(Dispatchers.Main)

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



}