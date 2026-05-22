const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const quotesService = {
  async getAll() {
    const res = await fetch(`${BASE_URL}/quotes`);
    return res.json();
  },

  async create(quoteData: { partId: string; vendorId: string; price: number; quantity: number }) {
    const res = await fetch(`${BASE_URL}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteData),
    });
    return res.json();
  },
};
