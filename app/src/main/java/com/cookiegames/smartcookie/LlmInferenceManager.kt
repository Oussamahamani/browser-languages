package com.cookiegames.smartcookie

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * LLM Inference Manager based on Google AI Edge Gallery patterns
 */
object LlmInferenceManager {
    private const val TAG = "LlmInferenceManager"

    private var llmInference: LlmInference? = null
    private var currentSession: LlmInferenceSession? = null
    private var isInitializing = false
    private var currentConfig: Config? = null

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

    suspend fun initialize(context: Context, config: Config): Boolean = withContext(Dispatchers.IO) {
        if (llmInference != null && !isInitializing) {
            Log.d(TAG, "LLM already initialized")
            return@withContext true
        }

        if (isInitializing) {
            Log.w(TAG, "Initialization already in progress")
            return@withContext false
        }

        try {
            isInitializing = true
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

            llmInference = LlmInference.createFromOptions(context, options)
            currentConfig = config

            // Create initial session
            createNewSession(config)

            Log.d(TAG, "LlmInference initialized successfully")
            true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize LlmInference", e)
            cleanup()
            false
        } finally {
            isInitializing = false
        }
    }

    suspend fun initialize(context: Context): Boolean {
        val defaultConfig = Config(
            modelPath = "/data/local/tmp/llm/gemma-3n-E2B-it-int4.task",
            maxTokens = 512,
            preferGpu = true
        )
        return initialize(context, defaultConfig)
    }

    /**
     * Translate text to Arabic with session reset (based on Google's pattern)
     */
    suspend fun translate(promptText: String): String? = withContext(Dispatchers.IO) {
        return@withContext translateToLanguage(promptText, "french")
    }

    /**
     * Translate text to any target language with automatic session management
     */
    suspend fun translateToLanguage(text: String, targetLanguage: String): String? = withContext(Dispatchers.IO) {
        val session = currentSession
        if (session == null || llmInference == null) {
            Log.e(TAG, "LLM not initialized. Call initialize() first.")
            return@withContext null
        }

        try {
            val startTime = System.currentTimeMillis()
            val prompt = "Translate this text to $targetLanguage. Return only the translation, no explanations: $text"

            Log.d(TAG, "Translating to $targetLanguage: ${text.take(50)}...")

            // Reset session before each translation to ensure clean state
            // This is similar to how Google's example handles independent queries
            if (!resetSessionInternal()) {
                Log.e(TAG, "Failed to reset session before translation")
                return@withContext null
            }

            // Use the fresh session
            val freshSession = currentSession!!
            freshSession.addQueryChunk(prompt)
            val response = freshSession.generateResponse()

            val endTime = System.currentTimeMillis()
            Log.d(TAG, "Translation completed in ${endTime - startTime}ms")
            Log.d(TAG, "Response: ${response.take(100)}...")

            response

        } catch (e: Exception) {
            Log.e(TAG, "Error generating translation", e)
            null
        }
    }

    /**
     * Generate response for conversational use (maintains session state)
     */
    suspend fun generateResponse(prompt: String, systemPrompt: String? = null): String? = withContext(Dispatchers.IO) {
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
     * Check if the manager is initialized and ready to use
     */
    fun isInitialized(): Boolean {
        return llmInference != null && currentSession != null && !isInitializing
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
}