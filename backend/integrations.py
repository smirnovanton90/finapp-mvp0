"""User integrations (T-Invest API, etc.)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import BrokerAccountLink, Item, User, UserIntegration
from schemas import (
    BrokerAccountLinkOut,
    BrokerAccountLinksPut,
    TbankAccountOut,
    TbankCompleteImportIn,
    TbankInfoOut,
    TbankOperationsPreviewResponse,
    UserIntegrationCreate,
    UserIntegrationOut,
    UserIntegrationPatch,
)
from tbank_sync import (
    PROVIDER_TBANK,
    complete_tbank_import,
    fetch_tbank_info_snapshot,
    list_tbank_open_accounts,
    preview_tbank_operations_import,
    run_tbank_sync,
    set_integration_token,
)

router = APIRouter(prefix="/users/me/integrations", tags=["integrations"])


def _integration_to_out(row: UserIntegration) -> UserIntegrationOut:
    return UserIntegrationOut(
        id=row.id,
        provider=row.provider,
        has_token=bool(row.token_ciphertext),
        sandbox=row.sandbox,
        last_sync_at=row.last_sync_at,
        last_error=row.last_error,
        tbank_is_premium=row.tbank_is_premium,
        tbank_is_qualified=row.tbank_is_qualified,
        tbank_risk_category=row.tbank_risk_category,
        tbank_info_fetched_at=row.tbank_info_fetched_at,
        tbank_wizard_import_completed_at=row.tbank_wizard_import_completed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[UserIntegrationOut])
def list_integrations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(UserIntegration)
        .filter(UserIntegration.user_id == user.id)
        .order_by(UserIntegration.id.asc())
        .all()
    )
    return [_integration_to_out(r) for r in rows]


@router.post("", response_model=UserIntegrationOut)
def create_or_get_integration(
    payload: UserIntegrationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.provider != PROVIDER_TBANK:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    existing = (
        db.query(UserIntegration)
        .filter(
            UserIntegration.user_id == user.id,
            UserIntegration.provider == payload.provider,
        )
        .first()
    )
    if existing:
        return _integration_to_out(existing)
    row = UserIntegration(
        user_id=user.id,
        provider=payload.provider,
        token_ciphertext=None,
        sandbox=payload.sandbox,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _integration_to_out(row)


@router.get("/{integration_id}", response_model=UserIntegrationOut)
def get_integration(
    integration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    return _integration_to_out(row)


@router.patch("/{integration_id}", response_model=UserIntegrationOut)
def patch_integration(
    integration_id: int,
    payload: UserIntegrationPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    if payload.sandbox is not None:
        row.sandbox = payload.sandbox
    if payload.token is not None:
        if not (payload.token or "").strip():
            raise HTTPException(status_code=400, detail="token must be non-empty")
        set_integration_token(row, payload.token.strip())
    db.commit()
    db.refresh(row)
    return _integration_to_out(row)


@router.delete("/{integration_id}/token", response_model=UserIntegrationOut)
def delete_integration_token(
    integration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    row.token_ciphertext = None
    db.commit()
    db.refresh(row)
    return _integration_to_out(row)


@router.post("/{integration_id}/sync", response_model=UserIntegrationOut)
def sync_integration(
    integration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    run_tbank_sync(db, row)
    row = db.get(UserIntegration, integration_id)
    if not row:
        raise HTTPException(status_code=404, detail="Integration not found")
    return _integration_to_out(row)


@router.get("/{integration_id}/tbank/info", response_model=TbankInfoOut)
def get_tbank_info(
    integration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    return fetch_tbank_info_snapshot(db, row)


@router.get("/{integration_id}/tbank/accounts", response_model=list[TbankAccountOut])
def get_tbank_accounts(
    integration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    return list_tbank_open_accounts(db, row)


@router.get("/{integration_id}/tbank/preview", response_model=TbankOperationsPreviewResponse)
def preview_tbank_import(
    integration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    return preview_tbank_operations_import(db, row)


@router.post("/{integration_id}/tbank/import", response_model=UserIntegrationOut)
def complete_tbank_wizard_import(
    integration_id: int,
    payload: TbankCompleteImportIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    complete_tbank_import(db, row, payload)
    row2 = db.get(UserIntegration, integration_id)
    if not row2:
        raise HTTPException(status_code=404, detail="Integration not found")
    return _integration_to_out(row2)


@router.get("/{integration_id}/account-links", response_model=list[BrokerAccountLinkOut])
def list_account_links(
    integration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    links = (
        db.query(BrokerAccountLink)
        .filter(BrokerAccountLink.integration_id == integration_id)
        .order_by(BrokerAccountLink.id.asc())
        .all()
    )
    return [BrokerAccountLinkOut.model_validate(x) for x in links]


@router.put("/{integration_id}/account-links", response_model=list[BrokerAccountLinkOut])
def put_account_links(
    integration_id: int,
    payload: BrokerAccountLinksPut,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(UserIntegration, integration_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Integration not found")
    for entry in payload.links:
        link = (
            db.query(BrokerAccountLink)
            .filter(
                BrokerAccountLink.integration_id == integration_id,
                BrokerAccountLink.external_account_id == entry.external_account_id,
            )
            .first()
        )
        if not link:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown external account: {entry.external_account_id}",
            )
        if entry.item_id is not None:
            item = db.get(Item, entry.item_id)
            if not item or item.user_id != user.id:
                raise HTTPException(status_code=400, detail="Invalid item_id")
            if item.kind != "ASSET":
                raise HTTPException(status_code=400, detail="Item must be an asset")
        link.item_id = entry.item_id
    db.commit()
    links = (
        db.query(BrokerAccountLink)
        .filter(BrokerAccountLink.integration_id == integration_id)
        .order_by(BrokerAccountLink.id.asc())
        .all()
    )
    return [BrokerAccountLinkOut.model_validate(x) for x in links]
