# auth.py — Supabase ES256 JWT, uses firebase_uid field for Supabase UUID
import os
import jwt as pyjwt
import requests
from functools import lru_cache
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db, User, UserStatus

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://omoinlmgsdtlzfasydgw.supabase.co")
ADMIN_EMAIL = "leslyndiz6@gmail.com"
security = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def get_jwks():
    try:
        r = requests.get(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[auth] JWKS fetch failed: {e}")
        return None


def verify_supabase_token(token: str) -> dict:
    try:
        header = pyjwt.get_unverified_header(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Bad token header: {e}")

    alg = header.get("alg", "HS256")

    if alg == "HS256":
        secret = os.getenv("SUPABASE_JWT_SECRET", "")
        try:
            return pyjwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired.")
        except pyjwt.InvalidTokenError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    # ES256 / RS256 via JWKS
    jwks = get_jwks()
    if not jwks:
        raise HTTPException(status_code=503, detail="Auth service unavailable.")

    kid = header.get("kid")
    key_data = next((k for k in jwks.get("keys", []) if not kid or k.get("kid") == kid), None)
    if not key_data:
        raise HTTPException(status_code=401, detail="No matching public key.")

    try:
        if alg == "ES256":
            public_key = pyjwt.algorithms.ECAlgorithm.from_jwk(key_data)
        else:
            public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key_data)
        return pyjwt.decode(token, public_key, algorithms=[alg], options={"verify_aud": False})
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    payload = verify_supabase_token(credentials.credentials)
    supabase_uid = payload.get("sub", "")
    email = payload.get("email", "").lower()

    # Look up by firebase_uid (stores Supabase UUID) OR email
    user = db.query(User).filter(User.firebase_uid == supabase_uid).first()
    if user is None:
        user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found. Please register first.")

    # Sync firebase_uid with Supabase UUID if missing
    if not user.firebase_uid and supabase_uid:
        user.firebase_uid = supabase_uid
        db.commit()

    # Auto-promote admin email
    if email == ADMIN_EMAIL and not user.is_admin:
        user.is_admin = True
        user.status = UserStatus.approved
        db.commit()

    # Block non-approved non-admin users
    if email != ADMIN_EMAIL:
        if user.status == UserStatus.pending:
            raise HTTPException(status_code=403, detail="Account pending admin approval.")
        if user.status in (UserStatus.rejected, UserStatus.revoked):
            raise HTTPException(status_code=403, detail=f"Account {user.status.value}.")

    return user


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if (current_user.email or "").lower() != ADMIN_EMAIL or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


def get_any_authenticated(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        payload = verify_supabase_token(credentials.credentials)
        uid = payload.get("sub", "")
        email = payload.get("email", "")
        user = db.query(User).filter(User.firebase_uid == uid).first()
        if not user:
            user = db.query(User).filter(User.email == email).first()
        return user
    except Exception:
        return None
