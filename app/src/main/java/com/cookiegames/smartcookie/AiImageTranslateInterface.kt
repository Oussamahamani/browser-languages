package com.cookiegames.smartcookie

import android.annotation.SuppressLint
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// Data class representing the expected JSON structure from ImageTextAnalyzer
// This is needed to parse the result.
//@Serializable
//data class RecognizedTextData(
//    val fullText: String
//)

class AiImageTranslateInterface(private val view: WebView) {

    // A single instance of the JSON parser for efficiency
    private val jsonParser = Json { ignoreUnknownKeys = true }




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

    /**
     * Wraps a string in quotes and escapes any internal quotes for safe
     * injection into a JavaScript string.
     */
    private fun quoted(text: String): String {
        return "'${text.replace("'", "\\'")}'"
    }
}