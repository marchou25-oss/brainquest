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
  monde:    "le monde et la société",
  random:   "un mélange de domaines très variés (chaque question doit venir d'un domaine DIFFÉRENT)"
};

const CAT_SUBTOPICS = {
  culture:  ["géographie mondiale","littérature classique","mythologie","gastronomie","proverbes","animaux","inventions célèbres","arts et peinture","architecture","religions du monde"],
  maths:    ["arithmétique mentale","géométrie plane","logique et déduction","statistiques","nombres premiers","fractions et pourcentages","algèbre","mesures et conversions","probabilités","suites numériques"],
  francais: ["grammaire et conjugaison","orthographe","figures de style","étymologie","homophones","locutions latines","littérature française","vocabulaire rare","synonymes","ponctuation"],
  sciences: ["corps humain","chimie des éléments","physique classique","astronomie","biologie animale","botanique","écologie","médecine","génétique","géologie"],
  histoire: ["Antiquité","Moyen-Âge","Révolution française","guerres mondiales","exploration et découvertes","civilisations disparues","Présidents français","traités et accords","Révolution industrielle","histoire africaine"],
  sport:    ["football mondial","JO été et hiver","tennis grand chelem","cyclisme","natation","athlétisme","basket-ball","formule 1","rugby","sports extrêmes"],
  cinema:   ["films cultes français","Hollywood classique","réalisateurs légendaires","oscars et césars","séries américaines","animés japonais","science-fiction","comédies cultes","thrillers","films d'animation"],
  musique:  ["pop française","rock classique","rap et hip-hop","jazz et blues","classique","reggae","électro","chansons françaises","boys bands","festivals célèbres"],
  tech:     ["histoire d'internet","jeux vidéo rétro","jeux vidéo modernes","réseaux sociaux","inventions tech","informatique","smartphones","intelligence artificielle","cryptomonnaies","robots et drones"],
  monde:    ["capitales du monde","drapeaux","gastronomie internationale","traditions et coutumes","records mondiaux","langues et dialectes","monnaies","religions","géographie physique","démographie"]
};

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé GROQ_API_KEY manquante." });

  const { category } = req.body || {};
  if (!CAT_NAMES[category]) return res.status(400).json({ error: 'Catégorie invalide : ' + category });

  try {
    const questions = await callGroq(category, apiKey);
    res.status(200).json({ questions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

function getSubtopics(category) {
  const topics = CAT_SUBTOPICS[category] || [];
  if (topics.length === 0) return '';
  const shuffled = topics.sort(() => Math.random() - 0.5).slice(0, 5);
  return `\nSous-thèmes OBLIGATOIRES pour cette partie (1 question par sous-thème) : ${shuffled.join(', ')}.`;
}

function callGroq(category, apiKey) {
  return new Promise((resolve, reject) => {
    const subtopics = category === 'random' ? '' : getSubtopics(category);
    const seed = Date.now();

    const prompt =
      `Tu es un expert en quiz éducatifs avec une rigueur académique absolue.\n\n` +
      `Génère exactement 5 questions de quiz sur ${CAT_NAMES[category]} pour des joueurs français de 10-25 ans.\n` +
      `${subtopics}\n\n` +
      `RÈGLES DE QUALITÉ STRICTES :\n` +
      `1. Chaque réponse correcte DOIT être un fait indiscutable et vérifiable\n` +
      `2. Les 3 mauvaises réponses doivent être plausibles mais clairement incorrectes\n` +
      `3. JAMAIS de questions ambiguës ou dont la réponse peut être contestée\n` +
      `4. JAMAIS deux questions sur le même sous-thème\n` +
      `5. Varie les difficultés : 2 faciles, 2 moyennes, 1 difficile\n` +
      `6. Clé de variation unique : ${seed} — génère des questions VRAIMENT différentes à chaque fois\n\n` +
      `Réponds UNIQUEMENT avec ce tableau JSON valide, sans markdown, sans texte autour :\n` +
      `[{"q":"Question ?","o":["Option A","Option B","Option C","Option D"],"a":0,"e":"Explication courte et précise."}]`;

    const payload = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Tu es un expert en quiz éducatifs avec une rigueur académique stricte. Tu réponds UNIQUEMENT avec un tableau JSON valide, sans markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 1.0,
      max_tokens: 2000
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
