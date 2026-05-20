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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_INFO') {
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'IMAGE_PICK_RESULT') {
    // Forward to all open extension views (the side panel)
    chrome.runtime.sendMessage(msg).catch(() => {});
    return true;
  }
  return true;
});
