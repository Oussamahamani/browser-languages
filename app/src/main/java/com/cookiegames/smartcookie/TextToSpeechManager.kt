import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.*
import kotlin.coroutines.resume

object TextToSpeechManager {

    private var textToSpeech: TextToSpeech? = null
    private var isInitialized = false

    /**
     * Initialize the TextToSpeech engine
     * Call this once in your Application class or MainActivity
     */
    suspend fun initialize(context: Context): Boolean = suspendCancellableCoroutine { continuation ->
        if (isInitialized && textToSpeech != null) {
            continuation.resume(true)
            return@suspendCancellableCoroutine
        }

        textToSpeech = TextToSpeech(context.applicationContext) { status ->
            when (status) {
                TextToSpeech.SUCCESS -> {
                    isInitialized = true
                    Log.d("TTS_Manager", "TextToSpeech initialized successfully")
                    continuation.resume(true)
                }
                else -> {
                    Log.e("TTS_Manager", "TextToSpeech initialization failed with status: $status")
                    isInitialized = false
                    continuation.resume(false)
                }
            }
        }
    }

    /**
     * Speak the given text
     * @param text The text to speak
     * @param queueMode QUEUE_FLUSH to interrupt current speech, QUEUE_ADD to queue after current speech
     */
    fun speak(text: String, queueMode: Int = TextToSpeech.QUEUE_FLUSH) {
        if (!isInitialized || textToSpeech == null) {
            Log.w("TTS_Manager", "TextToSpeech not initialized. Call initialize() first.")
            return
        }

        val utteranceId = "utterance_${System.currentTimeMillis()}"
        textToSpeech?.speak(text, queueMode, null, utteranceId)
        Log.d("TTS_Manager", "Speaking: $text")
    }

    /**
     * Speak text with callback for completion
     */
    fun speak(text: String, queueMode: Int = TextToSpeech.QUEUE_FLUSH, onComplete: (() -> Unit)? = null) {
        if (!isInitialized || textToSpeech == null) {
            Log.w("TTS_Manager", "TextToSpeech not initialized. Call initialize() first.")
            onComplete?.invoke()
            return
        }

        val utteranceId = "utterance_${System.currentTimeMillis()}"

        if (onComplete != null) {
            textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    Log.d("TTS_Manager", "Speech started for: $utteranceId")
                }

                override fun onDone(utteranceId: String?) {
                    Log.d("TTS_Manager", "Speech completed for: $utteranceId")
                    onComplete.invoke()
                }

                override fun onError(utteranceId: String?) {
                    Log.e("TTS_Manager", "Speech error for: $utteranceId")
                    onComplete.invoke()
                }
            })
        }

        textToSpeech?.speak(text, queueMode, null, utteranceId)
        Log.d("TTS_Manager", "Speaking: $text")
    }

    /**
     * Set the language for speech
     * @param locale The locale to set (e.g., Locale.US, Locale("ar"))
     * @return true if language is supported, false otherwise
     */
    fun setLanguage(locale: Locale): Boolean {
        return textToSpeech?.let { tts ->
            when (tts.setLanguage(locale)) {
                TextToSpeech.LANG_MISSING_DATA, TextToSpeech.LANG_NOT_SUPPORTED -> {
                    Log.e("TTS_Manager", "Language not supported: $locale")
                    false
                }
                else -> {
                    Log.d("TTS_Manager", "Language set to: $locale")
                    true
                }
            }
        } ?: false
    }

    /**
     * Set speech rate
     * @param rate Speech rate. 1.0 is normal, < 1.0 is slower, > 1.0 is faster
     */
    fun setSpeechRate(rate: Float) {
        textToSpeech?.setSpeechRate(rate)
        Log.d("TTS_Manager", "Speech rate set to: $rate")
    }

    /**
     * Set speech pitch
     * @param pitch Speech pitch. 1.0 is normal, < 1.0 is lower, > 1.0 is higher
     */
    fun setPitch(pitch: Float) {
        textToSpeech?.setPitch(pitch)
        Log.d("TTS_Manager", "Speech pitch set to: $pitch")
    }

    /**
     * Stop current speech
     */
    fun stop() {
        textToSpeech?.stop()
        Log.d("TTS_Manager", "Speech stopped")
    }

    /**
     * Check if TTS is currently speaking
     */
    fun isSpeaking(): Boolean {
        return textToSpeech?.isSpeaking ?: false
    }

    /**
     * Get available languages
     */
    fun getAvailableLanguages(): Set<Locale>? {
        return textToSpeech?.availableLanguages
    }

    /**
     * Check if a language is available
     */
    fun isLanguageAvailable(locale: Locale): Boolean {
        return textToSpeech?.let { tts ->
            when (tts.isLanguageAvailable(locale)) {
                TextToSpeech.LANG_AVAILABLE, TextToSpeech.LANG_COUNTRY_AVAILABLE, TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE -> true
                else -> false
            }
        } ?: false
    }

    /**
     * Release resources
     * Call this when the app is being destroyed
     */
    fun shutdown() {
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        isInitialized = false
        Log.d("TTS_Manager", "TextToSpeech shutdown")
    }
}