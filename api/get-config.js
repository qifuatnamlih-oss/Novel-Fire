export default function handler(req, res) {
  // Set cache control agar tidak membebani serverless function
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  
  res.status(200).json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  });
}