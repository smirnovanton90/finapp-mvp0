from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from google.oauth2 import id_token
from google.auth.transport import requests

from db import get_db
from models import User
from category_service import ensure_default_categories

GOOGLE_REQUEST = requests.Request()

def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        # В MVP можно не фиксировать audience (client_id), но лучше будет добавить позже
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

    ensure_default_categories(db, user)

    return user