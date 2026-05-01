export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { content, customPrompt } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY; // Tambahkan key ini di Vercel Env

  let prompt = `
    Perbaiki teks novel berikut menjadi Bahasa Indonesia yang baik, benar, dan mengalir (literer).
    Ketentuan:
    1. Hindari penggunaan kata ganti "saya" dan "anda" dalam narasi. 
    2. Gunakan kata ganti orang ketiga (ia, mereka) atau struktur kalimat pasif yang elegan jika memungkinkan.
    3. Kata "saya" dan "anda" HANYA diperbolehkan jika berada di dalam tanda kutip dialog ("...").
    4. Jangan mengubah makna cerita, hanya perbaiki gaya bahasa dan tata bahasa (EYD/PUEBI).
    
  `;

  if (customPrompt) {
    prompt += `\nInstruksi Tambahan Khusus: ${customPrompt}\n`;
  }

  prompt += `\nTeks yang harus diperbaiki:\n${content}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(200).json({ refinedContent: content, error: data.error.message });
    }

    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
      return res.status(200).json({ refinedContent: content, warning: 'AI tidak memberikan hasil, menggunakan teks asli.' });
    }

    const refinedText = data.candidates[0].content.parts[0].text;
    res.status(200).json({ refinedContent: refinedText });
  } catch (error) {
    res.status(200).json({ refinedContent: content, error: 'Gagal memproses teks dengan AI' });
  }
}