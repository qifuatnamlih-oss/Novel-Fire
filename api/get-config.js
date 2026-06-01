export default function handler(req, res) {
  // Mengambil data dari Environment Variables Vercel
  res.status(200).json({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });
}
