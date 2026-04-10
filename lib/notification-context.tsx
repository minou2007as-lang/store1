
'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/db'
import { useAuth } from '@/lib/auth-context'

export interface Notification {
  id: string
  user_id: string
  type: 'message' | 'order_delivered' | 'order_completed' | 'topup' | 'system'
  title: string
  content?: string
  message?: string
  is_read: boolean
  created_at: string
  order_id?: string
  action_url?: string
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: string | null
  addNotification: (notification: Omit<Notification, 'id' | 'created_at' | 'user_id' | 'is_read'>) => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (id: string) => Promise<void>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

const MAX_NOTIFICATIONS = 50
const TOAST_AUTO_DISMISS = 5000 // milliseconds

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [realtimeUnsubscribe, setRealtimeUnsubscribe] = useState<(() => void) | null>(null)

  // Load initial notifications
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false)
      return
    }

    const userId = user.id

    async function loadInitialNotifications() {
      try {
        setIsLoading(true)
        setError(null)

        const { data, error: fetchError } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
        if (fetchError) throw fetchError

        setNotifications(data || [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load notifications'
        console.error('Load notifications error:', err)
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialNotifications()
  }, [user?.id])

  // Subscribe to realtime changes
  useEffect(() => {
    if (!user?.id) return

    // Create unique channel name per user
    const channelName = `user:${user.id}:notifications`

    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification

          // Prevent duplicates
          setNotifications((current) => {
            const exists = current.some((n) => n.id === newNotification.id)
            if (exists) return current

            // Add to beginning, maintain limit
            const updated = [newNotification, ...current].slice(0, MAX_NOTIFICATIONS)
            return updated
          })

          // Show toast notification
          const toastMessage = newNotification.message || newNotification.content || ''
          toast(newNotification.title, {
            description: toastMessage,
            duration: TOAST_AUTO_DISMISS,
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updatedNotification = payload.new as Notification

          setNotifications((current) =>
            current.map((n) =>
              n.id === updatedNotification.id ? updatedNotification : n
            )
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deletedId = payload.old.id

          setNotifications((current) => current.filter((n) => n.id !== deletedId))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Notifications realtime subscribed')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime channel error')
          setError('Realtime connection failed')
        }
      })

    setRealtimeUnsubscribe(() => () => {
      supabase.removeChannel(subscription)
    })

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [user?.id])

  // Add notification (optimistic UI)
  const addNotification = useCallback(
    async (notification: Omit<Notification, 'id' | 'created_at' | 'user_id' | 'is_read'>) => {
      if (!user?.id) {
        throw new Error('User not authenticated')
      }

      const userId = user.id

      try {
        const insertPayload: any = {
          user_id: userId,
          title: notification.title,
          type: notification.type,
          message: notification.message || notification.content || '',
          is_read: false,
        }

        let { error: insertError } = await (supabase as any)
          .from('notifications')
          .insert([insertPayload])

        // Some deployments may not have a `type` column yet.
        if (insertError?.code === '42703' || insertError?.code === 'PGRST204') {
          const fallback = await (supabase as any)
            .from('notifications')
            .insert([
              {
                user_id: userId,
                title: notification.title,
                message: notification.message || notification.content || '',
                is_read: false,
              },
            ])
          insertError = fallback.error
        }

        if (insertError) throw insertError

        // Realtime will handle adding to state
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add notification'
        console.error('Add notification error:', err)
        throw err
      }
    },
    [user?.id]
  )

  // Mark as read
  const markAsRead = useCallback(
    async (id: string) => {
      if (!user?.id) {
        throw new Error('User not authenticated')
      }

      const userId = user.id

      try {
        const { error: updateError } = await (supabase as any)
          .from('notifications')
          .update({ is_read: true })
          .eq('id', id)
          .eq('user_id', userId)

        if (updateError) throw updateError

        // Optimistic update
        setNotifications((current) =>
          current.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        )
      } catch (err) {
        console.error('Mark as read error:', err)
        throw err
      }
    },
    [user?.id]
  )

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return

    const userId = user.id

    try {
      const { error: updateError } = await (supabase as any)
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)

      if (updateError) throw updateError

      // Optimistic update
      setNotifications((current) => current.map((n) => ({ ...n, is_read: true })))
    } catch (err) {
      console.error('Mark all as read error:', err)
      throw err
    }
  }, [user?.id])

  // Delete notification
  const deleteNotification = useCallback(
    async (id: string) => {
      try {
        if (!user?.id) {
          throw new Error('User not authenticated')
        }

        const userId = user.id

        const { error: deleteError } = await supabase
          .from('notifications')
          .delete()
          .eq('id', id)
          .eq('user_id', userId)

        if (deleteError) throw deleteError

        // Optimistic update
        setNotifications((current) => current.filter((n) => n.id !== id))
      } catch (err) {
        console.error('Delete notification error:', err)
        throw err
      }
    },
    [user?.id]
  )

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        error,
        addNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}

