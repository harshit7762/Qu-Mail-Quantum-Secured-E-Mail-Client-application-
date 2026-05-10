import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Mail, Lock, Plus, RefreshCcw, Send, 
  FileText, Trash2, ShieldCheck, User as UserIcon, Search,
  Bell, Calendar, Star, ChevronDown, Radio, Inbox, Key,
  Paperclip, X, Download, Image, File, Menu, Clock, SendHorizontal, ShoppingCart, AlertCircle, Trash, MoreVertical, Maximize2, Minimize2, Bold, Italic, Underline, Type, AlignLeft, List, ListOrdered, Quote, RotateCcw, RotateCw, Link as LinkIcon, Smile as SmileIcon, GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONSTANTS ---
// --- CONSTANTS ---
const BACKEND_PORT = "8000";
const API_BASE = "http://" + (window.location.hostname || "localhost") + ":" + BACKEND_PORT;


const safeSetLocal = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('Storage quota exceeded for', key);
  }
};

// Returns a localStorage key scoped to the active account email
// so switching accounts never mixes up mail data
const mailKey = (suffix, email) => {
  const safe = (email || 'default').replace(/[@.]/g, '_');
  return `qumail_${safe}_${suffix}`;
};

const QuMailApp = () => {
  // --- STATE MANAGEMENT ---
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [activeTab, setActiveTab] = useState('inbox');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLessExpanded, setIsLessExpanded] = useState(false);
  const [isSecurityDropdownOpen, setIsSecurityDropdownOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [hoveredSecurity, setHoveredSecurity] = useState(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const profileMenuRef = useRef(null);
  const [emails, setEmails] = useState([]);
  const [sentEmails, setSentEmails] = useState([]);
  const [draftEmails, setDraftEmails] = useState([]);
  const [trashEmails, setTrashEmails] = useState([]);
  const [snoozedEmails, setSnoozedEmails] = useState([]);
  const [spamEmails, setSpamEmails] = useState([]);
  const [scheduledEmails, setScheduledEmails] = useState([]);
  const [purchasesEmails, setPurchasesEmails] = useState([]);

  const [userProfile, setUserProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [blockedSenders, setBlockedSenders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Compose Form State
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [securityLevel, setSecurityLevel] = useState(4);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // --- CLOSE PROFILE MENU ON OUTSIDE CLICK ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- FETCH ACCOUNTS ---
  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_BASE}/accounts`);
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (_) {}
  };

  // Open profile menu and refresh account list
  const handleOpenProfileMenu = () => {
    setIsProfileMenuOpen(prev => {
      if (!prev) fetchAccounts();
      return !prev;
    });
  };

  // --- SWITCH ACCOUNT ---
  const handleSwitchAccount = async (email) => {
    if (userProfile?.email === email) return;
    try {
      const res = await fetch(`${API_BASE}/switch_account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.status === 'switched') {
        setIsProfileMenuOpen(false);
        // Load this account's mail — backend active account is now updated
        await loadMailFromDisk(email);
        const profileRes = await fetch(`${API_BASE}/me`);
        const profile = await profileRes.json();
        if (profile && !profile.error) setUserProfile(profile);
      } else {
        alert(data.error || 'Could not switch account.');
      }
    } catch (e) {
      alert('Switch failed: ' + e.message);
    }
  };

  // --- REMOVE ACCOUNT (permanent delete from all files) ---
  const handleRemoveAccount = async (emailToRemove) => {
    const target = emailToRemove || userProfile?.email;
    const isActive = target === userProfile?.email;
    const confirmed = window.confirm(
      `Remove ${target} from QuMail?\n\nThis will permanently delete its token and encryption keys from all files. This cannot be undone.`
    );
    if (!confirmed) return;

    setIsProfileMenuOpen(false);
    try {
      const res = await fetch(`${API_BASE}/remove_account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target })
      });
      const data = await res.json();
      if (data.status === 'removed') {
        await fetchAccounts();
        if (data.new_active) {
          // Switch UI to the new active account
          const profileRes = await fetch(`${API_BASE}/me`);
          const profile = await profileRes.json();
          if (profile && !profile.error) setUserProfile(profile);
        } else {
          // No accounts left — go to login
          window.location.href = `${API_BASE}/login`;
        }
      } else {
        alert(data.error || 'Could not remove account.');
      }
    } catch (e) {
      alert('Remove failed: ' + e.message);
    }
  };

  // --- VERIFY FILES ---
  const handleVerifyFiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/verify_files`);
      const data = await res.json();
      const lines = Object.entries(data.files).map(([name, info]) => {
        const status = info.exists ? `✅ ${info.size_bytes}B` : '❌ MISSING';
        const extra = info.accounts ? ` [${info.accounts.join(', ')}]` : '';
        return `${status}  ${name}${extra}`;
      });
      alert(`File Verification\n\n${lines.join('\n')}\n\ntoken.json format: ${data.files['token.json']?.format || 'unknown'}`);
    } catch (e) {
      alert('Verify failed: ' + e.message);
    }
  };

  // --- ADD ACCOUNT ---
  const handleAddAccount = async () => {
    setIsAddingAccount(true);
    try {
      const res = await fetch(`${API_BASE}/add_account`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'added') {
        await fetchAccounts();
        await handleSwitchAccount(data.email);
      } else {
        alert(data.error || 'Could not add account.');
      }
    } catch (e) {
      alert('Add account failed: ' + e.message);
    } finally {
      setIsAddingAccount(false);
    }
  };

  // --- LOGOUT (sign out = remove current account) ---
  const handleLogout = async (emailToRemove) => {
    await handleRemoveAccount(emailToRemove || userProfile?.email);
  };

  // --- 1. INITIALIZATION: FETCH USER PROFILE ---
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${API_BASE}/me`);
        if (!response.ok) throw new Error("Status " + response.status);
        const data = await response.json();
        if (data && !data.error) {
          setUserProfile(data);
          setIsBackendOnline(true);
        }
      } catch (err) {
        setIsBackendOnline(false);
      }
    };
    fetchProfile();
  }, []);

  // --- PUSH CURRENT STATE TO DISK (migration / sync) ---
  const syncStateToDisk = async (emailHint) => {
    const em = emailHint || userProfile?.email;
    if (!em) return;

    // Try per-account keys first, then fall back to legacy global keys
    const load = (suffix, legacyKey) => {
      try {
        // New per-account key
        const newKey = mailKey(suffix, em);
        const newVal = localStorage.getItem(newKey);
        if (newVal) return JSON.parse(newVal);
        // Legacy global key (old format before per-account storage)
        if (legacyKey) {
          const oldVal = localStorage.getItem(legacyKey);
          if (oldVal) return JSON.parse(oldVal);
        }
        return [];
      } catch { return []; }
    };

    const folders = {
      inbox:     load('inbox',     'qumail_inbox_items'),
      sent:      load('sent',      'qumail_sent_items'),
      drafts:    load('drafts',    'qumail_draft_items'),
      trash:     load('trash',     'qumail_trash_items'),
      snoozed:   load('snoozed',   'qumail_snoozed_items'),
      spam:      load('spam',      'qumail_spam_items'),
      scheduled: load('scheduled', 'qumail_scheduled_items'),
      purchases: load('purchases', 'qumail_purchases_items'),
    };
    const hasAny = Object.values(folders).some(arr => arr.length > 0);
    if (!hasAny) return;
    try {
      await fetch(`${API_BASE}/mail_store/sync_all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, folders })
      });
    } catch (_) {}
  };

  // --- 1b. LOAD MAIL DATA FROM DISK STORE ---
  const loadMailFromDisk = async (emailHint) => {
    const em = emailHint || userProfile?.email;

    const loadLocal = (suffix, legacyKey) => {
      try {
        const v = localStorage.getItem(mailKey(suffix, em));
        if (v) return JSON.parse(v);
        if (legacyKey) {
          const v2 = localStorage.getItem(legacyKey);
          if (v2) return JSON.parse(v2);
        }
        return [];
      } catch { return []; }
    };

    try {
      // No email query param — backend reads active account from token.json
      // (switch_account already updated it before this is called)
      const res = await fetch(`${API_BASE}/mail_store`);
      const data = await res.json();

      if (data.status === 'ok' && data.folders) {
        const f = data.folders;
        const hasData = Object.values(f).some(arr => arr.length > 0);

        if (hasData) {
          setEmails(f.inbox || []);
          setSentEmails(f.sent || []);
          setDraftEmails(f.drafts || []);
          setTrashEmails(f.trash || []);
          setSnoozedEmails(f.snoozed || []);
          setSpamEmails(f.spam || []);
          setScheduledEmails(f.scheduled || []);
          setPurchasesEmails(f.purchases || []);
        } else {
          // Disk empty — migrate from localStorage then reload
          await syncStateToDisk(em);
          const res2 = await fetch(`${API_BASE}/mail_store`);
          const data2 = await res2.json();
          if (data2.status === 'ok' && data2.folders) {
            const f2 = data2.folders;
            setEmails(f2.inbox || []);
            setSentEmails(f2.sent || []);
            setDraftEmails(f2.drafts || []);
            setTrashEmails(f2.trash || []);
            setSnoozedEmails(f2.snoozed || []);
            setSpamEmails(f2.spam || []);
            setScheduledEmails(f2.scheduled || []);
            setPurchasesEmails(f2.purchases || []);
          }
        }
      }
    } catch (e) {
      console.warn('Disk store unavailable, loading from localStorage:', e);
      setEmails(loadLocal('inbox', 'qumail_inbox_items'));
      setSentEmails(loadLocal('sent', 'qumail_sent_items'));
      setDraftEmails(loadLocal('drafts', 'qumail_draft_items'));
      setTrashEmails(loadLocal('trash', 'qumail_trash_items'));
      setSnoozedEmails(loadLocal('snoozed', 'qumail_snoozed_items'));
      setSpamEmails(loadLocal('spam', 'qumail_spam_items'));
      setScheduledEmails(loadLocal('scheduled', 'qumail_scheduled_items'));
      setPurchasesEmails(loadLocal('purchases', 'qumail_purchases_items'));
    }
    setSelectedEmail(null);
  };

  useEffect(() => {
    if (!userProfile?.email) return;
    loadMailFromDisk(userProfile.email);
  }, [userProfile?.email]);

  // --- 2. SYNC & REFRESH LOGIC ---
  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      // NOTE: Receive BEFORE syncing/rotating keys.
      // The /sync endpoint rotates the DH private key for Perfect Forward Secrecy.
      // If we rotate first, the new private key won't match the sender's encrypted payload
      // (encrypted with the OLD public key), causing decryption to silently fail.
      // The backend now handles key rotation automatically after a successful receive.
      const response = await fetch(`${API_BASE}/receive_email`);
      const data = await response.json();

      if (data.status === 'no-new-messages' || data.status === 'empty') {
        // Still reload from disk in case there are persisted messages not yet in state
        await loadMailFromDisk(userProfile?.email);
        setIsLoading(false);
        return;
      }

      const newMessages = data.messages || [];
      if (newMessages.length > 0) {
        setEmails(prev => {
          const existingIds = new Set(prev.map(e => String(e.id)));
          const toAdd = newMessages.filter(m => !existingIds.has(String(m.id)));
          return toAdd.length > 0 ? [...toAdd, ...prev] : prev;
        });
      }
      // Reload from disk to ensure full consistency with what was saved
      await loadMailFromDisk(userProfile?.email);
    } catch (err) {
      console.warn("Refresh/Sync skipped:", err.message);
      setIsBackendOnline(false);
      alert("Note: Backend is offline. Could not sync new messages.");
    } finally {
      setIsLoading(false);
    }
  };
// --- TOGGLE STAR ---
  const toggleStar = (e, emailId, isInbox) => {
    e.stopPropagation();
    if (isInbox) {
      setEmails(prev => {
        const updated = prev.map(m => m.id === emailId ? { ...m, starred: !m.starred } : m);
        safeSetLocal(mailKey('inbox', userProfile?.email), JSON.stringify(updated));
        return updated;
      });
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(prev => ({ ...prev, starred: !prev.starred }));
      }
    } else {
      setSentEmails(prev => {
        const updated = prev.map(m => m.id === emailId ? { ...m, starred: !m.starred } : m);
        safeSetLocal(mailKey('sent', userProfile?.email), JSON.stringify(updated));
        return updated;
      });
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(prev => ({ ...prev, starred: !prev.starred }));
      }
    }
  };

  // --- MOVE TO TRASH ---
  const moveToTrash = (emailId) => {

    if (activeTab === 'inbox') {
      // Permanently remove from inbox in mail_store.json
      fetch(`${API_BASE}/mail_store/inbox/${emailId}`, { method: 'DELETE' }).catch(() => {});
      // For real Gmail IDs — also block from re-appearing on sync
      if (String(emailId).length > 13 && !String(emailId).match(/^\d{13}$/)) {
        fetch(`${API_BASE}/delete_message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: String(emailId), folder: 'inbox' })
        }).catch(() => {});
      }
      setEmails(prev => prev.filter(e => e.id !== emailId));

    } else if (activeTab === 'sent') {
      // Permanently remove from sent in mail_store.json
      fetch(`${API_BASE}/mail_store/sent/${emailId}`, { method: 'DELETE' }).catch(() => {});
      setSentEmails(prev => prev.filter(e => e.id !== emailId));

    } else if (activeTab === 'drafts') {
      fetch(`${API_BASE}/mail_store/drafts/${emailId}`, { method: 'DELETE' }).catch(() => {});
      setDraftEmails(prev => prev.filter(e => e.id !== emailId));

    } else if (activeTab === 'starred') {
      const inboxMail = emails.find(e => e.id === emailId);
      const sentMail = sentEmails.find(e => e.id === emailId);
      if (inboxMail) {
        fetch(`${API_BASE}/mail_store/inbox/${emailId}`, { method: 'DELETE' }).catch(() => {});
        if (String(emailId).length > 13 && !String(emailId).match(/^\d{13}$/)) {
          fetch(`${API_BASE}/delete_message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: String(emailId), folder: 'inbox' })
          }).catch(() => {});
        }
        setEmails(prev => prev.filter(e => e.id !== emailId));
      } else if (sentMail) {
        fetch(`${API_BASE}/mail_store/sent/${emailId}`, { method: 'DELETE' }).catch(() => {});
        setSentEmails(prev => prev.filter(e => e.id !== emailId));
      }

    } else if (activeTab === 'trash') {
      fetch(`${API_BASE}/mail_store/trash/${emailId}`, { method: 'DELETE' }).catch(() => {});
      setTrashEmails(prev => prev.filter(e => e.id !== emailId));
      setSelectedEmail(null);
      return;
    }

    setSelectedEmail(null);
  };

  const emptyTrash = () => {
    if (window.confirm("Are you sure you want to permanently delete all messages in the bin?")) {
      trashEmails.forEach(mail => {
        fetch(`${API_BASE}/mail_store/trash/${mail.id}`, { method: 'DELETE' }).catch(() => {});
      });
      setTrashEmails([]);
      setSelectedEmail(null);
    }
  };


  // --- TOGGLE IMPORTANT ---
  const toggleImportant = (e, emailId) => {
    if (e) e.stopPropagation();
    const update = (list) => list.map(m => m.id === emailId ? { ...m, important: !m.important } : m);
    setEmails(prev => {
      const updated = update(prev);
      safeSetLocal(mailKey('inbox', userProfile?.email), JSON.stringify(updated));
      return updated;
    });
    setSentEmails(prev => {
      const updated = update(prev);
      safeSetLocal(mailKey('sent', userProfile?.email), JSON.stringify(updated));
      return updated;
    });
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(prev => ({ ...prev, important: !prev.important }));
    }
  };

  // --- MOVE TO SPAM ---
  const moveToSpam = (emailId) => {
    let emailToMove = emails.find(e => e.id === emailId) || sentEmails.find(e => e.id === emailId);
    if (!emailToMove) return;

    setEmails(prev => {
        const updated = prev.filter(e => e.id !== emailId);
        safeSetLocal(mailKey('inbox', userProfile?.email), JSON.stringify(updated));
        return updated;
    });
    setSentEmails(prev => {
        const updated = prev.filter(e => e.id !== emailId);
        safeSetLocal(mailKey('sent', userProfile?.email), JSON.stringify(updated));
        return updated;
    });
    setSpamEmails(prev => {
        const updated = [emailToMove, ...prev];
        safeSetLocal(mailKey('spam', userProfile?.email), JSON.stringify(updated));
        return updated;
    });
    setSelectedEmail(null);
    alert("Reported as Spam");
  };

  // --- TOGGLE READ ---
  const toggleRead = (e, emailId, forceState = null) => {
    if (e) e.stopPropagation();
    const update = (list) => list.map(m => m.id === emailId ? { ...m, read: forceState !== null ? forceState : !m.read } : m);
    setEmails(prev => {
      const updated = update(prev);
      safeSetLocal(mailKey('inbox', userProfile?.email), JSON.stringify(updated));
      return updated;
    });
    setSentEmails(prev => {
      const updated = update(prev);
      safeSetLocal(mailKey('sent', userProfile?.email), JSON.stringify(updated));
      return updated;
    });
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(prev => ({ ...prev, read: forceState !== null ? forceState : !prev.read }));
    }
  };

  // --- MOVE TO SNOOZED ---
  const moveToSnoozed = (emailId) => {
    let emailToMove = emails.find(e => e.id === emailId) || sentEmails.find(e => e.id === emailId);
    if (!emailToMove) return;

    setEmails(prev => {
        const updated = prev.filter(e => e.id !== emailId);
        safeSetLocal(mailKey('inbox', userProfile?.email), JSON.stringify(updated));
        return updated;
    });
    setSnoozedEmails(prev => {
        const updated = [{...emailToMove, snoozedAt: Date.now()}, ...prev];
        safeSetLocal(mailKey('snoozed', userProfile?.email), JSON.stringify(updated));
        return updated;
    });
    setSelectedEmail(null);
    alert("Message snoozed until tomorrow");
  };

  // --- MOVE TO SCHEDULED ---
  const moveToScheduled = (emailId) => {
    let emailToMove = emails.find(e => e.id === emailId) || sentEmails.find(e => e.id === emailId);
    if (!emailToMove) return;

    setEmails(prev => prev.filter(e => e.id !== emailId));
    setScheduledEmails(prev => {
        const updated = [{...emailToMove, scheduledTime: 'Tomorrow at 8:00 AM'}, ...prev];
        safeSetLocal(mailKey('scheduled', userProfile?.email), JSON.stringify(updated));
        return updated;
    });
    setSelectedEmail(null);
    alert("Message scheduled");
  };

  // --- SAVE DRAFT ---
  const handleSaveDraft = () => {
    if (!recipient && !message) {
      setIsComposeOpen(false);
      return;
    }
    const newDraft = {
      id: Date.now(),
      sender: userProfile?.name || "Me",
      recipient: recipient || "(No Recipient)",
      subject: subject || "(No Subject)",
      preview: message || "(Empty Message)",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      level: securityLevel,
      starred: false
    };
    setDraftEmails(prev => {
      const updated = [newDraft, ...prev];
      safeSetLocal(mailKey('drafts', userProfile?.email), JSON.stringify(updated));
      return updated;
    });
    setIsComposeOpen(false);
    setMessage('');
    setRecipient('');
    setSubject('');
    alert("Saved as Draft");
  };

  // --- 3. SEND SECURE MESSAGE ---
  const handleSendMessage = async (e, forcedLevel = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const activeLevel = forcedLevel !== null ? forcedLevel : securityLevel;

    if (!recipient) return alert("Please enter a recipient.");
    if (!message && attachedFiles.length === 0) return alert("Please enter a message or attach a file.");

    // CHECK: Level 1 (OTP) is strictly text-only
    if (activeLevel === 1 && attachedFiles.length > 0) {
      alert("⚠️ Level 1 (OTP) is strictly text-only. Please remove your attachments or choose a different security level (L2, L3, or L4) to send files.");
      setIsSecurityDropdownOpen(false);
      return;
    }

    setIsLoading(true);
    setIsProcessing(true);

    try {
      const storedAttachments = [];

      const hasText = !!message;
      const hasFiles = attachedFiles.length > 0 && activeLevel > 1;

      if (hasText && !hasFiles) {
        // TEXT ONLY — encrypt and send as single email
        const encryptData = new FormData();
        encryptData.append('level', activeLevel);
        encryptData.append('message', message);
        encryptData.append('subject', subject);
        encryptData.append('recipient_email', recipient);

        const encRes = await fetch(`${API_BASE}/encrypt`, { method: 'POST', body: encryptData });
        const payload = await encRes.json();

        const sendRes = await fetch(`${API_BASE}/send_email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient, payload })
        });
        const result = await sendRes.json();
        if (result.status !== 'sent') throw new Error(result.error || 'Text send failed');

      } else if (hasFiles) {
        // FILES (with optional text) — encrypt everything and send as one bundle email
        const encryptedFiles = [];
        for (const f of attachedFiles) {
          const result = await encryptFile(f, activeLevel, recipient);
          encryptedFiles.push({ result, file: f });
          storedAttachments.push({
            name: f.name,
            size: f.size,
            type: f.type,
            file_data_b64: result.fileDataB64
          });
        }

        // // Always use bundle so text + files arrive as one email
        // plain_text stored directly in bundle JSON (protected by file encryption)
        const sendRes = await fetch(`${API_BASE}/send_email_bundle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient,
            subject: subject || '',
            payloads: encryptedFiles.map(e => e.result.payload),
            plain_text: message || ''
          })
        });
        const resJson = await sendRes.json();
        if (resJson.status !== 'sent') throw new Error(resJson.error || 'Send failed');

      } else if (attachedFiles.length > 0 && activeLevel === 1) {
        alert("L1 (OTP) is text-only. Your attached files were NOT sent. Please switch to L2, L3, or L4 for file encryption.");
      }

      alert(`✅ Sent with Level ${activeLevel} security.${storedAttachments.length ? ` ${storedAttachments.length} file(s) secured & sent.` : ''}`);


      // Store in sent items � save to disk store
      const newSentMail = {
        id: Date.now(),
        sender: userProfile?.email || "Me",
        senderName: userProfile?.name || "Me",
        recipient: recipient,
        subject: subject || "Encrypted Sent Message",
        preview: message || `[${attachedFiles.length} file(s) encrypted]`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        level: activeLevel,
        starred: false,
        read: true,
        attachments: storedAttachments
      };
      // 1. Save to backend disk store
      fetch(`${API_BASE}/mail_store/sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSentMail)
      }).catch(() => {});

      // 2. Save to localStorage as backup so syncStateToDisk can find it
      setSentEmails(prev => {
        const updated = [newSentMail, ...prev];
        safeSetLocal(mailKey('sent', userProfile?.email), JSON.stringify(updated));
        return updated;
      });
      setIsComposeOpen(false);
      setMessage('');
      setRecipient('');
      setSubject('');
      setAttachedFiles([]);
    } catch (err) {
      alert("Encryption/Transmission failed: " + err.message);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  const encryptFile = async (fileObj, level, toRecipient) => {
    if (level === 1) return; // OTP text only
    
    // Set to encrypting
    setAttachedFiles(prev => prev.map(f => 
      f.id === fileObj.id ? { ...f, status: 'encrypting', error: null } : f
    ));

    try {
      const encryptData = new FormData();
      encryptData.append('level', level);
      encryptData.append('subject', subject || "");
      encryptData.append('recipient_email', toRecipient || recipient);
      encryptData.append('file', fileObj.file);

      const fetchOptions = {
        method: 'POST',
        body: encryptData,
        mode: 'cors',
        cache: 'no-cache'
      };

      const encRes = await fetch(`${API_BASE}/encrypt`, fetchOptions);
      if (!encRes.ok) {
        const errData = await encRes.json().catch(() => ({}));
        throw new Error(errData.error || `Server Error (${encRes.status})`);
      }
      
      const payload = await encRes.json();

      // Read for local Sent folder persistence
      const fileDataB64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsDataURL(fileObj.file);
      });

      setAttachedFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { 
          ...f, 
          status: 'secured', 
          payload, 
          file_data_b64: fileDataB64 
        } : f
      ));
      return { payload, fileDataB64 };
    } catch (err) {
      console.error("❌ Encryption Error:", err);
      setAttachedFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { ...f, status: 'error', error: err.message } : f
      ));
      throw err;
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      
      const newFiles = selected.map(file => {
        const id = Math.random().toString(36).substr(2, 9);
        const isImage = file.type.startsWith('image/');
        const previewUrl = isImage ? URL.createObjectURL(file) : null;
        
        return {
          id,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'uploading', // Initial state
          previewUrl,
          payload: null
        };
      });

      setAttachedFiles(prev => [...prev, ...newFiles]);
      e.target.value = '';

      // Simulate a brief upload sequence for "uploaded" feel
      for (const f of newFiles) {
        await new Promise(r => setTimeout(r, 400));
        setAttachedFiles(prev => prev.map(item => 
          item.id === f.id ? { ...item, status: 'attached' } : item
        ));
      }
    }
  };

  // We removed the auto-encryption useEffect to follow the "Encypt while sending" model.



  return (
    <div className="flex flex-col h-screen bg-background text-gray-800 font-sans overflow-hidden">
      {/* Hidden File Input for Attachments */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        multiple 
        className="opacity-0 w-0 h-0 absolute pointer-events-none" 
      />

      {/* Top Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-3">
        <div className="glass-navbar pill-capsule h-16 flex items-center px-6 shadow-lg max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3 w-[240px]">
            <img src="/logo.png" alt="QuMail Logo" className="w-11 h-11 object-contain drop-shadow-sm mix-blend-multiply" />
            <h1 className="text-[22px] font-bold tracking-tight text-gray-900 drop-shadow-sm">QuMail</h1>
          </div>

          <div className="flex-1 flex justify-center px-8">
            <div className="bg-white/40 hover:bg-white/50 transition-all flex items-center rounded-2xl h-11 px-4 w-full max-w-2xl border border-white/20 group focus-within:bg-white focus-within:shadow-inner focus-within:border-white/40">
              <Search className="w-5 h-5 text-gray-900 group-focus-within:text-black mr-3" />
              <input 
                type="text" 
                placeholder="Search mail" 
                className="bg-transparent border-none outline-none text-black focus:text-black placeholder-black/60 focus:placeholder-black/80 w-full text-[15px] font-medium" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 w-[240px] justify-end">
            <button 
              onClick={handleRefresh} 
              title="Sync Secure" 
              className="p-2.5 hover:bg-white/20 rounded-full transition-colors relative group"
            >
              <RefreshCcw className={`w-[18px] h-[18px] text-white ${isLoading ? 'animate-spin' : ''}`}/>
              {isLoading && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>}
            </button>
            <button className="p-2.5 hover:bg-white/20 rounded-full transition-colors text-white"><Radio className="w-[18px] h-[18px]" /></button>
            <button className="p-2.5 hover:bg-white/20 rounded-full transition-colors text-white"><Bell className="w-[18px] h-[18px]" /></button>
            <button className="p-2.5 hover:bg-white/20 rounded-full transition-colors text-white mr-2"><Calendar className="w-[18px] h-[18px]" /></button>
            
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={handleOpenProfileMenu}
                className="relative cursor-pointer focus:outline-none"
                title={userProfile?.email || "Account"}
              >
                <div className="w-10 h-10 rounded-full bg-white text-gray-900 flex items-center justify-center font-bold text-sm shadow-md ring-2 ring-white/20 hover:ring-white transition-all overflow-hidden border-2 border-gray-100/10">
                  {userProfile?.name?.charAt(0).toUpperCase() || <UserIcon size={20} />}
                </div>
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-nav ${isBackendOnline ? 'bg-green-500' : 'bg-red-500 grayscale'}`}></div>
              </button>

              {/* Profile Dropdown */}
              <AnimatePresence>
                {isProfileMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-14 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[200] overflow-hidden"
                  >
                    {/* Header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-[13px] font-bold text-gray-700">Accounts</span>
                      <span className="text-[11px] text-gray-400">{accounts.length} signed in</span>
                    </div>

                    {/* Account List */}
                    <div className="max-h-64 overflow-y-auto">
                      {accounts.length === 0 && (
                        <div className="px-5 py-4 text-[13px] text-gray-400 text-center">Loading accounts...</div>
                      )}
                      {accounts.map(acc => (
                        <div
                          key={acc.email}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group ${acc.active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          onClick={() => handleSwitchAccount(acc.email)}
                        >
                          {/* Avatar */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${acc.active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                            {acc.name?.charAt(0).toUpperCase() || <UserIcon size={18} />}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-900 truncate">{acc.name || acc.email}</p>
                            <p className="text-[11px] text-gray-500 truncate">{acc.email}</p>
                          </div>
                          {/* Active badge */}
                          {acc.active && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></div>
                          )}
                          {/* Remove button — always visible on hover for all accounts */}
                          <button
                            onClick={e => { e.stopPropagation(); handleRemoveAccount(acc.email); }}
                            title="Remove account"
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add Account */}
                    <div className="border-t border-gray-100">
                      <button
                        onClick={handleAddAccount}
                        disabled={isAddingAccount}
                        className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                      >
                        {isAddingAccount ? (
                          <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                            <Plus size={12} className="text-gray-600" />
                          </div>
                        )}
                        {isAddingAccount ? 'Opening Google sign-in...' : 'Add another account'}
                      </button>
                    </div>

                    {/* Sign out current */}
                    <div className="border-t border-gray-100">
                      <button
                        onClick={() => handleRemoveAccount(userProfile?.email)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={15} className="text-red-400" />
                        Remove {userProfile?.email?.split('@')[0]}
                      </button>
                      <button
                        onClick={async () => {
                          setIsProfileMenuOpen(false);
                          try {
                            const res = await fetch(`${API_BASE}/sync`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ email: userProfile?.email })
                            });
                            const d = await res.json();
                            if (d.status === 'success') {
                              alert('✅ Quantum identity synced to cloud. Your public keys are now registered.');
                            } else {
                              alert('⚠️ Sync failed: ' + (d.error || 'Unknown error'));
                            }
                          } catch (e) {
                            alert('⚠️ Could not reach backend: ' + e.message);
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100"
                      >
                        <ShieldCheck size={14} className="text-blue-500" />
                        Sync Quantum Identity
                      </button>
                      <button
                        onClick={handleVerifyFiles}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-gray-500 hover:bg-gray-50 transition-colors border-t border-gray-100"
                      >
                        <ShieldCheck size={14} className="text-gray-400" />
                        Verify credential files
                      </button>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                      <p className="text-[11px] text-gray-400 text-center">QuMail · Quantum-Safe Email</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 pt-[88px] overflow-hidden">
        {/* Sidebar */}
        <motion.aside 
          initial={false}
          animate={{ width: isSidebarCollapsed ? 70 : 260 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="bg-background flex flex-col pt-2 shrink-0 overflow-x-hidden border-r border-[#CFCFCF]/50"
        >
          <div className={`px-4 mb-6 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4'}`}>
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-600"
            >
              <Menu size={20} />
            </button>
          </div>

          <div className="px-3 mb-6">
            <motion.button 
              whileHover={{ scale: 1.02, backgroundColor: "#E8EBEE" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsComposeOpen(true)}
              className={`flex items-center bg-white shadow-sm hover:shadow-md border border-gray-100 text-gray-800 transition-all ${
                isSidebarCollapsed ? 'w-12 h-12 justify-center rounded-2xl' : 'w-fit px-6 py-4 rounded-compose gap-4'
              }`}
            >
              <Plus className="w-6 h-6 text-gray-700" strokeWidth={2.5} />
              {!isSidebarCollapsed && <span className="font-semibold text-[15px]">Compose</span>}
            </motion.button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-2">
            <NavItem icon={Inbox} label="Inbox" count={emails.length} active={activeTab === 'inbox'} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('inbox'); setSelectedEmail(null);}} />
            <NavItem icon={Star} label="Starred" active={activeTab === 'starred'} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('starred'); setSelectedEmail(null);}} />
            <NavItem icon={Clock} label="Snoozed" active={activeTab === 'snoozed'} count={snoozedEmails.length} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('snoozed'); setSelectedEmail(null);}} />
            <NavItem icon={SendHorizontal} label="Sent" count={sentEmails.length} active={activeTab === 'sent'} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('sent'); setSelectedEmail(null);}} />
            <NavItem icon={FileText} label="Drafts" count={draftEmails.length} active={activeTab === 'drafts'} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('drafts'); setSelectedEmail(null);}} />
            <NavItem icon={ShoppingCart} label="Purchases" active={activeTab === 'purchases'} count={purchasesEmails.length} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('purchases'); setSelectedEmail(null);}} />

            <SectionHeader 
              label="Less" 
              isExpanded={isLessExpanded} 
              onToggle={() => setIsLessExpanded(!isLessExpanded)} 
              collapsed={isSidebarCollapsed}
            />
            
            <AnimatePresence>
              {(isLessExpanded || isSidebarCollapsed) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <NavItem icon={AlertCircle} label="Important" active={activeTab === 'important'} count={[...emails, ...sentEmails].filter(e => e.important).length} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('important'); setSelectedEmail(null);}} />
                  <NavItem icon={Clock} label="Scheduled" active={activeTab === 'scheduled'} count={scheduledEmails.length} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('scheduled'); setSelectedEmail(null);}} />
                  <NavItem icon={Mail} label="All Mail" active={activeTab === 'all'} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('all'); setSelectedEmail(null);}} />
                  <NavItem icon={AlertCircle} label="Spam" active={activeTab === 'spam'} count={spamEmails.length} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('spam'); setSelectedEmail(null);}} />
                  <NavItem icon={Trash2} label="Bin" active={activeTab === 'trash'} count={trashEmails.length} collapsed={isSidebarCollapsed} onClick={() => {setActiveTab('trash'); setSelectedEmail(null);}} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quantum Key Vault */}
          {!isSidebarCollapsed && (
            <div className="mt-auto px-4 pb-6 pt-4 shrink-0">
              <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-4 shadow-lg border border-gray-800 relative overflow-hidden group">
                {/* Background effect */}
                <div className="absolute -right-4 -top-8 w-24 h-24 bg-blue-500 rounded-full mix-blend-screen filter blur-[20px] opacity-20 group-hover:opacity-30 transition-opacity"></div>
                
                <div className="flex items-center gap-2 mb-3 relative z-10">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                    <Key size={12} className="text-blue-400" />
                  </div>
                  <span className="text-[12px] font-bold text-white tracking-wide uppercase">Key Vault</span>
                </div>
                
                <div className="flex items-end gap-1.5 relative z-10">
                  <span className="text-3xl font-black text-white leading-none">50</span>
                  <span className="text-[11px] font-medium text-gray-400 mb-1 leading-none uppercase tracking-wider">Active Keys</span>
                </div>
                
                {/* Progress bar mock */}
                <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden relative z-10">
                  <div className="absolute inset-y-0 left-0 w-[50%] bg-gradient-to-r from-blue-500 to-indigo-400"></div>
                </div>
              </div>
            </div>
          )}
        </motion.aside>

        {/* Middle Email List */}
        <div className="w-[320px] bg-white border-r border-[#CFCFCF] flex flex-col shrink-0 flex-1 sm:flex-none">
          <div className="h-14 flex items-center px-6 border-b border-gray-100 shrink-0">
            <h2 className="text-[20px] font-medium text-gray-800 capitalize leading-none">
              {activeTab === 'sent' ? 'Sent' : 
               activeTab === 'trash' ? 'Bin' : 
               activeTab === 'all' ? 'All Mail' : 
               activeTab}
            </h2>
            {activeTab === 'trash' && trashEmails.length > 0 && (
              <button 
                onClick={emptyTrash}
                className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all text-[12px] font-bold border border-red-100"
              >
                <Trash size={14} />
                Empty Bin
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {(() => {
              let displayList = [];
              if (activeTab === 'inbox') displayList = emails;
              else if (activeTab === 'sent') displayList = sentEmails;
              else if (activeTab === 'starred') displayList = [...emails, ...sentEmails].filter(e => e.starred);
              else if (activeTab === 'drafts') displayList = draftEmails;
              else if (activeTab === 'trash') displayList = trashEmails;
              else if (activeTab === 'snoozed') displayList = snoozedEmails;
              else if (activeTab === 'spam') displayList = spamEmails;
              else if (activeTab === 'scheduled') displayList = scheduledEmails;
              else if (activeTab === 'important') displayList = [...emails, ...sentEmails].filter(e => e.important);
              else if (activeTab === 'purchases') displayList = purchasesEmails;
              else if (activeTab === 'all') displayList = [...emails, ...sentEmails, ...draftEmails, ...snoozedEmails, ...spamEmails, ...scheduledEmails, ...purchasesEmails];

              // Filter blocked and search
              displayList = displayList.filter(e => !blockedSenders.includes(e.sender));
              if (searchQuery) {
                const q = searchQuery.toLowerCase();
                displayList = displayList.filter(e => 
                  e.subject.toLowerCase().includes(q) || 
                  e.sender.toLowerCase().includes(q) || 
                  e.preview.toLowerCase().includes(q)
                );
              }

              if (displayList.length === 0) {
                return (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center animate-fade-in">
                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 transition-transform hover:scale-110">
                      <Mail className="w-8 h-8 opacity-40 text-gray-400" />
                    </div>
                    <p className="text-[15px] font-medium text-gray-500">No {activeTab} messages.</p>
                    <p className="text-[12px] opacity-70 mt-1">Click Sync icon on top right to fetch.</p>
                  </div>
                );
              }

              return displayList.map(email => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={email.id} 
                  onClick={() => {
                    setSelectedEmail(email);
                    if (!email.read) {
                      const updateStore = (list) => list.map(e => e.id === email.id ? {...e, read: true} : e);
                      setEmails(prev => {
                        const updated = updateStore(prev);
                        safeSetLocal(mailKey('inbox', userProfile?.email), JSON.stringify(updated));
                        return updated;
                      });
                      setSentEmails(prev => {
                        const updated = updateStore(prev);
                        safeSetLocal(mailKey('sent', userProfile?.email), JSON.stringify(updated));
                        return updated;
                      });
                    }
                  }}
                  className={`relative group px-4 py-4 border-b border-gray-100 cursor-pointer transition-all ${
                    selectedEmail?.id === email.id 
                    ? 'shadow-[inset_4px_0_0_0_#1A73E8] bg-blue-50' 
                    : email.read 
                      ? 'bg-green-100/50 hover:bg-green-100/70' 
                      : 'bg-red-100/50 hover:bg-red-100/70'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex flex-col gap-1 items-center mt-0.5">
                      <div onClick={(e) => toggleStar(e, email.id, emails.some(m => m.id === email.id))}>
                         <Star className={`w-[18px] h-[18px] cursor-pointer transition-all ${email.starred ? 'text-[#F4B400] fill-[#F4B400]' : 'text-gray-300 group-hover:text-gray-400'}`} />
                      </div>
                      <div onClick={(e) => toggleImportant(e, email.id)}>
                         <Lock className={`w-3.5 h-3.5 cursor-pointer transition-all ${email.important ? 'text-blue-600 fill-blue-600' : 'text-gray-300 group-hover:text-gray-400'}`} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1 group relative">
                        <span className={`text-[14px] truncate pr-2 ${selectedEmail?.id === email.id ? 'text-blue-700 font-bold' : 'text-gray-900 font-semibold'}`}>
                          {(emails.some(m => m.id === email.id)) ? email.sender : `To: ${email.recipient}`}
                        </span>
                        <span className="text-[11px] text-gray-500 whitespace-nowrap mt-0.5 shrink-0">{email.time}</span>
                        
                        {/* Hover Subject Tooltip for Unread Messages */}
                        {!email.read && (
                          <div className="fixed opacity-0 group-hover:opacity-100 bg-[#333333] text-white text-[12px] font-medium px-3 py-1.5 rounded shadow-lg pointer-events-none transition-opacity duration-200 z-[999] whitespace-nowrap pointer-events-none hidden sm:block"
                               style={{ top: '50%', left: '50%', transform: 'translate(-50%, -200%)', position: 'absolute' }}>
                            {email.subject}
                            <div className="absolute -bottom-[4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-[#333333] rotate-45"></div>
                          </div>
                        )}
                      </div>
                      <h4 className="text-[13px] font-medium text-gray-700 truncate mb-1">{email.subject}</h4>
                      <p className="text-[12px] text-gray-500 line-clamp-2 leading-relaxed">{email.preview}</p>
                      
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          email.level === 4 ? 'bg-purple-100/80 text-purple-700 border border-purple-200' : 
                          email.level === 3 ? 'bg-blue-100/80 text-blue-700 border border-blue-200' : 
                          email.level === 2 ? 'bg-green-100/80 text-green-700 border border-green-200' :
                          'bg-amber-100/80 text-amber-700 border border-amber-200'
                        }`}>
                          L{email.level}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            })()}
          </div>
        </div>

        {/* Email Content Panel */}
        <div className="flex-1 bg-white overflow-hidden flex flex-col min-w-0">
          <AnimatePresence mode="wait">
            {selectedEmail ? (
              <motion.div 
                key={selectedEmail.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-1 flex-col overflow-y-auto scrollbar-thin pb-20"
              >
                <div className="h-14 flex items-center justify-between px-8 border-b border-gray-100 sticky top-0 bg-white z-10 shrink-0">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedEmail(null)} className="p-2 hover:bg-gray-100 rounded-full sm:hidden mr-2"><RotateCcw size={18}/></button>
                    <button 
                      onClick={() => moveToTrash(selectedEmail.id)} 
                      className="p-2 hover:bg-gray-100 rounded-full" 
                      title="Delete"
                    >
                      <Trash2 size={18} className="text-gray-500 hover:text-red-500" />
                    </button>
                    <button 
                      onClick={() => moveToSnoozed(selectedEmail.id)}
                      className="p-2 hover:bg-gray-100 rounded-full" 
                      title="Snooze"
                    >
                      <Clock size={18} className="text-gray-500" />
                    </button>
                    <button 
                      onClick={() => moveToSpam(selectedEmail.id)}
                      className="p-2 hover:bg-gray-100 rounded-full" 
                      title="Report Spam"
                    >
                      <AlertCircle size={18} className="text-gray-500" />
                    </button>
                    <div className="w-[1px] h-6 bg-gray-200 mx-2"></div>
                    <button 
                      onClick={(e) => toggleRead(e, selectedEmail.id)}
                      className="p-2 hover:bg-gray-100 rounded-full" 
                      title={selectedEmail.read ? "Mark as unread" : "Mark as read"}
                    >
                      <Mail size={18} className="text-gray-500" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] text-gray-500 mr-4">1 of 1</span>
                    <button className="p-2 hover:bg-gray-100 rounded-full text-gray-400 disabled:opacity-30"><RotateCcw size={16} className="-rotate-90"/></button>
                    <button className="p-2 hover:bg-gray-100 rounded-full text-gray-400 disabled:opacity-30"><RotateCw size={16} className="rotate-90"/></button>
                    
                    {/* MORE MENU (3 DOTS) */}
                    <div className="relative">
                      <button 
                        onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                        className={`p-2 hover:bg-gray-100 rounded-full transition-colors ${isMoreMenuOpen ? 'bg-gray-100' : ''}`}
                      >
                        <MoreVertical size={18} className="text-gray-500" />
                      </button>
                      
                      <AnimatePresence>
                        {isMoreMenuOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMoreMenuOpen(false)}></div>
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 10 }}
                              className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 overflow-hidden"
                            >
                              {activeTab === 'sent' ? (
                                // SENT MENU OPTIONS
                                <>
                                  <MenuOption label="Reply" onClick={() => { setIsComposeOpen(true); setRecipient(selectedEmail.recipient); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Forward" onClick={() => { setIsComposeOpen(true); setMessage(`---------- Forwarded message ---------\nFrom: ${selectedEmail.sender}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.preview}`); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Delete" onClick={() => { moveToTrash(selectedEmail.id); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Mark as unread" onClick={() => { toggleRead(null, selectedEmail.id, false); setIsMoreMenuOpen(false); }} />
                                  <div className="h-[1px] bg-gray-100 my-1"></div>
                                  <MenuOption label="Report spam" onClick={() => { moveToSpam(selectedEmail.id); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Filter messages like this" onClick={() => { setSearchQuery(selectedEmail.recipient); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Translate" onClick={() => { alert("Translating message..."); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Print" onClick={() => { window.print(); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Download message" onClick={() => { 
                                     const blob = new Blob([`Subject: ${selectedEmail.subject}\nFrom: ${selectedEmail.sender}\nTo: ${selectedEmail.recipient}\n\n${selectedEmail.preview}`], {type: 'text/plain'});
                                     const url = URL.createObjectURL(blob);
                                     const a = document.createElement('a');
                                     a.href = url;
                                     a.download = `email_${selectedEmail.id}.txt`;
                                     a.click();
                                     setIsMoreMenuOpen(false);
                                  }} />
                                </>
                              ) : (
                                // INBOX MENU OPTIONS
                                <>
                                  <MenuOption label="Reply" onClick={() => { setIsComposeOpen(true); setRecipient(selectedEmail.sender); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Forward" onClick={() => { setIsComposeOpen(true); setMessage(`---------- Forwarded message ---------\nFrom: ${selectedEmail.sender}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.preview}`); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Delete" onClick={() => { moveToTrash(selectedEmail.id); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Mark as unread" onClick={() => { toggleRead(null, selectedEmail.id, false); setIsMoreMenuOpen(false); }} />
                                  <div className="h-[1px] bg-gray-100 my-1"></div>
                                  <MenuOption label="Block sender" onClick={() => { setBlockedSenders(prev => [...prev, selectedEmail.sender]); setSelectedEmail(null); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Report spam" onClick={() => { moveToSpam(selectedEmail.id); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Report phishing" onClick={() => { moveToSpam(selectedEmail.id); alert("Phishing reported."); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Filter messages like this" onClick={() => { setSearchQuery(selectedEmail.sender); setIsMoreMenuOpen(false); }} />
                                  <div className="h-[1px] bg-gray-100 my-1"></div>
                                  <MenuOption label="Print" onClick={() => { window.print(); setIsMoreMenuOpen(false); }} />
                                  <MenuOption label="Download message" onClick={() => { 
                                     const blob = new Blob([`Subject: ${selectedEmail.subject}\nFrom: ${selectedEmail.sender}\nTo: ${userProfile?.email}\n\n${selectedEmail.preview}`], {type: 'text/plain'});
                                     const url = URL.createObjectURL(blob);
                                     const a = document.createElement('a');
                                     a.href = url;
                                     a.download = `email_${selectedEmail.id}.txt`;
                                     a.click();
                                     setIsMoreMenuOpen(false);
                                  }} />
                                </>
                              )}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                <div className="p-8 max-w-4xl mx-auto w-full">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-[24px] font-medium text-gray-900 mb-6 leading-tight">{selectedEmail.subject}</h2>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg shadow-sm border border-blue-200 shrink-0">
                          {activeTab === 'inbox' || activeTab === 'trash' ? (selectedEmail.sender ? selectedEmail.sender.charAt(0).toUpperCase() : 'U') : (selectedEmail.recipient ? selectedEmail.recipient.charAt(0).toUpperCase() : 'M')}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <p className="font-bold text-gray-900 text-[15px] truncate">
                              {(activeTab === 'inbox' || activeTab === 'trash') ? selectedEmail.sender : `To: ${selectedEmail.recipient}`}
                            </p>
                            <span className="text-[12px] text-gray-500 font-normal">
                              &lt;{(activeTab === 'inbox' || activeTab === 'trash') ? selectedEmail.sender : selectedEmail.recipient}&gt;
                            </span>
                          </div>
                          <p className="text-[13px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                            to me 
                            <ChevronDown size={12} className="cursor-pointer" />
                            <span className="mx-1">•</span> 
                            {selectedEmail.level === 1 ? 'Shielded OTP' : selectedEmail.level === 3 ? 'Post-Quantum' : selectedEmail.level === 4 ? 'Quantum-Hybrid' : 'QS-AES'} 
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-[13px] text-gray-500">{selectedEmail.time}</span>
                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-gray-100 rounded-full" title="Reply"><RotateCcw size={18} className="text-gray-500"/></button>
                        <button className="p-2 hover:bg-gray-100 rounded-full" title="More"><MoreVertical size={18} className="text-gray-500"/></button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-[#3c4043] whitespace-pre-wrap leading-[1.6] text-[15px] pl-16">
                    {selectedEmail.decrypted_text || selectedEmail.preview}
                  </div>

                  {/* Attachments Section */}
                  {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                    <div className="mt-12 pl-16 pt-8 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
                          <Paperclip size={16} /> 
                          {selectedEmail.attachments.length} Attachments
                        </h4>
                        <button className="text-[12px] font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">Download all</button>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {selectedEmail.attachments.map((att, idx) => (
                           <motion.div 
                            key={idx}
                            whileHover={{ y: -2 }}
                            className="group relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50 hover:bg-white hover:shadow-lg transition-all"
                           >
                              <div className="aspect-[4/3] flex items-center justify-center bg-white/50">
                                 {att.name?.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? (
                                    <Image className="w-10 h-10 text-blue-400 opacity-40" />
                                 ) : (
                                    <FileText className="w-10 h-10 text-gray-300 opacity-40" />
                                 )}
                              </div>
                              <div className="p-3 bg-white border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <p className="text-[13px] font-semibold text-gray-800 truncate">{att.name}</p>
                                    <p className="text-[11px] text-gray-500">{(att.size / 1024 || 0).toFixed(1)} KB</p>
                                  </div>
                                  <button 
                                    onClick={() => {
                                      if (att.file_data_b64) {
                                        // In-memory base64 — direct download
                                        const byteChars = atob(att.file_data_b64);
                                        const byteArr = new Uint8Array(byteChars.length);
                                        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
                                        const blob = new Blob([byteArr]);
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = att.name || 'attachment';
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } else if (att.download_url) {
                                        // Fetch from backend disk store
                                        fetch(`${API_BASE}${att.download_url}`)
                                          .then(r => r.blob())
                                          .then(blob => {
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = att.name || 'attachment';
                                            a.click();
                                            URL.revokeObjectURL(url);
                                          })
                                          .catch(() => alert('Download failed. File may no longer be available.'));
                                      }
                                    }}
                                    className="p-2 bg-gray-100 hover:bg-blue-600 hover:text-white rounded-lg transition-colors text-gray-600"
                                  >
                                    <Download size={16} />
                                  </button>
                                </div>
                              </div>
                           </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-12 pl-16 flex gap-4">
                    <button className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-full text-[14px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      <RotateCcw size={16} /> Reply
                    </button>
                    <button className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-full text-[14px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      <SendHorizontal size={16} /> Forward
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center p-12 text-center"
              >
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-blue-100 rounded-full blur-2xl opacity-50 animate-pulse"></div>
                  <img src="/logo.png" alt="QuMail Logo" className="relative w-[140px] h-[140px] object-contain drop-shadow-xl mix-blend-multiply z-10" />
                </div>
                <h3 className="text-[22px] font-bold text-gray-800 mb-2">Select an item to read</h3>
                <p className="text-[15px] text-gray-500 max-w-[280px]">Nothing is selected. Pick an email from the left list to view its secure content.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      
      {/* COMPOSE MODAL */}
      <AnimatePresence>
        {isComposeOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-[720px] h-[640px] flex flex-col overflow-hidden border border-gray-200 relative"
            >
              {/* Processing Overlay */}
              <AnimatePresence>
                {isProcessing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-[120] flex flex-col items-center justify-center"
                  >
                    <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                    <h3 className="text-[18px] font-bold text-gray-900">Encrypting Content...</h3>
                    <p className="text-[14px] text-gray-500 mt-1">Applying Quantum-Safe Protection</p>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Header */}
              <div className="bg-[#F1F3F4] px-4 py-2 flex items-center justify-between shrink-0">
                <span className="text-[14px] font-bold text-gray-700">New Message</span>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Minimize2 size={14}/></button>
                  <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Maximize2 size={14}/></button>
                  <button onClick={() => setIsComposeOpen(false)} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><X size={14}/></button>
                </div>
              </div>

              {/* Fields */}
              <div className="px-4 py-1 flex flex-col divide-y divide-[#E0E0E0]">
                <div className="flex items-center py-2.5">
                  <span className="text-[14px] text-gray-500 w-12">To</span>
                  <input 
                    type="email" 
                    value={recipient} 
                    onChange={(e) => setRecipient(e.target.value)}
                    className="flex-1 outline-none text-[14px] text-gray-800"
                  />
                  <div className="flex gap-3 text-[12px] text-gray-500 font-medium">
                    <button className="hover:underline">Cc</button>
                    <button className="hover:underline">Bcc</button>
                  </div>
                </div>
                <div className="flex items-center py-2.5">
                  <input 
                    type="text" 
                    placeholder="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="flex-1 outline-none text-[14px] text-gray-800"
                  />
                </div>
              </div>

              {/* Editor */}
              <div className="flex-1 p-4 overflow-y-auto min-h-[300px]">
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="QuMail: Secure encryption begins here..."
                  className="w-full h-full outline-none resize-none text-[14px] text-[#3c4043] font-medium leading-[1.6]"
                />
              </div>

              {/* Attachments Preview */}
              {attachedFiles.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-50 flex flex-wrap gap-2 max-h-48 overflow-y-auto bg-gray-50/50">
                  {attachedFiles.map((f, idx) => (
                    <div key={f.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1.5 pr-3 group shadow-sm transition-all hover:border-blue-200 min-w-[200px]">
                      {/* Image Thumbnail or Icon */}
                      {f.previewUrl ? (
                        <div className="w-10 h-10 rounded border border-gray-100 overflow-hidden shrink-0">
                          <img src={f.previewUrl} alt="preview" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
                          <FileText size={20} className="text-gray-400" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-gray-700 truncate">{f.name}</span>
                          {f.status === 'secured' && <ShieldCheck size={12} className="text-green-500" title="Secured" />}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[9px] text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                          
                          {/* Status Indicators */}
                          {f.status === 'uploading' && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 border-2 border-gray-100 border-t-gray-400 rounded-full animate-spin"></div>
                              <span className="text-[9px] text-gray-500 font-medium italic">Uploading...</span>
                            </div>
                          )}
                          {f.status === 'attached' && (
                            <div className="flex items-center gap-1">
                              <Shield size={10} className="text-gray-400" />
                              <span className="text-[9px] text-gray-600 font-bold">Ready</span>
                            </div>
                          )}
                          {f.status === 'encrypting' && (
                            <div className="flex items-center gap-1">
                              <div className="w-2.5 h-2.5 border-2 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                              <span className="text-[9px] text-blue-500 font-bold">Securing...</span>
                            </div>
                          )}
                          {f.status === 'error' && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-red-500 font-bold">Failed</span>
                            </div>
                          )}
                          {f.status === 'secured' && (
                            <span className="text-[9px] text-green-600 font-bold italic">Secured & Ready</span>
                          )}
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                          setAttachedFiles(prev => prev.filter(item => item.id !== f.id));
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        <X size={16}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Toolbar & Actions */}
              <div className="bg-white px-4 py-3 border-t border-gray-100 flex flex-col gap-3">
                {/* Formatting Toolbar */}
                <div className="bg-[#F1F3F4]/80 p-1 rounded-full flex items-center justify-between">
                  <div className="flex items-center gap-0.5 ml-1">
                    <button className="p-1.5 hover:bg-gray-200 rounded-full text-gray-600"><RotateCcw size={14}/></button>
                    <button className="p-1.5 hover:bg-gray-200 rounded-full text-gray-600"><RotateCw size={14}/></button>
                    <div className="w-[1px] h-4 bg-gray-300 mx-1"></div>
                    <button className="px-2 py-0.5 hover:bg-gray-200 rounded text-[12px] text-gray-600 font-semibold flex items-center gap-1">Sans Serif <ChevronDown size={10}/></button>
                    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><Type size={14}/></button>
                    <div className="w-[1px] h-4 bg-gray-300 mx-1"></div>
                    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><Bold size={14}/></button>
                    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><Italic size={14}/></button>
                    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><Underline size={14}/></button>
                    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><AlignLeft size={14}/></button>
                    <div className="w-[1px] h-4 bg-gray-300 mx-1"></div>
                    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><List size={14}/></button>
                    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><ListOrdered size={14}/></button>
                    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><Quote size={14}/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 shrink-0 relative">
                    {/* Send Button & Dropdown */}
                    <div className="relative">
                      <button 
                        onClick={() => setIsSecurityDropdownOpen(!isSecurityDropdownOpen)}
                        className="bg-primary hover:bg-blue-700 text-white font-bold text-[14px] px-6 py-2.5 rounded-full flex items-center gap-3 transition-all shadow-lg hover:shadow-blue-200/50"
                      >
                        Send <ChevronDown size={16} className={`transition-transform duration-200 ${isSecurityDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {isSecurityDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-[105]" onClick={() => setIsSecurityDropdownOpen(false)}></div>
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: -20 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              className="absolute bottom-full left-0 mb-4 w-[280px] bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 overflow-visible z-[110]"
                            >
                              <div className="p-3 flex flex-col gap-1 relative">
                                {[
                                  { id: 1, label: 'OTP (One Time Pad) - Text Only', icon: '🔑', bg: 'bg-blue-100/50', text: 'text-blue-700', tipDetails: 'Strictly for text messages. Uses a secret one-time key generated locally.\nNote: Attachments are NOT supported in L1.' },
                                  { id: 2, label: 'QAES (Quantum AES)', icon: '🛡️', bg: 'bg-green-100/50', text: 'text-green-700', tipDetails: 'Quantum-safe AES encryption using QKD-seeded keys from KME.\nBest for highly secure file and text transmission.' },
                                  { id: 3, label: 'PQC (Post-Quantum ML-KEM)', icon: '🌀', bg: 'bg-purple-100/50', text: 'text-purple-700', tipDetails: 'Uses Post-Quantum ML-KEM key encapsulation.\nFuture-proof security against quantum computer threats.' },
                                  { id: 4, label: 'DH (Secure Key Handshake)', icon: '☁️', bg: 'bg-amber-100/50', text: 'text-amber-700', tipDetails: 'Secure Cloud-based Diffie-Hellman key exchange.\nEstablishes a private encrypted channel via the Cloud Identity server.' }
                                ].map(opt => (
                                  <div 
                                    key={opt.id}
                                    onMouseEnter={() => setHoveredSecurity(opt.id)}
                                    onMouseLeave={() => setHoveredSecurity(null)}
                                    onClick={(e) => {
                                      setSecurityLevel(opt.id);
                                      setIsSecurityDropdownOpen(false);
                                      handleSendMessage(e, opt.id);
                                    }}
                                    className="relative group flex items-center h-[52px] px-3 rounded-xl hover:bg-white cursor-pointer transition-all duration-200"
                                  >
                                    <div className={`w-9 h-9 rounded-full ${opt.bg} flex items-center justify-center mr-3 shadow-sm border border-white/50 shrink-0`}>
                                      <span className="text-lg leading-none filter drop-shadow-sm">{opt.icon}</span>
                                    </div>
                                    <div className="flex flex-col justify-center">
                                      <span className="text-[14px] font-bold text-gray-800 leading-tight">L{opt.id} – {opt.label.split(' (')[0]}</span>
                                      <span className={`text-[11px] font-medium leading-tight ${opt.text}`}>
                                        {opt.label.includes('(') ? '(' + opt.label.split('(')[1] : ''}
                                      </span>
                                    </div>
                                    
                                    {/* Tooltip */}
                                    <AnimatePresence>
                                      {hoveredSecurity === opt.id && (
                                        <motion.div 
                                          initial={{ opacity: 0, x: 10, scale: 0.95 }}
                                          animate={{ opacity: 1, x: 0, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.95 }}
                                          transition={{ duration: 0.15, ease: "easeOut" }}
                                          className="absolute left-[calc(100%+16px)] top-1/2 -translate-y-1/2 bg-[#1A1A1A] text-white px-4 py-3 rounded-xl text-[13px] w-[260px] shadow-2xl z-[120] pointer-events-none border border-white/10"
                                        >
                                          <div className="flex items-center gap-2 mb-1.5 border-b border-white/10 pb-1.5">
                                            <span className="text-base">{opt.icon}</span>
                                            <p className="font-bold text-white tracking-wide">L{opt.id} – {opt.label.split(' (')[0]}</p>
                                          </div>
                                          <p className="opacity-80 leading-relaxed whitespace-pre-line text-[12px]">{opt.tipDetails}</p>
                                          
                                          {/* Arrow */}
                                          <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-[#1A1A1A] rotate-45 border-l border-b border-white/10"></div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center gap-0.5 ml-2">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-500" 
                        title="Attach files"
                      >
                        <Paperclip size={18}/>
                      </button>
                      <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><LinkIcon size={18}/></button>
                      <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><SmileIcon size={18}/></button>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                      >
                        <Image size={18}/>
                      </button>
                      <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Lock size={18}/></button>
                      <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><MoreVertical size={18}/></button>
                    </div>
                  </div>

                  <button className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={20}/>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

// Redesigned Components
const NavItem = ({ icon: Icon, label, count, active, collapsed, onClick }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, backgroundColor: "rgba(201, 212, 232, 0.4)" }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative flex items-center h-10 px-3 mx-2 my-0.5 rounded-full cursor-pointer transition-colors duration-150 ${
        active ? 'bg-active text-gray-900 font-semibold' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      <div className={`flex items-center justify-center ${collapsed ? 'w-full' : 'mr-4'}`}>
        <Icon className={`w-[18px] h-[18px] ${active ? 'text-gray-900' : 'text-gray-600'}`} strokeWidth={active ? 2.5 : 2} />
      </div>
      
      {!collapsed && (
        <>
          <span className="flex-1 text-[13.5px] truncate">{label}</span>
          {count > 0 && (
            <span className={`text-[11px] font-medium ${active ? 'text-gray-900' : 'text-gray-500'}`}>
              {count}
            </span>
          )}
        </>
      )}

      {collapsed && (
        <div className="absolute left-full ml-4 px-2 py-1 bg-gray-800 text-white text-[11px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
          {label}
        </div>
      )}
    </motion.div>
  );
};

const SectionHeader = ({ label, isExpanded, onToggle, collapsed }) => {
  if (collapsed) return <div className="h-4" />;
  
  return (
    <div 
      onClick={onToggle}
      className="flex items-center px-6 py-2 mt-2 text-gray-500 hover:text-gray-900 cursor-pointer group"
    >
      <ChevronDown className={`w-3.5 h-3.5 mr-2 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
      <span className="text-[12px] font-bold uppercase tracking-wider">{label}</span>
    </div>
  );
};

const MenuOption = ({ label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-4 py-2 text-[14px] transition-colors hover:bg-gray-100 ${danger ? 'text-red-600' : 'text-gray-700'}`}
  >
    {label}
  </button>
);

export default QuMailApp;