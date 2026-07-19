import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils'

/**
 * Button — the ecosystem's primary action. Every color is a semantic token, so
 * it rebrands and dark-modes for free. The press micro-interaction (scale) and
 * hover shadow reference the shared motion feel and honor reduced-motion.
 */
const buttonVariants = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
    'transition-[background-color,box-shadow,border-color,transform,color] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    'active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
    'disabled:pointer-events-none disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-fg shadow-sm hover:bg-primary-hover hover:shadow active:bg-primary-active',
        outline:
          'border border-border bg-surface text-fg shadow-sm hover:border-border-strong hover:bg-surface-hover active:bg-surface-hover',
        ghost: 'text-fg hover:bg-surface-hover active:bg-bg-subtle',
        subtle: 'bg-primary-subtle text-primary hover:bg-primary-subtle/70 active:bg-primary-subtle/60',
        secondary: 'bg-bg-subtle text-fg hover:bg-surface-hover active:bg-border-subtle',
        destructive:
          'bg-danger text-danger-fg shadow-sm hover:bg-danger/90 active:bg-danger/80',
        link: 'text-primary underline-offset-4 hover:underline focus-visible:ring-offset-0',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4 py-2',
        lg: 'h-11 px-6 text-[0.9375rem]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Render onto the single child element instead of a <button>. */
    asChild?: boolean
  }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className)

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{
        className?: string
        ref?: React.Ref<HTMLElement>
      }>
      return React.cloneElement(child, {
        ...props,
        ref: ref as React.Ref<HTMLElement>,
        className: cn(classes, child.props.className),
      })
    }

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
