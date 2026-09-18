import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatError(error: unknown): string {
  if (!error) return 'Something went wrong.'
  if (typeof error === 'string') return error
  const message = (error as { message?: string }).message
  if (!message) return 'Something went wrong.'
  return message.replace(/^\[.*?\]\s*/, '')
}

export function isOfflineError(error: unknown): boolean {
  const msg = formatError(error).toLowerCase()
  return (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('failed to fetch') ||
    msg.includes('socket')
  )
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}