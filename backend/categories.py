from dataclasses import dataclass
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
import sqlalchemy as sa
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import Category, User, UserCategoryState
from schemas import (
    CategoryCreate,
    CategoryIconUpdate,
    CategoryOut,
    CategoryScopeUpdate,
    CategoryVisibilityUpdate,
)

router = APIRouter(prefix="/categories", tags=["categories"])


@dataclass
class CategoryCacheEntry:
    etag: str
    payload: list[dict]


CATEGORY_CACHE: dict[tuple[int, bool], CategoryCacheEntry] = {}
CACHE_CONTROL_VALUE = "private, max-age=60"


def compute_etag(payload: list[dict]) -> str:
    payload_json = json.dumps(
        payload, ensure_ascii=True, sort_keys=True, separators=(",", ":")
    )
    digest = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()
    return f"\"{digest}\""


def etag_matches(header_value: str | None, etag: str) -> bool:
    if not header_value:
        return False
    parts = [part.strip() for part in header_value.split(",")]
    return "*" in parts or etag in parts


def invalidate_category_cache(user_id: int) -> None:
    for key in list(CATEGORY_CACHE.keys()):
        if key[0] == user_id:
            CATEGORY_CACHE.pop(key, None)


def normalize_icon(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def build_category_out(category: Category, state: UserCategoryState | None) -> CategoryOut:
    if category.owner_user_id is None:
        icon_name = (
            state.icon_override
            if state and state.icon_override is not None
            else category.icon_name
        )
    else:
        icon_name = category.icon_name
    enabled = state.enabled if state else True
    return CategoryOut(
        id=category.id,
        name=category.name,
        scope=category.scope,
        icon_name=icon_name,
        parent_id=category.parent_id,
        owner_user_id=category.owner_user_id,
        enabled=enabled,
        archived_at=category.archived_at,
        children=[],
    )


def sort_tree(nodes: list[CategoryOut]) -> list[CategoryOut]:
    nodes.sort(key=lambda item: item.name.casefold())
    for node in nodes:
        if node.children:
            sort_tree(node.children)
    return nodes


def fetch_category(
    db: Session, user: User, category_id: int, allow_archived: bool = False
) -> Category:
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.owner_user_id not in (None, user.id):
        raise HTTPException(status_code=403, detail="Category is not available for this user")
    if category.archived_at is not None and not allow_archived:
        raise HTTPException(status_code=400, detail="Category is archived")
    return category


@router.get("", response_model=list[CategoryOut])
def list_categories(
    request: Request,
    response: Response,
    include_archived: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cache_key = (user.id, include_archived)
    cache_entry = CATEGORY_CACHE.get(cache_key)
    if cache_entry:
        if etag_matches(request.headers.get("if-none-match"), cache_entry.etag):
            return Response(
                status_code=304,
                headers={
                    "ETag": cache_entry.etag,
                    "Cache-Control": CACHE_CONTROL_VALUE,
                },
            )
        response.headers["ETag"] = cache_entry.etag
        response.headers["Cache-Control"] = CACHE_CONTROL_VALUE
        return cache_entry.payload

    categories = db.execute(
        select(Category).where(
            or_(Category.owner_user_id.is_(None), Category.owner_user_id == user.id)
        )
    ).scalars()

    states = db.execute(
        select(UserCategoryState).where(UserCategoryState.user_id == user.id)
    ).scalars()
    state_map = {state.category_id: state for state in states}

    nodes: dict[int, CategoryOut] = {}
    for category in categories:
        if not include_archived and category.archived_at is not None:
            continue
        nodes[category.id] = build_category_out(category, state_map.get(category.id))

    roots: list[CategoryOut] = []
    for node in nodes.values():
        parent_id = node.parent_id
        parent = nodes.get(parent_id) if parent_id else None
        if parent:
            parent.children.append(node)
        else:
            roots.append(node)

    payload = jsonable_encoder(sort_tree(roots))
    etag = compute_etag(payload)
    CATEGORY_CACHE[cache_key] = CategoryCacheEntry(etag=etag, payload=payload)

    if etag_matches(request.headers.get("if-none-match"), etag):
        return Response(
            status_code=304,
            headers={
                "ETag": etag,
                "Cache-Control": CACHE_CONTROL_VALUE,
            },
        )

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = CACHE_CONTROL_VALUE
    return payload


@router.post("", response_model=CategoryOut)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    parent = None
    if payload.parent_id is not None:
        parent = fetch_category(db, user, payload.parent_id)
        if parent.scope != "BOTH" and payload.scope != parent.scope:
            raise HTTPException(
                status_code=400,
                detail="Category scope must match the parent scope",
            )

    existing = db.execute(
        select(Category).where(
            Category.name == name,
            Category.parent_id == payload.parent_id,
            Category.archived_at.is_(None),
            or_(Category.owner_user_id.is_(None), Category.owner_user_id == user.id),
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Category with same name already exists")

    icon_name = normalize_icon(payload.icon_name)
    category = Category(
        name=name,
        scope=payload.scope,
        parent_id=payload.parent_id,
        owner_user_id=user.id,
        icon_name=icon_name,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    invalidate_category_cache(user.id)
    return build_category_out(category, None)


@router.patch("/{category_id}/scope", response_model=CategoryOut)
def update_category_scope(
    category_id: int,
    payload: CategoryScopeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = fetch_category(db, user, category_id)
    if category.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot edit scope of global category")

    if category.parent_id:
        parent = fetch_category(db, user, category.parent_id)
        if parent.scope != "BOTH" and payload.scope != parent.scope:
            raise HTTPException(
                status_code=400,
                detail="Category scope must match the parent scope",
            )

    category.scope = payload.scope
    db.commit()
    db.refresh(category)
    state = db.execute(
        select(UserCategoryState).where(
            UserCategoryState.user_id == user.id,
            UserCategoryState.category_id == category_id,
        )
    ).scalar_one_or_none()
    invalidate_category_cache(user.id)
    return build_category_out(category, state)


@router.patch("/{category_id}/visibility", response_model=CategoryOut)
def update_category_visibility(
    category_id: int,
    payload: CategoryVisibilityUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = fetch_category(db, user, category_id, allow_archived=True)
    state = db.execute(
        select(UserCategoryState).where(
            UserCategoryState.user_id == user.id,
            UserCategoryState.category_id == category_id,
        )
    ).scalar_one_or_none()

    if state:
        state.enabled = payload.enabled
    else:
        state = UserCategoryState(
            user_id=user.id,
            category_id=category_id,
            enabled=payload.enabled,
        )
        db.add(state)

    db.commit()
    invalidate_category_cache(user.id)
    return build_category_out(category, state)


@router.patch("/{category_id}/icon", response_model=CategoryOut)
def update_category_icon(
    category_id: int,
    payload: CategoryIconUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = fetch_category(db, user, category_id)
    icon_name = normalize_icon(payload.icon_name)

    state = None
    if category.owner_user_id == user.id:
        category.icon_name = icon_name
        state = db.execute(
            select(UserCategoryState).where(
                UserCategoryState.user_id == user.id,
                UserCategoryState.category_id == category_id,
            )
        ).scalar_one_or_none()
    else:
        state = db.execute(
            select(UserCategoryState).where(
                UserCategoryState.user_id == user.id,
                UserCategoryState.category_id == category_id,
            )
        ).scalar_one_or_none()
        if state:
            state.icon_override = icon_name
        else:
            state = UserCategoryState(
                user_id=user.id,
                category_id=category_id,
                icon_override=icon_name,
            )
            db.add(state)

    db.commit()
    db.refresh(category)
    invalidate_category_cache(user.id)
    return build_category_out(category, state)


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = fetch_category(db, user, category_id, allow_archived=True)
    if category.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot delete global category")

    if category.archived_at is not None:
        return {"ok": True}

    all_categories = db.execute(
        select(Category).where(Category.owner_user_id == user.id)
    ).scalars()
    by_parent: dict[int | None, list[Category]] = {}
    for item in all_categories:
        by_parent.setdefault(item.parent_id, []).append(item)

    to_archive: list[Category] = []
    stack = [category]
    while stack:
        current = stack.pop()
        to_archive.append(current)
        stack.extend(by_parent.get(current.id, []))

    for item in to_archive:
        item.archived_at = sa.func.now()

    db.commit()
    invalidate_category_cache(user.id)
    return {"ok": True}
