export const DEFAULT_TIMEZONE = "Europe/Moscow";

let activeDisplayTimezone = DEFAULT_TIMEZONE;

export function setActiveDisplayTimezone(timeZone: string) {
  activeDisplayTimezone = timeZone || DEFAULT_TIMEZONE;
}

export function getActiveDisplayTimezone() {
  return activeDisplayTimezone;
}

export function detectDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function effectiveTimezone(
  profile: {
    timezone?: string | null;
    timezone_auto?: boolean;
    timezone_detected?: string | null;
  },
  deviceTimezone = detectDeviceTimezone()
): string {
  if (profile.timezone_auto) {
    return deviceTimezone || profile.timezone_detected || profile.timezone || DEFAULT_TIMEZONE;
  }
  return profile.timezone || DEFAULT_TIMEZONE;
}

function zoneParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || DEFAULT_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  if (map.hour === "24") map.hour = "00";
  return map;
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const map = zoneParts(instant, timeZone);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - instant.getTime();
}

/** Местные цифры `value` в поясе `timeZone` → абсолютный момент. */
export function zonedWallTimeToUtc(value: string, timeZone?: string | null): Date {
  const trimmed = (value || "").trim();
  const [datePart, rawTime = "00:00:00"] = trimmed.split(/[T ]/);
  const [year, month, day] = datePart.split("-").map(Number);
  const timePart = rawTime.replace(/Z$/, "").split("+")[0];
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map((part) => Number(part) || 0);
  const utcGuess = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour, minute, second));
  const zone = timeZone || DEFAULT_TIMEZONE;
  const offset = zoneOffsetMs(utcGuess, zone);
  let instant = new Date(utcGuess.getTime() - offset);
  const offset2 = zoneOffsetMs(instant, zone);
  if (offset2 !== offset) {
    instant = new Date(utcGuess.getTime() - offset2);
  }
  return instant;
}

export function dateKeyInTimezone(instant: Date, timeZone?: string | null): string {
  const map = zoneParts(instant, timeZone || getActiveDisplayTimezone());
  return `${map.year}-${map.month}-${map.day}`;
}

export function timeInTimezone(instant: Date, timeZone?: string | null): string {
  const map = zoneParts(instant, timeZone || getActiveDisplayTimezone());
  return `${map.hour}:${map.minute}`;
}

export function todayDateKey(timeZone?: string | null): string {
  return dateKeyInTimezone(new Date(), timeZone || getActiveDisplayTimezone());
}

export function nowInTimezone(timeZone?: string | null): { dateKey: string; time: string } {
  const zone = timeZone || getActiveDisplayTimezone();
  const now = new Date();
  return { dateKey: dateKeyInTimezone(now, zone), time: timeInTimezone(now, zone) };
}

export function transactionDateKey(
  value: string,
  txTimezone?: string | null,
  displayTimezone?: string | null
): string {
  if (!value) return "";
  const instant = zonedWallTimeToUtc(value, txTimezone || DEFAULT_TIMEZONE);
  return dateKeyInTimezone(instant, displayTimezone || getActiveDisplayTimezone());
}

export function formatTransactionDateLabel(
  value: string,
  txTimezone?: string | null,
  displayTimezone?: string | null
): string {
  const key = transactionDateKey(value, txTimezone, displayTimezone);
  if (!key || key.length < 10) return value;
  const [year, month, day] = key.split("-");
  return `${day}.${month}.${year.slice(-2)}`;
}

export function formatTransactionTimeLabel(
  value: string,
  txTimezone?: string | null,
  displayTimezone?: string | null
): string {
  if (!value || !/[T ]\d{1,2}:\d{2}/.test(value)) return "";
  const instant = zonedWallTimeToUtc(value, txTimezone || DEFAULT_TIMEZONE);
  const time = timeInTimezone(instant, displayTimezone || getActiveDisplayTimezone());
  if (time === "00:00") return "";
  return time;
}

export function hasTransactionOccurred(
  value: string,
  txTimezone?: string | null,
  now = new Date()
): boolean {
  if (!value) return false;
  return zonedWallTimeToUtc(value, txTimezone || DEFAULT_TIMEZONE).getTime() <= now.getTime();
}

export function splitWallClock(value: string): { dateKey: string; time: string } {
  const dateKey = value ? value.slice(0, 10) : "";
  const match = /[T ](\d{2}:\d{2})/.exec(value || "");
  return { dateKey, time: match ? match[1] : "00:00" };
}

const CITY_RU: Record<string, string> = {
  Moscow: "Москва",
  Kiev: "Киев",
  Paris: "Париж",
  Rome: "Рим",
  Vienna: "Вена",
  Warsaw: "Варшава",
  Prague: "Прага",
  New_York: "Нью-Йорк",
  Los_Angeles: "Лос-Анджелес",
  Mexico_City: "Мехико",
  Sao_Paulo: "Сан-Паулу",
  Buenos_Aires: "Буэнос-Айрес",
  Dubai: "Дубай",
  Tokyo: "Токио",
  Seoul: "Сеул",
  Shanghai: "Шанхай",
  Hong_Kong: "Гонконг",
  Singapore: "Сингапур",
  Calcutta: "Калькутта",
  Katmandu: "Катманду",
  Rangoon: "Янгон",
  Saigon: "Хошимин",
  Cairo: "Каир",
  Istanbul: "Стамбул",
  Athens: "Афины",
  Lisbon: "Лиссабон",
  Brussels: "Брюссель",
  Copenhagen: "Копенгаген",
  Stockholm: "Стокгольм",
  Helsinki: "Хельсинки",
  Bucharest: "Бухарест",
  Belgrade: "Белград",
  Zurich: "Цюрих",
  Havana: "Гавана",
  Ulaanbaatar: "Улан-Батор",
  Pyongyang: "Пхеньян",
  Kamchatka: "Петропавловск-Камчатский",
  Sakhalin: "Южно-Сахалинск",
  Anadyr: "Анадырь",
  Addis_Ababa: "Аддис-Абеба",
  Dar_es_Salaam: "Дар-эс-Салам",
  Godthab: "Нуук",
  Argentina: "Аргентина",
  Indiana: "Индиана",
  Kentucky: "Кентукки",
  North_Dakota: "Северная Дакота",
};

const TRANSLIT_DIGRAPHS: [string, string][] = [
  ["shch", "щ"],
  ["sch", "щ"],
  ["zh", "ж"],
  ["kh", "х"],
  ["ts", "ц"],
  ["ch", "ч"],
  ["sh", "ш"],
  ["yo", "ё"],
  ["yu", "ю"],
  ["ya", "я"],
  ["ye", "е"],
  ["ph", "ф"],
  ["th", "т"],
  ["ck", "к"],
  ["qu", "кв"],
  ["ew", "ью"],
  ["ay", "ай"],
  ["ai", "ай"],
  ["oy", "ой"],
  ["oi", "ой"],
];

const TRANSLIT_LETTERS: Record<string, string> = {
  a: "а",
  b: "б",
  c: "к",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "х",
  i: "и",
  j: "дж",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "к",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  w: "в",
  x: "кс",
  y: "й",
  z: "з",
};

function transliterateWord(word: string): string {
  const lower = word.toLowerCase();
  let index = 0;
  let out = "";
  while (index < lower.length) {
    const digraph = TRANSLIT_DIGRAPHS.find(([source]) => lower.startsWith(source, index));
    if (digraph) {
      out += digraph[1];
      index += digraph[0].length;
      continue;
    }
    const letter = lower[index];
    out += TRANSLIT_LETTERS[letter] ?? letter;
    index += 1;
  }
  if (!out) return word;
  return out.charAt(0).toLocaleUpperCase("ru") + out.slice(1);
}

export function timezoneCityName(zone: string): string {
  const parts = (zone || DEFAULT_TIMEZONE).split("/");
  const citySlug = parts[parts.length - 1] || zone;
  return russianPlaceName(citySlug);
}

function russianPlaceName(slug: string): string {
  if (CITY_RU[slug]) return CITY_RU[slug];
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map(transliterateWord)
    .join(slug.includes("_") || slug.includes("-") ? " " : "");
}

export function timezoneUtcOffset(zone: string): string {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
    }).formatToParts(new Date());
    const raw = formatted.find((part) => part.type === "timeZoneName")?.value ?? "";
    return raw.replace("GMT", "UTC");
  } catch {
    return "";
  }
}

export type TimezoneOption = {
  value: string;
  label: string;
  searchText: string;
};

export function timezoneOptions(): TimezoneOption[] {
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [DEFAULT_TIMEZONE];
  const drafts = zones.map((zone) => {
    const parts = zone.split("/");
    const citySlug = parts[parts.length - 1] || zone;
    const regionSlug = parts.length > 2 ? parts[parts.length - 2] : "";
    const city = russianPlaceName(citySlug);
    const region = regionSlug ? russianPlaceName(regionSlug) : "";
    const offset = timezoneUtcOffset(zone);
    return { value: zone, city, region, offset, citySlug };
  });
  const cityCounts = new Map<string, number>();
  drafts.forEach((item) => {
    cityCounts.set(item.city, (cityCounts.get(item.city) ?? 0) + 1);
  });
  const options = drafts.map((item) => {
    const place =
      (cityCounts.get(item.city) ?? 0) > 1 && item.region
        ? `${item.city} (${item.region})`
        : item.city;
    const label = item.offset ? `${place} — ${item.offset}` : place;
    const searchText = [place, item.city, item.region, item.citySlug.replace(/_/g, " "), item.offset, item.value]
      .join(" ")
      .toLocaleLowerCase("ru");
    return { value: item.value, label, searchText };
  });
  options.sort((a, b) => {
    if (a.value === DEFAULT_TIMEZONE) return -1;
    if (b.value === DEFAULT_TIMEZONE) return 1;
    return a.label.localeCompare(b.label, "ru");
  });
  return options;
}
