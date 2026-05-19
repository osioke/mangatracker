const Schedule = (() => {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function getReleasesOnDay(entries, dayIndex) {
    return entries.filter(e => {
      if (!e.releaseDays || e.releaseDays.length === 0) return false;
      if (e.status === 'dropped') return false;
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
      const releases = getReleasesOnDay(entries, dayIdx);
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

  function groupByStatus(entries, todayDayIdx, cookThreshold) {
    const todayReleases = getReleasesOnDay(entries, todayDayIdx);
    const cookingReady = getCookingReady(entries, cookThreshold);
    const upToDate = entries.filter(e => {
      if (e.status === 'dropped' || e.mode === 'cooking') return false;
      const hasRelease = e.releaseDays && e.releaseDays.includes(todayDayIdx);
      return !hasRelease;
    });
    return { todayReleases, cookingReady, upToDate };
  }

  return { getWeekData, groupByStatus, DAYS, DAYS_FULL };
})();
