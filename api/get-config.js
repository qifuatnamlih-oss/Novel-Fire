export default function handler(req, res) {
  // Mengambil data dari Environment Variables Vercel
  res.status(200).json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY
  });
}