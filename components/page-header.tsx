import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** Optional action buttons / controls to render on the right side */
  actions?: ReactNode
  /** Optional extra element below the description (e.g. status badges, breadcrumbs) */
  meta?: ReactNode
  /** Override the container class — defaults to the standard header style */
  className?: string
}

/**
 * Standard page header used at the top of every dashboard page.
 *
 * Renders inside <main> and pairs with the sidebar's bottom border to form a
 * clean L-shape: the sidebar's `border-b` under the logo aligns horizontally
 * with this component's `border-b` underneath. The header content uses the
 * same horizontal padding as the sidebar (px-6 py-5) so left/right margins
 * line up with the nav links below the logo.
 */
export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-4 px-6 py-5 border-b bg-card',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold leading-tight truncate">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 leading-tight">{description}</p>
        )}
        {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  )
}
