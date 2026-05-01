import { GoogleGenerativeAI } from "@google/generative-ai";

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
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const refinedText = response.text();

    if (!refinedText) {
      throw new Error("AI tidak menghasilkan teks");
    }

    res.status(200).json({ refinedContent: refinedText });
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(200).json({ refinedContent: content, error: 'Gagal memproses teks dengan AI' });
  }
}