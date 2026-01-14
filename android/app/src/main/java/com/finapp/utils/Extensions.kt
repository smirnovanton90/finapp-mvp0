package com.finapp.utils

import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

fun Int.formatRubles(): String {
    val rubles = this / 100.0
    val formatter = NumberFormat.getCurrencyInstance(Locale("ru", "RU"))
    return formatter.format(rubles)
}

fun String.toDate(): Date? {
    val formatters = listOf(
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS", Locale.getDefault()),
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()),
        SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()),
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.getDefault())
    )
    
    for (formatter in formatters) {
        try {
            return formatter.parse(this)
        } catch (e: Exception) {
            continue
        }
    }
    return null
}

fun Date.formatDate(): String {
    val formatter = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
    return formatter.format(this)
}

fun Date.formatDateTime(): String {
    val formatter = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
    return formatter.format(this)
}

fun Date.toISOString(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(this)
}

fun Date.toDateString(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    return formatter.format(this)
}
