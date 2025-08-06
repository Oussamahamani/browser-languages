package com.cookiegames.smartcookie

import android.content.Context
import android.util.Log
import com.cookiegames.smartcookie.preference.UserPreferences
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlin.coroutines.resume
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.buffer
import okio.sink
import java.io.File
import java.io.IOException
import kotlin.math.roundToInt

/**
 * LLM Inference Manager based on Google AI Edge Gallery patterns
 */
object LlmInferenceManager {
    private const val TAG = "LlmInferenceManager"

    private var llmInference: LlmInference? = null
    private var currentSession: LlmInferenceSession? = null
    private var isInitializing = false
    private var currentConfig: Config? = null
    private var loadingCallback: ((Boolean, String?) -> Unit)? = null
    private val translationMutex = Mutex()
    
    // UserPreferences instance to get selected language
    private var userPreferences: UserPreferences? = null
    
    // Model download URL and path configuration
    private const val MODEL_DOWNLOAD_URL = "https://firebasestorage.googleapis.com/v0/b/jobready-fce4e.appspot.com/o/assets%2Fgemma-3n-E2B-it-int4.task?alt=media&token=c0ff5d25-188d-447e-a9b0-fd15eca67453"
    private const val MODEL_FILENAME = "gemma-3n-E2B-it-int4.task"
    
    // Download progress callback  
    private var downloadProgressCallback: ((Int, Long, Long, String?) -> Unit)? = null
    private var isDownloading = false
    
    // Load balancing queue system
    private val requestQueue = mutableListOf<TranslationRequest>()
    private var isProcessingQueue = false
    private val sourceQueues = mutableMapOf<String, MutableList<TranslationRequest>>()
    private var currentSourceIndex = 0
    private var activeSources = mutableListOf<String>()

    data class TranslationRequest(
        val text: String,
        val source: String, // identifier for the requesting script
        val continuation: kotlin.coroutines.Continuation<String?>
    )

    data class Config(
        val modelPath: String,
        val maxTokens: Int = 512,
        val topK: Int = 40,
        val topP: Float = 0.95f,
        val temperature: Float = 0.8f,
        val preferGpu: Boolean = true
    )

    /**
     * Data class to hold both LLM engine and session (similar to Google's LlmModelInstance)
     */
    data class LlmModelInstance(
        val engine: LlmInference,
        var session: LlmInferenceSession
    )

    /**
     * Set the UserPreferences instance to access selected language
     */
    fun setUserPreferences(preferences: UserPreferences) {
        userPreferences = preferences
    }

    /**
     * Convert language code to language name for LLM prompts
     */
    private fun getLanguageNameFromCode(languageCode: String): String {
        return when (languageCode) {
            "en" -> "english"
            "ar" -> "arabic"
            "cs" -> "czech"
            "de" -> "german"
            "el" -> "greek"
            "es" -> "spanish"
            "fa" -> "persian"
            "fr" -> "french"
            "hu" -> "hungarian"
            "it" -> "italian"
            "iw" -> "hebrew"
            "ja" -> "japanese"
            "ko" -> "korean"
            "lt" -> "lithuanian"
            "nl" -> "dutch"
            "pl" -> "polish"
            "pt" -> "portuguese"
            "pt-rBR" -> "portuguese"
            "ru" -> "russian"
            "sr" -> "serbian"
            "tr" -> "turkish"
            "zh-rCN" -> "chinese"
            "zh-rTW" -> "chinese"
            else -> "english" // Default fallback
        }
    }

    /**
     * Get the current target language from user preferences
     */
    private fun getCurrentTargetLanguage(): String {
        val selectedLanguage = userPreferences?.selectedLanguage?.ifEmpty { "en" } ?: "en"
        return getLanguageNameFromCode(selectedLanguage)
    }

    suspend fun initialize(context: Context, config: Config): Boolean = withContext(Dispatchers.IO) {
        if (llmInference != null && !isInitializing) {
            Log.d(TAG, "LLM already initialized")
            loadingCallback?.invoke(false, null)
            return@withContext true
        }

        if (isInitializing) {
            Log.w(TAG, "Initialization already in progress")
            return@withContext false
        }

        try {
            isInitializing = true
            loadingCallback?.invoke(true, "Checking model availability...")
            Log.d(TAG, "Checking model file: ${config.modelPath}")
            
            // Check if model exists, download if not
            val modelFile = File(config.modelPath)
            if (!modelFile.exists()) {
                Log.d(TAG, "Model file not found. Starting download...")
                loadingCallback?.invoke(true, "Model not found. Starting download...")
                
                val downloaded = downloadModel(context, config.modelPath)
                if (!downloaded) {
                    Log.e(TAG, "Failed to download model")
                    loadingCallback?.invoke(false, "Failed to download model")
                    return@withContext false
                }
            }
            
            loadingCallback?.invoke(true, "Initializing LLM...")
            Log.d(TAG, "Initializing LlmInference with model: ${config.modelPath}")

            val preferredBackend = if (config.preferGpu) {
                LlmInference.Backend.GPU
            } else {
                LlmInference.Backend.CPU
            }

            val options = LlmInference.LlmInferenceOptions.builder()
                .setModelPath(config.modelPath)
                .setMaxTokens(config.maxTokens)
                .setPreferredBackend(preferredBackend)
                .build()

            loadingCallback?.invoke(true, "Loading model...")
            llmInference = LlmInference.createFromOptions(context, options)
            currentConfig = config

            // Create initial session
            loadingCallback?.invoke(true, "Creating session...")
            createNewSession(config)

            Log.d(TAG, "LlmInference initialized successfully")
            loadingCallback?.invoke(false, null)
            true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize LlmInference", e)
            loadingCallback?.invoke(false, "Initialization failed: ${e.message}")
            cleanup()
            false
        } finally {
            isInitializing = false
        }
    }

    suspend fun initialize(context: Context): Boolean {
        val modelDir = File(context.filesDir, "llm")
        val modelFile = File(modelDir, MODEL_FILENAME)
        
        val defaultConfig = Config(
            modelPath = modelFile.absolutePath,
            maxTokens = 512,
            preferGpu = true
        )
        return initialize(context, defaultConfig)
    }

    /**
     * Translate text using the user's selected language (based on Google's pattern)
     */
    suspend fun translate(promptText: String): String? = withContext(Dispatchers.IO) {
        return@withContext translateToLanguage(promptText, "default")
    }

    /**
     * Translate text with load balancing between different sources using user's selected language
     */
    suspend fun translateToLanguage(text: String, source: String = "default"): String? {
        return suspendCancellableCoroutine { continuation ->
            val request = TranslationRequest(text, source, continuation)
            
            synchronized(sourceQueues) {
                // Add to source-specific queue
                if (!sourceQueues.containsKey(source)) {
                    sourceQueues[source] = mutableListOf()
                    activeSources.add(source)
                    Log.d(TAG, "New source detected: $source (total sources: ${activeSources.size})")
                }
                sourceQueues[source]!!.add(request)
                
                val totalRequests = sourceQueues.values.sumOf { it.size }
                Log.d(TAG, "Queued translation request from $source (total requests: $totalRequests, sources: ${activeSources.size})")
            }
            
            processQueueIfNeeded()
        }
    }

    /**
     * Legacy method for backward compatibility - now uses user's selected language
     */
    // @Deprecated("Use translateToLanguage(text, source) instead")
    // suspend fun translateToLanguage(text: String, targetLanguage: String): String? {
    //     return translateToLanguage(text, "legacy")
    // }

    /**
     * Legacy method for backward compatibility - now uses user's selected language
     */
    @Deprecated("Use translateToLanguage(text, source) instead")
    suspend fun translateToLanguage(text: String, targetLanguage: String, source: String): String? {
        return translateToLanguage(text, source)
    }
    
    private fun processQueueIfNeeded() {
        synchronized(this) {
            if (isProcessingQueue) return
            isProcessingQueue = true
        }
        
        kotlinx.coroutines.GlobalScope.launch(Dispatchers.IO) {
            processQueue()
        }
    }
    
    private suspend fun processQueue() {
        while (true) {
            val nextRequest = getNextRequestWithLoadBalancing() ?: break
            
            try {
                val targetLanguage = getCurrentTargetLanguage()
                val result = performTranslation(nextRequest.text, targetLanguage, nextRequest.source)
                nextRequest.continuation.resume(result)
            } catch (e: Exception) {
                Log.e(TAG, "Error in translation for ${nextRequest.source}", e)
                nextRequest.continuation.resume(null)
            }
        }
        
        synchronized(this) {
            isProcessingQueue = false
        }
    }
    
    private fun getNextRequestWithLoadBalancing(): TranslationRequest? {
        synchronized(sourceQueues) {
            // Remove empty source queues
            val emptySourcesKeys = sourceQueues.keys.filter { sourceQueues[it]!!.isEmpty() }
            emptySourcesKeys.forEach { sourceKey ->
                sourceQueues.remove(sourceKey)
                activeSources.remove(sourceKey)
            }
            
            if (activeSources.isEmpty()) return null
            
            // True round-robin: cycle through active sources
            if (currentSourceIndex >= activeSources.size) {
                currentSourceIndex = 0
            }
            
            val currentSource = activeSources[currentSourceIndex]
            val sourceQueue = sourceQueues[currentSource]!!
            val request = sourceQueue.removeAt(0)
            
            // Move to next source for next request
            currentSourceIndex = (currentSourceIndex + 1) % activeSources.size
            
            val totalRequests = sourceQueues.values.sumOf { it.size }
            Log.d(TAG, "Processing request from $currentSource (total remaining: $totalRequests, active sources: ${activeSources.size})")
            
            return request
        }
    }
    
    private suspend fun performTranslation(text: String, targetLanguage: String, source: String): String? = withContext(Dispatchers.IO) {
        translationMutex.withLock {
            val session = currentSession
            if (session == null || llmInference == null) {
                Log.e(TAG, "LLM not initialized. Call initialize() first.")
                return@withContext null
            }

            try {
                val startTime = System.currentTimeMillis()
                val prompt = "Translate this text to $targetLanguage. Return only the translation, no explanations: $text"

                Log.d(TAG, "[$source] Translating to $targetLanguage: ${text.take(50)}...")

                // Reset session before each translation to ensure clean state
                if (!resetSessionInternal()) {
                    Log.e(TAG, "Failed to reset session before translation")
                    return@withContext null
                }

                // Use the fresh session
                val freshSession = currentSession!!
                freshSession.addQueryChunk(prompt)
                val response = freshSession.generateResponse()

                val endTime = System.currentTimeMillis()
                Log.d(TAG, "[$source] Translation completed in ${endTime - startTime}ms")
                Log.d(TAG, "[$source] Response: ${response.take(100)}...")

                response

            } catch (e: Exception) {
                Log.e(TAG, "Error generating translation for $source", e)
                null
            }
        }
    }

    /**
     * Generate response for conversational use (maintains session state)
     * Uses mutex to prevent concurrent access issues
     */
    suspend fun generateResponse(prompt: String, systemPrompt: String? = null): String? = withContext(Dispatchers.IO) {
        translationMutex.withLock {
        val session = currentSession
        if (session == null || llmInference == null) {
            Log.e(TAG, "LLM not initialized. Call initialize() first.")
            return@withContext null
        }

        try {
            val startTime = System.currentTimeMillis()
            val fullPrompt = if (systemPrompt != null) {
                "$systemPrompt\n\n$prompt"
            } else {
                prompt
            }

            Log.d(TAG, "Generating response for: ${prompt.take(50)}...")

            session.addQueryChunk(fullPrompt)
            val response = session.generateResponse()

            val endTime = System.currentTimeMillis()
            Log.d(TAG, "Response generated in ${endTime - startTime}ms")

            response

        } catch (e: Exception) {
            Log.e(TAG, "Error generating response", e)
            null
        }
        }
    }

    /**
     * Generate response with streaming support
     */
    suspend fun generateResponseStreaming(
        prompt: String,
        systemPrompt: String? = null,
        onPartialResult: (String) -> Unit
    ): String? = withContext(Dispatchers.IO) {
        val session = currentSession
        if (session == null || llmInference == null) {
            Log.e(TAG, "LLM not initialized. Call initialize() first.")
            return@withContext null
        }

        try {
            val startTime = System.currentTimeMillis()
            val fullPrompt = if (systemPrompt != null) {
                "$systemPrompt\n\n$prompt"
            } else {
                prompt
            }

            Log.d(TAG, "Generating streaming response for: ${prompt.take(50)}...")

            var fullResponse = ""
            var isComplete = false

            session.addQueryChunk(fullPrompt)
            session.generateResponseAsync { partialResult, done ->
                fullResponse += partialResult
                onPartialResult(partialResult)

                if (done) {
                    isComplete = true
                    val endTime = System.currentTimeMillis()
                    Log.d(TAG, "Streaming response completed in ${endTime - startTime}ms")
                }
            }

            // Wait for completion
            while (!isComplete) {
                kotlinx.coroutines.delay(10)
            }

            fullResponse

        } catch (e: Exception) {
            Log.e(TAG, "Error generating streaming response", e)
            null
        }
    }

    /**
     * Reset the current session (based on Google's resetSession pattern)
     */
    suspend fun resetSession(): Boolean = withContext(Dispatchers.IO) {
        return@withContext resetSessionInternal()
    }

    /**
     * Internal session reset method
     */
    private fun resetSessionInternal(): Boolean {
        val config = currentConfig ?: return false
        val inference = llmInference ?: return false

        try {
            Log.d(TAG, "Resetting LLM session")

            // Close current session
            currentSession?.close()

            // Create new session with same parameters
            currentSession = LlmInferenceSession.createFromOptions(
                inference,
                LlmInferenceSession.LlmInferenceSessionOptions.builder()
                    .setTopK(config.topK)
                    .setTopP(config.topP)
                    .setTemperature(config.temperature)
                    .build()
            )

            Log.d(TAG, "Session reset successfully")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to reset session", e)
            return false
        }
    }

    /**
     * Set callback for loading status updates
     */
    fun setLoadingCallback(callback: ((Boolean, String?) -> Unit)?) {
        loadingCallback = callback
    }

    /**
     * Set callback for download progress updates
     * @param callback (progressPercent: Int, bytesDownloaded: Long, totalBytes: Long, timeRemaining: String?) -> Unit
     */
    fun setDownloadProgressCallback(callback: ((Int, Long, Long, String?) -> Unit)?) {
        downloadProgressCallback = callback
    }

    /**
     * Check if the manager is initialized and ready to use
     */
    fun isInitialized(): Boolean {
        return llmInference != null && currentSession != null && !isInitializing
    }

    /**
     * Check if the manager is currently initializing
     */
    fun isInitializing(): Boolean {
        return isInitializing
    }

    /**
     * Clean up all resources
     */
    fun close() {
        Log.d(TAG, "Cleaning up LlmInference resources")

        currentSession?.let { session ->
            try {
                session.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing session", e)
            }
        }
        currentSession = null

        llmInference?.let { inference ->
            try {
                inference.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing inference", e)
            }
        }
        llmInference = null
        currentConfig = null

        Log.d(TAG, "Cleanup completed")
    }

    /**
     * Create a new session with the current configuration
     */
    private fun createNewSession(config: Config) {
        currentSession?.close()

        val inference = llmInference ?: throw IllegalStateException("LlmInference not initialized")

        currentSession = LlmInferenceSession.createFromOptions(
            inference,
            LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTopK(config.topK)
                .setTopP(config.topP)
                .setTemperature(config.temperature)
                .build()
        )
    }

    private fun cleanup() {
        currentSession?.close()
        currentSession = null
        llmInference?.close()
        llmInference = null
        currentConfig = null
    }
    
    /**
     * Download the model file with progress tracking
     */
    private suspend fun downloadModel(context: Context, modelPath: String): Boolean = withContext(Dispatchers.IO) {
        if (isDownloading) {
            Log.w(TAG, "Download already in progress")
            return@withContext false
        }
        
        isDownloading = true
        
        try {
            val modelFile = File(modelPath)
            val modelDir = modelFile.parentFile
            
            // Create directory if it doesn't exist
            if (!modelDir.exists()) {
                modelDir.mkdirs()
            }
            
            val client = OkHttpClient.Builder()
                .build()
            
            val request = Request.Builder()
                .url(MODEL_DOWNLOAD_URL)
                .build()
            
            Log.d(TAG, "Starting model download from: $MODEL_DOWNLOAD_URL")
            loadingCallback?.invoke(true, "Starting download...")
            
            val response = client.newCall(request).execute()
            
            if (!response.isSuccessful) {
                Log.e(TAG, "Download failed with response code: ${response.code()}")
                loadingCallback?.invoke(false, "Download failed: ${response.message()}")
                return@withContext false
            }
            
            val responseBody = response.body() ?: run {
                Log.e(TAG, "Response body is null")
                loadingCallback?.invoke(false, "Download failed: No response body")
                return@withContext false
            }
            
            val contentLength = responseBody.contentLength()
            Log.d(TAG, "Download started. Content length: $contentLength bytes")
            
            val sink = modelFile.sink().buffer()
            val source = responseBody.source()
            
            var bytesDownloaded = 0L
            var lastProgressUpdate = System.currentTimeMillis()
            val startTime = System.currentTimeMillis()
            val buffer = ByteArray(8192)
            
            while (true) {
                val bytesRead = source.read(buffer)
                if (bytesRead.toLong() == -1L) break
                
                sink.write(buffer, 0, bytesRead.toInt())
                bytesDownloaded += bytesRead
                
                // Update progress every 500ms
                val currentTime = System.currentTimeMillis()
                if (currentTime - lastProgressUpdate >= 500) {
                    val progressPercent = if (contentLength > 0) {
                        ((bytesDownloaded * 100) / contentLength).toInt()
                    } else {
                        0
                    }
                    
                    // Calculate estimated time remaining
                    val timeElapsed = currentTime - startTime
                    val timeRemaining = if (progressPercent > 0 && timeElapsed > 1000) {
                        val estimatedTotal = (timeElapsed * 100) / progressPercent
                        val remaining = estimatedTotal - timeElapsed
                        formatTimeRemaining(remaining)
                    } else {
                        "Calculating..."
                    }
                    
                    Log.d(TAG, "Download progress: $progressPercent% ($bytesDownloaded/$contentLength bytes)")
                    loadingCallback?.invoke(true, "Downloading model: $progressPercent%")
                    downloadProgressCallback?.invoke(progressPercent, bytesDownloaded, contentLength, timeRemaining)
                    
                    lastProgressUpdate = currentTime
                }
            }
            
            sink.close()
            response.close()
            
            val totalTime = System.currentTimeMillis() - startTime
            Log.d(TAG, "Model downloaded successfully in ${totalTime}ms. Size: ${modelFile.length()} bytes")
            loadingCallback?.invoke(true, "Download completed successfully")
            downloadProgressCallback?.invoke(100, bytesDownloaded, contentLength, "Completed")
            
            true
            
        } catch (e: IOException) {
            Log.e(TAG, "Failed to download model", e)
            loadingCallback?.invoke(false, "Download failed: ${e.message}")
            false
        } finally {
            isDownloading = false
        }
    }
    
    /**
     * Format time remaining in a human-readable format
     */
    private fun formatTimeRemaining(milliseconds: Long): String {
        val seconds = milliseconds / 1000
        return when {
            seconds < 60 -> "${seconds}s remaining"
            seconds < 3600 -> "${seconds / 60}m ${seconds % 60}s remaining"
            else -> "${seconds / 3600}h ${(seconds % 3600) / 60}m remaining"
        }
    }
    
    /**
     * Check if model is currently downloading
     */
    fun isModelDownloading(): Boolean = isDownloading
    
    /**
     * Get the model file path for the current context
     */
    fun getModelPath(context: Context): String {
        val modelDir = File(context.filesDir, "llm")
        return File(modelDir, MODEL_FILENAME).absolutePath
    }
    
    /**
     * Check if model file exists
     */
    fun isModelAvailable(context: Context): Boolean {
        val modelFile = File(getModelPath(context))
        return modelFile.exists() && modelFile.length() > 0
    }
}