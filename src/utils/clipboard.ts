const LOCAL_CLIPBOARD_KEY = 'swiftdrop_clipboard_text';

/**
 * Send Anywhere style Universal Session Code Formatter.
 * Accepts both 6-Digit Numeric Keys (e.g. "482-190" or "482 190")
 * and Alpha Codes (e.g. "KWM-XQP").
 * Automatically inserts a hyphen after 3 characters.
 */
export function formatUniversalSessionCode(raw: string, previousValue = ''): string {
  // Keep alphanumeric characters (0-9 and A-Z)
  const charsOnly = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);

  if (charsOnly.length === 0) {
    return '';
  }

  const isDeleting = raw.length < previousValue.length;

  if (charsOnly.length < 3) {
    return charsOnly;
  }

  if (charsOnly.length === 3) {
    const endsWithSep = /[-\s]$/.test(raw);
    if (endsWithSep && !isDeleting) {
      return `${charsOnly}-`;
    }
    return charsOnly;
  }

  return `${charsOnly.slice(0, 3)}-${charsOnly.slice(3)}`;
}

/**
 * Formats any input string into an uppercase letters-only Session Code (e.g. "KWM-XQP").
 * - Strips all numbers (0-9) and special characters
 * - Converts all letters to uppercase (A-Z)
 * - Allows '-' or space as separator after 3 letters
 */
export function formatAlphaSessionCode(raw: string, previousValue = ''): string {
  // Keep only A-Z letters
  const lettersOnly = raw.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6);

  if (lettersOnly.length === 0) {
    return '';
  }

  // If user is backspacing from "ABC-" -> "ABC", don't force the trailing hyphen back
  const isDeleting = raw.length < previousValue.length;

  if (lettersOnly.length < 3) {
    return lettersOnly;
  }

  if (lettersOnly.length === 3) {
    // If the user explicitly typed a hyphen or space after 3 letters (and isn't backspacing), show "ABC-"
    const endsWithSep = /[-\s]$/.test(raw);
    if (endsWithSep && !isDeleting) {
      return `${lettersOnly}-`;
    }
    return lettersOnly;
  }

  // 4 to 6 letters: always format as "ABC-DEF"
  return `${lettersOnly.slice(0, 3)}-${lettersOnly.slice(3)}`;
}

/**
 * Universal copy helper that works on both HTTPS/localhost (navigator.clipboard)
 * AND plain HTTP LAN IPs like http://192.168.1.3:3000 (via textarea + execCommand fallback).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    localStorage.setItem(LOCAL_CLIPBOARD_KEY, text);
  } catch {
    // Ignore storage errors
  }

  // 1. Try modern Async Clipboard API if available in Secure Context
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  // 2. Fallback for HTTP LAN IPs (e.g. http://192.168.1.3:3000)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

/**
 * Universal paste helper that works across HTTPS, localhost, and plain HTTP LAN IPs.
 */
export async function readTextFromClipboard(inputEl?: HTMLInputElement | null): Promise<string | null> {
  // 1. Try modern Async Clipboard API first
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        return text.trim();
      }
    } catch {
      // Fall through to fallbacks
    }
  }

  // 2. Try execCommand('paste') on the target input element
  if (inputEl) {
    try {
      inputEl.focus();
      const pasted = document.execCommand('paste');
      if (pasted && inputEl.value) {
        return inputEl.value;
      }
    } catch {
      // Ignore
    }
  }

  // 3. Check local cached clipboard from same browser session
  try {
    const cached = localStorage.getItem(LOCAL_CLIPBOARD_KEY);
    if (cached && cached.trim()) {
      return cached.trim();
    }
  } catch {
    // Ignore
  }

  return null;
}
