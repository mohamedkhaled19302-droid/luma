import { Link } from 'react-router-dom'
import { ArrowRight, Brain, CalendarRange, BatteryCharging, Sparkles, Waves } from 'lucide-react'
import { Logo } from '@/components/common/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const features = [
  {
    icon: Brain,
    title: 'A scheduler that thinks',
    description:
      'LUMA plans your day around deadlines, energy levels and real study time — not just a to-do list.',
  },
  {
    icon: CalendarRange,
    title: 'Every block counts',
    description:
      'Classes, commitments, deep work and rest — one calm timeline instead of ten scattered apps.',
  },
  {
    icon: BatteryCharging,
    title: 'Work with your energy',
    description:
      'Tough tasks when you are sharp, lighter work when you are drained. You set the rhythm.',
  },
  {
    icon: Waves,
    title: 'Rest is part of the plan',
    description:
      'Breaks, sleep and free time are scheduled like everything else. Burnout is not in your syllabus.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Logo />
        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth/sign-up">
              Get started
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-14 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border bg-accent/40 px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Built for students who want a life, not just a schedule
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
            Plan your life.
            <span className="block bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 bg-clip-text text-transparent">
              Not just your tasks.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            LUMA turns deadlines, habits and energy into a calm weekly plan — then reshapes it
            around the life you actually want to live.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/auth/sign-up">
                Start planning free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link to="/auth/sign-in">I already have an account</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-20 sm:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t py-8">
        <p className="px-6 text-center text-sm text-muted-foreground">
          LUMA &middot; a calmer way to do student life
        </p>
      </footer>
    </div>
  )
}