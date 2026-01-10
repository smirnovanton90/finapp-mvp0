from models import Item

MOEX_TYPE_CODES = {
    "securities",
    "bonds",
    "etf",
    "bpif",
    "pif",
    "precious_metals",
}


def is_moex_type(type_code: str) -> bool:
    return type_code in MOEX_TYPE_CODES


def is_moex_item(item: Item) -> bool:
    return item.instrument_id is not None
