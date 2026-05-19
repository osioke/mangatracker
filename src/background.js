chrome.runtime.onInstalled.addListener(() => {
  console.log('MangaTracker installed');
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_INFO') {
    sendResponse({ ok: true });
  }
  return true;
});
