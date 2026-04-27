import { NextResponse } from 'next/server';
import { duffel } from '@/lib/duffel';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slices, passengers, cabin_class } = body;

    if (!slices || !Array.isArray(slices) || slices.length === 0) {
      return NextResponse.json({ error: 'Missing slices' }, { status: 400 });
    }

    const offerRequest = await duffel.offerRequests.create({
      slices: slices.map((slice: any) => ({
        origin: slice.origin,
        destination: slice.destination,
        departure_date: slice.departure_date,
      })) as any,
      passengers: passengers || [{ type: 'adult' }],
      ...(cabin_class && { cabin_class }),
    });

    // Fetch offers for this request
    const offers = await duffel.offers.list({
      offer_request_id: offerRequest.data.id,
      sort: 'total_amount',
    });

    return NextResponse.json({
      offerRequest: offerRequest.data,
      offers: offers.data,
    });
  } catch (error: any) {
    console.error('Duffel API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch flights' }, { status: 500 });
  }
}
