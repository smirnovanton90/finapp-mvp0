from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from google.oauth2 import id_token
from google.auth.transport import requests
import base64
import hashlib
import hmac
import json
import secrets
import time

from config import settings
from db import get_db
from models import OnboardingState, User

AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
GOOGLE_REQUEST = requests.Request()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded)


def _sign(payload: bytes) -> str:
    secret = settings.auth_secret.encode("utf-8")
    signature = hmac.new(secret, payload, hashlib.sha256).digest()
    return _b64url_encode(signature)


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": user_id,
        "exp": int(time.time()) + AUTH_TOKEN_TTL_SECONDS,
    }
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    encoded = _b64url_encode(raw)
    signature = _sign(encoded.encode("ascii"))
    return f"{encoded}.{signature}"


def verify_access_token(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 2:
        raise HTTPException(status_code=401, detail="Invalid token")
    encoded, signature = parts
    expected = _sign(encoded.encode("ascii"))
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        payload = json.loads(_b64url_decode(encoded))
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        raise HTTPException(status_code=401, detail="Token expired")
    return payload


def hash_password(password: str) -> str:
    iterations = 120_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return "pbkdf2_sha256${}${}${}".format(
        iterations, _b64url_encode(salt), _b64url_encode(digest)
    )


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algorithm, iterations_raw, salt_b64, digest_b64 = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        salt = _b64url_decode(salt_b64)
        expected = _b64url_decode(digest_b64)
    except (ValueError, TypeError):
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(candidate, expected)


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    parts = token.split(".")

    if len(parts) == 2:
        payload = verify_access_token(token)
        user_id = payload.get("sub")
        if not isinstance(user_id, int):
            raise HTTPException(status_code=401, detail="Invalid token subject")
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    try:
        payload = id_token.verify_oauth2_token(token, GOOGLE_REQUEST)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    sub = payload.get("sub")
    email = payload.get("email")
    name = payload.get("name")

    if not sub:
        raise HTTPException(status_code=401, detail="Token has no sub")

    stmt = select(User).where(User.google_sub == sub)
    user = db.execute(stmt).scalar_one_or_none()

    if not user:
        user = User(google_sub=sub, email=email, name=name)
        db.add(user)
        db.commit()
        db.refresh(user)
        db.add(
            OnboardingState(
                user_id=user.id,
                device_type="WEB",
                status="PENDING",
            )
        )
        db.commit()

    return user
