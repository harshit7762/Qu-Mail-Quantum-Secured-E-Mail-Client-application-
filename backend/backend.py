import os
import sys

# Ensure the directory containing this script is in the Python search path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# --- IMPORT SHARED LOGIC ---
try:
    from qumail_reciever import sync_identity_to_render, P, G 
except ImportError as e:
    print(f" Critical Import Error: {e}")
    print(f"DEBUG: sys.path is {sys.path}")
    print(f"Check if qumail_reciever.py exists in {current_dir}")

import json
import requests

from sae_client import encrypt_data
from decy import aes_decrypt_b64, fetch_key_from_kme, decrypt_payload
from emailsend import send_email, send_plain_file
from reciever_email import (
    fetch_qumail_emails, fetch_payload_from_email,
    mark_seen
)
from mail_store import (
    get_all_folders, get_folder, append_message,
    update_message, move_message,
    delete_message as store_delete_message,
    delete_account as store_delete_account
)
from gmail_auth import (
    get_gmail_service, load_credentials, get_user_profile,
    run_automatic_auth_flow, list_accounts, switch_account,
    remove_account, get_active_email
)
import base64

def clean_payload(data):
    """Recursively ensures all binary data in a dictionary is Base64 encoded."""
    if isinstance(data, dict):
        return {k: clean_payload(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_payload(v) for v in data]
    elif isinstance(data, bytes):
        return base64.b64encode(data).decode('utf-8', errors='ignore')
    return data

app = FastAPI()

# ------------------------------------------
# ENABLE CORS FOR FRONTEND
# ------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------
# SYNC ENDPOINT (The Bridge to qumail_reciever)
# ------------------------------------------
@app.post("/sync")
async def sync_secure_endpoint(request: Request):
    try:
        # 1. Get user identity
        try:
            data = await request.json()
            email = data.get("email")
        except:
            email = None
        
        if not email:
            profile = get_user_profile()
            email = profile.get("email")

        print(f" Triggering qumail_reciever sync for {email}...")

        # 2. Call your working receiver logic
        # This generates keys if missing and posts to Render
        success = sync_identity_to_render(email) 
        
        if success:
            print(f" Identity for {email} is now Quantum-Safe.")
            return {"status": "success", "message": "Identity synced successfully"}
        else:
            return JSONResponse(status_code=500, content={"error": "Sync function returned False"})

    except Exception as e:
        print(f" Sync failed: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)}) 

# ------------------------------------------
# SERVE FRONTEND BUILD
# ------------------------------------------
# Ensure this path is correct for your folder structure
app.mount("/static", StaticFiles(directory="C:/Users/HP/OneDrive/Desktop/Qumail-main/build/static"), name="static")

@app.get("/")
def frontend_root():
    return FileResponse("C:/Users/HP/OneDrive/Desktop/Qumail-main/build/index.html")

@app.get("/me")
def me():
    try:
        profile = get_user_profile()
        return {
            "email": profile.get("email"),
            "name": profile.get("name"),
            "picture": profile.get("picture")
        }
    except Exception as e:
        return {"error": "Not logged in", "details": str(e)}

# ------------------------------------------
# MULTI-ACCOUNT MANAGEMENT
# ------------------------------------------

@app.get("/accounts")
def get_accounts():
    """Return all saved accounts."""
    try:
        accounts = list_accounts()
        return {"accounts": accounts}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/switch_account")
async def switch_account_endpoint(request: Request):
    """Switch the active account."""
    try:
        data = await request.json()
        email = data.get("email", "").strip().lower()
        if not email:
            return JSONResponse(status_code=400, content={"error": "email required"})
        ok = switch_account(email)
        if ok:
            return {"status": "switched", "email": email}
        return JSONResponse(status_code=404, content={"error": "Account not found. Please add it first."})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/add_account")
def add_account():
    """Open Google OAuth browser flow to add a new account."""
    try:
        creds = run_automatic_auth_flow(prompt_account_chooser=True)
        profile = get_user_profile()
        new_email = profile.get("email")

        # Generate DH + PQC keys for the new account and append to receiver_keys.json
        from qumail_reciever import ensure_identity_exists
        ensure_identity_exists(new_email)

        return {"status": "added", "email": new_email, "name": profile.get("name")}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/logout")
async def logout(request: Request):
    """Sign out of the specified (or active) account  removes its token."""
    try:
        body = await request.json()
        email = body.get("email")
    except Exception:
        email = None
    if not email:
        email = get_active_email()
    if email:
        remove_account(email)
    return {"status": "logged_out", "email": email}

@app.post("/remove_account")
async def remove_account_endpoint(request: Request):
    """
    Permanently remove an account:
    - Deletes its entry from token.json
    - Deletes its keys from receiver_keys.json
    - Updates flat key files for the new active account
    Returns the new active account email (or None if no accounts left).
    """
    try:
        body = await request.json()
        email = body.get("email", "").strip().lower()
    except Exception:
        email = ""
    if not email:
        return JSONResponse(status_code=400, content={"error": "email required"})

    remove_account(email)

    new_active = get_active_email()
    return {
        "status": "removed",
        "removed_email": email,
        "new_active": new_active
    }

@app.get("/verify_files")
def verify_files():
    """
    Check that all required credential and key files exist.
    Returns a status dict so the frontend can show warnings.
    """
    import os
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    files = {
        "token.json":                  os.path.join(backend_dir, "token.json"),
        "receiver_keys.json":          os.path.join(backend_dir, "receiver_keys.json"),
        "receiver_dh_private.txt":     os.path.join(backend_dir, "receiver_dh_private.txt"),
        "receiver_pqc_private.bin":    os.path.join(backend_dir, "receiver_pqc_private.bin"),
        "receiver_pqc_public.bin":     os.path.join(backend_dir, "receiver_pqc_public.bin"),
    }
    result = {}
    for name, path in files.items():
        exists = os.path.exists(path)
        size = os.path.getsize(path) if exists else 0
        result[name] = {"exists": exists, "size_bytes": size}

    # Also report token.json format
    token_path = files["token.json"]
    if os.path.exists(token_path):
        try:
            with open(token_path) as f:
                data = json.load(f)
            result["token.json"]["format"] = "multi-account" if "accounts" in data else "legacy-flat"
            result["token.json"]["accounts"] = list(data.get("accounts", {}).keys())
            result["token.json"]["active"] = data.get("active")
        except Exception as e:
            result["token.json"]["format"] = f"error: {e}"

    # Report receiver_keys.json accounts
    keys_path = files["receiver_keys.json"]
    if os.path.exists(keys_path):
        try:
            with open(keys_path) as f:
                kdata = json.load(f)
            result["receiver_keys.json"]["accounts"] = list(kdata.keys())
        except Exception as e:
            result["receiver_keys.json"]["accounts"] = f"error: {e}"

    all_ok = all(v["exists"] for v in result.values())
    return {"all_ok": all_ok, "files": result}

@app.get("/login")
def login():
    """Add a new account via OAuth and set it as active."""
    try:
        run_automatic_auth_flow(prompt_account_chooser=True)
        profile = get_user_profile()
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/")
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Login failed: {str(e)}"})

# ------------------------------------------
# ENCRYPTION & SENDING
# ------------------------------------------
@app.post("/encrypt")
async def encrypt_message(
    level: int = Form(...), 
    message: str = Form(None),
    subject: str = Form(None),
    recipient_email: str = Form(None),
    file: UploadFile = File(None)
):
    try:
        if file:
            print(f" Encrypting file: {file.filename} ({file.content_type}) for {recipient_email}")
            data = await file.read()
            print(f"   Size: {len(data)} bytes")
            # Corrected order: recipient_email, then original_filename
            payload = encrypt_data(data, level, "file", recipient_email, file.filename)
        else:
            print(f" Encrypting text message for {recipient_email} (Level {level})")
            payload = encrypt_data(message.encode(), level, "text", recipient_email=recipient_email)
        
        if subject:
            payload["subject"] = subject
            
        print(f" Encryption L{level} successful.")
        return clean_payload(payload)

    except Exception as e:
        print(f" Encryption Error: {str(e)}")
        return JSONResponse(
            status_code=500, 
            content={"error": f"Encryption failed at Level {level}: {str(e)}"}
        )

@app.post("/encrypt_multi")
async def encrypt_multi(request: Request):
    """
    Encrypt multiple files at once and return an array of payloads.
    The frontend sends all files in one multipart request.
    """
    try:
        form = await request.form()
        level = int(form.get("level", 2))
        subject = form.get("subject", "")
        recipient_email = form.get("recipient_email", "")
        files = form.getlist("files")

        payloads = []
        for f in files:
            data = await f.read()
            payload = encrypt_data(data, level, "file", recipient_email, f.filename)
            if subject:
                payload["subject"] = subject
            payloads.append(clean_payload(payload))

        return {"status": "ok", "payloads": payloads, "count": len(payloads)}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/send_email_bundle")
async def send_email_bundle(request: Request):
    """Send encrypted file payloads (+ optional plain text) as ONE Gmail email."""
    try:
        body = await request.json()
        recipient = body.get("recipient", "")
        payloads = body.get("payloads", [])
        subject = body.get("subject", "")
        # Store plain text directly — the bundle JSON attachment is already
        # protected by the file encryption; no need to double-encrypt the text
        plain_text = body.get("plain_text", "")
        if not recipient or not payloads:
            return JSONResponse(status_code=400, content={"error": "recipient and payloads required"})
        bundle = {
            "type": "multi_file",
            "file_count": len(payloads),
            "files": payloads,
            "subject": subject,
            "plain_text": plain_text
        }
        print(f"Sending bundle: {len(payloads)} files, plain_text='{plain_text[:50] if plain_text else 'EMPTY'}'")
        result = send_email(bundle, recipient)
        return {"status": "sent", "id": result.get("id"), "file_count": len(payloads)}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/send_email")
async def send_encrypted(request: Request):
    """Accept either JSON body or form data for flexibility with large payloads."""
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            body = await request.json()
            payload_dict = body.get("payload")
            recipient = body.get("recipient")
            if isinstance(payload_dict, str):
                payload_dict = json.loads(payload_dict)
        else:
            form = await request.form()
            payload_str = form.get("payload", "")
            recipient = form.get("recipient", "")
            payload_dict = json.loads(payload_str)

        if not payload_dict or not recipient:
            return JSONResponse(status_code=400, content={"error": "payload and recipient required"})

        result = send_email(payload_dict, recipient)
        return {"status": "sent", "id": result.get("id")}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/send_plain")
async def send_plain(recipient: str = Form(...), file: UploadFile = File(...)):
    try:
        file_content = await file.read()
        result = send_plain_file(recipient, file_content, file.filename)
        return {"status": "sent", "id": result.get("id")}
    except Exception as e:
        return {"error": str(e)}

# ------------------------------------------
# RECEIVE & DECRYPT
# ------------------------------------------
@app.get("/receive_email")
def receive_all():
    try:
        profile = get_user_profile()
        user_email = profile.get("email", "").lower()

        # Fetch only unseen messages — newest first, stop at first success
        msgs = fetch_qumail_emails(active_email=user_email)
        if not msgs:
            return {"status": "no-new-messages", "messages": []}

        print(f"Syncing inbox for {user_email} — {len(msgs)} new message(s) to check.")

        results = []
        for msg in msgs:
            msg_id = msg["id"]
            try:
                payload = fetch_payload_from_email(msg_id)
                if not payload:
                    mark_seen(user_email, msg_id)
                    continue

                sender_raw = payload.get("sender", "").lower()

                # Skip self-sent
                if user_email and user_email in sender_raw:
                    mark_seen(user_email, msg_id)
                    continue

                method = payload.get("method", "")

                # --- MULTI-FILE BUNDLE ---
                if payload.get("type") == "multi_file":
                    file_payloads = payload.get("files", [])
                    plain_text    = payload.get("plain_text", "")
                    print(f"Bundle received: {len(file_payloads)} files, plain_text='{plain_text[:50] if plain_text else 'EMPTY'}'")
                    print(f"Bundle keys: {list(payload.keys())}")
                    attachments = []
                    attachment_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "attachments")
                    os.makedirs(attachment_dir, exist_ok=True)

                    for i, fp in enumerate(file_payloads):
                        fp["sender"] = payload.get("sender", "Unknown")
                        try:
                            file_bytes = decrypt_payload(fp)
                            if not file_bytes:
                                continue
                            fname = fp.get("filename", f"file_{i+1}")
                            att_path = os.path.join(attachment_dir, f"{msg_id}_{i}_{fname}")
                            with open(att_path, "wb") as af:
                                af.write(file_bytes)
                            attachments.append({
                                "name": fname,
                                "size": len(file_bytes),
                                "type": "",
                                "download_url": f"/attachment/{msg_id}_{i}",
                                "file_data_b64": base64.b64encode(file_bytes).decode("utf-8")
                            })
                        except Exception as fe:
                            print(f"Failed to decrypt file {i} in bundle: {fe}")

                    import time as _time
                    preview = plain_text[:200] if plain_text else f"[{len(attachments)} encrypted file(s)]"
                    msg_data = {
                        "id": msg_id,
                        "key_id": "Bundle",
                        "level": file_payloads[0].get("level") if file_payloads else 2,
                        "sender": payload.get("sender", "Unknown"),
                        "subject": payload.get("subject", "No Subject"),
                        "content_type": "multi_file",
                        "time": _time.strftime("%I:%M %p"),
                        "starred": False,
                        "read": False,
                        "preview": preview,
                        "decrypted_text": plain_text,
                        "attachments": attachments
                    }
                    store_msg = {k: v for k, v in msg_data.items() if k != "file_data_b64"}
                    store_msg["attachments"] = [{k: v for k, v in a.items() if k != "file_data_b64"} for a in attachments]
                    try:
                        append_message(user_email, "inbox", store_msg)
                    except Exception as se:
                        print(f"Failed to save bundle message: {se}")
                    mark_seen(user_email, msg_id)
                    results.append(msg_data)
                    continue

                if not method:
                    mark_seen(user_email, msg_id)
                    continue

                key_id = "Session-Key"
                try:
                    plaintext_bytes = decrypt_payload(payload)
                    if not plaintext_bytes:
                        mark_seen(user_email, msg_id)
                        continue

                    if "key_id" in payload:
                        key_id = payload["key_id"]
                    elif "key_ids" in payload:
                        key_id = ",".join(payload["key_ids"])
                    elif "sender_public_hash" in payload:
                        key_id = "Secure-Handshake-Key"

                except Exception as de:
                    if "padding" not in str(de).lower():
                        print(f"Decryption error for {msg_id}: {de}")
                    # Mark undecryptable messages as seen — stop retrying
                    mark_seen(user_email, msg_id)
                    continue

                content_type = payload.get("content_type", "text")
                import time as _time
                msg_data = {
                    "id": msg_id,
                    "key_id": key_id,
                    "level": payload.get("level"),
                    "sender": payload.get("sender", "Unknown"),
                    "subject": payload.get("subject", "No Subject"),
                    "content_type": content_type,
                    "time": _time.strftime("%I:%M %p"),
                    "starred": False,
                    "read": False
                }

                if content_type == "file":
                    filename = payload.get("filename", "decrypted_file")
                    msg_data["filename"] = filename
                    msg_data["preview"] = f"[Encrypted file: {filename}]"

                    # Save file to disk for persistent download access
                    attachment_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "attachments")
                    os.makedirs(attachment_dir, exist_ok=True)
                    att_path = os.path.join(attachment_dir, f"{msg_id}_{filename}")
                    with open(att_path, "wb") as af:
                        af.write(plaintext_bytes)

                    # Build attachments array so the UI renders the download card
                    msg_data["attachments"] = [{
                        "name": filename,
                        "size": len(plaintext_bytes),
                        "type": "",
                        "download_url": f"/attachment/{msg_id}",
                        "file_data_b64": base64.b64encode(plaintext_bytes).decode("utf-8")
                    }]
                else:
                    text = plaintext_bytes.decode("utf-8", errors="ignore")
                    msg_data["decrypted_text"] = text
                    msg_data["text"] = text
                    msg_data["preview"] = text[:200]

                # Persist to disk mail store — strip binary and path fields
                store_msg = {k: v for k, v in msg_data.items() 
                             if k not in ("file_data_b64", "attachment_path")}
                try:
                    added = append_message(user_email, "inbox", store_msg)
                    if added:
                        print(f"Saved message {msg_id} to inbox for {user_email}")
                    else:
                        print(f"Message {msg_id} already in store (duplicate)")
                except Exception as store_err:
                    print(f"Failed to save message {msg_id} to mail store: {store_err}")
                mark_seen(user_email, msg_id)
                results.append(msg_data)

            except Exception as e:
                print(f"Error processing {msg_id}: {e}")
                continue

        if not results:
            return {"status": "no-new-messages", "messages": []}

        # Rotate DH key AFTER decrypting — ensures we used the correct private key
        # for all messages in this batch before generating a new one (Perfect Forward Secrecy)
        try:
            sync_identity_to_render(user_email)
        except Exception as rot_err:
            print(f" Post-receive key rotation failed (non-fatal): {rot_err}")

        latest = results[0]
        return {"status": "success", "messages": results, **latest}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


# ------------------------------------------
# MAIL STORE ENDPOINTS
# ------------------------------------------

@app.get("/mail_store")
def get_mail_store():
    """Return all folders for the active account from disk storage."""
    try:
        profile = get_user_profile()
        target_email = profile.get("email", "").lower()
        folders = get_all_folders(target_email)
        return {"status": "ok", "email": target_email, "folders": folders}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/attachment/{att_id:path}")
def get_attachment(att_id: str):
    """Serve a previously decrypted file attachment by message ID (or msg_id_index for bundles)."""
    attachment_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "attachments")
    if not os.path.exists(attachment_dir):
        return JSONResponse(status_code=404, content={"error": "No attachments directory"})
    for fname in os.listdir(attachment_dir):
        if fname.startswith(att_id + "_"):
            fpath = os.path.join(attachment_dir, fname)
            original_name = fname[len(att_id) + 1:]
            return FileResponse(fpath, filename=original_name, media_type="application/octet-stream")
    return JSONResponse(status_code=404, content={"error": "Attachment not found"})
async def sync_all_folders(request: Request):
    """
    Bulk-save all folders from the frontend into disk store.
    Called on first load to migrate any data the frontend has in memory/localStorage.
    Only saves messages that aren't already in the store (deduplicates by id).
    """
    try:
        body = await request.json()
        email = body.get("email", "").strip().lower()
        folders_data = body.get("folders", {})
        if not email:
            profile = get_user_profile()
            email = profile.get("email", "").lower()

        saved_counts = {}
        for folder, messages in folders_data.items():
            if not isinstance(messages, list):
                continue
            count = 0
            for msg in messages:
                if append_message(email, folder, msg):
                    count += 1
            saved_counts[folder] = count

        return {"status": "synced", "email": email, "saved": saved_counts}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/mail_store/sent")
async def save_sent_message(request: Request):
    """Persist a sent message to disk mail store."""
    try:
        msg = await request.json()
        profile = get_user_profile()
        email = profile.get("email", "").lower()
        added = append_message(email, "sent", msg)
        return {"status": "saved" if added else "duplicate"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/mail_store/move")
async def move_mail_message(request: Request):
    """Move a message between folders in disk store."""
    try:
        body = await request.json()
        profile = get_user_profile()
        email = profile.get("email", "").lower()
        ok = move_message(email, body["from"], body["to"], body["id"])
        return {"status": "moved" if ok else "not_found"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/mail_store/update")
async def update_mail_message(request: Request):
    """Patch fields on a message (e.g. starred, read)."""
    try:
        body = await request.json()
        profile = get_user_profile()
        email = profile.get("email", "").lower()
        update_message(email, body["folder"], body["id"], body["updates"])
        return {"status": "updated"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.delete("/mail_store/{folder}/{msg_id}")
def delete_mail_message(folder: str, msg_id: str):
    """
    Permanently delete a message from mail_store.json.
    For real Gmail IDs (inbox messages): also marks seen so it is never re-fetched.
    """
    try:
        profile = get_user_profile()
        email = profile.get("email", "").lower()
        ok = store_delete_message(email, folder, msg_id)
        # If it's a real Gmail ID, mark seen so sync never re-delivers it
        s = str(msg_id).strip()
        if len(s) > 13 and not s.isdigit():
            mark_seen(email, msg_id)
        return {"status": "deleted" if ok else "not_found"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/delete_message")
async def delete_message(request: Request):
    """
    Delete a message: removes from mail_store.json and marks seen in Gmail.
    Called by the frontend for inbox messages with real Gmail IDs.
    """
    try:
        body = await request.json()
        msg_id = str(body.get("id", "")).strip()
        folder = body.get("folder", "inbox")
        if not msg_id:
            return JSONResponse(status_code=400, content={"error": "id required"})
        profile = get_user_profile()
        email = profile.get("email", "").lower()
        store_delete_message(email, folder, msg_id)
        mark_seen(email, msg_id)
        return {"status": "deleted", "id": msg_id}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/decrypt_email")
def decrypt_email(message_id: str = Form(...)):
    try:
        payload = fetch_payload_from_email(message_id)

        if not payload:
            return {"error": "Invalid payload"}

        level = payload.get("level")
        method = payload.get("method")
        content_type = payload.get("content_type", "text")

        plaintext_bytes = None
        if level == 1 or method == "OTP":
            plaintext_bytes = decrypt_payload(payload)
        elif level == 0 or method == "NONE":
            plaintext_bytes = base64.b64decode(payload["data"])
        elif level == 2 or "key_id" in payload:
            iv = payload.get("iv")
            ciphertext = payload.get("ciphertext")
            if not iv or not ciphertext:
                return {"error": "Invalid AES payload"}
            key_bytes, _ = fetch_key_from_kme(32, "aes-256", key_id_override=payload["key_id"])
            plaintext_bytes = aes_decrypt_b64(iv, ciphertext, key_bytes)
        elif "sender_public_hash" in payload:
            plaintext_bytes = decrypt_payload(payload)
        else:
            return {"error": "Unknown encryption format"}

        if plaintext_bytes is None:
            return {"error": "Decryption failed"}

        if content_type == "file":
            import base64
            encoded = base64.b64encode(plaintext_bytes).decode('utf-8')
            return {
                "content_type": "file",
                "filename": payload.get("filename", "decrypted_file"),
                "message": encoded # Reusing 'message' field for base64 data for commonality
            }
        else:
            try:
                text = plaintext_bytes.decode('utf-8', errors="ignore")
            except Exception:
                text = "[Binary Data]"
            return {
                "content_type": "text",
                "message": text
            }

        return {"error": "Unknown encryption format"}

    except Exception as e:
        print("Decrypt Error:", e)
        return {"error": str(e)}