'use strict';
const https = require('https');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const code = (req.query?.code || req.body?.code || '').toUpperCase().trim();
  if (!code || code.length !== 6) return res.status(400).json({ error: 'Code invalide' });

  // GET: fetch duel data
  if (req.method === 'GET') {
    try {
      const result = await upstashCmd(['GET', `duel-${code}`]);
      if (!result.result) return res.status(404).json({ error: 'Duel introuvable ou expiré (24h max)' });
      const duel = JSON.parse(result.result);
      res.status(200).json({ duel });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // POST: save player score
  if (req.method === 'POST') {
    let { name, score, xp, correct, total } = req.body || {};
    name    = String(name || 'Joueur').replace(/[<>&"']/g, '').slice(0, 15).trim() || 'Joueur';
    score   = Math.min(Math.max(parseInt(score)   || 0, 0), 999999);
    xp      = Math.min(Math.max(parseInt(xp)      || 0, 0), 999999);
    correct = parseInt(correct) || 0;
    total   = parseInt(total)   || 5;

    try {
      const result = await upstashCmd(['GET', `duel-${code}`]);
      if (!result.result) return res.status(404).json({ error: 'Duel introuvable ou expiré' });

      const duel = JSON.parse(result.result);
      const pct  = Math.round(correct / total * 100);

      // Avoid duplicate entries for the same player
      const existing = duel.players.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
      const playerData = { name, score, xp, pct, date: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) };

      if (existing >= 0) duel.players[existing] = playerData;
      else duel.players.push(playerData);

      // Sort by score
      duel.players.sort((a, b) => b.score - a.score);

      await upstashCmd(['SET', `duel-${code}`, JSON.stringify(duel), 'EX', '86400']);

      res.status(200).json({ players: duel.players, winner: duel.players[0]?.name || null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Méthode non autorisée' });
};

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
