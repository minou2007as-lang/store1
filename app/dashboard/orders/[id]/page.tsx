"use client"

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useNotifications } from '@/lib/notification-context'
import { useOrderChat } from '@/hooks/use-order-chat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { OrderTimeline } from '@/components/order-timeline'
import { SellerRating } from '@/components/seller-rating'
import { Loader2, Send } from 'lucide-react'

type OrderResponse = {
  success: boolean
  order?: any
  error?: string
}

const renderStars = (rating: number) => {
  const filled = Math.max(0, Math.min(5, Math.round(rating)))
  const empty = 5 - filled
  return '★'.repeat(filled) + '☆'.repeat(empty)
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const getStatusLabel = (status: string) => {
  return status.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function OrderDetailsPage() {
  const { id } = useParams() as { id: string }
  const { user } = useAuth()
  const { addNotification } = useNotifications()
  
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [existingReview, setExistingReview] = useState<any>(null)
  const [reviewError, setReviewError] = useState('')
  const [reviewSuccess, setReviewSuccess] = useState('')
  const [sellerRating, setSellerRating] = useState<{ avg: number; total: number } | null>(null)

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  
  // Use real-time chat hook
  const { messages, loading: messagesLoading, sendMessage } = useOrderChat(id, token)

  const orderStatus = order?.status ?? ''
  const sellerId = order?.assigned_seller_id
  const isSeller = user?.role === 'seller' && user?.id === sellerId
  const isCustomer = user?.role === 'customer' && user?.id === order?.customer_id
  const canChat = user && order && (isSeller || isCustomer)

  const fetchOrder = async () => {
    if (!id || !token) return
    setError('')

    try {
      setLoading(true)
      const response = await fetch(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data: OrderResponse = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load order')
      }

      setOrder(data.order)
    } catch (err) {
      console.error('Fetch order error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load order')
    } finally {
      setLoading(false)
    }
  }

  const fetchSellerRating = async () => {
    if (!sellerId || !token) return
    try {
      const response = await fetch(`/api/reviews?seller_id=${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (response.ok && data.avg_rating !== undefined) {
        setSellerRating({
          avg: data.avg_rating,
          total: data.total_reviews ?? 0,
        })
      }
    } catch (err) {
      console.error('Fetch seller rating error:', err)
    }
  }

  const fetchReview = async () => {
    if (!id || !token || !isCustomer) return
    try {
      const response = await fetch(`/api/reviews?order_id=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (response.ok && data.reviews?.length > 0) {
        setExistingReview(data.reviews[0])
      }
    } catch (err) {
      console.error('Fetch existing review error:', err)
    }
  }

  useEffect(() => {
    if (!id || !user) return
    fetchOrder()
  }, [id, user])

  useEffect(() => {
    fetchSellerRating()
    fetchReview()
  }, [sellerId, id, user, orderStatus])

  // Listen for real-time updates
  useEffect(() => {
    if (!id || !token) return

    const interval = window.setInterval(() => {
      fetchOrder()
    }, 10000)

    return () => window.clearInterval(interval)
  }, [id, token])

  const handleSendMessage = async () => {
    if (!messageText.trim()) return
    setSendingMessage(true)
    try {
      await sendMessage(messageText)
      setMessageText('')
      try {
        await addNotification({
          type: 'message',
          title: 'Message sent',
          content: messageText.substring(0, 50),
        })
      } catch (notifErr) {
        console.error('Notification error:', notifErr)
      }
    } catch (err) {
      console.error(err)
      try {
        await addNotification({
          type: 'system',
          title: 'Error',
          content: 'Failed to send message',
        })
      } catch (notifErr) {
        console.error('Notification error:', notifErr)
      }
    } finally {
      setSendingMessage(false)
    }
  }

  const handleMarkDelivered = async () => {
    if (!id || !token) return
    setActionLoading(true)
    setActionMessage('')
    try {
      const response = await fetch(`/api/orders/${id}/deliver`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to mark delivered')
      }
      setActionMessage(data.message ?? 'Order marked as delivered')
      try {
        await addNotification({
          type: 'order_delivered',
          title: 'Order delivered',
          content: 'Your order has been marked as delivered',
          order_id: id,
        })
      } catch (notifErr) {
        console.error('Notification error:', notifErr)
      }
      await fetchOrder()
    } catch (err) {
      console.error(err)
      setActionMessage(err instanceof Error ? err.message : 'Failed to mark delivered')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmDelivery = async () => {
    if (!id || !token) return
    setActionLoading(true)
    setActionMessage('')
    try {
      const response = await fetch(`/api/orders/${id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to confirm delivery')
      }
      setActionMessage(data.message ?? 'Delivery confirmed')
      try {
        await addNotification({
          type: 'order_completed',
          title: 'Order completed',
          content: 'Delivery confirmed and funds released',
          order_id: id,
        })
      } catch (notifErr) {
        console.error('Notification error:', notifErr)
      }
      await fetchOrder()
    } catch (err) {
      console.error(err)
      setActionMessage(err instanceof Error ? err.message : 'Failed to confirm delivery')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!id || !token || existingReview) return
    if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
      setReviewError('Select a rating between 1 and 5')
      return
    }

    setReviewError('')
    setReviewSuccess('')

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: id, rating: reviewRating, comment: reviewComment.trim() }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to submit review')
      }
      setReviewSuccess('Review submitted successfully')
      setExistingReview(data.review)
      await fetchSellerRating()
    } catch (err) {
      console.error(err)
      setReviewError(err instanceof Error ? err.message : 'Failed to submit review')
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading order...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-slate-700">
          Order not found.
        </div>
      </div>
    )
  }

  const gameName = order.offer?.product?.game?.name ?? 'Unknown game'
  const productName = order.offer?.product?.name ?? 'Unknown product'
  const price = order.offer?.points_price ?? order.points_amount

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Order #{order.id}</h1>
          <p className="text-sm text-slate-600 mt-1">{productName} · {gameName}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm uppercase tracking-wide text-slate-700">
            {getStatusLabel(order.status)}
          </span>
          <span className="text-sm text-slate-500">Created {formatDate(order.created_at)}</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Order details</CardTitle>
              <CardDescription>Manage delivery, confirmation, and review for this order.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Order amount</p>
                  <p className="text-lg font-semibold text-slate-900">{price} pts</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Seller</p>
                  <p className="text-slate-900">{order.seller?.username ?? 'Not assigned'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Delivered at</p>
                  <p className="text-slate-900">{formatDate(order.delivered_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Confirmed at</p>
                  <p className="text-slate-900">{formatDate(order.confirmed_at)}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Auto release</p>
                  <p className="text-slate-900">{formatDate(order.auto_release_at)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Seller earnings</p>
                  <p className="text-slate-900">{order.seller_earnings ?? 'TBD'} pts</p>
                </div>
              </div>

              {actionMessage && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                  {actionMessage}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {isSeller && order.status === 'in_progress' && !order.delivered_at && (
                  <Button onClick={handleMarkDelivered} disabled={actionLoading} className="w-full">
                    {actionLoading ? 'Marking delivered...' : 'Mark Delivered'}
                  </Button>
                )}

                {isCustomer && order.delivered_at && !order.confirmed_at && (
                  <Button variant="secondary" onClick={handleConfirmDelivery} disabled={actionLoading} className="w-full">
                    {actionLoading ? 'Confirming...' : 'Confirm Delivery'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {isCustomer && order.status === 'completed' && (
            <Card>
              <CardHeader>
                <CardTitle>Order review</CardTitle>
                <CardDescription>Leave a review for your seller once the order is completed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {existingReview ? (
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-semibold text-slate-900">Your review</p>
                      <span className="text-yellow-500 text-lg">{renderStars(existingReview.rating)}</span>
                    </div>
                    {existingReview.comment && <p className="mt-3 text-slate-700">{existingReview.comment}</p>}
                    <p className="mt-2 text-xs text-slate-500">Submitted on {formatDate(existingReview.created_at)}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-slate-500">Rating</p>
                      <div className="mt-2 flex gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={`text-2xl ${reviewRating >= value ? 'text-yellow-500' : 'text-slate-300'}`}
                            onClick={() => setReviewRating(value)}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Textarea
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Share your experience with this seller"
                        rows={4}
                      />
                    </div>
                    {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
                    {reviewSuccess && <p className="text-sm text-green-600">{reviewSuccess}</p>}
                    <Button onClick={handleSubmitReview} className="w-full">
                      Submit review
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Order chat</CardTitle>
              <CardDescription>Messages between the seller and customer for this order.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canChat ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Only this order's customer and seller can access the chat.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {messagesLoading ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        Loading messages...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        No messages yet. Start the conversation.
                      </div>
                    ) : (
                      messages.map((message) => (
                        <div key={message.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-900">{message.sender.username}</p>
                            <p className="text-xs text-slate-500">{formatDate(message.created_at)}</p>
                          </div>
                          <p className="mt-2 text-slate-700">{message.content}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="grid gap-3">
                    <Input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Write a message..."
                    />
                    <Button onClick={handleSendMessage} disabled={sendingMessage || !messageText.trim()} className="w-full">
                      {sendingMessage ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send message
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Product</span>
                  <span>{productName}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Game</span>
                  <span>{gameName}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Seller</span>
                  <span>{order.seller?.username ?? 'Unassigned'}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Order status</span>
                  <span>{getStatusLabel(order.status)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Price</span>
                  <span>{price} pts</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order status</CardTitle>
              <CardDescription>Track your order progress</CardDescription>
            </CardHeader>
            <CardContent>
              <OrderTimeline
                status={order.status}
                deliveredAt={order.delivered_at}
                confirmedAt={order.confirmed_at}
                completedAt={order.completed_at}
                autoReleaseAt={order.auto_release_at}
              />
            </CardContent>
          </Card>

          {sellerRating && (
            <Card>
              <CardHeader>
                <CardTitle>Seller rating</CardTitle>
              </CardHeader>
              <CardContent>
                <SellerRating avgRating={sellerRating.avg} totalReviews={sellerRating.total} size="lg" />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
