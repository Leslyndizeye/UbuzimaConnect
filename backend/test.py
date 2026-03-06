#!/usr/bin/env python3
"""
Run this in your backend folder:
  python3 test_email.py
"""
import os, requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = "https://omoinlmgsdtlzfasydgw.supabase.co"
SERVICE_KEY  = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
TEST_EMAIL   = "1tetagloria@gmail.com"   # ← change to any email you want to test

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

print(f"\n{'='*60}")
print(f"SUPABASE URL  : {SUPABASE_URL}")
print(f"SERVICE KEY   : {SERVICE_KEY[:30]}..." if SERVICE_KEY else "SERVICE KEY   :  MISSING")
print(f"TEST EMAIL    : {TEST_EMAIL}")
print(f"{'='*60}\n")

# ── Step 1: Check admin API access ───────────────────────────
print("Step 1: Testing admin API access...")
r = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=5", headers=headers, timeout=10)
print(f"  Status: {r.status_code}")
if r.ok:
    users = r.json().get("users", [])
    print(f"   Admin API works! Total auth users visible: {len(users)}")
    for u in users:
        print(f"     - {u.get('email')} | confirmed: {bool(u.get('email_confirmed_at'))}")
else:
    print(f"   Admin API FAILED: {r.text}")
    print("\n  FIX: Your SUPABASE_SERVICE_ROLE_KEY is wrong or missing.")
    exit(1)

# ── Step 2: Check if test email already exists ───────────────
print(f"\nStep 2: Checking if {TEST_EMAIL} exists in Supabase Auth...")
r2 = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000", headers=headers, timeout=10)
existing_id = None
if r2.ok:
    all_users = r2.json().get("users", [])
    match = [u for u in all_users if u.get("email","").lower() == TEST_EMAIL.lower()]
    if match:
        existing_id = match[0]["id"]
        print(f"  Found! Supabase UID: {existing_id}")
        print(f"  Confirmed: {bool(match[0].get('email_confirmed_at'))}")
    else:
        print(f"  Not found — user will be created fresh by invite")

# ── Step 3: Delete if exists (so invite email template is used) ──
if existing_id:
    print(f"\nStep 3: Deleting existing auth user {existing_id} so invite works cleanly...")
    r3 = requests.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{existing_id}", headers=headers, timeout=10)
    print(f"  Delete status: {r3.status_code}")
    if r3.status_code in (200, 204):
        print(f"   Deleted successfully")
    else:
        print(f"   Delete failed: {r3.text}")
else:
    print(f"\nStep 3: No existing user to delete — skipping")

# ── Step 4: Send invite ──────────────────────────────────────
print(f"\nStep 4: Sending invite to {TEST_EMAIL}...")
r4 = requests.post(
    f"{SUPABASE_URL}/auth/v1/invite",
    headers=headers,
    json={
        "email": TEST_EMAIL,
        "options": {
            "redirect_to": FRONTEND_URL,
            "data": {"full_name": "Test Doctor"},
        },
    },
    timeout=10,
)
print(f"  Status: {r4.status_code}")
print(f"  Response: {r4.text[:600]}")

if r4.ok:
    uid = r4.json().get("id")
    print(f"\n SUCCESS! Invite sent to {TEST_EMAIL}")
    print(f"   New Supabase UID: {uid}")
    print(f"   Check {TEST_EMAIL} inbox now — email should arrive in <1 minute")
else:
    print(f"\n INVITE FAILED")
    print(f"   Status: {r4.status_code}")
    print(f"   Error: {r4.text}")
    if r4.status_code == 422:
        print(f"\n   CAUSE: User already exists in Supabase Auth (delete in Step 3 may have failed)")
    elif r4.status_code == 401:
        print(f"\n   CAUSE: Service role key is invalid or expired")
    elif r4.status_code == 429:
        print(f"\n   CAUSE: Rate limited — too many emails sent recently (Supabase free plan: 2/hour)")
        print(f"   FIX: Wait 1 hour OR connect custom SMTP in Supabase → Settings → Auth → SMTP")

print(f"\n{'='*60}\n")