package com.cookiegames.smartcookie

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AiYouTubeTranslateInterface(private val view: WebView) {

    @JavascriptInterface
    fun getUserLanguage(): String {
        Log.i("webview","working")
        return "by world "
    }

    @JavascriptInterface
    fun translateWithId() {
        Log.i("webview", "loaded from js 2")

        CoroutineScope(Dispatchers.IO).launch {


            val translated = LlmInferenceManager.translate("my name is john and i live in french")
            if (translated != null) {
                Log.i("loaded from js",translated)
            }else{
                Log.i("loaded from js","no translation")

            }

//            val jsCode = """onTranslationResult($translated)"""
            val jsCode = """onTranslationResult(${translated?.let { quoted(it) }})"""

            view.post {
                Log.i("webview", "loaded from js 5")
                view.evaluateJavascript(jsCode, null)
            }
        }
    }

    private fun quoted(text: String): String {
        return "\"" + text.replace("\"", "\\\"") + "\""
    }
}