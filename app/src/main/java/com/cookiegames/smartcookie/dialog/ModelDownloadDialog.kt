package com.cookiegames.smartcookie.dialog

import android.app.AlertDialog
import android.content.Context
import android.view.LayoutInflater
import android.widget.ProgressBar
import android.widget.TextView
import com.cookiegames.smartcookie.R
import kotlin.math.roundToInt

class ModelDownloadDialog private constructor(
    private val context: Context,
    private val dialog: AlertDialog,
    private val progressBar: ProgressBar,
    private val progressText: TextView,
    private val bytesText: TextView,
    private val timeText: TextView
) {
    
    companion object {
        fun create(context: Context): ModelDownloadDialog {
            val view = LayoutInflater.from(context).inflate(R.layout.dialog_model_download, null)
            
            val dialog = AlertDialog.Builder(context)
                .setView(view)
                .setCancelable(false)
                .create()
            
            val progressBar = view.findViewById<ProgressBar>(R.id.downloadProgressBar)
            val progressText = view.findViewById<TextView>(R.id.downloadProgressText)
            val bytesText = view.findViewById<TextView>(R.id.downloadBytesText)
            val timeText = view.findViewById<TextView>(R.id.downloadTimeText)
            
            return ModelDownloadDialog(context, dialog, progressBar, progressText, bytesText, timeText)
        }
    }
    
    fun show() {
        dialog.show()
    }
    
    fun dismiss() {
        dialog.dismiss()
    }
    
    fun updateProgress(progressPercent: Int, bytesDownloaded: Long, totalBytes: Long, timeRemaining: String?) {
        progressBar.progress = progressPercent
        progressText.text = "$progressPercent%"
        
        val downloadedMB = bytesDownloaded / (1024.0 * 1024.0)
        val totalMB = if (totalBytes > 0) totalBytes / (1024.0 * 1024.0) else 0.0
        
        bytesText.text = if (totalBytes > 0) {
            "${downloadedMB.roundToInt()} MB / ${totalMB.roundToInt()} MB"
        } else {
            "${downloadedMB.roundToInt()} MB downloaded"
        }
        
        timeText.text = timeRemaining ?: "Calculating time remaining..."
    }
    
    fun updateMessage(message: String) {
        timeText.text = message
    }
    
    fun isShowing(): Boolean = dialog.isShowing
}