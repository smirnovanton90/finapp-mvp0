package com.finapp.utils

object Constants {
    // Базовый URL API
    // Для эмулятора используйте: http://10.0.2.2:8000
    // Для физического устройства используйте IP адрес вашего компьютера: http://192.168.1.X:8000
    const val BASE_URL = "http://10.0.2.2:8000"
    
    // Keys для SharedPreferences
    const val PREFS_NAME = "finapp_prefs"
    const val KEY_ACCESS_TOKEN = "access_token"
    
    // Navigation routes
    const val ROUTE_LOGIN = "login"
    const val ROUTE_ITEMS_LIST = "items_list"
    const val ROUTE_ITEM_FORM = "item_form"
    const val ROUTE_TRANSACTIONS_LIST = "transactions_list"
    const val ROUTE_TRANSACTION_FORM = "transaction_form"
}
