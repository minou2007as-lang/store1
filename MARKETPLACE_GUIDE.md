# Game Services Marketplace - Implementation Guide

## Overview

The Game Services Marketplace is a comprehensive system that enables users to browse games, view service offers, and purchase exclusive seller packs using platform points. The system is built with Next.js, React, and Supabase.

## Architecture

### Database Schema

#### 1. **Exclusive Offers Table** (NEW)
```sql
CREATE TABLE public.exclusive_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
```

**Indices:**
- `idx_exclusive_offers_seller_id` - Query offers by seller
- `idx_exclusive_offers_game_id` - Query offers by game
- `idx_exclusive_offers_is_active` - Filter active offers
- `idx_exclusive_offers_seller_game` - Combined seller + game queries

#### 2. **Existing Tables Used**

- **games** - Already exists, enhanced for marketplace display
- **offers** - Linked to products (which are linked to games)
- **products** - Game services/items available
- **orders** - Customer orders (existing)
- **users** - User/seller information
- **sellers** - Seller profiles

## API Endpoints

### Games API

#### Get All Games
```
GET /api/games
```

**Response:**
```json
{
  "games": [
    {
      "id": "uuid",
      "name": "Game Name",
      "description": "Game description",
      "image_url": "https://...",
      "slug": "game-slug"
    }
  ]
}
```

### Game Offers API

#### Get Offers for Specific Game
```
GET /api/games/[gameId]/offers
```

**Response:**
```json
{
  "game": {
    "id": "uuid",
    "name": "Game Name"
  },
  "offers": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "name": "Offer Name",
      "description": "Description",
      "image_url": "https://...",
      "quantity": 100,
      "unit": "units",
      "points_price": 500
    }
  ]
}
```

### Exclusive Offers API

#### Get All Exclusive Offers
```
GET /api/exclusive-offers
```

**Response:**
```json
{
  "offers": [
    {
      "id": "uuid",
      "name": "War Pack",
      "description": "Include 200M wood, 150M food, speedups",
      "price": 800,
      "seller": {
        "id": "uuid",
        "username": "seller_name",
        "avatar_url": "https://..."
      },
      "game": {
        "id": "uuid",
        "name": "Game Name"
      },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

#### Get Specific Exclusive Offer
```
GET /api/exclusive-offers/[id]
```

**Response:** Single exclusive offer object (same structure as above)

#### Create Exclusive Offer (Seller Only)
```
POST /api/exclusive-offers
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "War Pack",
  "description": "200M wood + 150M food + speedups",
  "price": 800,
  "game_id": "uuid (optional)"
}
```

**Response:** Created offer object (201)

**Requirements:**
- User must be authenticated
- User must be registered as a seller
- Name and price are required
- Price must be a positive number

#### Update Exclusive Offer (Owner Only)
```
PATCH /api/exclusive-offers/[id]
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Name (optional)",
  "description": "Updated description (optional)",
  "price": 900,
  "game_id": "uuid (optional)"
}
```

**Requirements:**
- User must be authenticated
- User must be the offer owner (seller_id == user.id)

#### Delete Exclusive Offer (Owner Only)
```
DELETE /api/exclusive-offers/[id]
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

**Requirements:**
- User must be authenticated
- User must be the offer owner
- Performs soft delete (sets is_active to false)

## Frontend Pages

### 1. Marketplace Hub (`/dashboard/marketplace`)
Central navigation page for marketplace features.

**Features:**
- Links to Browse Games and Exclusive Offers
- Interactive feature cards
- "How it works" guide
- Marketplace features overview

### 2. Games Browsing (`/dashboard/marketplace/games`)
Browse and search all available games.

**Features:**
- Display all active games in card grid
- Search by game name or description
- Game image display (if available)
- "View Offers" button for each game
- Responsive design (1-3 columns)
- Loading and error states

**User Flow:**
1. User sees list of games
2. Clicks "View Offers" on desired game
3. Redirected to offers page for that game

### 3. Game Offers Detail (`/dashboard/marketplace/offers/game/[gameId]`)
View all offers for a specific game with selection and ordering capability.

**Features:**
- Game header with back button
- List of available offers for the game
- Offer selection (visual feedback with checkmark)
- Order summary panel
- Quick offer details (quantity, unit, price)
- "Proceed to Order" button
- Features/benefits information

**User Flow:**
1. User sees offers for selected game
2. Clicks offer to select it
3. Summary updates on right panel
4. Clicks "Proceed to Order" to create order

### 4. Exclusive Offers (`/dashboard/marketplace/exclusive-offers`)
Browse seller-created exclusive packs.

**Features:**
- Display all exclusive offers from sellers
- Seller information with avatar
- Filter by seller dropdown
- Search functionality (offer name, seller, description)
- Badges for exclusive packages and game tags
- Price display with points
- "Order Now" and "Details" buttons
- Responsive grid layout
- Loading and error states

**User Flow:**
1. User sees all exclusive offers
2. Can filter by seller or search
3. Clicks "Order Now" to purchase
4. Or clicks "Details" for more info

## Component Structure

### Reusable Components

#### GameCard
Display individual game with image and action button.

**Props:**
- `game: Game` - Game object with id, name, description, image_url
- `onViewOffers: (gameId: string) => void` - Callback when View Offers is clicked

#### OfferCard
Display individual offer with selection capability.

**Props:**
- `offer: Offer` - Offer object
- `isSelected: boolean` - Whether offer is selected
- `onSelect: (offerId: string) => void` - Selection callback

#### ExclusiveOfferCard
Display seller pack with seller info.

**Props:**
- `offer: ExclusiveOffer` - Exclusive offer object
- `onOrderNow: (offerId: string) => void` - Order callback
- `onViewDetails: (offerId: string) => void` - Details view callback

#### SellerFilter
Multi-select filter component for exclusive offers.

**Props:**
- `sellers: Seller[]` - Available sellers
- `selected: string | null` - Currently selected seller
- `onSelect: (sellerId: string | null) => void` - Selection callback

## Data Flow

### Game Browsing Flow
```
User navigates to /marketplace
    ↓
Fetches /api/games (all active games)
    ↓
Displays game cards with images
    ↓
User clicks "View Offers"
    ↓
Navigates to /marketplace/offers/game/[gameId]
    ↓
Fetches /api/games/[gameId]/offers
    ↓
Displays offers for that game
    ↓
User selects offer and clicks "Proceed to Order"
    ↓
Navigates to order creation page
```

### Exclusive Offers Flow
```
User navigates to /marketplace/exclusive-offers
    ↓
Fetches /api/exclusive-offers
    ↓
Displays all exclusive offers with seller info
    ↓
User can filter by seller or search
    ↓
User clicks "Order Now"
    ↓
Navigates to order creation with exclusive_offer_id
```

### Seller Creating Exclusive Offer
```
Authenticated seller navigates to seller dashboard
    ↓
Creates new exclusive offer via POST /api/exclusive-offers
    ↓
Provides: name, description, price, optional game_id
    ↓
System validates seller status and creation
    ↓
Offer becomes active immediately
    ↓
Appears in /marketplace/exclusive-offers
```

## Styling & Design

### Dark Modern Theme
- **Background:** Gradient from slate-950 to slate-900
- **Primary Color:** Blue (600-700 for bright, 900 for backgrounds)
- **Accent Colors:** Purple, Green, Amber
- **Text:** White for headers, slate-400 for secondary
- **Borders:** slate-700 with hover effects

### Responsive Layout
- **Mobile:** 1 column grid
- **Tablet:** 2 column grid (md: breakpoint)
- **Desktop:** 3 column grid (lg: breakpoint)

### Hover Effects
- Border color shift to blue/purple
- Shadow effects with color tint
- Image scale on hover
- Smooth transitions (300ms)

### Animations
- Fade in/out for loading states
- Smooth transitions on all interactive elements
- Spinner animation for loading
- Selection checkmark animation

## Setup Instructions

### 1. Database Migration
Run the migration script to create the exclusive_offers table:

```bash
# In Supabase SQL Editor:
-- Copy contents of scripts/03-exclusive-offers-schema.sql
-- Execute in Supabase dashboard
```

### 2. Environment Variables
Ensure these are set in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

### 3. Navigation Setup
Add marketplace links to your dashboard sidebar:
```typescript
{
  label: 'Marketplace',
  href: '/dashboard/marketplace',
  icon: ShoppingCart,
}
```

### 4. Create Order Integration
The offers pages link to `/dashboard/marketplace/orders/create?offerId=X&gameId=Y`

You'll need to create this route to handle order creation:
```typescript
// /app/dashboard/marketplace/orders/create/page.tsx
// Should handle:
// - fetching offer details
// - game account selection
// - points validation
// - order submission
```

## Best Practices

### Security
- Always validate seller_id in POST/PATCH/DELETE endpoints
- Use soft deletes (is_active flag) for data retention
- Validate points prices (must be positive)
- Check user authentication before creating/editing offers

### Performance
- Use indices on frequently queried columns
- Implement pagination for large result sets
- Cache game and offer data on client
- Use suspense/skeleton loading states

### User Experience
- Clear error messages for all failure states
- Loading indicators for async operations
- Confirmation dialogs for destructive actions
- Toast notifications for success/success messages

### Code Quality
- Consistent error handling across all APIs
- TypeScript types for all data structures
- Reusable component patterns
- Comprehensive API documentation

## Telegram Integration (Optional)

Add Telegram notifications when orders are created:

```typescript
// In order creation endpoint
if (topupNotificationUrl) {
  // Send notification to admin/seller via Telegram
  // Reference: app/api/topups/route.ts (notifyAdminViaTelegram)
}
```

## Future Enhancements

1. **Order Creation Flow** - Complete order management system
2. **Seller Dashboard** - Manage own offers and orders
3. **Reviews & Ratings** - Rate offers and sellers
4. **Offer Analytics** - View performance metrics
5. **Bulk Operations** - Create multiple offers
6. **Advanced Filtering** - Price range, rating, response time
7. **Real-time Updates** - Socket.io for live offer updates
8. **Payment Processing** - Additional payment methods
9. **Wishlist** - Save favorite offers
10. **Notifications** - Email/SMS for order updates

## Troubleshooting

### Offers Not Showing
- Verify `is_active: true` filter is applied
- Check game_id is correct
- Ensure products exist for the game

### Seller Packs Not Appearing
- Verify seller_id matches users table
- Check `is_active: true` status
- Confirm authentication token is valid

### Images Not Loading
- Verify image_url is properly stored in database
- Check CORS settings for image hosting
- Use fallback placeholder images

### Auth Errors on Create Offer
- Verify Bearer token in Authorization header
- Confirm seller record exists for user
- Check SUPABASE_SERVICE_ROLE_KEY is set

## API Error Codes

- **400** - Bad request (validation error)
- **401** - Unauthorized (missing/invalid auth)
- **403** - Forbidden (user not authorized for action)
- **404** - Not found (resource doesn't exist)
- **500** - Server error (unexpected exception)

## Support

For issues or questions:
1. Check database migrations are applied
2. Verify API endpoints are accessible
3. Review browser console for client errors
4. Check server logs for backend errors
