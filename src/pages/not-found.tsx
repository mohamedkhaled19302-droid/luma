import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-8 w-8" />
      </div>
      <h1 className="text-5xl font-extrabold tracking-tight text-foreground">404</h1>
      <p className="max-w-sm text-muted-foreground">
        This page drifted off the plan. Let's get you back on track.
      </p>
      <Button asChild size="lg">
        <Link to="/dashboard">Back to my day</Link>
      </Button>
    </div>
  )
}