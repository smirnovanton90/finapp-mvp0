"""HTTP client for T-Invest (T-Bank) public REST API."""

from __future__ import annotations

import logging
import re
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

import requests

from config import settings

logger = logging.getLogger(__name__)

_ssl_warned_insecure = False

# Кэш ответов инструментов: один FIGI на импорт/синк не должен бить API сотни раз (лимит 429).
_TBANK_INSTRUMENT_CACHE_MAX = 8192
_tbank_instrument_cache_lock = threading.Lock()
_instrument_by_figi_cache: OrderedDict[tuple[bool, str], dict[str, Any] | None] = OrderedDict()
_currency_by_figi_cache: OrderedDict[tuple[bool, str], dict[str, Any] | None] = OrderedDict()


def _tbank_lru_cache_set(
    cache: OrderedDict[tuple[bool, str], dict[str, Any] | None],
    key: tuple[bool, str],
    value: dict[str, Any] | None,
) -> None:
    with _tbank_instrument_cache_lock:
        cache[key] = value
        cache.move_to_end(key)
        while len(cache) > _TBANK_INSTRUMENT_CACHE_MAX:
            cache.popitem(last=False)


_CACHE_MISS = object()


def _tbank_lru_cache_get(
    cache: OrderedDict[tuple[bool, str], dict[str, Any] | None],
    key: tuple[bool, str],
) -> dict[str, Any] | None | object:
    """Возвращает значение из кэша или _CACHE_MISS."""
    with _tbank_instrument_cache_lock:
        if key not in cache:
            return _CACHE_MISS
        cache.move_to_end(key)
        return cache[key]

_USERS = "tinkoff.public.invest.api.contract.v1.UsersService"
_OPERATIONS = "tinkoff.public.invest.api.contract.v1.OperationsService"
_INSTRUMENTS = "tinkoff.public.invest.api.contract.v1.InstrumentsService"

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _instrument_id_type_for_value(id_value: str) -> str:
    """Тип идентификатора для GetInstrumentBy (обязательное поле idType в REST API)."""
    if _UUID_RE.match(id_value.strip()):
        return "INSTRUMENT_ID_TYPE_UID"
    return "INSTRUMENT_ID_TYPE_FIGI"


def _ssl_verify_arg() -> bool | str:
    """Путь к PEM (доп. CA), False при отключении проверки, иначе True."""
    global _ssl_warned_insecure
    if settings.tbank_invest_ca_bundle:
        return settings.tbank_invest_ca_bundle.strip()
    if not settings.tbank_invest_verify_ssl:
        if not _ssl_warned_insecure:
            logger.warning(
                "T-Invest: SSL verification disabled (tbank_invest_verify_ssl=false). "
                "Use only in a trusted network; prefer tbank_invest_ca_bundle for corporate proxies."
            )
            _ssl_warned_insecure = True
        return False
    return True


def _post(
    base_url: str,
    path: str,
    token: str,
    body: dict[str, Any] | None = None,
    *,
    not_found_ok: bool = False,
) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/rest/{path}"
    last: requests.Response | None = None
    for attempt in range(8):
        r = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=body if body is not None else {},
            timeout=60,
            verify=_ssl_verify_arg(),
        )
        last = r
        if r.status_code == 429:
            wait = 1.0 + attempt * 0.75
            ra = r.headers.get("Retry-After")
            if ra:
                try:
                    wait = max(wait, float(ra))
                except (TypeError, ValueError):
                    pass
            wait = min(wait, 90.0)
            logger.warning(
                "T-Invest API 429 %s, пауза %.1f с (попытка %s/8)",
                path,
                wait,
                attempt + 1,
            )
            time.sleep(wait)
            continue
        if r.status_code == 404 and not_found_ok:
            logger.debug("T-Invest API 404 (допустимо) %s", path)
            return {}
        if r.status_code >= 400:
            logger.warning("T-Invest API error %s %s: %s", r.status_code, path, r.text[:500])
            r.raise_for_status()
        return r.json() if r.content else {}
    if last is not None:
        last.raise_for_status()
    return {}


def money_to_kopecks(m: dict[str, Any] | None) -> int:
    """Protobuf Money / Quotation → копейки (RUB). units/nano или camelCase Units/Nano."""
    if not m:
        return 0
    units = m.get("units")
    if units is None:
        units = m.get("Units")
    nano = m.get("nano")
    if nano is None:
        nano = m.get("Nano")
    if units is None and nano is None:
        return 0
    try:
        u = int(str(units or 0))
    except (TypeError, ValueError):
        u = 0
    try:
        n = int(str(nano or 0))
    except (TypeError, ValueError):
        n = 0
    rubles = u + n / 1_000_000_000
    return int(round(rubles * 100))


def _scalar_rubles_to_kopecks(v: Any) -> int:
    """Если API отдаёт сумму числом/строкой в рублях."""
    if v is None:
        return 0
    if isinstance(v, bool):
        return 0
    if isinstance(v, (int, float)):
        return int(round(float(v) * 100))
    if isinstance(v, str):
        s = v.strip().replace(",", ".")
        if not s:
            return 0
        try:
            return int(round(float(s) * 100))
        except ValueError:
            return 0
    return 0


# Backwards-compatible alias
_money_to_kopecks = money_to_kopecks


def tbank_base_url(*, sandbox: bool) -> str:
    return (
        settings.tbank_invest_sandbox_base_url
        if sandbox
        else settings.tbank_invest_base_url
    )


def get_accounts(token: str, *, sandbox: bool = False) -> list[dict[str, Any]]:
    data = _post(tbank_base_url(sandbox=sandbox), f"{_USERS}/GetAccounts", token, {})
    raw = data.get("accounts") or data.get("Accounts") or []
    return list(raw) if isinstance(raw, list) else []


def get_info(token: str, *, sandbox: bool = False) -> dict[str, Any]:
    """UsersService/GetInfo: profile flags (premium/qualified/risk), etc."""
    return _post(tbank_base_url(sandbox=sandbox), f"{_USERS}/GetInfo", token, {})


def get_positions(token: str, account_id: str, *, sandbox: bool = False) -> list[dict[str, Any]]:
    data = _post(
        tbank_base_url(sandbox=sandbox),
        f"{_OPERATIONS}/GetPositions",
        token,
        {"accountId": account_id},
    )
    raw = data.get("securities") or data.get("Securities") or []
    return list(raw) if isinstance(raw, list) else []


def get_portfolio(token: str, account_id: str, *, sandbox: bool = False) -> dict[str, Any]:
    return _post(
        tbank_base_url(sandbox=sandbox),
        f"{_OPERATIONS}/GetPortfolio",
        token,
        {"accountId": account_id, "currency": "RUB"},
    )


def _extract_operations_batch(data: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("items", "Items", "operations", "Operations"):
        raw = data.get(key)
        if isinstance(raw, list):
            return [x for x in raw if isinstance(x, dict)]
    return []


def _get_operations_by_cursor(
    base: str,
    token: str,
    account_id: str,
    date_from_iso: str,
    date_to_iso: str,
) -> list[dict[str, Any]]:
    path = f"{_OPERATIONS}/GetOperationsByCursor"
    out: list[dict[str, Any]] = []
    cursor: str | None = None
    for _ in range(200):
        body: dict[str, Any] = {
            "accountId": account_id,
            "from": date_from_iso,
            "to": date_to_iso,
            "state": "OPERATION_STATE_EXECUTED",
            "limit": 1000,
        }
        if cursor:
            body["cursor"] = cursor
        data = _post(base, path, token, body)
        out.extend(_extract_operations_batch(data))
        has_next = bool(data.get("hasNext") or data.get("has_next"))
        next_c = data.get("nextCursor") or data.get("next_cursor")
        if not has_next:
            break
        if not next_c:
            break
        cursor = str(next_c)
        if len(out) > 100_000:
            logger.warning("T-Invest: operation list truncated at 100000")
            break
    return out


def _get_operations_legacy(
    base: str,
    token: str,
    account_id: str,
    date_from_iso: str,
    date_to_iso: str,
) -> list[dict[str, Any]]:
    data = _post(
        base,
        f"{_OPERATIONS}/GetOperations",
        token,
        {
            "accountId": account_id,
            "from": date_from_iso,
            "to": date_to_iso,
            "state": "OPERATION_STATE_EXECUTED",
        },
    )
    return _extract_operations_batch(data)


def _operation_trades_score(op: dict[str, Any]) -> tuple[int, int]:
    """Для выбора более полной копии операции при дедупе: (число сделок в trades, 1 если ключ trades есть)."""
    raw = op.get("trades")
    if raw is None:
        raw = op.get("Trades")
    if not isinstance(raw, list):
        return (0, 0)
    n = sum(1 for t in raw if isinstance(t, dict))
    return (n, 1)


def _prefer_richer_operation(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """GetOperationsByCursor часто отдаёт операции без trades; GetOperations — с trades. Нужна более полная версия."""
    sa = _operation_trades_score(a)
    sb = _operation_trades_score(b)
    return b if sb > sa else a


def _dedupe_operations(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for op in rows:
        oid = operation_id(op)
        if not oid:
            continue
        if oid not in best:
            best[oid] = op
        else:
            best[oid] = _prefer_richer_operation(best[oid], op)
    return list(best.values())


def get_operations(
    token: str,
    account_id: str,
    *,
    date_from_iso: str,
    date_to_iso: str,
    sandbox: bool = False,
) -> list[dict[str, Any]]:
    """Операции за период: объединяем GetOperationsByCursor и GetOperations, дедуп по id.

    При совпадении id оставляем вариант с более полным списком ``trades`` (нужен импорт сделок поштучно).
    """
    base = tbank_base_url(sandbox=sandbox)
    by_cursor = _get_operations_by_cursor(base, token, account_id, date_from_iso, date_to_iso)
    legacy = _get_operations_legacy(base, token, account_id, date_from_iso, date_to_iso)
    logger.info(
        "T-Invest operations fetched: by_cursor=%s legacy=%s",
        len(by_cursor),
        len(legacy),
    )
    merged = by_cursor + legacy
    return _dedupe_operations(merged)


def _get_instrument_by_figi_uncached(
    token: str, figi: str, *, sandbox: bool = False
) -> dict[str, Any] | None:
    fid = (figi or "").strip()
    if not fid:
        return None
    id_type = _instrument_id_type_for_value(fid)
    data = _post(
        tbank_base_url(sandbox=sandbox),
        f"{_INSTRUMENTS}/GetInstrumentBy",
        token,
        {"idType": id_type, "id": fid},
    )
    inst = data.get("instrument") or data.get("Instrument")
    if isinstance(inst, dict) and (inst.get("ticker") or inst.get("Ticker")):
        return inst
    data2 = _post(
        tbank_base_url(sandbox=sandbox),
        f"{_INSTRUMENTS}/FindInstrument",
        token,
        {"query": fid},
    )
    raw = data2.get("instruments") or data2.get("Instruments") or []
    if isinstance(raw, list) and raw:
        first = raw[0]
        return first if isinstance(first, dict) else None
    return inst if isinstance(inst, dict) else None


def get_instrument_by_figi(token: str, figi: str, *, sandbox: bool = False) -> dict[str, Any] | None:
    """Resolve FIGI / uid → instrument details (ticker for MOEX). Результат кэшируется по (sandbox, figi)."""
    fid = (figi or "").strip()
    if not fid:
        return None
    key = (sandbox, fid)
    hit = _tbank_lru_cache_get(_instrument_by_figi_cache, key)
    if hit is not _CACHE_MISS:
        return hit  # type: ignore[return-value]
    out = _get_instrument_by_figi_uncached(token, fid, sandbox=sandbox)
    _tbank_lru_cache_set(_instrument_by_figi_cache, key, out)
    return out


def tbank_instrument_display_name(inst: dict[str, Any] | None, *, fallback: str = "") -> str:
    """Имя/тикер из ответа GetInstrumentBy / FindInstrument / CurrencyBy (приоритет: name → shortName → ticker)."""
    if not isinstance(inst, dict):
        return (fallback or "").strip()[:200]
    for key in ("name", "Name", "shortName", "ShortName", "ticker", "Ticker"):
        v = inst.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()[:200]
    return (fallback or "").strip()[:200]


def _get_currency_by_figi_uncached(
    token: str, figi: str, *, sandbox: bool = False
) -> dict[str, Any] | None:
    fid = (figi or "").strip()
    if not fid:
        return None
    id_type = _instrument_id_type_for_value(fid)
    data = _post(
        tbank_base_url(sandbox=sandbox),
        f"{_INSTRUMENTS}/CurrencyBy",
        token,
        {"idType": id_type, "id": fid},
        not_found_ok=True,
    )
    inst = data.get("instrument") or data.get("Instrument")
    return inst if isinstance(inst, dict) else None


def get_currency_by_figi(token: str, figi: str, *, sandbox: bool = False) -> dict[str, Any] | None:
    """InstrumentsService/CurrencyBy: валютный инструмент по FIGI / UID. Кэш по (sandbox, figi)."""
    fid = (figi or "").strip()
    if not fid:
        return None
    key = (sandbox, fid)
    hit = _tbank_lru_cache_get(_currency_by_figi_cache, key)
    if hit is not _CACHE_MISS:
        return hit  # type: ignore[return-value]
    out = _get_currency_by_figi_uncached(token, fid, sandbox=sandbox)
    _tbank_lru_cache_set(_currency_by_figi_cache, key, out)
    return out


def currency_iso_from_currency_instrument(inst: dict[str, Any]) -> str | None:
    """ISO-код валюты из ответа CurrencyBy: nominal.currency → iso_currency_name → currency."""
    nominal = inst.get("nominal") or inst.get("Nominal")
    if isinstance(nominal, dict):
        c = nominal.get("currency") or nominal.get("Currency")
        if isinstance(c, str) and c.strip():
            return c.strip().upper()[:3]
    for key in ("isoCurrencyName", "iso_currency_name"):
        v = inst.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip().upper()[:3]
    c = inst.get("currency") or inst.get("Currency")
    if isinstance(c, str) and c.strip():
        return c.strip().upper()[:3]
    return None


def account_id(acc: dict[str, Any]) -> str:
    return str(acc.get("id") or acc.get("accountId") or acc.get("AccountId") or "")


def account_name(acc: dict[str, Any]) -> str | None:
    n = acc.get("name") or acc.get("Name")
    return str(n).strip() if n else None


def account_type(acc: dict[str, Any]) -> str | None:
    t = acc.get("type") or acc.get("Type")
    return str(t) if t else None


def account_status(acc: dict[str, Any]) -> str | None:
    s = acc.get("status") or acc.get("Status")
    return str(s) if s else None


def account_opened_date_iso(acc: dict[str, Any]) -> str | None:
    d = acc.get("openedDate") or acc.get("OpenedDate") or acc.get("opened_at") or acc.get("openedAt")
    return str(d).strip() if isinstance(d, str) and d.strip() else None


def position_figi(pos: dict[str, Any]) -> str:
    return str(
        pos.get("figi")
        or pos.get("Figi")
        or pos.get("instrumentUid")
        or pos.get("InstrumentUid")
        or ""
    ).strip()


def operation_id(op: dict[str, Any]) -> str:
    oid = op.get("id") or op.get("operationId") or op.get("OperationId")
    if oid is not None and str(oid).strip():
        return str(oid).strip()
    cur = op.get("cursor") or op.get("Cursor")
    if cur is not None and str(cur).strip():
        return str(cur).strip()
    return ""


def operation_type(op: dict[str, Any]) -> str:
    # В API поле `operationType` содержит стабильный enum (OPERATION_TYPE_*),
    # а `type` — локализованное человекочитаемое название.
    # Для фильтрации импорта обязательно используем enum в первую очередь.
    t = op.get("operationType") or op.get("OperationType") or op.get("type")
    if t is None or t == "":
        return ""
    # REST может отдать числовой enum
    return str(t)


def operation_payment_kopecks(op: dict[str, Any]) -> int:
    """Сумма в копейках: payment → commission → купон/доход (accruedInt, yield)."""
    pay = op.get("payment") or op.get("Payment")
    if isinstance(pay, dict):
        p = money_to_kopecks(pay)
        if p != 0:
            return p
    elif pay is not None:
        p = _scalar_rubles_to_kopecks(pay)
        if p != 0:
            return p

    for key in (
        "commission",
        "Commission",
        "accruedInt",
        "AccruedInt",
        "yield",
        "Yield",
        "price",
        "Price",
    ):
        raw = op.get(key)
        if isinstance(raw, dict):
            p = money_to_kopecks(raw)
            if p != 0:
                return p
        elif raw is not None:
            p = _scalar_rubles_to_kopecks(raw)
            if p != 0:
                return p
    return 0


def operation_payment_field_abs_kopecks(op: dict[str, Any]) -> int:
    """Модуль суммы из поля ``payment`` / ``Payment`` (итог движения денег по операции).

    Для разбивки по ``trades``: остаток = это значение минус сумма ног (qty×price по сделкам);
    родительская split-транзакция показывает ту же сумму. Так НКД и прочее, включённые в
    ``payment``, не теряются, даже если в сделках цена уже «усреднена» и совпадает с полным списанием.

    Если ``payment`` отсутствует или даёт 0 — fallback на ``operation_payment_kopecks``.
    """
    raw = op.get("payment") or op.get("Payment")
    if raw is not None:
        if isinstance(raw, dict):
            p = money_to_kopecks(raw)
        else:
            p = _scalar_rubles_to_kopecks(raw)
        if p != 0:
            return abs(int(p))
    return abs(int(operation_payment_kopecks(op)))


def operation_date_iso(op: dict[str, Any]) -> str | None:
    for k in ("date", "Date", "dateTime", "DateTime"):
        d = op.get(k)
        if isinstance(d, str) and d.strip():
            return d.strip()
        if isinstance(d, dict):
            secs = d.get("seconds") if "seconds" in d else d.get("Seconds")
            if secs is not None:
                try:
                    dt = datetime.fromtimestamp(int(str(secs)), tz=timezone.utc)
                    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
                except (ValueError, OSError, TypeError):
                    pass
    return None
