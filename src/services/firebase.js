const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  setDoc, 
  doc 
} = require('firebase/firestore');

require('dotenv').config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

let app, db;

try {
  // Inicializa o app Firebase com try/catch para evitar falhar caso não tenha as credenciais
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (error) {
  console.warn('[Firebase] Não foi possível inicializar. Verifique suas credenciais em firebase.js');
}

/**
 * Salva ou Atualiza a Dashboard do mês específico no Firestore.
 * @param {string} monthYear - Ex: "Setembro 2026"
 * @param {Object} metrics - Dados consolidados (totais, metas, etc)
 */
async function saveDashboardToFirebase(monthYear, metrics) {
  if (!db) throw new Error("Firebase não foi inicializado corretamente.");

  try {
    // Usamos o mês/ano como o ID do documento para evitar duplicatas (ex: "Setembro_2026")
    const docId = monthYear.replace(/\s+/g, '_');
    const dashboardRef = doc(db, 'mensais_dashboards', docId);

    const payload = {
      monthYear,
      metrics,
      updatedAt: new Date().toISOString()
    };

    await setDoc(dashboardRef, payload, { merge: true });
    return { success: true, docId };
  } catch (error) {
    console.error("[Firebase] Erro ao salvar a dashboard:", error);
    throw error;
  }
}

/**
 * Obtém todos os históricos de Dashboards salvos
 */
async function getDashboardsFromFirebase() {
  if (!db) throw new Error("Firebase não foi inicializado corretamente.");

  try {
    const q = query(collection(db, 'mensais_dashboards'), orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const dashboards = [];
    querySnapshot.forEach((doc) => {
      dashboards.push({ id: doc.id, ...doc.data() });
    });

    return dashboards;
  } catch (error) {
    console.error("[Firebase] Erro ao buscar as dashboards:", error);
    throw error;
  }
}

async function saveAvatarToFirebase(analystName, base64Image) {
  if (!db) return;
  try {
    const avatarRef = doc(db, 'avatars', cleanStringForId(analystName));
    await setDoc(avatarRef, {
      analystName,
      image: base64Image,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[Firebase] Erro ao salvar avatar:", error);
  }
}

async function getAvatarsFromFirebase() {
  if (!db) return [];
  try {
    const q = query(collection(db, 'avatars'));
    const querySnapshot = await getDocs(q);
    const avatars = [];
    querySnapshot.forEach((doc) => {
      avatars.push({ id: doc.id, ...doc.data() });
    });
    return avatars;
  } catch (error) {
    console.error("[Firebase] Erro ao buscar avatares:", error);
    return [];
  }
}

function cleanStringForId(str) {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

module.exports = {
  saveDashboardToFirebase,
  getDashboardsFromFirebase,
  saveAvatarToFirebase,
  getAvatarsFromFirebase
};
