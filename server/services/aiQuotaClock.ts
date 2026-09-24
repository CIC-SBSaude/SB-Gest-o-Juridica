const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
});
export function providerDayKey(date = new Date()) {
  const parts = Object.fromEntries(dateFormat.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function providerDayStart(date = new Date()) {
  const key = providerDayKey(date);
  // Locate the transition instead of assuming a fixed offset: DST days have 23/25 hours.
  let low = date.getTime() - 27 * 3600000, high = date.getTime();
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (providerDayKey(new Date(middle)) === key) high = middle;
    else low = middle;
  }
  return new Date(high).toISOString();
}

export function providerNextReset(date = new Date()) {
  const key = providerDayKey(date);
  let low = date.getTime();
  let high = low + 30 * 3600000;
  while (providerDayKey(new Date(high)) === key) high += 6 * 3600000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (providerDayKey(new Date(middle)) === key) low = middle;
    else high = middle;
  }
  return new Date(high).toISOString();
}
