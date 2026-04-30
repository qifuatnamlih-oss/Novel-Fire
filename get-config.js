export default function handler(req, res) {
  // Hanya mengembalikan URL dan KEY dari environment variable Vercel
  res.status(200).json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  });
}