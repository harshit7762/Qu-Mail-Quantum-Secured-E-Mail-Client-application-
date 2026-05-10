import os
import json
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

class RegistrationData(BaseModel):
    email: str
    level3_pk: str
    level4_pk: str

app = FastAPI(title="QuMail Identity Registry")

# ---------------------------------------------------------------------------
# Persistent registry — stored in a JSON file so data survives Render restarts
# ---------------------------------------------------------------------------
REGISTRY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "identity_registry.json")

def _load_registry() -> dict:
    if os.path.exists(REGISTRY_FILE):
        try:
            with open(REGISTRY_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_registry(registry: dict):
    try:
        with open(REGISTRY_FILE, "w") as f:
            json.dump(registry, f, indent=2)
    except Exception as e:
        print(f"[identity_server] Failed to persist registry: {e}")

# Load on startup
USER_REGISTRY: dict = _load_registry()
print(f"[identity_server] Loaded {len(USER_REGISTRY)} registered identities from disk.")

@app.get("/")
async def root():
    return {"status": "QuMail Identity Server running", "registered": len(USER_REGISTRY)}

@app.post("/register")
async def register(data: RegistrationData):
    email = data.email.strip().lower()
    USER_REGISTRY[email] = {
        "3": data.level3_pk,
        "4": data.level4_pk
    }
    _save_registry(USER_REGISTRY)
    print(f"[identity_server] Registered/updated keys for {email}")
    return {"status": "success", "detail": f"Keys registered for {email}"}

@app.get("/lookup/{email}")
async def lookup(email: str):
    email = email.strip().lower()
    if email not in USER_REGISTRY:
        raise HTTPException(status_code=404, detail="User not found")
    return USER_REGISTRY[email]

@app.get("/list")
async def list_users():
    """Debug endpoint — lists all registered emails."""
    return {"registered": list(USER_REGISTRY.keys()), "count": len(USER_REGISTRY)}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
