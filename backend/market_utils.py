from models import Item

MOEX_TYPE_CODES = {
    "securities",
    "bonds",
    "etf",
    "bpif",
    "pif",
    "precious_metals",
}

# Board id used for crypto instruments in market_prices (no real boards in CoinGecko).
CRYPTO_BOARD_ID = "default"


def is_moex_type(type_code: str) -> bool:
    return type_code in MOEX_TYPE_CODES


def is_crypto_type(type_code: str) -> bool:
    return type_code == "crypto"


def is_moex_item(item: Item) -> bool:
    return item.type_code in MOEX_TYPE_CODES and item.instrument_id is not None


def is_crypto_item(item: Item) -> bool:
    return item.type_code == "crypto" and item.instrument_id is not None
