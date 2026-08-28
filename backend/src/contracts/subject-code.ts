/**
 * Creates a stable subject code from the first letter of every word.
 * Vietnamese diacritics are removed so the result is suitable for a code.
 * Examples: "Vật lí" -> "VL", "Khoa học tự nhiên" -> "KHTN".
 */
export function deriveSubjectCode(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
}
