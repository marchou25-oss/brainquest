'use strict';
const https = require('https');

const CAT_NAMES = {
  culture:  "la culture générale",
  maths:    "les mathématiques",
  francais: "la langue française",
  sciences: "les sciences",
  histoire: "l'histoire et la géographie",
  sport:    "le sport",
  cinema:   "le cinéma et les séries",
  musique:  "la musique",
  tech:     "la technologie et les jeux vidéo",
  monde:    "le monde et la société"
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY manquante' });

  let { category, playerName } = req.body || {};
  if (!CAT_NAMES[category]) return res.status(400).json({ error: 'Catégorie invalide' });
  playerName = String(playerName || 'Joueur 1').replace(/[<>&"']/g, '').slice(0, 15).trim() || 'Joueur 1';

  try {
    // Generate questions
    const questions = await callGroq(category, groqKey);

    // Create unique 6-char code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Store duel in Upstash with 24h TTL
    const duel = {
      code, category,
      catLabel: CAT_NAMES[category],
      questions,
      players: [],
      createdAt: Date.now()
    };
    await upstashCmd(['SET', `duel-${code}`, JSON.stringify(duel), 'EX', '86400']);

    res.status(200).json({ code, category, questions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

function callGroq(category, apiKey) {
  return new Promise((resolve, reject) => {
    const seed = Date.now();
    const prompt =
      `Génère exactement 5 questions de quiz sur ${CAT_NAMES[category]} pour des joueurs français de 10-25 ans.\n` +
      `RÈGLES : chaque réponse correcte doit être un fait indiscutable. Varie les difficultés. Seed: ${seed}\n` +
      `JSON uniquement : [{"q":"?","o":["A","B","C","D"],"a":0,"e":"Explication."}]`;

    const payload = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Expert quiz éducatif. Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 0.9, max_tokens: 2000
    });

    const options = {
      hostname: 'api.groq.com', port: 443,
      path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(payload) }
    };

    const req = https.request(options, (resp) => {
      let raw = '';
      resp.on('data', c => raw += c);
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) { reject(new Error(parsed.error.message)); return; }
          const text = parsed.choices?.[0]?.message?.content || '[]';
          const questions = JSON.parse(text.replace(/```json|```/g, '').trim());
          if (!Array.isArray(questions) || questions.length === 0) throw new Error('Réponse invalide');
          resolve(questions);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

function upstashCmd(cmd) {
  return new Promise((resolve, reject) => {
    const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
    const payload = JSON.stringify(cmd);
    const options = {
      hostname: url.hostname, port: 443, path: '/', method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options, (resp) => {
      let raw = '';
      resp.on('data', c => raw += c);
      resp.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
