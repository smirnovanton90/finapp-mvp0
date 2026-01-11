from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import OnboardingState, User
from schemas import (
    OnboardingDeviceType,
    OnboardingStateOut,
    OnboardingStateUpdate,
)

router = APIRouter()


@router.get("/onboarding/status", response_model=OnboardingStateOut)
def get_onboarding_status(
    device_type: OnboardingDeviceType = "WEB",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(OnboardingState).where(
        OnboardingState.user_id == user.id,
        OnboardingState.device_type == device_type,
    )
    state = db.execute(stmt).scalar_one_or_none()
    if not state:
        state = OnboardingState(
            user_id=user.id,
            device_type=device_type,
            status="COMPLETED",
        )
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


@router.post("/onboarding/status", response_model=OnboardingStateOut)
def update_onboarding_status(
    payload: OnboardingStateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(OnboardingState).where(
        OnboardingState.user_id == user.id,
        OnboardingState.device_type == payload.device_type,
    )
    state = db.execute(stmt).scalar_one_or_none()
    if not state:
        state = OnboardingState(
            user_id=user.id,
            device_type=payload.device_type,
            status=payload.status,
        )
        db.add(state)
    else:
        state.status = payload.status
    db.commit()
    db.refresh(state)
    return state
