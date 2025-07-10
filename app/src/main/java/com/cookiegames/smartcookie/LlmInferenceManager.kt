import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference

object LlmInferenceManager {

    var llmInference: LlmInference? = null
        private set

    fun initialize(context: Context) {
        if (llmInference == null) {
                val options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath("/data/local/tmp/llm/Gemma3-1B-IT_multi-prefill-seq_q4_ekv2048.task")
                    .setMaxTokens(512)
                    .setPreferredBackend(LlmInference.Backend.GPU)
                    .build()
                llmInference = LlmInference.createFromOptions(context, options)


//                var result = llmInference?.generateResponse("are you a human?")
//            Log.d("LLM_TEST", "LLM response: $result")


        }
    }


    fun close() {
        llmInference?.close()
        llmInference = null
    }
}
