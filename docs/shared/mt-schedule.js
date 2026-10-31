// NOTE: an identical copy of this file lives in extension/src/shared/. If you change it here, make the same change there.
/**
 * MangaTracker — release schedule logic (shared by extension and web app).
 *
 * Weekly entries release on chosen weekdays; monthly entries on a day of the
 * month. Either kind can instead be "irregular" (releaseFreq === 0), meaning
 * there is no predictable date — those are listed separately, never in the
 * day-by-day grid.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTSchedule = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  const DAYS      = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Series states in which nothing new is going to appear on a schedule.
  const NOT_RELEASING = ['dropped', 'completed', 'season_end', 'hiatus'];

  function lastDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  // Irregular = deliberately no fixed date. Applies to weekly AND monthly
  // entries (releaseFreq 0). Ordinary entries always have releaseFreq >= 1.
  function isIrregular(entry) {
    return !!entry && entry.releaseFreq === 0;
  }

  // Is the series itself still releasing, and are you actively tracking it?
  function isTracking(entry) {
    return !!entry && !NOT_RELEASING.includes(entry.status) && entry.mode !== 'paused';
  }

  function isReleaseOnDate(entry, date) {
    if (!isTracking(entry) || isIrregular(entry)) return false;
    if (entry.releaseType === 'monthly') {
      if (!entry.releaseDayOfMonth) return false;
      // Clamp so "the 31st" still fires on 28/29/30 in shorter months.
      return date.getDate() === Math.min(entry.releaseDayOfMonth, lastDayOfMonth(date));
    }
    return !!(entry.releaseDays && entry.releaseDays.includes(date.getDay()));
  }

  function getReleasesOnDate(entries, date) {
    return entries.filter(e => isReleaseOnDate(e, date));
  }

  function getCookingReady(entries, threshold) {
    return entries.filter(e => {
      if (e.mode !== 'cooking' || e.status === 'dropped') return false;
      const latest = e.latestChapter || e.chapter || 0;
      return (latest - (e.chapter || 0)) >= (threshold || 10);
    });
  }

  function getWeekData(entries, anchorDate) {
    const base = anchorDate || new Date();
    const days = [];
    for (let i = -2; i <= 6; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push({
        date: d, dayIdx: d.getDay(),
        label: DAYS[d.getDay()], fullLabel: DAYS_FULL[d.getDay()],
        dateNum: d.getDate(),
        month: d.toLocaleString('default', { month: 'short' }),
        isPast: i < 0, isToday: i === 0,
        releases: getReleasesOnDate(entries, d),
      });
    }
    return days;
  }

  return {
    DAYS, DAYS_FULL, NOT_RELEASING,
    isIrregular, isTracking, isReleaseOnDate, getReleasesOnDate,
    getCookingReady, getWeekData, lastDayOfMonth,
  };
});
