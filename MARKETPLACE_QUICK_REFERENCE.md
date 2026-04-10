# Game Services Marketplace - Quick Reference

## 🚀 Quick Start

### For Users

1. **Browse Games**
   - Go to `/dashboard/marketplace`
   - Click "Browse Games"
   - Search for your desired game
   - Click "View Offers"

2. **Select an Offer**
   - View all available services
   - Click on offer to select
   - See price in right panel
   - Click "Proceed to Order"

3. **Exclusive Packs**
   - Go to "Exclusive Packs" from hub
   - Filter by seller (optional)
   - Click "Order Now" on desired pack
   - Complete order with points

### For Sellers

1. **Create Exclusive Offer**
   - Make authenticated POST to `/api/exclusive-offers`
   - Provide: name, price, optional description and game_id
   - Offer appears immediately in marketplace

2. **Manage Offers**
   - Update: PATCH `/api/exclusive-offers/[id]`
   - Delete: DELETE `/api/exclusive-offers/[id]` (soft delete)
   - Only you can modify your offers

## 📂 File Structure

```
/app/dashboard/marketplace/
├── page.tsx                           # Hub page (navigation)
├── games/
│   └── page.tsx                       # Browse all games
└── offers/
    └── game/
        └── [gameId]/
            └── page.tsx               # Offers for specific game
└── exclusive-offers/
    └── page.tsx                       # Seller packs listing

/app/api/
├── games/
│   ├── route.ts                       # GET all games
│   └── [gameId]/
│       └── offers/
│           └── route.ts               # GET offers for game
└── exclusive-offers/
    ├── route.ts                       # GET all, POST create
    └── [id]/
        └── route.ts                   # GET, PATCH, DELETE individual
```

## 🔌 API Endpoints Reference

### Games
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/games` | Fetch all active games |

### Game Offers
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/games/[gameId]/offers` | Get offers for specific game |

### Exclusive Offers
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/exclusive-offers` | No | List all active packs |
| POST | `/api/exclusive-offers` | Yes | Create new pack (seller only) |
| GET | `/api/exclusive-offers/[id]` | No | Get specific pack |
| PATCH | `/api/exclusive-offers/[id]` | Yes | Update pack (owner only) |
| DELETE | `/api/exclusive-offers/[id]` | Yes | Delete pack (owner only) |

## 🎨 Theme Colors

- **Primary Blue:** `#2563eb` (blue-600)
- **Primary Dark:** `#0c4a6e` (blue-900)
- **Accent Purple:** `#a855f7` (purple-600)
- **Background:** `#0f172a` to `#0f172a` (slate-950 to slate-900)
- **Text Primary:** `#ffffff`
- **Text Secondary:** `#94a3b8` (slate-400)

## 📊 Database Tables

### exclusive_offers
```
id (UUID, PK)
seller_id (UUID, FK users)
game_id (UUID, FK games, nullable)
name (TEXT, required)
description (TEXT, nullable)
price (INTEGER, required, positive)
is_active (BOOLEAN, default true)
created_at (TIMESTAMP, default now)
updated_at (TIMESTAMP, default now)
```

### Indices
- seller_id (frequent lookups by seller)
- game_id (filter by game)
- is_active (active offers only)
- (seller_id, game_id) (combined queries)

## 🔐 Authentication

### Create/Update/Delete Exclusive Offers
Requires Bearer token in Authorization header:
```
Authorization: Bearer <user_auth_token>
```

Must be authenticated user AND registered seller.

## ✅ Validation Rules

### Exclusive Offer Creation
- ✓ name (required, string)
- ✓ price (required, positive integer)
- ✓ description (optional, string)
- ✓ game_id (optional, valid UUID)
- ✓ seller_id = authenticated user id
- ✓ is_active = true (default)

### Update
- All fields optional except those being updated
- Price must still be positive if provided
- seller_id cannot be changed

### Delete
- Soft delete only (is_active = false)
- Permanent deletion should follow data retention policy

## 🎯 Response Format

### Success Response
```json
{
  "id": "uuid",
  "name": "War Pack",
  "description": "...",
  "price": 800,
  "seller": { "id": "uuid", "username": "..." },
  "game": { "id": "uuid", "name": "..." },
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Error Response
```json
{
  "error": "Description of error"
}
```

### Error Codes
- 400 Bad Request (validation failed)
- 401 Unauthorized (missing auth)
- 403 Forbidden (not owner/not seller)
- 404 Not Found (resource missing)
- 500 Server Error (unexpected)

## 🎪 Component Props

### GameCard
```typescript
interface GameCardProps {
  game: {
    id: string
    name: string
    description?: string
    image_url?: string
  }
  onViewOffers: (gameId: string) => void
}
```

### OfferCard
```typescript
interface OfferCardProps {
  offer: {
    id: string
    name: string
    quantity: number
    unit: string
    points_price: number
  }
  isSelected: boolean
  onSelect: (offerId: string) => void
}
```

### ExclusiveOfferCard
```typescript
interface ExclusiveOfferCardProps {
  offer: ExclusiveOffer
  onOrderNow: (offerId: string) => void
  onViewDetails: (offerId: string) => void
}
```

## 🚧 TODO: Order Integration

The marketplace currently displays offers. Complete order creation by:

1. Create `/app/dashboard/marketplace/orders/create/page.tsx`
2. Accept query params: `?offerId=X&gameId=Y`
3. Handle:
   - Fetch offer details
   - Game account selection
   - Points validation
   - Order submission to `/api/orders`

## 🔗 Navigation Flow

```
/dashboard/marketplace (Hub)
  ├─→ /dashboard/marketplace/games (Browse)
  │    └─→ /dashboard/marketplace/offers/game/[id] (View Offers)
  │         └─→ /dashboard/marketplace/orders/create (Not yet built)
  │
  └─→ /dashboard/marketplace/exclusive-offers (Packs)
       └─→ /dashboard/marketplace/orders/create (Not yet built)
```

## 📝 Common Queries

### Get all games for dropdown
```javascript
const response = await fetch('/api/games')
const { games } = await response.json()
```

### Get offers for a game
```javascript
const response = await fetch(`/api/games/${gameId}/offers`)
const { game, offers } = await response.json()
```

### Get all exclusive offers
```javascript
const response = await fetch('/api/exclusive-offers')
const { offers, total } = await response.json()
```

### Create exclusive offer (seller)
```javascript
const response = await fetch('/api/exclusive-offers', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'War Pack',
    description: '200M wood + speedups',
    price: 800,
    game_id: gameId // optional
  })
})
```

## 🎯 Performance Tips

1. **Caching** - Cache games list for 5 minutes
2. **Pagination** - Limit offers to 20 per page
3. **Images** - Lazy load game images
4. **Search** - Debounce search input (300ms)
5. **Filter** - Apply filtering on client-side for UX

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Offers not showing | Check `is_active = true`, verify game_id |
| Can't create offer | Verify seller status, check auth token |
| Images broken | Check image URLs in database, use fallback |
| Filter not working | Verify seller_id matches database |
| Auth 401 error | Check Bearer token, verify in auth |

## 📞 Integration Points

### Order System
- Receives `offerId` from marketplace
- Deducts points from user
- Associates with game_account_id
- Creates order record

### Seller System
- Verify `sellers` table has user record
- Check `verification_status`
- Track `total_tasks_completed`

### Notification System
- Optional: Send Telegram on offer purchase
- Optional: Email seller on exclusive offer creation
- Optional: Notify user on order assignment

## Quick Commands

```bash
# Test games API
curl http://localhost:3000/api/games

# Test offers for game
curl http://localhost:3000/api/games/[gameId]/offers

# Test exclusive offers
curl http://localhost:3000/api/exclusive-offers

# Create exclusive offer (need Bearer token)
curl -X POST http://localhost:3000/api/exclusive-offers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Pack","price":100}'
```

## 📚 Related Files
- MARKETPLACE_GUIDE.md - Detailed implementation guide
- scripts/03-exclusive-offers-schema.sql - Database migrations
- /app/dashboard/marketplace/* - All marketplace pages
- /app/api/games/* - Games and offers APIs
- /app/api/exclusive-offers/* - Exclusive offers APIs
