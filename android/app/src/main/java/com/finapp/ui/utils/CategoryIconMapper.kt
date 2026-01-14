package com.finapp.ui.utils

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.graphics.vector.ImageVector

object CategoryIconMapper {
    private val iconMap: Map<String, ImageVector> = mapOf(
        "Briefcase" to Icons.Default.Work,
        "Hammer" to Icons.Default.Build,
        "TrendingUp" to Icons.Default.TrendingUp,
        "Percent" to Icons.Default.Percent,
        "BadgePercent" to Icons.Default.CardGiftcard,
        "Coins" to Icons.Default.MonetizationOn,
        "Banknote" to Icons.Default.AttachMoney,
        "Wallet" to Icons.Default.Wallet,
        "Landmark" to Icons.Default.AccountBalance,
        "Calculator" to Icons.Default.Calculate,
        "Car" to Icons.Default.DirectionsCar,
        "Bike" to Icons.Default.DirectionsBike,
        "Truck" to Icons.Default.LocalShipping,
        "Train" to Icons.Default.Train,
        "Ship" to Icons.Default.DirectionsBoat,
        "Building" to Icons.Default.Business,
        "Wrench" to Icons.Default.Build,
        "ShieldCheck" to Icons.Default.VerifiedUser,
        "Heart" to Icons.Default.Favorite,
        "Sparkles" to Icons.Default.Star,
        "Gamepad2" to Icons.Default.SportsEsports,
        "Music" to Icons.Default.MusicNote,
        "Headphones" to Icons.Default.Headset,
        "Mic" to Icons.Default.Mic,
        "BookOpen" to Icons.Default.MenuBook,
        "Paintbrush" to Icons.Default.Brush,
        "Palette" to Icons.Default.Palette,
        "Wifi" to Icons.Default.Wifi,
        "Phone" to Icons.Default.Phone,
        "Smartphone" to Icons.Default.Smartphone,
        "PawPrint" to Icons.Default.Pets,
        "Bone" to Icons.Default.Pets,
        "BottleWine" to Icons.Default.LocalBar,
        "HandCoins" to Icons.Default.Handshake,
        "CreditCard" to Icons.Default.CreditCard,
        "HeartPulse" to Icons.Default.Favorite,
        "Stethoscope" to Icons.Default.LocalHospital,
        "Pill" to Icons.Default.Medication,
        "Syringe" to Icons.Default.Medication,
        "Receipt" to Icons.Default.Receipt,
        "Shirt" to Icons.Default.Checkroom,
        "ShoppingCart" to Icons.Default.ShoppingCart,
        "ShoppingBag" to Icons.Default.ShoppingBag,
        "Coffee" to Icons.Default.LocalCafe,
        "ChefHat" to Icons.Default.Restaurant,
        "Pizza" to Icons.Default.LocalPizza,
        "Popcorn" to Icons.Default.Movie,
        "Film" to Icons.Default.Movie,
        "Plane" to Icons.Default.Flight,
        "MapPin" to Icons.Default.Place,
        "Ticket" to Icons.Default.ConfirmationNumber,
        "Tv" to Icons.Default.Tv,
        "Lightbulb" to Icons.Default.Lightbulb,
        "Zap" to Icons.Default.FlashOn,
        "Droplet" to Icons.Default.WaterDrop,
        "Dumbbell" to Icons.Default.FitnessCenter,
        "Ban" to Icons.Default.Block,
        "Cigarette" to Icons.Default.SmokingRooms,
        "Utensils" to Icons.Default.Restaurant,
        "CalendarSync" to Icons.Default.CalendarToday,
        "Gift" to Icons.Default.CardGiftcard,
        "Shield" to Icons.Default.Shield,
        "Bus" to Icons.Default.DirectionsBus,
        "Scissors" to Icons.Default.ContentCut,
        "Home" to Icons.Default.Home,
        "Laptop" to Icons.Default.Laptop,
        "MoreVertical" to Icons.Default.MoreVert
    )
    
    val fallbackIcon: ImageVector = Icons.Default.AccountBalanceWallet
    
    fun getIcon(iconName: String?): ImageVector {
        if (iconName == null || iconName.isBlank()) return fallbackIcon
        return iconMap[iconName.trim()] ?: fallbackIcon
    }
}