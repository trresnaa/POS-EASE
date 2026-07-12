/**
 * Komponen Badge \u2014 label kecil untuk menampilkan status atau kategori.
 * Mendukung beberapa variant visual: default, secondary, destructive, outline.
 *
 * Digunakan di: Dashboard.jsx (untuk menampilkan status order/payment)
 *
 * @param {'default'|'secondary'|'destructive'|'outline'} variant - Gaya visual badge
 */
import { cn } from '../../lib/utils'

const badgeVariants = {
  default: 'border-transparent bg-slate-900 text-slate-50',
  secondary: 'border-transparent bg-slate-100 text-slate-900',
  destructive: 'border-transparent bg-red-500 text-slate-50',
  outline: 'text-slate-900',
}

function Badge({ className, variant = 'default', ...props }) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
