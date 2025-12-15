from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy import func

from db import get_db
from models import Item, User
from schemas import ItemCreate, ItemOut
from auth import get_current_user

from transactions import router as transactions_router

app = FastAPI(title="FinApp API", version="0.1.0")

app.include_router(transactions_router)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/items", response_model=list[ItemOut])
def list_items(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Item).where(Item.user_id == user.id)

    if not include_archived:
        stmt = stmt.where(Item.archived_at.is_(None))

    stmt = stmt.order_by(Item.created_at.desc())
    return list(db.execute(stmt).scalars())


@app.post("/items", response_model=ItemOut)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Item(
        user_id=user.id,
        kind=payload.kind,
        type_code=payload.type_code,
        name=payload.name,
        initial_value_rub=payload.initial_value_rub,
        current_value_rub=payload.initial_value_rub,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@app.patch("/items/{item_id}/archive", response_model=ItemOut)
def archive_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")

    if item.archived_at is None:
        item.archived_at = func.now()

    db.commit()
    db.refresh(item)
    return item

@app.get("/items/archived", response_model=list[ItemOut])
def list_archived_items(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    stmt = select(Item).where(
        Item.user_id == user.id,
        or_(
            Item.is_archived == False,
            Item.is_archived.is_(None),
        )
    )
    return db.scalars(stmt).all()