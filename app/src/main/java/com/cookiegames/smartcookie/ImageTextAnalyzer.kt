package com.cookiegames.smartcookie

import kotlinx.coroutines.tasks.await


import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.util.Base64
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

// --- kotlinx.serialization imports ---
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.KSerializer
// --- End kotlinx.serialization imports ---

/**
 * Custom KSerializer for android.graphics.Rect.
 * It serializes Rect into a simple string format "left,top,right,bottom".
 */
object RectSerializer : KSerializer<Rect> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("Rect", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Rect) {
        encoder.encodeString("${value.left},${value.top},${value.right},${value.bottom}")
    }

    override fun deserialize(decoder: Decoder): Rect {
        val parts = decoder.decodeString().split(",")
        if (parts.size == 4) {
            return Rect(parts[0].toInt(), parts[1].toInt(), parts[2].toInt(), parts[3].toInt())
        }
        throw IllegalArgumentException("Invalid Rect string format: Expected 'left,top,right,bottom'")
    }
}

// Data class to hold the recognized text and its structured information
@Serializable // Mark as serializable
data class RecognizedTextData(
    val fullText: String,
    val textBlocks: List<TextBlockData> // This will now contain only block-level data
)

// Data class for a text block, now simplified to only text and bounding box
@Serializable // Mark as serializable
data class TextBlockData(
    val text: String,
    @Serializable(with = RectSerializer::class) // Use custom serializer for Rect
    val boundingBox: Rect?
)

// Removed TextLineData and TextElementData as they are no longer needed for the flattened output.
// If you need them for internal processing but not JSON, keep them but don't use them in RecognizedTextData.

/**
 * Singleton object responsible for analyzing text in images fetched from URLs.
 * It uses OkHttp for image downloading and ML Kit for text recognition.
 * Returns the result as a JSON string with a flattened structure.
 */
object ImageTextAnalyzer {

    private const val TAG = "ImageTextAnalyzer"
    // Re-use a single OkHttpClient instance for efficiency across multiple requests
    private val httpClient = OkHttpClient()

    // Configure Json serializer for pretty printing (optional)
    private val json = Json { prettyPrint = true }

    /**
     * Analyzes text from an image loaded from a given URL.
     * This is a suspend function, meaning it must be called from a coroutine or another suspend function.
     *
     * @param context The application context. Required by ML Kit's InputImage.fromBitmap.
     * @param imageUrl The URL of the image to analyze.
     * @return A JSON string representing the [RecognizedTextData] object,
     * containing the full recognized text and a flattened list of text blocks
     * with their bounding box coordinates.
     * @throws IOException if there's a problem downloading or decoding the image.
     * @throws Exception if ML Kit encounters an error during text recognition.
     */
    suspend fun analyzeImageFromUrl(
        imageUrl: String
    ): String { // Changed return type to String
        var bitmap: Bitmap? = null
        try {
            // 1. Download and decode the image on an IO dispatcher (for network operations)
            bitmap = withContext(Dispatchers.IO) {
                val request = Request.Builder().url(imageUrl).build()
                val response = httpClient.newCall(request).execute()

                if (!response.isSuccessful) {
                    val errorMessage = when (response.code()) {
                        404 -> "Image not found at URL: $imageUrl (HTTP 404)"
                        403 -> "Access forbidden to image at URL: $imageUrl (HTTP 403)"
                        401 -> "Authentication required for image at URL: $imageUrl (HTTP 401)"
                        500 -> "Server error when fetching image from URL: $imageUrl (HTTP 500)"
                        503 -> "Service unavailable when fetching image from URL: $imageUrl (HTTP 503)"
                        else -> "Failed to download image from URL: $imageUrl (HTTP ${response.code()})"
                    }
                    throw IOException(errorMessage)
                }

                try {
                    response.body()?.byteStream()?.use { inputStream ->
                        BitmapFactory.decodeStream(inputStream)
                    }
                } catch (e: Exception) {
                    throw IOException("Failed to read image data from URL: $imageUrl. Error: ${e.message}", e)
                }
            }

            if (bitmap == null) {
                throw IOException("Failed to decode bitmap from URL: $imageUrl. The file may not be a valid image format (supported: JPEG, PNG, GIF, BMP, WebP) or the image data may be corrupted.")
            }

            // 2. Process the image with ML Kit on the Main dispatcher (ML Kit often prefers main thread for setup)
            val recognizedText: Text = withContext(Dispatchers.Main) {
                try {
                    val image = InputImage.fromBitmap(bitmap, 0) // 0 is rotationDegrees (no rotation)
                    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

                    // Await the ML Kit task result
                    recognizer.process(image).await()
                } catch (e: Exception) {
                    throw Exception("ML Kit text recognition failed for image from URL: $imageUrl. This could be due to: image quality issues, unsupported image format, or ML Kit initialization problems. Error: ${e.message}", e)
                }
            }

            // 3. Map ML Kit's Text object to our custom data classes for flattened output
            val recognizedData = try {
                mapVisionTextToRecognizedTextData(recognizedText)
            } catch (e: Exception) {
                throw Exception("Failed to process recognized text data from image at URL: $imageUrl. Error: ${e.message}", e)
            }

            // 4. Convert the data class to a JSON string
            return try {
                json.encodeToString(recognizedData) // Serialize to JSON string
            } catch (e: Exception) {
                throw Exception("Failed to serialize recognized text data to JSON for image from URL: $imageUrl. Error: ${e.message}", e)
            }

        } catch (e: IOException) {
            // Network or image decoding related errors
            Log.e(TAG, "IO Error analyzing image from URL: $imageUrl - ${e.message}", e)
            throw e
        } catch (e: SecurityException) {
            // Permission or security related errors
            val errorMessage = "Security error when analyzing image from URL: $imageUrl. Check internet permissions and URL accessibility. Error: ${e.message}"
            Log.e(TAG, errorMessage, e)
            throw SecurityException(errorMessage, e)
        } catch (e: OutOfMemoryError) {
            // Memory related errors
            val errorMessage = "Out of memory error when processing image from URL: $imageUrl. The image may be too large. Consider using a smaller image or optimizing memory usage."
            Log.e(TAG, errorMessage, e)
            throw OutOfMemoryError(errorMessage)
        } catch (e: IllegalArgumentException) {
            // Invalid arguments or malformed URL
            val errorMessage = "Invalid argument when analyzing image from URL: $imageUrl. Check if the URL is properly formatted. Error: ${e.message}"
            Log.e(TAG, errorMessage, e)
            throw IllegalArgumentException(errorMessage, e)
        } catch (e: Exception) {
            // Generic fallback for any other unexpected errors
            val errorMessage = "Unexpected error analyzing image from URL: $imageUrl. Error type: ${e.javaClass.simpleName}, Message: ${e.message}"
            Log.e(TAG, errorMessage, e)
            throw Exception(errorMessage, e)
        } finally {
            // Ensure the bitmap is recycled to free up memory, regardless of success or failure
            bitmap?.recycle()
        }
    }

    /**
     * Analyzes text from a Base64 encoded image string.
     */
    suspend fun analyzeImageFromBase64(base64String: String): String {
        var bitmap: Bitmap? = null
        try {
            bitmap = withContext(Dispatchers.IO) {
                try {
                    val imageBytes = Base64.decode(base64String, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                        ?: throw IOException("Failed to decode image from Base64 string. The string may not be valid Base64 or may not represent a valid image format.")
                } catch (e: IllegalArgumentException) {
                    throw IOException("Invalid Base64 string format. Error: ${e.message}", e)
                }
            }

            return processImageWithMLKit(bitmap)
        } catch (e: IOException) {
            Log.e(TAG, "IO Error analyzing Base64 image - ${e.message}", e)
            throw e
        } catch (e: Exception) {
            val errorMessage = "Unexpected error analyzing Base64 image. Error type: ${e.javaClass.simpleName}, Message: ${e.message}"
            Log.e(TAG, errorMessage, e)
            throw Exception(errorMessage, e)
        } finally {
            bitmap?.recycle()
        }
    }

    /**
     * Helper function to map ML Kit's [Text] object to our custom [RecognizedTextData] structure
     * for a flattened JSON output.
     * This extracts the full text and only block-level information including bounding boxes.
     */
    private fun mapVisionTextToRecognizedTextData(visionText: Text): RecognizedTextData {
        val textBlocksData = visionText.textBlocks.map { block ->
            TextBlockData(
                text = block.text, // Get the full text of the block
                boundingBox = block.boundingBox // Get the bounding box of the block
            )
        }
        return RecognizedTextData(
            fullText = visionText.text, // The complete recognized text string
            textBlocks = textBlocksData
        )
    }

    /**
     * Common method to process bitmap with ML Kit and return JSON.
     */
    private suspend fun processImageWithMLKit(bitmap: Bitmap): String {
        val recognizedText: Text = withContext(Dispatchers.Main) {
            try {
                val image = InputImage.fromBitmap(bitmap, 0)
                val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                recognizer.process(image).await()
            } catch (e: Exception) {
                throw Exception("ML Kit text recognition failed. Error: ${e.message}", e)
            }
        }

        val recognizedData = mapVisionTextToRecognizedTextData(recognizedText)
        return json.encodeToString(recognizedData)
    }
}


