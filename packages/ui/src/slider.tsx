import * as React from 'react'
import { cn } from './utils'

export type SliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * Slider — a tokenized range input for bounded, imprecise values (percent
 * complete, opacity, weighting). It stays a native `<input type="range">` so
 * keyboard, touch, and assistive-technology behaviour come for free; only the
 * track and thumb are restyled, through `accent-color`.
 *
 * For an exact number, use `Input type="number"` — a slider says "roughly
 * this much", and dressing up a precise field as one loses that meaning.
 */
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Slider.displayName = 'Slider'
