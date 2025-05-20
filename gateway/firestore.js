const admin = require('firebase-admin');

// Service account dosyasını doğrudan kullan
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

/**
 * Yeni bir chat mesajı ekler.
 * @param {string} chatId - Chat odası ID'si
 * @param {object} message - { sender, text, timestamp }
 */
async function addMessage(chatId, message) {
  return db.collection('chats').doc(chatId).collection('messages').add(message);
}

/**
 * Bir chat odasındaki tüm mesajları getirir (zaman sırasına göre).
 * @param {string} chatId
 */
async function getMessages(chatId) {
  const snapshot = await db.collection('chats').doc(chatId).collection('messages').orderBy('timestamp').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

module.exports = {
  addMessage,
  getMessages,
  db,
};
