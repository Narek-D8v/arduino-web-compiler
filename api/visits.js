// Vercel Serverless Function for counting unique website visitors.

const REPO_OWNER = process.env.GITHUB_OWNER || 'Narek-D8v';
const REPO_NAME = process.env.GITHUB_REPO || 'arduino-web-compiler';
const REPO_BRANCH = process.env.GITHUB_BRANCH || 'main';
const STATS_PATH = '.visitor-stats.json';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
}

function githubHeaders() {
    const githubToken = process.env.MY_GITHUB_TOKEN;
    if (!githubToken) throw new Error('GitHub token not configured on server');
    return {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Arduino-Web-Compiler'
    };
}

const crypto = require('crypto');

const BOT_PATTERN = /bot|crawler|spider|slurp|curl|wget|python|httpclient|fetch|axios|node|scrapy|headless/i;

function isBot(ua) {
    return BOT_PATTERN.test(String(ua || ''));
}

function getVisitorKey(req) {
    const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
    const realIp = String((req.headers && req.headers['x-real-ip']) || '').trim();
    const ip = forwarded || realIp;
    const ua = String((req.headers && req.headers['user-agent']) || '');
    if (isBot(ua)) return '';
    const raw = ip ? `${ip}|${ua}` : String((req.body && req.body.deviceId) || '').trim();
    if (!raw) return '';
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

async function readStats() {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${STATS_PATH}?ref=${encodeURIComponent(REPO_BRANCH)}`;
    const response = await fetch(url, { headers: githubHeaders() });

    if (response.status === 404) {
        return { sha: null, data: { total: 0, devices: [] } };
    }

    if (!response.ok) {
        const details = await response.text();
        const error = new Error(`GitHub API error: ${response.status}`);
        error.status = response.status;
        error.details = details;
        throw error;
    }

    const json = await response.json();
    let parsed = {};
    try {
        parsed = JSON.parse(Buffer.from(json.content || '', 'base64').toString('utf8'));
    } catch (e) {
        parsed = {};
    }

    const devices = Array.isArray(parsed.devices)
        ? parsed.devices.filter(item => typeof item === 'string').slice(-100000)
        : [];

    return {
        sha: json.sha,
        data: {
            total: Number.isFinite(parsed.total) ? Math.max(0, Math.round(parsed.total)) : devices.length,
            devices
        }
    };
}

async function writeStats(sha, data) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${STATS_PATH}`;
    const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
    const body = {
        message: 'Update visitor stats',
        content,
        branch: REPO_BRANCH
    };
    if (sha) body.sha = sha;

    const response = await fetch(url, {
        method: 'PUT',
        headers: githubHeaders(),
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const details = await response.text();
        const error = new Error(`GitHub API error: ${response.status}`);
        error.status = response.status;
        error.details = details;
        throw error;
    }

    const json = await response.json();
    return json.content && json.content.sha ? json.content.sha : sha;
}

module.exports = async (req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        if (req.method === 'GET') {
            const { data } = await readStats();
            return res.status(200).json({
                success: true,
                total: data.total || data.devices.length,
                unique: data.devices.length
            });
        }

        if (req.method !== 'POST') {
            return res.status(405).json({
                success: false,
                error: 'Method not allowed. Use GET or POST.'
            });
        }

        const deviceId = getVisitorKey(req);
        if (!deviceId) {
            const { data } = await readStats();
            return res.status(200).json({
                success: true,
                total: data.total || data.devices.length,
                unique: data.devices.length,
                newVisitor: false,
                bot: true
            });
        }

        let attempts = 0;
        while (attempts < 3) {
            attempts += 1;
            const { sha, data } = await readStats();
            const devices = data.devices.slice();
            let changed = false;

            if (!devices.includes(deviceId)) {
                devices.push(deviceId);
                changed = true;
            }

            const total = Math.max(data.total || 0, devices.length);
            const nextData = { total, devices };

            if (!changed) {
                return res.status(200).json({
                    success: true,
                    total,
                    unique: devices.length,
                    newVisitor: false
                });
            }

            try {
                await writeStats(sha, nextData);
                return res.status(200).json({
                    success: true,
                    total,
                    unique: devices.length,
                    newVisitor: true
                });
            } catch (error) {
                if (attempts >= 3 || error.status !== 409) throw error;
            }
        }
    } catch (error) {
        console.error('Visits API Error:', error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.status ? error.message : 'Internal server error',
            details: error.details,
            message: error.message
        });
    }
};
