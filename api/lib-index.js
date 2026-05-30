// api/lib-index.js
// Прокси для Arduino Library Registry.
//
// Браузер не может напрямую запросить downloads.arduino.cc — тот блокирует
// запросы не со своих доменов (CORS). Этот файл запускается на Vercel как
// serverless-функция и проксирует запрос от имени сервера, добавляя нужные
// CORS-заголовки в ответ.
//
// URL: /api/lib-index
// Метод: GET
// Ответ: application/gzip  (~4 MB, кэшируется браузером/CDN на 24 часа)

const UPSTREAM_URL =
  'https://downloads.arduino.cc/libraries/library_index.json.gz';

const CACHE_TTL = 86400;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Use GET' });
  }

  try {
    const upstream = await fetch(UPSTREAM_URL);

    if (!upstream.ok) {
      throw new Error(`Upstream error ${upstream.status}`);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader(
      'Content-Type',
      'application/gzip'
    );

    res.setHeader(
      'Cache-Control',
      `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`
    );

    res.setHeader('Content-Length', buffer.length);

    res.status(200).send(buffer);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Failed to fetch library index',
      message: err.message
    });
  }
};
