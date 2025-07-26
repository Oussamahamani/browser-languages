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
import android.widget.TextView
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

    private var tts: TextToSpeech? = null // Declare TextToSpeech instance
    // Define the language and Arabic text to test
    private val testLanguage: Locale = Locale("ar") // Use "ar" for Arabic
    private val textToSpeak: String = "قَوْسُ قُزَحْ، يُسَمَّى كَذَلِكَ: قَوْسُ الْمَطَرِ أَوْ قَوْسُ الْأَلْوَانِ، وَهُوَ ظَاهِرَةٌ طَبِيعِيَّةٌ فِزْيَائِيَّةٌ نَاتِجَةٌ عَنِ انْكِسَارِ وَتَحَلُّلِ ضَوْءِ الشَّمْسِ خِلالَ قَطْرَةِ مَاءِ الْمَطَرِ.\n" +
            "\n" // "Hello, this is an automatic voice test in Arabic."

    private lateinit var statusTextView: TextView
    private lateinit var fullRecognizedTextView: TextView
    private lateinit var detailedRecognizedTextView: TextView

    // Define a sample URL for testing. You can replace this with any image URL containing text.
    private val TEST_IMAGE_URL = "https://acropolis-wp-content-uploads.s3.us-west-1.amazonaws.com/02-women-leveling-up-in-STEM.png"    // Another example: "https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png"
    // Or a URL to an image with more complex text.


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
            try {
                Log.d("MainActivity", "Attempting to analyze image from URL: $TEST_IMAGE_URL")
                val recognizedData = ImageTextAnalyzer.analyzeImageFromUrl(this@MainActivity, TEST_IMAGE_URL)

                Log.d("MainActivity", "Analysis Complete!")
                Log.d("TextRecognitionResult", recognizedData)

                Log.d("TextRecognitionResult", "Detailed Text Data:")


            } catch (e: Exception) {
                Log.e("MainActivity", "Error during image analysis: ${e.message}", e)
                Log.e("TextRecognitionResult", "Failed to recognize text: ${e.localizedMessage ?: "Unknown error"}")
            }


//            runLlmInference()
            // LlmInferenceManager.initialize(this@MainActivity)
//            val reply = LlmInferenceManager.translate("Hello I am from france")
//            Log.d("LLM", "Response: $reply")

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
