import { Duffel } from '@duffel/api';

if (!process.env.DUFFEL_ACCESS_TOKEN) {
  console.warn('DUFFEL_ACCESS_TOKEN is not set. Flight search will not work.');
}

export const duffel = new Duffel({
  token: process.env.DUFFEL_ACCESS_TOKEN || '',
});
