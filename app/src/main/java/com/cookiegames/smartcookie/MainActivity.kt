package com.cookiegames.smartcookie

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeech.OnInitListener
import android.util.Log
import android.view.KeyEvent
import android.view.Menu
import android.view.View
import android.webkit.CookieManager
import android.webkit.CookieSyncManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import com.cookiegames.smartcookie.browser.activity.BrowserActivity
import com.cookiegames.smartcookie.dialog.LanguageSelectionDialog
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import io.reactivex.Completable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext



import androidx.appcompat.app.AppCompatActivity
//import com.example.utils.TextToSpeechManager
import java.util.Locale

class MainActivity : BrowserActivity() {
//    private lateinit var ttsManager: TextToSpeechManager

    private var tts: TextToSpeech? = null // Declare TextToSpeech instance
    // Define the language and Arabic text to test
    private val TEST_IMAGE_URL = "https://www.bls.gov/blog/2017/images/women-at-work.png"    // Another example: "https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png"
    
    // UI elements for loading overlay
    private lateinit var loadingOverlay: FrameLayout
    private lateinit var loadingText: TextView



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

        // Initialize UI elements
        initLoadingUI()

        // Set up LLM loading callback and user preferences
        LlmInferenceManager.setLoadingCallback { isLoading, message ->
            runOnUiThread {
                updateLoadingState(isLoading, message)
            }
        }
        LlmInferenceManager.setUserPreferences(userPreferences)

        // Show language selection dialog if language is not set
        if (userPreferences.selectedLanguage.isEmpty()) {
            LanguageSelectionDialog.showFirstTimeSetup(
                this,
                userPreferences
            ) { selectedLanguageCode ->
                Log.d("MainActivity", "Language selected: $selectedLanguageCode")
                // You can add additional logic here when language is selected
            }
        }

        lifecycleScope.launch {
            val isInitialized = withContext(Dispatchers.IO) {
                     LlmInferenceManager.initialize(this@MainActivity)
                 }
                 if (isInitialized) {
                     Log.d("MainActivitychromium", "LLM ready to use:")

                     // Make calls sequentially, not simultaneously

                 } else {
                     Log.e("MainActivitychromium", "LLM initialization failed")
                 }


                val success = TextToSpeechManager.initialize(this@MainActivity)
                if (success) {
                    // Optionally set language (default is system language)
                    TextToSpeechManager.setLanguage(Locale.US)
                    val arabicSet = TextToSpeechManager.setLanguage(Locale("ar"))

                    Log.d("MainActivity", "TTS initialized successfully")
                } else {
                    Log.e("MainActivity", "TTS initialization failed")
                }


//          var reply = LlmInferenceManager.translate("Hello I am from france")



        }
    }
        private fun initLoadingUI() {
            loadingOverlay = findViewById(R.id.llm_loading_overlay)
            loadingText = findViewById(R.id.llm_loading_text)
        }

        private fun updateLoadingState(isLoading: Boolean, message: String?) {
            if (isLoading) {
                loadingText.text = message ?: "Loading..."
                loadingOverlay.visibility = View.VISIBLE
                // Disable user interactions
                window.setFlags(
                    android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                    android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                )
            } else {
                loadingOverlay.visibility = View.GONE
                // Re-enable user interactions
                window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE)
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
