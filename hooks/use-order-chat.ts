import { useEffect, useState, useCallback, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface ChatMessage {
  id: string
  content: string
  created_at: string
  sender: {
    username: string
    avatar_url?: string | null
  }
}

export function useOrderChat(orderId: string | null, token: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const channelRef = useRef<RealtimeChannel | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!orderId || !token) {
      setLoading(false)
      return
    }

    try {
      setError('')
      const response = await fetch(`/api/orders/${orderId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load messages')
      }

      setMessages(data.messages ?? [])
    } catch (err) {
      console.error('Fetch messages error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [orderId, token])

  // Subscribe to real-time message updates
  useEffect(() => {
    fetchMessages()

    return () => {
      channelRef.current = null
    }
  }, [orderId, fetchMessages])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!orderId || !token) {
        throw new Error('Order or auth missing')
      }

      const response = await fetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: content.trim() }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to send message')
      }

      if (data.message) {
        setMessages((current) => [...current, data.message])
      }

      return data.message
    },
    [orderId, token]
  )

  return { messages, loading, error, sendMessage }
}
