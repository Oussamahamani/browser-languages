import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.lifecycle.lifecycleScope

object LlmInferenceManager {

    var llmInference: LlmInference? = null
        private set

    suspend fun initialize(context: Context) {
        if (llmInference == null) {
                val options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath("/data/local/tmp/llm/Gemma3-1B-IT_multi-prefill-seq_q4_ekv2048.task")
                    .setMaxTokens(512)
                    .setPreferredBackend(LlmInference.Backend.GPU)
                    .build()
                llmInference = LlmInference.createFromOptions(context, options)



        }
    }

    suspend fun promptAsync(promptText: String): String? = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        try {
            Log.d("LLM_PROMPT", "Prompting: $promptText")
            val response = llmInference?.generateResponse(promptText)
            val endTime = System.currentTimeMillis()
            Log.d("LLM_PROMPT", "Response: $response")
            Log.d("LLM_PROMPT", "Time taken: ${endTime - startTime}ms")
            response
        } catch (e: Exception) {
            val errorTime = System.currentTimeMillis()
            Log.e("LLM_PROMPT", "Error generating response after ${errorTime - startTime}ms", e)
            null
        }
    }

    suspend fun translate(promptText: String): String? = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        val prompt = "Translate this text to Arabic. Return only the translation, no explanations: "
        try {
            Log.d("LLM_PROMPT", "Prompting: $promptText")
            val response = llmInference?.generateResponse(prompt+promptText)
            val endTime = System.currentTimeMillis()
            Log.d("LLM_PROMPT", "Response: $response")
            Log.d("LLM_PROMPT", "Time taken: ${endTime - startTime}ms")
            response
        } catch (e: Exception) {
            val errorTime = System.currentTimeMillis()
            Log.e("LLM_PROMPT", "Error generating response after ${errorTime - startTime}ms", e)
            null
        }
    }
    fun close() {
        llmInference?.close()
        llmInference = null
    }
}
