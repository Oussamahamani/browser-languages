package com.cookiegames.smartcookie

import kotlinx.coroutines.tasks.await

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException

// Data class to hold the recognized text and its structured information
data class RecognizedTextData(
    val fullText: String,
    val textBlocks: List<TextBlockData>
)

// Data class for a text block, including its text and bounding box
data class TextBlockData(
    val text: String,
    val boundingBox: Rect?,
    val lines: List<TextLineData>
)

// Data class for a text line, including its text and bounding box
data class TextLineData(
    val text: String,
    val boundingBox: Rect?,
    val elements: List<TextElementData>
)

// Data class for a text element (word), including its text and bounding box
data class TextElementData(
    val text: String,
    val boundingBox: Rect?
)

/**
 * Singleton object responsible for analyzing text in images fetched from URLs.
 * It uses OkHttp for image downloading and ML Kit for text recognition.
 */
object ImageTextAnalyzer {

    private const val TAG = "ImageTextAnalyzer"
    // Re-use a single OkHttpClient instance for efficiency across multiple requests
    private val httpClient = OkHttpClient()

    /**
     * Analyzes text from an image loaded from a given URL.
     * This is a suspend function, meaning it must be called from a coroutine or another suspend function.
     *
     * @param context The application context. Required by ML Kit's InputImage.fromBitmap.
     * @param imageUrl The URL of the image to analyze.
     * @return A [RecognizedTextData] object containing the full recognized text and
     * structured information (blocks, lines, elements) with their bounding box coordinates.
     * @throws IOException if there's a problem downloading or decoding the image.
     * @throws Exception if ML Kit encounters an error during text recognition.
     */
    suspend fun analyzeImageFromUrl(
        context: Context,
        imageUrl: String
    ): RecognizedTextData {
        var bitmap: Bitmap? = null
        try {
            // 1. Download and decode the image on an IO dispatcher (for network operations)
            bitmap = withContext(Dispatchers.IO) {
                val request = Request.Builder().url(imageUrl).build()
                val response = httpClient.newCall(request).execute()

                if (!response.isSuccessful) {
                    throw IOException("Failed to download image from $imageUrl")
                }

                response.body()?.byteStream()?.use { inputStream ->
                    BitmapFactory.decodeStream(inputStream)
                }
            }

            if (bitmap == null) {
                throw IOException("Failed to decode bitmap from URL: $imageUrl. Image might be invalid or corrupted.")
            }

            // 2. Process the image with ML Kit on the Main dispatcher (ML Kit often prefers main thread for setup)
            val recognizedText: Text = withContext(Dispatchers.Main) {
                val image = InputImage.fromBitmap(bitmap, 0) // 0 is rotationDegrees (no rotation)
                val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

                // Await the ML Kit task result
                recognizer.process(image).await()
            }

            // 3. Map ML Kit's Text object to our custom data classes
            return mapVisionTextToRecognizedTextData(recognizedText)

        } catch (e: Exception) {
            // Log the error for debugging purposes
            Log.e(TAG, "Error analyzing image from URL: $imageUrl", e)
            // Re-throw the exception so the caller can handle it
            throw e
        } finally {
            // Ensure the bitmap is recycled to free up memory, regardless of success or failure
            bitmap?.recycle()
        }
    }

    /**
     * Helper function to map ML Kit's [Text] object to our custom [RecognizedTextData] structure.
     * This extracts the full text and detailed information including bounding boxes.
     */
    private fun mapVisionTextToRecognizedTextData(visionText: Text): RecognizedTextData {
        val textBlocksData = visionText.textBlocks.map { block ->
            val textLinesData = block.lines.map { line ->
                val textElementsData = line.elements.map { element ->
                    TextElementData(
                        text = element.text,
                        boundingBox = element.boundingBox // The Rect object for the element
                    )
                }
                TextLineData(
                    text = line.text,
                    boundingBox = line.boundingBox, // The Rect object for the line
                    elements = textElementsData
                )
            }
            TextBlockData(
                text = block.text,
                boundingBox = block.boundingBox, // The Rect object for the block
                lines = textLinesData
            )
        }
        return RecognizedTextData(
            fullText = visionText.text, // The complete recognized text string
            textBlocks = textBlocksData
        )
    }
}


