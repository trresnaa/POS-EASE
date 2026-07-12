// Offset waktu GMT+8 dalam milidetik (digunakan untuk konversi ke zona waktu WIB/WITA/WIT)
const GMT_8_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * Mendapatkan string tanggal saat ini (atau tanggal tertentu) dalam format YYYY-MM-DD
 * sesuai zona waktu GMT+8 (WIB/WITA).
 * Berguna untuk input filter tanggal yang timezone-aware.
 *
 * @param {Date} [date=new Date()] - Objek Date yang akan dikonversi (default: sekarang)
 * @returns {string} String tanggal format "YYYY-MM-DD"
 */
export const getGmt8DateInput = (date = new Date()) =>
  new Date(date.getTime() + GMT_8_OFFSET_MS).toISOString().slice(0, 10)

/**
 * Menambahkan sejumlah hari ke string tanggal format "YYYY-MM-DD".
 * Menggunakan UTC Date agar tidak terpengaruh DST (Daylight Saving Time).
 *
 * @param {string} dateInput - Tanggal awal dalam format "YYYY-MM-DD"
 * @param {number} days - Jumlah hari yang ditambahkan (bisa negatif)
 * @returns {string} Tanggal baru dalam format "YYYY-MM-DD"
 */
export const addDaysToDateInput = (dateInput, days) => {
  const [year, month, day] = dateInput.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
}

/**
 * Mengkonversi rentang tanggal (from–to) ke format ISO 8601 UTC
 * dengan mempertimbangkan zona waktu GMT+8.
 * - startIso: awal hari (00:00:00 GMT+8) dikonversi ke UTC
 * - endIso:   akhir hari (23:59:59.999 GMT+8) dikonversi ke UTC
 *
 * Digunakan untuk query Supabase agar data yang diambil sesuai hari WIB.
 *
 * @param {string} from - Tanggal mulai "YYYY-MM-DD"
 * @param {string} to   - Tanggal selesai "YYYY-MM-DD"
 * @returns {{ startIso: string, endIso: string }}
 */
export const getGmt8DateRange = (from, to) => ({
  startIso: new Date(`${from}T00:00:00.000+08:00`).toISOString(),
  endIso: new Date(`${to}T23:59:59.999+08:00`).toISOString(),
})
