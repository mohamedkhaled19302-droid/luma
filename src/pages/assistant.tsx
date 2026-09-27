import { useAuth } from '@/hooks/use-auth'
import { EmptyState } from '@/components/common/states'
import { AssistantPanel } from '@/components/assistant/assistant-panel'

export default function AssistantPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  if (!userId) {
    return (
      <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
        <EmptyState title="Sign in to use the Assistant" />
      </div>
    )
  }

  return (
    <div className="mx-auto h-[calc(100vh-4rem)] max-w-3xl px-4 py-4">
      <AssistantPanel userId={userId} />
    </div>
  )
}