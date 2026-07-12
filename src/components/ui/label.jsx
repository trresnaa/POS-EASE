/**
 * Komponen Label \u2014 wrapper tipis dari elemen HTML <label>.
 * Digunakan untuk menghubungkan teks label dengan elemen form (input, dll.)
 * melalui atribut `htmlFor`.
 *
 * Digunakan di: Login.jsx
 */
import { cn } from '../../lib/utils'

function Label({ className, ...props }) {
  return (
    <label
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
