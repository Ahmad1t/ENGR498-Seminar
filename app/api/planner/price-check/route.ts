import { NextResponse } from 'next/server';
import { Duffel } from '@duffel/api';

const duffel = new Duffel({ token: process.env.DUFFEL_API_TOKEN || '' });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { origin, destination, departureDate, returnDate, tripType, adults = 1, children = 0, cabinClass = 'economy' } = body;

    console.log('\n💰 PRICE CHECK — received params:', JSON.stringify({ origin, destination, departureDate, returnDate, tripType, adults, children, cabinClass }));

    if (!origin || !destination || !departureDate) {
      console.log('💰 PRICE CHECK — missing required fields, aborting');
      return NextResponse.json({ cheapestPrice: null, error: 'Missing required fields' });
    }

    const slices: any[] = [{ origin, destination, departure_date: departureDate }];
    if (tripType === 'round_trip' && returnDate) {
      slices.push({ origin: destination, destination: origin, departure_date: returnDate });
    }

    const passengers = [
      ...Array(adults).fill(null).map(() => ({ type: 'adult' as const })),
      ...Array(children).fill(null).map(() => ({ type: 'child' as const })),
    ];

    console.log('💰 PRICE CHECK — calling Duffel with:', { slices: JSON.stringify(slices), passengers: passengers.length, cabinClass });

    const offerRequest = await duffel.offerRequests.create({
      slices,
      passengers,
      ...(cabinClass && cabinClass !== 'economy' && { cabin_class: cabinClass }),
    });

    console.log('💰 PRICE CHECK — Duffel offer request ID:', offerRequest.data.id);

    const offers = await duffel.offers.list({
      offer_request_id: offerRequest.data.id,
      sort: 'total_amount',
    });

    console.log('💰 PRICE CHECK — Duffel returned', offers.data?.length || 0, 'offers');

    const cheapest = offers.data?.[0];
    const cheapestPrice = cheapest ? parseFloat(cheapest.total_amount) : null;

    console.log('💰 PRICE CHECK — cheapest price found:', cheapestPrice ? `$${cheapestPrice}` : 'NONE');

    return NextResponse.json({
      cheapestPrice,
      currency: cheapest?.total_currency || 'USD',
    });
  } catch (error: any) {
    console.error('💰 PRICE CHECK ERROR — FULL DETAILS:', {
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
      response: JSON.stringify(error?.response?.data || error?.response || 'no response'),
      status: error?.status || error?.response?.status,
      type: error?.constructor?.name,
    });
    return NextResponse.json({ cheapestPrice: null, error: error?.message || 'Unknown Duffel error' });
  }
}
