import { BRAND } from '@/lib/brand'
import { Link } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ErrorScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlert className="h-8 w-8" />
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-sm text-muted-foreground">
        {BRAND.name} hit an unexpected snag. A quick reload usually sorts it out.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={() => window.location.reload()}>
          Reload app
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/dashboard">Back to my day</Link>
        </Button>
      </div>
    </div>
  )
}