const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const partsService = {
  async search(query: string) {
    const res = await fetch(`${BASE_URL}/parts?q=${encodeURIComponent(query)}`);
    return res.json();
  },

  async getById(id: string) {
    const res = await fetch(`${BASE_URL}/parts/${id}`);
    return res.json();
  },
};
