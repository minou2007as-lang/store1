import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { z } from 'zod';

const createOrderSchema = z.object({
  game_id: z.string().min(1),
  seller_id: z.string().min(1),
  offer_id: z.string().min(1),
  account_id: z.string().min(1),
});

function normalizeUserBalance(user: any) {
  return {
    ...user,
    total_points: Number(user.points ?? 0),
    balance: Number(user.balance ?? user.points ?? 0),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const status = searchParams.get('status');

    const baseQuery = supabase
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
      queryBuilder = queryBuilder.eq('status', 'open');
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

    if (filter === 'available' && auth.role === 'seller') {
      const { data: sellerGames, error: gamesError } = await supabase
        .from('seller_games')
        .select('game_id')
        .eq('seller_id', auth.id);

      if (gamesError) {
        console.error('Seller games query error:', gamesError);
        return NextResponse.json({ error: gamesError.message }, { status: 500 });
      }

      const gameIds = new Set((sellerGames ?? []).map((row: any) => row.game_id));
      orders = orders.filter(
        (order) =>
          order.offer?.product?.game?.id &&
          gameIds.has(order.offer.product.game.id)
      );
    }

    const normalizedOrders = orders.map((order) => ({
      id: order.id,
      product_name: order.offer?.product?.name ?? '',
      game_name: order.offer?.product?.game?.name ?? '',
      status: order.status,
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
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth || auth.role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can create orders' }, { status: 403 });
    }

    const body = await request.json();
    const { game_id, seller_id, offer_id, account_id } = createOrderSchema.parse(body);

    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, points_price, product_id')
      .eq('id', offer_id)
      .eq('is_active', true)
      .single();

    if (offerError || !offer) {
      console.error('Offer query error:', offerError);
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, game_id')
      .eq('id', offer.product_id)
      .single();

    if (productError || !product) {
      console.error('Product query error:', productError);
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.game_id !== game_id) {
      return NextResponse.json(
        { error: 'Selected offer does not belong to the selected game' },
        { status: 400 }
      );
    }

    const { data: sellerGame, error: sellerGameError } = await supabase
      .from('seller_games')
      .select('id')
      .eq('seller_id', seller_id)
      .eq('game_id', game_id)
      .single();

    if (sellerGameError || !sellerGame) {
      return NextResponse.json(
        { error: 'Seller is not assigned to the selected game' },
        { status: 400 }
      );
    }

    const { data: gameAccount, error: gameAccountError } = await supabase
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

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, points, balance')
      .eq('id', auth.id)
      .single();

    if (userError || !user) {
      console.error('User query error:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentUser = user as any;
    const customerPoints = Number(currentUser.points ?? currentUser.balance ?? 0);

    if (customerPoints < offer.points_price) {
      return NextResponse.json({ error: 'Insufficient points' }, { status: 400 });
    }

    const pointsRemaining = customerPoints - offer.points_price;
    const updateData: any = {};
    if ('points' in user) {
      updateData.points = pointsRemaining;
    } else {
      updateData.balance = pointsRemaining;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', auth.id);

    if (updateError) {
      console.error('Update user points error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id: auth.id,
        offer_id,
        assigned_seller_id: seller_id,
        game_account_id: account_id,
        points_amount: offer.points_price,
        status: 'open',
      })
      .select('id')
      .single();

    if (orderError || !orderData) {
      console.error('Create order error:', orderError);
      return NextResponse.json({ error: 'Unable to create order' }, { status: 500 });
    }

    await supabase.from('point_transactions').insert({
      user_id: auth.id,
      amount: -offer.points_price,
      transaction_type: 'spend',
      related_order_id: orderData.id,
      description: 'Order creation',
    });

    return NextResponse.json(
      {
        success: true,
        order_id: orderData.id,
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
