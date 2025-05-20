const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const { addMessage, getMessages } = require('./firestore');
const { parseIntent } = require('./llm');

const app = express();
app.use(express.json());
app.use(cors());

// Midterm API base URL (örnek)
const MIDTERM_API_BASE = process.env.MIDTERM_API_BASE_URL;
const apiKey = process.env.GEMINI_API_KEY;
const geminiUrl = `${process.env.GEMINI_API_URL}?key=${apiKey}`;
const LOGIN_CREDENTIALS = { username: process.env.LOGIN_USERNAME, password: process.env.LOGIN_PASSWORD };
let accessToken = null;

console.log('MIDTERM_API_BASE:', MIDTERM_API_BASE);
console.log('geminiUrl:', geminiUrl);

async function loginAndGetToken() {
  try {
    const response = await axios.post(`${MIDTERM_API_BASE}/login`, LOGIN_CREDENTIALS);
    accessToken = response.data.accessToken;
    console.log('Gateway login başarılı, token alındı.');
  } catch (err) {
    console.error('Gateway login başarısız:', err.response?.data || err.message);
  }
}

// Gateway başlarken login ol
loginAndGetToken();

// Proxy: Query Bill
app.post('/api/query-bill', async (req, res) => {
  try {
    const response = await axios.post(`${MIDTERM_API_BASE}/query-bill`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Query Bill (GET)
app.get('/api/query-bill', async (req, res) => {
    try {
      const response = await axios.get(`${MIDTERM_API_BASE}/queryBill`, { params: req.query });
      res.json(response.data);
    } catch (err) {
      res.status(500).json({ error: err.message, details: err.response?.data });
    }
  });
  
  // Query Bill Detailed (GET)
  app.get('/api/query-bill-detailed', async (req, res) => {
    try {
      const response = await axios.get(`${MIDTERM_API_BASE}/queryBillDetailed`, { params: req.query });
      res.json(response.data);
    } catch (err) {
      res.status(500).json({ error: err.message, details: err.response?.data });
    }
  });

// Proxy: Query Bill Detailed
app.post('/api/query-bill-detailed', async (req, res) => {
  try {
    const response = await axios.post(`${MIDTERM_API_BASE}/query-bill-detailed`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy: Make Payment
app.post('/api/make-payment', async (req, res) => {
  try {
    const response = await axios.post(`${MIDTERM_API_BASE}/payBill`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Yeni mesaj ekle ve LLM + Midterm API zinciri
app.post('/api/chat/:chatId/message', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { sender, text } = req.body;
    const timestamp = Date.now();
    // 1. Kullanıcı mesajını kaydet
    await addMessage(chatId, { sender, text, timestamp });

    // 2. LLM ile intent/parametre parse et
    let llmResult;
    try {
      llmResult = await parseIntent(text);
    } catch (e) {
      await addMessage(chatId, {
        sender: 'assistant',
        text: 'Mesajınızı anlayamadım. Size şu konularda yardımcı olabilirim:\n- Fatura sorgulama\n- Detaylı fatura sorgulama\n- Fatura ödeme\nLütfen ne yapmak istediğinizi açıkça belirtin.',
        timestamp: Date.now()
      });
      return res.json({ success: true, info: 'LLM parse başarısız' });
    }

    // 3. Intent'e göre ilgili Midterm API'ye istek at
    let apiResponseText = '';
    // Parametre eksikliği kontrolü
    if (
      (llmResult.intent === 'query_bill' || llmResult.intent === 'query_bill_detailed') &&
      (!llmResult.params.subscriberNo || !llmResult.params.month || !llmResult.params.year)
    ) {
      apiResponseText = "Fatura sorgulama için lütfen abone numarası, ay ve yıl bilgisini de girin.";
    } else if (
      llmResult.intent === 'make_payment' &&
      (!llmResult.params.subscriberNo || !llmResult.params.month || !llmResult.params.year || !llmResult.params.amount)
    ) {
      apiResponseText = "Fatura ödemesi için lütfen abone numarası, ay, yıl ve ödeme tutarını da girin.";
    } else {
      try {
        const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
        if (llmResult.intent === 'query_bill') {
          const response = await axios.get('http://localhost:3001/api/query-bill', { params: llmResult.params, headers });
          apiResponseText = JSON.stringify(response.data);
        } else if (llmResult.intent === 'query_bill_detailed') {
          const response = await axios.get('http://localhost:3001/api/query-bill-detailed', { params: llmResult.params, headers });
          apiResponseText = JSON.stringify(response.data);
        } else if (llmResult.intent === 'make_payment') {
          const response = await axios.post('http://localhost:3001/api/make-payment', llmResult.params, { headers });
          apiResponseText = JSON.stringify(response.data);
        } else {
          apiResponseText = 'Desteklenmeyen bir işlem istediniz.';
        }
      } catch (e) {
        let errorMsg = 'API çağrısı başarısız: ';
        if (e.response?.data?.error) {
          errorMsg += e.response.data.error;
        } else if (e.response?.data?.message) {
          errorMsg += e.response.data.message;
        } else {
          errorMsg += e.message;
        }
        apiResponseText = errorMsg;
      }
    }

    // 4. Yanıtı assistant olarak chat'e ekle
    await addMessage(chatId, { sender: 'assistant', text: apiResponseText, timestamp: Date.now() });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mesajları getir
app.get('/api/chat/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const messages = await getMessages(chatId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});