const Schedule = (() => {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Clamp a target day-of-month to the actual length of the given month, so
  // "the 31st" still fires on Feb 28/29, Apr 30, etc. instead of never.
  function lastDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  // Does this entry release on this specific calendar date?
  // Weekly entries (default): true if the date's weekday is in releaseDays.
  // Monthly entries: true if the date's day-of-month matches releaseDayOfMonth
  // (clamped to the month's real length).
  function isReleaseOnDate(entry, date) {
    if (!entry || entry.status === 'dropped') return false;
    if (entry.releaseType === 'monthly') {
      if (!entry.releaseDayOfMonth) return false;
      const target = Math.min(entry.releaseDayOfMonth, lastDayOfMonth(date));
      return date.getDate() === target;
    }
    return !!(entry.releaseDays && entry.releaseDays.includes(date.getDay()));
  }

  function getReleasesOnDate(entries, date) {
    return entries.filter(e => isReleaseOnDate(e, date));
  }

  // Back-compat helper for weekly-only lookups by weekday index (0-6).
  // Prefer getReleasesOnDate()/isReleaseOnDate() where an actual date is
  // available, since weekday-only lookups can't represent monthly entries.
  function getReleasesOnDay(entries, dayIndex) {
    return entries.filter(e => {
      if (!e.releaseDays || e.releaseDays.length === 0) return false;
      if (e.status === 'dropped') return false;
      if (e.releaseType === 'monthly') return false;
      return e.releaseDays.includes(dayIndex);
    });
  }

  function getCookingReady(entries, threshold) {
    return entries.filter(e => {
      if (e.mode !== 'cooking') return false;
      if (e.status === 'dropped') return false;
      const latestKnown = e.latestChapter || e.chapter;
      const myChapter = e.chapter || 0;
      return (latestKnown - myChapter) >= (threshold || 10);
    });
  }

  function getWeekData(entries, anchorDate) {
    const base = anchorDate || new Date();
    const days = [];
    for (let i = -2; i <= 6; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dayIdx = d.getDay();
      const releases = getReleasesOnDate(entries, d);
      days.push({
        date: d,
        dayIdx,
        label: DAYS[dayIdx],
        fullLabel: DAYS_FULL[dayIdx],
        dateNum: d.getDate(),
        month: d.toLocaleString('default', { month: 'short' }),
        isPast: i < 0,
        isToday: i === 0,
        releases
      });
    }
    return days;
  }

  function groupByStatus(entries, todayDayIdx, cookThreshold, todayDate) {
    const today = todayDate || new Date();
    const todayReleases = todayDate ? getReleasesOnDate(entries, today) : getReleasesOnDay(entries, todayDayIdx);
    const cookingReady = getCookingReady(entries, cookThreshold);
    const upToDate = entries.filter(e => {
      if (e.status === 'dropped' || e.mode === 'cooking') return false;
      return !isReleaseOnDate(e, today);
    });
    return { todayReleases, cookingReady, upToDate };
  }

  return { getWeekData, groupByStatus, getReleasesOnDate, getReleasesOnDay, isReleaseOnDate, DAYS, DAYS_FULL };
})();
