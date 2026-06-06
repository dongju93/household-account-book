import { cn } from '../lib/cn'
import { won } from '../lib/format'

/** Tabular-figure money label. `withSign` prefixes "+" for positive values. */
export function Won({
  value,
  withSign,
  className,
}: {
  value: number
  withSign?: boolean
  className?: string
}) {
  return <span className={cn('tnum', className)}>{won(value, withSign)}</span>
}
