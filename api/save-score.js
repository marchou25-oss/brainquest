'use strict';
const https = require('https');

const CAT_EMOJI = { culture:'🌍', maths:'🧮', francais:'✏️', sciences:'🔬', histoire:'📜', daily:'⚡' };

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  let { name, score, xp, cat, correct, total } = req.body || {};
  name  = String(name || 'Anonyme').replace(/[<>&"']/g, '').slice(0, 15).trim() || 'Anonyme';
  score = Math.min(Math.max(parseInt(score) || 0, 0), 999999);
  xp    = Math.min(Math.max(parseInt(xp)    || 0, 0), 999999);
  correct = parseInt(correct) || 0;
  total   = parseInt(total)   || 5;
  const ts = Date.now();

  try {
    let scores = await upstashGet('bq-leaderboard') || [];
    scores.push({
      name, score, xp,
      cat: CAT_EMOJI[cat] || '🎯',
      pct: Math.round(correct / total * 100),
      date: new Date().toLocaleDateString('fr-FR'),
      ts
    });
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 100);
    await upstashSet('bq-leaderboard', scores);
    const rank = scores.findIndex(s => s.ts === ts) + 1;
    res.status(200).json({ ok: true, rank });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

function upstashGet(key) {
  return upstashCmd(['GET', key]).then(r => r.result ? JSON.parse(r.result) : null);
}
function upstashSet(key, value) {
  return upstashCmd(['SET', key, JSON.stringify(value)]);
}
function upstashCmd(cmd) {
  return new Promise((resolve, reject) => {
    const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
    const payload = JSON.stringify(cmd);
    const options = {
      hostname: url.hostname, port: 443, path: '/', method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
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
