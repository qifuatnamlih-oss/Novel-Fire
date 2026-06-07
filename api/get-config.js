export default function handler(req, res) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Validasi: Pastikan variabel lingkungan tersedia sebelum mengirim respon
  if (!url || !key) {
    console.error("API Error: Supabase environment variables are missing.");
    return res.status(500).json({
      error: "Konfigurasi server tidak lengkap. Pastikan Environment Variables sudah diatur."
    });
  }

  // Tambahkan Caching: Data ini statis, jadi kita bisa menyimpannya di Edge/Browser cache.
  // max-age=3600 (1 jam di browser), s-maxage=86400 (24 jam di Vercel Edge Cache)
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate');

  res.status(200).json({ url, key });
}
