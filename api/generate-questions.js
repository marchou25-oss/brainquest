'use strict';
const https = require('https');

const CAT_NAMES = {
  culture:  "la culture générale (géographie, arts, littérature, musique, sport, gastronomie…)",
  maths:    "les mathématiques (arithmétique, géométrie, logique, algèbre, probabilités…)",
  francais: "la langue française (grammaire, orthographe, vocabulaire, figures de style, littérature…)",
  sciences: "les sciences (biologie, chimie, physique, astronomie, environnement, corps humain…)",
  histoire: "l'histoire et la géographie (France, monde, grandes dates, personnages, pays, capitales…)",
  sport:    "le sport (football, tennis, basket, JO, champions du monde, records, athlètes célèbres, règles des sports…)",
  cinema:   "le cinéma et les séries (films cultes, acteurs, réalisateurs, oscars, séries populaires, personnages fictifs…)",
  musique:  "la musique (artistes français et internationaux, albums mythiques, genres musicaux, histoire de la musique, chansons célèbres…)",
  tech:     "la technologie et les jeux vidéo (inventions, applications célèbres, personnages de jeux vidéo, histoire du web, réseaux sociaux, gadgets…)",
  monde:    "le monde et la société (pays, cultures, traditions, gastronomie mondiale, phénomènes sociaux, records mondiaux, drapeaux…)",
  random:   "un mélange surprise de thèmes très variés : chaque question doit venir d'un domaine DIFFÉRENT parmi culture générale, maths, français, sciences, histoire, sport, cinéma, musique, technologie et monde. Les 5 questions doivent absolument couvrir 5 domaines distincts, une question par domaine."
};

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé GROQ_API_KEY manquante dans les variables d'environnement Vercel." });

  const { category } = req.body || {};
  if (!CAT_NAMES[category]) return res.status(400).json({ error: 'Catégorie invalide : ' + category });

  try {
    const questions = await callGroq(category, apiKey);
    res.status(200).json({ questions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

function callGroq(category, apiKey) {
  return new Promise((resolve, reject) => {
    const prompt =
      `Génère exactement 5 questions de quiz originales sur ${CAT_NAMES[category]} pour des joueurs français de 10-25 ans.\n` +
      `Varie les niveaux (2 faciles, 2 moyennes, 1 difficile). Sois créatif et surprenant.\n` +
      `Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown :\n` +
      `[{"q":"Question ?","o":["A","B","C","D"],"a":0,"e":"Explication courte."}]`;

    const payload = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Tu es un expert en quiz éducatifs. Tu réponds UNIQUEMENT avec un tableau JSON valide, sans markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 1500
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
          if (parsed.error) { reject(new Error('Erreur Groq : ' + parsed.error.message)); return; }
          const text = parsed.choices?.[0]?.message?.content || '[]';
          const questions = JSON.parse(text.replace(/```json|```/g, '').trim());
          if (!Array.isArray(questions) || questions.length === 0) throw new Error('Réponse invalide');
          resolve(questions);
        } catch (e) { reject(new Error('Erreur traitement : ' + e.message)); }
      });
    });
    req.on('error', e => reject(new Error('Erreur réseau : ' + e.message)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Délai dépassé')); });
    req.write(payload);
    req.end();
  });
}
