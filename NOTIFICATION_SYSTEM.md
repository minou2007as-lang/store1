# Production-Level Realtime Notification System

## Overview

This document describes the upgraded production-level realtime notification system for MOHSTORE using Supabase PostgreSQL Realtime, React Context, and optimistic UI patterns.

## Architecture

### Database Schema

```sql
CREATE TABLE notifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,          -- Associated user
  type VARCHAR(50) NOT NULL,              -- message, order_delivered, order_completed, system
  title VARCHAR(255) NOT NULL,            -- Short notification title
  content TEXT NOT NULL,                  -- Full notification content
  is_read BOOLEAN DEFAULT FALSE,          -- Read status
  order_id VARCHAR(36),                   -- Associated order (optional)
  action_url VARCHAR(500),                -- URL to navigate when clicked (optional)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_user_created (user_id, created_at),  -- Critical for filtering + sorting
  INDEX idx_is_read (is_read),
  INDEX idx_type (type)
);
```

### Supabase Realtime Configuration

**Channel Name:** `user:{user_id}:notifications`
- One unique channel per user for security
- Automatically unsubscribes on component unmount

**Filters:**
- INSERT: `user_id=eq.{user_id}` - Only new notifications for this user
- UPDATE: `user_id=eq.{user_id}` - Only read status updates
- DELETE: `user_id=eq.{user_id}` - Only deletions for this user

## Component Architecture

### 1. `lib/notification-context.tsx` (Client Component)

**Purpose:** Global notification state management with Supabase realtime integration

**Key Features:**
- ✅ Supabase Realtime PostgreSQL change subscriptions
- ✅ Optimistic UI updates (instant feedback)
- ✅ Duplicate prevention (checks by id)
- ✅ Max 50 notifications in memory (prevents memory leaks)
- ✅ Toast notifications via Sonner
- ✅ Proper cleanup and unsubscribe on unmount
- ✅ Error handling and user-friendly messages

**Hooks Exported:**
- `useNotifications()` - Access context with all methods

**Context Methods:**
```typescript
interface NotificationContextType {
  notifications: Notification[]              // Array of notifications
  unreadCount: number                        // Count of is_read=false
  isLoading: boolean                         // Initial load state
  error: string | null                       // Error message if any
  addNotification(notification)              // Create notification (async)
  markAsRead(id)                             // Mark single as read (async)
  markAllAsRead()                            // Mark all as read (async)
  deleteNotification(id)                     // Delete notification (async)
}
```

**Realtime Flow:**
```
1. User login → loadInitialNotifications() fetches last 50
2. Subscribe to postgres_changes (INSERT, UPDATE, DELETE)
3. New notification → INSERT event → addNotification fires → toast notify → append to state
4. Mark read → UPDATE event → optimistic update
5. Delete → DELETE event → remove from state
6. User logout/unmount → unsubscribe from channel
```

### 2. `components/notification-center.tsx` (Client Component)

**Purpose:** UI dropdown showing notifications with read/delete actions

**Features:**
- ✅ Bell icon with unread badge
- ✅ Dropdown panel (max 400px height, scrollable)
- ✅ Icon mapping per notification type
- ✅ Delete button (trash icon, hover-reveal)
- ✅ Mark as read button
- ✅ Bulk "Mark all read" action
- ✅ Loading and empty states
- ✅ Error handling with toast feedback
- ✅ Timestamp display (localized)

**Usage:**
```tsx
import { NotificationCenter } from '@/components/notification-center'

export function TopNavbar() {
  return (
    <nav>
      <NotificationCenter />
    </nav>
  )
}
```

### 3. API Endpoints

#### `POST /api/notifications`
Create a new notification (for backend operations)

**Request:**
```json
{
  "type": "order_delivered",
  "title": "Order Delivered",
  "content": "Your order has been marked as delivered",
  "order_id": "order-123",
  "action_url": "/dashboard/orders/order-123"
}
```

**Response:**
```json
{
  "success": true,
  "notification": { ... }
}
```

#### `GET /api/notifications`
Fetch user's notifications with pagination

**Query Params:**
- `limit=50` - Max 100, default 50
- `offset=0` - Pagination offset
- `unread=true` - Only unread notifications

**Response:**
```json
{
  "success": true,
  "notifications": [...],
  "total": 150
}
```

#### `PATCH /api/notifications/:id`
Mark a notification as read/unread

**Request:**
```json
{
  "is_read": true
}
```

#### `DELETE /api/notifications/:id`
Delete a notification

#### `PATCH /api/notifications/mark-all-read`
Mark all notifications as read

## Usage Examples

### 1. Creating a Notification from Client

```typescript
import { useNotifications } from '@/lib/notification-context'

export function OrderPage() {
  const { addNotification } = useNotifications()

  const handleMarkDelivered = async () => {
    try {
      const response = await fetch(`/api/orders/${id}/deliver`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      
      if (data.success) {
        // Notification sent to DB → Realtime fires → appears in UI instantly
        await addNotification({
          type: 'order_delivered',
          title: 'Order Delivered',
          content: 'Your order has been marked as delivered',
          order_id: id,
        })
      }
    } catch (err) {
      console.error(err)
    }
  }

  return <button onClick={handleMarkDelivered}>Mark Delivered</button>
}
```

### 2. Creating a Notification from Server

```typescript
// /api/orders/[id]/deliver
export async function POST(request: NextRequest) {
  // ... handle delivery ...

  // Create notification via API
  const notifResponse = await fetch(
    `${process.env.NEXTAUTH_URL}/api/notifications`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'order_delivered',
        title: 'Order Delivered',
        content: `Order ${orderId} has been delivered`,
        order_id: orderId,
        action_url: `/dashboard/orders/${orderId}`,
      }),
    }
  )

  return NextResponse.json({ success: true })
}
```

### 3. Listening to Notifications

```typescript
import { useNotifications } from '@/lib/notification-context'

export function NotificationListener() {
  const { notifications, unreadCount, isLoading } = useNotifications()

  return (
    <div>
      <p>Unread: {unreadCount}</p>
      <ul>
        {notifications.map((notif) => (
          <li key={notif.id}>
            {notif.is_read ? '✓' : '●'} {notif.title}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

## Performance Optimizations

### 1. Duplicate Prevention
```typescript
const exists = current.some((n) => n.id === newNotification.id)
if (exists) return current
```

### 2. Memory Limits
```typescript
const updated = [newNotification, ...current].slice(0, MAX_NOTIFICATIONS)
```

### 3. Optimistic UI
- Add to state immediately
- Don't wait for Supabase response
- Database changes eventually sync via realtime

### 4. Efficient Subscriptions
- One channel per user (not per component)
- Proper cleanup (unsubscribe on unmount)
- No re-subscriptions on rerender

### 5. Memoization
- `useCallback` for all event handlers
- Dependency arrays properly maintained

## Security

### User Isolation
- Realtime filters by `user_id=eq.{current_user_id}`
- API endpoints verify request token matches user
- Database foreign key prevents cross-user notifications

### No XSS Vulnerabilities
- Content stored as plain text
- Toast uses Sonner (safe HTML escaping)
- No inline HTML/script execution

### No N+1 Queries
- Realtime events include full notification object
- No additional DB queries needed

## Error Handling

### Realtime Connection Fails
```typescript
.subscribe((status) => {
  if (status === 'CHANNEL_ERROR') {
    setError('Realtime connection failed')
  }
})
```
- UI still functional (uses initial loaded notifications)
- Optional: Show warning/retry message

### API Fails
```typescript
try {
  await addNotification(...)
} catch (err) {
  console.error('Notification error:', err)
  toast.error('Failed to create notification')
}
```
- Errors don't crash the app
- Toast provides feedback
- Operation logs for debugging

## Monitoring & Debugging

### Debug Logs
```typescript
console.log('Notifications realtime subscribed')
console.log('Load notifications error:', err)
console.log('Notification error:', err)
```

### Supabase Dashboard
- View `notifications` table
- Monitor realtime subscriptions
- Check logs for errors

### React DevTools
- Inspect `NotificationProvider` state
- Watch realtime events firing
- Profile component renders

## Deployment Checklist

- [ ] Run migration: Add `notifications` table to Supabase
- [ ] Enable Realtime in Supabase (Settings > Realtime)
- [ ] Test in development environment
- [ ] Add API endpoints to CORS whitelist (if needed)
- [ ] Monitor production logs for errors
- [ ] Set up alerts for realtime connection issues

## Limitations & Future Enhancements

### Current Limitations
- Max 50 notifications stored (by design)
- No notification preferences
- No email/SMS fallback

### Potential Enhancements
- [ ] Notification preferences (mute certain types)
- [ ] Persistent notification archive (paginated history)
- [ ] Email digest for missed notifications
- [ ] Sound/vibration on new notification
- [ ] Notification categories/grouping
- [ ] TTL (auto-delete old notifications after 30 days)

## Testing

```typescript
// Test realtime subscription
const { addNotification } = useNotifications()
await addNotification({
  type: 'system',
  title: 'Test',
  content: 'This is a test notification'
})

// Should appear instantly in dropdown
// Toast should show at bottom
```

---

**System Type:** Production-ready SaaS
**Stack:** Next.js + Supabase + React Context + Sonner
**Last Updated:** 2024-04-02
