const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const vendorsService = {
  async getAll() {
    const res = await fetch(`${BASE_URL}/vendors`);
    return res.json();
  },

  async getById(id: string) {
    const res = await fetch(`${BASE_URL}/vendors/${id}`);
    return res.json();
  },
};
