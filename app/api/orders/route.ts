import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { sendOrderNotification, sendTelegramMessage } from '@/lib/telegram';
import { z } from 'zod';

const FIXED_PLATFORM_FEE = 0.1;

const createOrderSchema = z.object({
  game_id: z.string().min(1).optional(),
  seller_id: z.string().min(1).optional(),
  offer_id: z.string().min(1).optional(),
  exclusive_offer_id: z.string().min(1).optional(),
  account_id: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(99).optional().default(1),
}).refine(
  (data) => (data.offer_id && data.game_id) || data.exclusive_offer_id,
  'Either offer_id+game_id or exclusive_offer_id must be provided'
);

const db: any = supabaseAdmin ?? supabase;

function getAuthFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  return verifyToken(token);
}

const dbStatusByClientStatus: Record<string, string> = {
  pending: 'open',
  accepted: 'in_progress',
};

const clientStatusByDbStatus: Record<string, string> = {
  open: 'pending',
  accepted: 'in_progress',
};

function normalizeOrderStatusForDb(status: string) {
  return dbStatusByClientStatus[status] ?? status;
}

function normalizeOrderStatusForClient(status: string) {
  return clientStatusByDbStatus[status] ?? status;
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const rawStatus = searchParams.get('status');
    const status = rawStatus ? normalizeOrderStatusForDb(rawStatus) : null;

    // Use admin client so custom-JWT auth is not blocked by Supabase RLS.
    const adminDb = supabaseAdmin ?? supabase;

    const baseQuery = adminDb
      .from('orders')
      .select(
        `id, customer_id, assigned_seller_id, status, points_amount, created_at,
         offer:offer_id(id, points_price, product:product_id(name, game:game_id(name)))`
      )
      .order('created_at', { ascending: false });

    let queryBuilder = baseQuery;

    if (filter === 'my-orders') {
      queryBuilder = queryBuilder.eq('customer_id', auth.id);
    } else if (filter === 'my-tasks') {
      queryBuilder = queryBuilder.eq('assigned_seller_id', auth.id);
    } else if (filter === 'available') {
      // Only show open orders that haven't been assigned to a seller yet.
      queryBuilder = queryBuilder.eq('status', 'open').is('assigned_seller_id', null);
    }

    if (status) {
      queryBuilder = queryBuilder.eq('status', status);
    }

    const { data, error } = await queryBuilder;
    if (error) {
      console.error('Get orders error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let orders = (data ?? []) as any[];

    if (filter === 'available' && auth.role !== 'seller' && auth.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const normalizedOrders = orders.map((order) => ({
      id: order.id,
      product_name: order.offer?.product?.name ?? '',
      game_name: order.offer?.product?.game?.name ?? '',
      status: normalizeOrderStatusForClient(order.status),
      points_price: order.offer?.points_price ?? order.points_amount ?? 0,
      assigned_seller_id: order.assigned_seller_id,
      created_at: order.created_at,
    }));

    return NextResponse.json({
      success: true,
      orders: normalizedOrders,
    });
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth || auth.role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can create orders' }, { status: 403 });
    }

    const body = await request.json();
    const { game_id, offer_id, exclusive_offer_id, account_id, quantity } = createOrderSchema.parse(body);

    // Determine order type and get pricing
    let pointsPrice: number;
    let assignedSellerUserId: string | null = null;
    let orderInsertData: any;
    let gameName = 'Unknown Game';
    let offerName = 'Unknown Offer';
    let notificationVisibility: 'public' | 'private' = 'public';
    const orderQuantity = Number(quantity ?? 1);

    if (exclusive_offer_id) {
      // Handle exclusive offer order
      const { data: exclusiveOffer, error: exclusiveOfferError } = await db
        .from('exclusive_offers')
        .select('id, name, price, seller_id, game:game_id(name)')
        .eq('id', exclusive_offer_id)
        .eq('is_active', true)
        .single();

      if (exclusiveOfferError || !exclusiveOffer) {
        console.error('Exclusive offer query error:', exclusiveOfferError);
        return NextResponse.json({ error: 'Exclusive offer not found' }, { status: 404 });
      }

      const basePrice = Number(exclusiveOffer.price ?? 0);
      pointsPrice = basePrice * orderQuantity;
      assignedSellerUserId = String(exclusiveOffer.seller_id);
      gameName = exclusiveOffer.game?.name ?? 'Exclusive Offer';
      offerName = `${exclusiveOffer.name ?? 'Exclusive Pack'} x${orderQuantity}`;
      notificationVisibility = 'private';

      // Verify game account exists and belongs to user
      const { data: gameAccount, error: gameAccountError } = await db
        .from('game_accounts')
        .select('id')
        .eq('id', account_id)
        .eq('user_id', auth.id)
        .single();

      if (gameAccountError || !gameAccount) {
        return NextResponse.json({ error: 'Game account not found' }, { status: 404 });
      }

      orderInsertData = {
        customer_id: auth.id,
        offer_id: null,
        assigned_seller_id: assignedSellerUserId,
        game_account_id: account_id,
        points_amount: pointsPrice,
        status: 'open',
      };
    } else if (offer_id && game_id) {
      // Handle standard offer order
      const { data: offer, error: offerError } = await db
        .from('offers')
        .select('id, name, points_price, product:product_id(id, name, game_id, game:game_id(name))')
        .eq('id', offer_id)
        .eq('is_active', true)
        .single();

      if (offerError || !offer) {
        console.error('Offer query error:', offerError);
        return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
      }

      const productGameId = offer.product?.game_id;
      if (!productGameId) {
        return NextResponse.json({ error: 'Offer product is invalid' }, { status: 404 });
      }

      if (String(productGameId) !== String(game_id)) {
        return NextResponse.json(
          { error: 'Selected offer does not belong to the selected game' },
          { status: 400 }
        );
      }

      gameName = offer.product?.game?.name ?? 'Game Service';
      offerName = offer.name ?? offer.product?.name ?? 'Offer';

      // Validate at least one verified seller is available for this game.
      const { data: candidates, error: candidatesError } = await db
        .from('seller_games')
        .select('seller:seller_id(id, user_id, verification_status)')
        .eq('game_id', game_id)

      if (candidatesError) {
        console.error('Seller candidate query error:', candidatesError)
        return NextResponse.json({ error: 'Unable to route order' }, { status: 500 })
      }

      const verifiedCandidate = (candidates ?? []).find(
        (row: any) => row.seller?.user_id && row.seller?.verification_status === 'verified'
      )

      if (!verifiedCandidate?.seller?.user_id) {
        return NextResponse.json({ error: 'No verified sellers available for this game' }, { status: 400 })
      }

      const basePrice = Number(offer.points_price ?? 0);
      pointsPrice = basePrice * orderQuantity;

      const { data: gameAccount, error: gameAccountError } = await db
        .from('game_accounts')
        .select('id, game_id')
        .eq('id', account_id)
        .eq('user_id', auth.id)
        .single();

      if (gameAccountError || !gameAccount) {
        return NextResponse.json({ error: 'Game account not found' }, { status: 404 });
      }

      if (String(gameAccount.game_id) !== String(game_id)) {
        return NextResponse.json(
          { error: 'Selected game account does not match the selected game' },
          { status: 400 }
        );
      }

      orderInsertData = {
        customer_id: auth.id,
        offer_id,
        assigned_seller_id: null,
        game_account_id: account_id,
        points_amount: pointsPrice,
        status: 'open',
      };

      offerName = `${offerName} x${orderQuantity}`;
    } else {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

    // Customer pays a fixed platform fee per order.
    const platformFee = FIXED_PLATFORM_FEE;
    const totalCharge = Number((pointsPrice + platformFee).toFixed(1));

    // Verify user has enough points
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, points')
      .eq('id', auth.id)
      .single();

    if (userError || !user) {
      console.error('User query error:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentUser = user as any;
    const customerPoints = Number(currentUser.points ?? 0);

    if (customerPoints < totalCharge) {
      return NextResponse.json({ error: 'Insufficient points' }, { status: 400 });
    }

    // Deduct points from user
    const pointsRemaining = Number((customerPoints - totalCharge).toFixed(1));
    const updateData: any = { points: pointsRemaining };

    const { error: updateError } = await db
      .from('users')
      .update(updateData)
      .eq('id', auth.id);

    if (updateError) {
      console.error('Update user points error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Create order. Try full payload first (includes platform_fee/seller_earnings),
    // then fallback for older schemas without those columns.
    const orderPayloadFull = {
      ...orderInsertData,
      platform_fee: platformFee,
      seller_earnings: pointsPrice,
    };

    let orderData: any = null;
    let orderError: any = null;
    const insertFull = await db
      .from('orders')
      .insert(orderPayloadFull)
      .select('id')
      .single();
    orderData = insertFull.data;
    orderError = insertFull.error;

    if (orderError && (orderError.code === '42703' || orderError.code === 'PGRST204')) {
      const insertFallback = await db
        .from('orders')
        .insert(orderInsertData)
        .select('id')
        .single();
      orderData = insertFallback.data;
      orderError = insertFallback.error;
    }

    if (orderError || !orderData) {
      console.error('Create order error:', orderError);
      return NextResponse.json({ error: 'Unable to create order' }, { status: 500 });
    }

    // Record points transaction
    await db.from('point_transactions').insert({
      user_id: auth.id,
      amount: -totalCharge,
      transaction_type: 'spend',
      related_order_id: orderData.id,
      description: exclusive_offer_id
        ? `Exclusive offer order x${orderQuantity} (fee: ${platformFee})`
        : `Order creation x${orderQuantity} (fee: ${platformFee})`,
    });

    const sellerTelegramId = assignedSellerUserId
      ? (
          await db
            .from('users')
            .select('telegram_id')
            .eq('id', assignedSellerUserId)
            .maybeSingle()
        ).data?.telegram_id ?? null
      : null

    // No assigned seller → broadcast to the group so any seller can pick it up.
    const isUnassigned = !assignedSellerUserId
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID ?? null

    try {
      if (isUnassigned && groupChatId) {
        const safeEsc = (s: string) =>
          s.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')

        const msg = [
          '*🔔 NEW ORDER \\(OPEN FOR ALL SELLERS\\)*',
          '',
          `🎮 *Game:* ${safeEsc(gameName)}`,
          `📦 *Offer:* ${safeEsc(offerName)}`,
          `💰 *Price:* ${pointsPrice} points`,
          `👤 *Customer:* ${safeEsc(auth.username)}`,
          '',
          `🆔 *Order:* \\#${orderData.id}`,
        ].join('\n')

        await sendTelegramMessage(groupChatId, msg, {
          inline_keyboard: [[
            { text: '✅ Accept', callback_data: `order_accept:${orderData.id}` },
            { text: '❌ Reject', callback_data: `order_reject:${orderData.id}` },
          ]],
        })
      } else {
        await sendOrderNotification(
          {
            orderId: String(orderData.id),
            gameName,
            offerName,
            price: totalCharge,
            customerUsername: auth.username,
            visibility: notificationVisibility,
          },
          { telegramId: sellerTelegramId }
        )
      }
    } catch (telegramError) {
      console.error('Order created but Telegram notification failed:', telegramError)
    }

    return NextResponse.json(
      {
        success: true,
        id: orderData.id,
        order_id: orderData.id,
        points_amount: pointsPrice,
        platform_fee: platformFee,
        total_charge: totalCharge,
        message: 'Order created successfully. Waiting for seller to pick.',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create order error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
