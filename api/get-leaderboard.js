'use strict';
const https = require('https');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const scores = await upstashGet('bq-leaderboard') || [];
    res.status(200).json({ scores });
  } catch (e) {
    res.status(200).json({ scores: [], error: e.message });
  }
};

function upstashGet(key) {
  return upstashCmd(['GET', key]).then(r => r.result ? JSON.parse(r.result) : null);
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
