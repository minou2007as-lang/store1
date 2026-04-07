import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, avatar_url, points, role')
      .eq('id', id)
      .eq('role', 'seller')
      .maybeSingle();

    if (userError) {
      console.error('Get seller user error:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('sellers')
      .select('id, business_name, business_description, total_tasks_completed, average_rating, total_reviews')
      .eq('user_id', id)
      .maybeSingle();

    if (profileError) {
      console.error('Get seller profile error:', profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const seller = {
      id: String(user.id),
      username: user.username,
      avatar_url: user.avatar_url,
      total_points: Number(user.points ?? 0),
      business_name: profile?.business_name ?? null,
      business_description: profile?.business_description ?? null,
      total_tasks_completed: Number(profile?.total_tasks_completed ?? 0),
      average_rating: Number(profile?.average_rating ?? 0),
      total_reviews: Number(profile?.total_reviews ?? 0),
    };

    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('id, offer_id, status, points_amount, created_at')
      .eq('assigned_seller_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (ordersError) {
      console.error('Get seller recent orders error:', ordersError);
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const offerIds = Array.from(
      new Set((ordersData ?? []).map((order: any) => order.offer_id).filter(Boolean))
    );

    const { data: offersData, error: offersError } = offerIds.length
      ? await supabase.from('offers').select('id, product_id').in('id', offerIds)
      : { data: [], error: null };

    if (offersError) {
      console.error('Get seller offers error:', offersError);
      return NextResponse.json({ error: offersError.message }, { status: 500 });
    }

    const productIds = Array.from(
      new Set((offersData ?? []).map((offer: any) => offer.product_id).filter(Boolean))
    );

    const { data: productsData, error: productsError } = productIds.length
      ? await supabase.from('products').select('id, game_id').in('id', productIds)
      : { data: [], error: null };

    if (productsError) {
      console.error('Get seller products error:', productsError);
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    const gameIds = Array.from(
      new Set((productsData ?? []).map((product: any) => product.game_id).filter(Boolean))
    );

    const { data: gamesData, error: gamesError } = gameIds.length
      ? await supabase.from('games').select('id, name').in('id', gameIds)
      : { data: [], error: null };

    if (gamesError) {
      console.error('Get seller games error:', gamesError);
      return NextResponse.json({ error: gamesError.message }, { status: 500 });
    }

    const offerToProduct = new Map((offersData ?? []).map((offer: any) => [String(offer.id), String(offer.product_id)]));
    const productToGame = new Map((productsData ?? []).map((product: any) => [String(product.id), String(product.game_id)]));
    const gameNameById = new Map((gamesData ?? []).map((game: any) => [String(game.id), String(game.name)]));

    const recentOrders = (ordersData ?? []).map((order: any) => {
      const productId = order.offer_id ? offerToProduct.get(String(order.offer_id)) : undefined;
      const gameId = productId ? productToGame.get(String(productId)) : undefined;
      const gameName = gameId ? gameNameById.get(String(gameId)) ?? null : null;

      return {
        id: String(order.id),
        game_name: gameName,
        status: order.status,
        agreed_amount: Number(order.points_amount ?? 0),
        created_at: order.created_at,
      };
    });

    const { data: reviewsData, error: reviewsError } = await supabase
      .from('reviews')
      .select('rating, comment, created_at, customer:customer_id(username)')
      .eq('seller_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (reviewsError) {
      console.error('Get seller reviews error:', reviewsError);
      return NextResponse.json({ error: reviewsError.message }, { status: 500 });
    }

    const reviews = (reviewsData ?? []).map((review: any) => ({
      username: review.customer?.username ?? 'Unknown',
      seller_review: review.comment ?? null,
      seller_rating: review.rating ?? null,
      comment: review.comment ?? null,
      rating: review.rating ?? null,
      created_at: review.created_at,
    }));

    return NextResponse.json({
      success: true,
      seller,
      recentOrders,
      reviews,
    });
  } catch (error) {
    console.error('Get seller error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
