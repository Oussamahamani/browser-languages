package com.cookiegames.smartcookie

import android.util.Log
import android.webkit.JavascriptInterface

class AITranslateInterface() {

    @JavascriptInterface
    fun getUserLanguage(): String {
        Log.i("webview","working")
        return "by world "
    }
}