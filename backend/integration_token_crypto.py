"""Encrypt/decrypt third-party integration tokens (e.g. T-Invest API token) using Fernet."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from config import settings


def _fernet() -> Fernet:
    key = settings.integration_token_fernet_key
    if key:
        return Fernet(key.strip().encode("utf-8"))
    raw = hashlib.sha256(settings.auth_secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_token(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_token(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as e:
        raise ValueError("Invalid token ciphertext") from e
