/**
 * Utility fungsi `cn` — menggabungkan beberapa class name secara kondisional
 * menggunakan `clsx` lalu menyelesaikan konflik Tailwind CSS dengan `tailwind-merge`.
 *
 * Contoh:
 *   cn('px-2 py-1', isActive && 'bg-blue-500', 'text-sm')
 *   => 'px-2 py-1 bg-blue-500 text-sm' (jika isActive = true)
 *
 * Digunakan di semua komponen UI (button, card, input, dll.) untuk
 * menggabungkan class default dengan class override dari props.
 *
 * @param {...any} inputs - Class names atau kondisi boolean
 * @returns {string} String class name yang sudah di-merge
 */
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
