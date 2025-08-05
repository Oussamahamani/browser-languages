package com.cookiegames.smartcookie.dialog

import android.content.Context
import android.view.LayoutInflater
import android.widget.*
import androidx.appcompat.app.AlertDialog
import com.cookiegames.smartcookie.R
import com.cookiegames.smartcookie.preference.UserPreferences

class LanguageSelectionDialog(
    private val context: Context,
    private val userPreferences: UserPreferences,
    private val onLanguageSelected: ((String) -> Unit)? = null
) {

    private val languageNames: Array<String> by lazy {
        context.resources.getStringArray(R.array.languages)
    }
    
    private val languageCodes: Array<String> by lazy {
        context.resources.getStringArray(R.array.language_codes)
    }

    fun show() {
        val layoutInflater = LayoutInflater.from(context)
        val dialogView = layoutInflater.inflate(R.layout.dialog_language_selection, null)

        val titleText = dialogView.findViewById<TextView>(R.id.dialog_title)
        val subtitleText = dialogView.findViewById<TextView>(R.id.dialog_subtitle)
        val languageSpinner = dialogView.findViewById<Spinner>(R.id.language_spinner)
        val cancelButton = dialogView.findViewById<Button>(R.id.button_cancel)
        val confirmButton = dialogView.findViewById<Button>(R.id.button_confirm)

        // Set up spinner adapter
        val adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, languageNames)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        languageSpinner.adapter = adapter

        // Set current selection based on saved preference
        val currentLanguageCode = userPreferences.selectedLanguage
        val currentIndex = if (currentLanguageCode.isNotEmpty()) {
            languageCodes.indexOf(currentLanguageCode)
        } else {
            0 // Default to first language (English) if not set
        }
        if (currentIndex >= 0) {
            languageSpinner.setSelection(currentIndex)
        }

        val alertDialog = AlertDialog.Builder(context)
            .setView(dialogView)
            .setCancelable(userPreferences.selectedLanguage.isNotEmpty()) // Non-cancelable if language not set
            .create()

        // Hide cancel button if language is not set (first time setup)
        if (userPreferences.selectedLanguage.isEmpty()) {
            cancelButton.visibility = android.view.View.GONE
        } else {
            cancelButton.setOnClickListener {
                alertDialog.dismiss()
            }
        }

        confirmButton.setOnClickListener {
            val selectedIndex = languageSpinner.selectedItemPosition
            val selectedLanguageCode = languageCodes[selectedIndex]
            
            // Save the selected language
            userPreferences.selectedLanguage = selectedLanguageCode
            
            // Mark first run setup as completed if this is the first time
            if (!userPreferences.firstRunLanguageSetup) {
                userPreferences.firstRunLanguageSetup = true
            }
            
            // Notify callback
            onLanguageSelected?.invoke(selectedLanguageCode)
            
            alertDialog.dismiss()
        }

        alertDialog.show()
    }

    companion object {
        /**
         * Show language selection dialog for first-time setup
         */
        fun showFirstTimeSetup(
            context: Context,
            userPreferences: UserPreferences,
            onLanguageSelected: ((String) -> Unit)? = null
        ) {
            LanguageSelectionDialog(context, userPreferences, onLanguageSelected).show()
        }
    }
}