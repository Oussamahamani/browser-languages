package com.cookiegames.smartcookie

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeech.OnInitListener
import android.util.Log
import android.view.KeyEvent
import android.view.Menu
import android.webkit.CookieManager
import android.webkit.CookieSyncManager
import androidx.lifecycle.lifecycleScope
import com.cookiegames.smartcookie.browser.activity.BrowserActivity
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import io.reactivex.Completable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext



import androidx.appcompat.app.AppCompatActivity
import java.util.Locale

class MainActivity : BrowserActivity() {

    private lateinit var llmInference: LlmInference
    private var tts: TextToSpeech? = null // Declare TextToSpeech instance
    // Define the language and Arabic text to test
    private val testLanguage: Locale = Locale("ar") // Use "ar" for Arabic
    private val textToSpeak: String = "قَوْسُ قُزَحْ، يُسَمَّى كَذَلِكَ: قَوْسُ الْمَطَرِ أَوْ قَوْسُ الْأَلْوَانِ، وَهُوَ ظَاهِرَةٌ طَبِيعِيَّةٌ فِزْيَائِيَّةٌ نَاتِجَةٌ عَنِ انْكِسَارِ وَتَحَلُّلِ ضَوْءِ الشَّمْسِ خِلالَ قَطْرَةِ مَاءِ الْمَطَرِ.\n" +
            "\n" // "Hello, this is an automatic voice test in Arabic."

    @Suppress("DEPRECATION")
    public override fun updateCookiePreference(): Completable = Completable.fromAction {
        val cookieManager = CookieManager.getInstance()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            CookieSyncManager.createInstance(this@MainActivity)
        }
        cookieManager.setAcceptCookie(userPreferences.cookiesEnabled)
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        return false
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d("LLM_TEST", "Prompt working")

        lifecycleScope.launch {
            runLlmInference()
        }
    }

    private suspend fun runLlmInference() = withContext(Dispatchers.IO) {
        try {
            tts = TextToSpeech(this@MainActivity, OnInitListener { status: Int ->

                val result = tts?.setLanguage(testLanguage)
//                val installIntent = Intent().apply {
//                    action = TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA
//                }
//                startActivity(installIntent)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    // Log an error if Arabic language data is missing or not supported
                    Log.e("TTS", "Arabic Language (${testLanguage.displayName}) is not supported or missing data!")
                    // On some devices, users might need to download the Arabic voice data from
                    // their device settings (Settings -> System -> Languages & input -> Advanced -> Text-to-speech output -> Preferred engine settings -> Install voice data).
                } else {
                    // If initialization and language setting are successful, speak the Arabic text
                    Log.d("TTS", "TextToSpeech initialized successfully for Arabic. Attempting to speak.")
//                    tts?.speak(textToSpeak, TextToSpeech.QUEUE_FLUSH, null, "uniqueIdForTest")

                }

            })

            val startTime = System.currentTimeMillis()
            val options = LlmInference.LlmInferenceOptions.builder()
                .setModelPath("/data/local/tmp/llm/Gemma3-1B-IT_multi-prefill-seq_q4_ekv2048.task")
                .setMaxTokens(512)
                .setPreferredBackend(LlmInference.Backend.GPU) // ✅ GPU usage
                .build()

            llmInference = LlmInference.createFromOptions(this@MainActivity, options)

            var endTime = System.currentTimeMillis()
            Log.d("LLM_TEST", "Time taken to load model: ${endTime - startTime}ms")

            var result = llmInference.generateResponse("are you a robot?")
             endTime = System.currentTimeMillis()

            Log.d("LLM_TEST", "LLM response: $result")
            Log.d("LLM_TEST", "Time taken to to response: ${endTime - startTime}ms")

             result = llmInference.generateResponse("how are you?")
            endTime = System.currentTimeMillis()

            Log.d("LLM_TEST", "LLM2 response: $result")
            Log.d("LLM_TEST", "Time2 taken to to response: ${endTime - startTime}ms")
            llmInference.close() // ✅ Good practice
        } catch (e: Exception) {
            Log.e("LLM_TEST", "Error while running LLM inference", e)
        }
    }

    override fun onNewIntent(intent: Intent) =
            if (intent.action == INTENT_PANIC_TRIGGER) {
                // TODO: investigate why this is here and why removing it fixes an intent issue
                panicClean()
            } else {
                handleNewIntent(intent)
                super.onNewIntent(intent)
            }

    override fun onPause() {
        super.onPause()
        saveOpenTabs()
    }

    override fun onResume(){
        super.onResume()
        invalidateOptionsMenu()
    }

    override fun updateHistory(title: String?, url: String) = addItemToHistory(title, url)

    override fun isIncognito() = false

    override fun closeActivity() = closeDrawers {
        performExitCleanUp()
        moveTaskToBack(true)
        if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            super.finishAndRemoveTask()
        }
        else {
            super.finish()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.isCtrlPressed) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_P ->
                    // Open a new private window
                    if (event.isShiftPressed) {
                        startActivity(IncognitoActivity.createIntent(this))
                        overridePendingTransition(R.anim.slide_up_in, R.anim.fade_out_scale)
                        return true
                    }
            }
        }
        return super.dispatchKeyEvent(event)
    }


}
