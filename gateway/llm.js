const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
const url = `${process.env.GEMINI_API_URL}?key=${apiKey}`;

/**
 * LLM'e mesaj gönderir ve cevabı döner.
 * @param {string} prompt - Kullanıcıdan gelen mesaj veya prompt.
 * @returns {Promise<string>} - LLM cevabı
 */
async function askGemini(prompt) {
  try {
    const response = await axios.post(url, {
      contents: [
        { parts: [{ text: prompt }] }
      ]
    });
    // Gemini API response formatı
    return response.data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error('Gemini API error:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * Kullanıcı mesajından intent ve parametreleri çıkarır.
 * @param {string} message - Kullanıcı mesajı
 * @returns {Promise<{intent: string, params: object}>}
 */
async function parseIntent(message) {
  const prompt = `Aşağıdaki kullanıcı mesajını analiz et ve niyetini (intent) ve parametrelerini SADECE GEÇERLİ BİR JSON olarak döndür. Kod bloğu, açıklama veya başka bir şey ekleme. Sadece tek satırda JSON döndür.\nÖrnek:\n{"intent": "query_bill", "params": {"subscriberNo": "123", "month": 5, "year": 2024}}\n\nKullanıcı mesajı: "${message}"`;
  const raw = await askGemini(prompt);
  console.log("Gemini yanıtı:", raw); // Gemini yanıtını logla
  const cleaned = raw.replace(/```json|```/g, '').trim();
  console.log("Temizlenmiş Gemini yanıtı:", cleaned);
  try {
    // Sadece JSON döndürmesini bekliyoruz
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error('LLM yanıtı JSON formatında değil: ' + cleaned);
  }
}

module.exports = {
  askGemini,
  parseIntent,
};
