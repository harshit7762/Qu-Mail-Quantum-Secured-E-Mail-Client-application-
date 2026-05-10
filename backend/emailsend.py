import base64
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from googleapiclient.discovery import build
from gmail_auth import load_credentials


def send_email(payload: dict, recipient: str):
    """
    Sends a QuMail encrypted payload to the recipient.
    For multi_file bundles: each encrypted file is a separate MIME attachment.
    The bundle metadata (including plain_text) goes in qumail_encrypted.json.
    """
    creds = load_credentials()
    service = build("gmail", "v1", credentials=creds)

    message = MIMEMultipart()
    message["to"] = recipient
    message["subject"] = payload.get("subject") or "QuMail Secure Encrypted Message"

    body_text = (
        "You have received a secure QuMail message.\n\n"
        "This email contains an encrypted payload attachment.\n"
        "Open it in QuMail to decrypt.\n"
    )
    message.attach(MIMEText(body_text, "plain"))

    if payload.get("type") == "multi_file":
        # For bundles: store each file payload as a separate attachment
        # Keep only metadata + plain_text in the main JSON
        file_payloads = payload.get("files", [])
        meta = {
            "type": "multi_file",
            "file_count": len(file_payloads),
            "subject": payload.get("subject", ""),
            "plain_text": payload.get("plain_text", ""),
            "file_indices": list(range(len(file_payloads)))
        }
        # Main metadata JSON
        json_meta = json.dumps(meta, indent=2).encode()
        att = MIMEApplication(json_meta, _subtype="json")
        att.add_header("Content-Disposition", "attachment", filename="qumail_encrypted.json")
        message.attach(att)

        # Each file payload as a separate attachment
        for i, fp in enumerate(file_payloads):
            fp_json = json.dumps(fp, indent=2).encode()
            fp_att = MIMEApplication(fp_json, _subtype="json")
            fp_att.add_header("Content-Disposition", "attachment", filename=f"qumail_file_{i}.json")
            message.attach(fp_att)
    else:
        # Single payload — original behaviour
        json_payload = json.dumps(payload, indent=2).encode()
        attachment = MIMEApplication(json_payload, _subtype="json")
        attachment.add_header("Content-Disposition", "attachment", filename="qumail_encrypted.json")
        message.attach(attachment)

    return _execute_gmail_send(service, message)

def send_plain_file(recipient: str, file_content: bytes, filename: str):
    """
    Sends a file 'as is' via Gmail OAuth without encryption.
    """
    creds = load_credentials()
    service = build("gmail", "v1", credentials=creds)

    message = MIMEMultipart()
    message["to"] = recipient
    message["subject"] = f" QuMail Shared File: {filename}"

    body_text = f"You have received a file via QuMail: {filename}\nNote: This file was sent without additional Quantum encryption."
    message.attach(MIMEText(body_text, "plain"))

    # Determine MIME type or default to application/octet-stream
    attachment = MIMEApplication(file_content)
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    message.attach(attachment)

    return _execute_gmail_send(service, message)

def _execute_gmail_send(service, message):
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
    result = service.users().messages().send(userId="me", body={"raw": raw_message}).execute()
    return result
