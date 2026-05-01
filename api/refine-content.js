import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { content, customPrompt } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY; // Tambahkan key ini di Vercel Env

  if (!API_KEY) {
    console.error("Missing GEMINI_API_KEY");
    return res.status(200).json({ refinedContent: content, error: 'Konfigurasi API Key tidak ditemukan' });
  }

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
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      // Longgarkan filter keamanan agar tidak mudah memicu error "Blocked" pada konten novel
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ]
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    // Cek apakah ada hasil yang dikembalikan
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("AI tidak mengembalikan hasil (mungkin konten diblokir).");
    }

    const refinedText = response.text();
    res.status(200).json({ refinedContent: refinedText });
  } catch (error) {
    // Jika limit tercapai atau error lain, kembalikan konten asli agar proses tetap jalan
    console.error("Gemini API Error details:", error.message || error);
    res.status(200).json({ refinedContent: content, error: 'Gagal memproses teks dengan AI' });
  }
}