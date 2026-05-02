import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { content, customPrompt } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY?.trim(); // Tambahkan key ini di Vercel Env (trim untuk hapus spasi tak sengaja)

  if (!API_KEY) {
    console.error("DEBUG: GEMINI_API_KEY is not defined in process.env");
    return res.status(200).json({ refinedContent: content, error: 'Konfigurasi API Key tidak ditemukan' });
  }

  let prompt = `
    Tugas: Bertindaklah sebagai editor novel profesional. Tulis ulang dan perbaiki teks novel di bawah ini.
    Instruksi Wajib:
    1. Gunakan gaya bahasa naratif yang elegan, mengalir, dan puitis (literer).
    2. Narasi HARUS menggunakan kata ganti orang ketiga (ia, mereka, [nama tokoh]).
    3. Hapus kata ganti "saya" dan "anda" dari narasi, KECUALI di dalam percakapan/dialog (tanda kutip).
    4. Perbaiki ejaan (PUEBI/EYD) dan buat kalimat yang monoton menjadi lebih bervariasi.
  `;

  if (customPrompt) {
    prompt += `\nInstruksi Tambahan Khusus: ${customPrompt}\n`;
  }

  prompt += `\n\nTEKS NOVEL UNTUK DIPERBAIKI:\n${content}`;

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ 
      // Sesuaikan identifier model dengan hasil 'curl' jika versi 1.5-flash 404.
      // Standar stabil: "gemini-1.5-flash"
      // Berdasarkan curl kamu: "gemini-2.5-flash"
      model: "gemini-1.5-flash",
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
      generationConfig: {
        temperature: 0.8, // Membuat AI lebih kreatif dalam pemilihan kata
        topP: 0.95,
      }
    }); // Menghapus parameter apiVersion kustom agar SDK menentukan default terbaik (v1)

    const result = await model.generateContent(prompt);
    const response = result.response;
    
    if (!response || !response.candidates || response.candidates.length === 0) {
      throw new Error("AI tidak mengembalikan hasil (mungkin konten diblokir).");
    }

    const refinedText = response.text();
    
    // Tambahkan log di server untuk verifikasi (bisa dilihat di Vercel Dashboard)
    console.log("AI Berhasil memproses teks.");
    res.status(200).json({ refinedContent: refinedText });
  } catch (error) {
    // Jika limit tercapai atau error lain, kembalikan konten asli agar proses tetap jalan
    console.error("Gemini API Error:", error.message);
    res.status(200).json({ refinedContent: content, error: error.message || 'Terjadi kesalahan pada AI' });
  }
}