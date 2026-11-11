export function localDateAt(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function interpretDateQuery(
  text: string,
  now: Date,
  timeZone: string,
): { from: string; to: string; label: string } | null {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    timeZone = "UTC";
  }
  const today = localDateAt(now, timeZone);
  const [year, month, day] = today.split("-").map(Number);
  const lower = text.toLowerCase();

  const iso = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const date = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    return { from: date, to: date, label: date };
  }

  const named = lower.match(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/);
  if (named) {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = monthNames.findIndex((m) => named[2].startsWith(m)) + 1;
    let targetYear = named[3] ? Number(named[3]) : year;
    const targetDay = Number(named[1]);
    if (!named[3] && monthIndex > month) targetYear -= 1;
    const date = `${targetYear}-${String(monthIndex).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
    return { from: date, to: date, label: date };
  }

  const relative = lower.match(/\b(last|this|yesterday)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (relative || /\byesterday\b/.test(lower)) {
    const todayUtc = new Date(Date.UTC(year, month - 1, day));
    let offset = 1;
    if (relative) {
      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const currentWeekday = new Date(todayUtc).getUTCDay();
      const targetWeekday = weekdays.indexOf(relative[2]);
      offset = (currentWeekday - targetWeekday + 7) % 7;
      if (relative[1] === "last" && offset === 0) offset = 7;
      if (relative[1] === "this" && offset === 0) offset = 0;
      if (relative[1] === "this" && offset > currentWeekday) offset = (currentWeekday - targetWeekday + 7) % 7;
    }
    todayUtc.setUTCDate(todayUtc.getUTCDate() - offset);
    const date = todayUtc.toISOString().slice(0, 10);
    return { from: date, to: date, label: date };
  }

  return null;
}

export function dateFromTimestamp(timestamp: string, timeZone: string): string {
  return localDateAt(new Date(timestamp), timeZone);
}

function utcStartOfLocalDate(date: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const corrected = desired - (representedAsUtc - guess);
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess);
}

export function utcRangeForLocalDates(from: string, to: string, timeZone: string): { from: string; to: string } {
  try { new Intl.DateTimeFormat("en", { timeZone }); }
  catch { timeZone = "UTC"; }
  const [year, month, day] = to.split("-").map(Number);
  const dayAfterTo = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return {
    from: utcStartOfLocalDate(from, timeZone).toISOString(),
    to: utcStartOfLocalDate(dayAfterTo, timeZone).toISOString(),
  };
}
