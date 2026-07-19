const unsafeFilename = /[<>:"/\\|?*]/gu;

function replaceSheetCharacters(value: string): string {
  let output = value;
  for (const character of ["\\", "/", "?", "*", "[", "]", ":"]) {
    output = output.replaceAll(character, "_");
  }
  return output;
}

export function safeFilename(value: string): string {
  const withoutControls = Array.from(value, (character) => character.charCodeAt(0) < 32 ? "_" : character).join("");
  const sanitized = withoutControls.replace(unsafeFilename, "_").replace(/\s+/gu, "_").slice(0, 80);
  return sanitized.length > 0 ? sanitized : "未命名";
}

export function safeSheetName(value: string, used: Set<string>): string {
  const base = (replaceSheetCharacters(value).trim() || "未命名").slice(0, 31);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase("zh-CN"))) {
    const suffixText = `_${suffix}`;
    candidate = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  used.add(candidate.toLocaleLowerCase("zh-CN"));
  return candidate;
}

export function timestampForFilename(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}${lookup.month}${lookup.day}-${lookup.hour}${lookup.minute}`;
}
