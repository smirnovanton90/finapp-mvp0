package com.finapp.utils

import com.finapp.data.models.User
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

const val DEFAULT_TIMEZONE = "Europe/Moscow"

object DisplayTimezone {
    var zoneId: String = DEFAULT_TIMEZONE

    fun apply(user: User?) {
        if (user == null) return
        zoneId = effectiveTimezone(user)
    }
}

fun deviceTimezone(): String {
    return try {
        ZoneId.systemDefault().id
    } catch (e: Exception) {
        DEFAULT_TIMEZONE
    }
}

fun effectiveTimezone(user: User): String {
    return if (user.timezoneAuto) deviceTimezone() else user.timezone.ifBlank { DEFAULT_TIMEZONE }
}

fun zoneOrDefault(name: String?): ZoneId {
    return try {
        ZoneId.of(if (name.isNullOrBlank()) DEFAULT_TIMEZONE else name)
    } catch (e: Exception) {
        ZoneId.of(DEFAULT_TIMEZONE)
    }
}

fun transactionInstant(transactionDate: String, txTimezone: String?): Instant {
    val zone = zoneOrDefault(txTimezone)
    val local = if (transactionDate.contains("T")) {
        LocalDateTime.parse(transactionDate.take(19))
    } else {
        LocalDate.parse(transactionDate.take(10)).atStartOfDay()
    }
    return local.atZone(zone).toInstant()
}

fun formatTransactionInZone(transactionDate: String, txTimezone: String?, displayZone: String): String {
    val zoned = transactionInstant(transactionDate, txTimezone).atZone(zoneOrDefault(displayZone))
    val hasTime = transactionDate.contains("T")
    val pattern = if (hasTime && !(zoned.hour == 0 && zoned.minute == 0)) {
        "dd.MM.yyyy HH:mm"
    } else {
        "dd.MM.yyyy"
    }
    return DateTimeFormatter.ofPattern(pattern).format(zoned)
}

fun transactionDateInZone(transactionDate: String, txTimezone: String?, displayZone: String): LocalDate {
    return transactionInstant(transactionDate, txTimezone).atZone(zoneOrDefault(displayZone)).toLocalDate()
}
