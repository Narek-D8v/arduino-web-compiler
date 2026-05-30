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

const UPSTREAM_URL = 'https://downloads.arduino.cc/libraries/library_index.json.gz';

// Сколько секунд Vercel Edge Cache и браузер могут кэшировать ответ.
// 86400 = 24 часа. Индекс обновляется редко, поэтому это безопасно.
const CACHE_TTL = 86400;

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
    setCors(res);

    // Preflight-запрос браузера — отвечаем сразу
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed. Use GET.' });
    }

    try {
        // Запрашиваем индекс у Arduino — с нашего сервера это работает без ограничений
        const upstream = await fetch(UPSTREAM_URL, {
            headers: {
                // Представляемся как обычный браузер, чтобы не попасть под bot-фильтры
                'User-Agent': 'Mozilla/5.0 (compatible; ArduinoWebIDE/1.0)',
                'Accept-Encoding': 'gzip, deflate',
            }
        });

        if (!upstream.ok) {
            return res.status(502).json({
                error: `Upstream error: ${upstream.status} ${upstream.statusText}`
            });
        }

        const buffer = await upstream.arrayBuffer();

        // Говорим браузеру и Vercel CDN кэшировать ответ на 24 часа.
        // s-maxage — для CDN (Vercel Edge Cache), max-age — для браузера.
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`);
        res.setHeader('Content-Length', buffer.byteLength);

        res.status(200).send(Buffer.from(buffer));

    } catch (err) {
        console.error('lib-index proxy error:', err);
        res.status(500).json({
            error: 'Failed to fetch library index',
            message: err.message
        });
    }
};
