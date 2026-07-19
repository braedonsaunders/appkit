import * as React from 'react'
import { cn } from './utils'

export type SwitchProps = React.InputHTMLAttributes<HTMLInputElement>

/**
 * Switch — an accessible checkbox styled as a toggle. Pure CSS (peer), so it's
 * server-renderable and works controlled or uncontrolled. The knob stays light
 * in both themes by convention.
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, disabled, ...props }, ref) => (
    <label
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <input ref={ref} type="checkbox" role="switch" className="peer sr-only" disabled={disabled} {...props} />
      <span className="absolute inset-0 rounded-full bg-border-strong transition-colors duration-200 peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg" />
      <span className="pointer-events-none absolute left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out peer-checked:translate-x-5 motion-reduce:transition-none" />
    </label>
  ),
)
Switch.displayName = 'Switch'
