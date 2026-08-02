chrome.runtime.onInstalled.addListener(() => {
  console.log('MangaTracker installed');
});

// Open the side panel when the toolbar icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── Relay IMAGE_PICK_RESULT from content script → side panel ──────────────────
// Content scripts can't message specific windows directly; they broadcast to
// the runtime and the background worker forwards to all extension views.
//
// NOTE: this listener used to also answer GET_PAGE_INFO with a dummy
// `{ ok: true }` response. GET_PAGE_INFO is sent via chrome.tabs.sendMessage,
// which delivers to *every* runtime.onMessage listener in the extension —
// including this one, not just the content script's. Since only the first
// sendResponse() call for a message "wins", that stray handler could
// intermittently beat the content script's real page-info response and hand
// the popup `{ ok: true }` instead of the actual title/image/genres, which is
// why auto-detection was flaky. It's been removed — this file has no
// business answering that message at all.
//
// Also: the old code did `return true` unconditionally, even for message
// types it never responds to. `return true` tells Chrome "I will call
// sendResponse asynchronously", and if that promise is never kept, Chrome
// logs "A listener indicated an asynchronous response by returning true, but
// the message channel closed before a response was received." That's the
// exact error visible in the console screenshots. Now we only return true
// when there's actually a response in flight (there isn't one here, since
// IMAGE_PICK_RESULT is fire-and-forget), and false otherwise.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'IMAGE_PICK_RESULT') {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
  return false;
});
