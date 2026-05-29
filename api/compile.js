const REPO_OWNER = process.env.GITHUB_OWNER || 'Narek-D8v';
const REPO_NAME = process.env.GITHUB_REPO || 'arduino-web-compiler';
const REPO_BRANCH = process.env.GITHUB_BRANCH || 'main';

const ALLOWED_BOARDS = new Set(['uno', 'nano', 'mega', 'esp32', 'esp32-s3', 'esp32-c3']);
const MAX_CODE_BYTES = 300000;
const MAX_FILE_BYTES = 180000;
const MAX_FILES = 40;

function setCors(res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
}

function cleanFileName(name) {
    return String(name || '')
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/^\.+/, '')
        .slice(0, 64);
}

function cleanText(value, limit, fallback = '') {
    const text = String(value ?? fallback).replace(/\0/g, '').slice(0, limit);
    return text || fallback;
}

function cleanColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#00e676';
}

function cleanBoard(value) {
    const board = String(value || 'uno').trim();
    return ALLOWED_BOARDS.has(board) ? board : 'uno';
}

function cleanFqbn(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9:._=-]/g, '')
        .slice(0, 120);
}

function normalizeSmartWifi(raw, enabled) {
    if (!enabled || !raw || typeof raw !== 'object') return undefined;

    let apPass = cleanText(raw.apPass, 64, '');
    if (apPass && apPass.length < 8) apPass = '';

    const timeout = Number(raw.timeoutSeconds);
    const apSsid = cleanText(raw.apSsid, 48, 'ESP32-Setup').trim() || 'ESP32-Setup';
    const portalTitle = cleanText(raw.portalTitle, 64, 'ESP32 Wi-Fi Setup').trim() || 'ESP32 Wi-Fi Setup';
    return {
        enabled: true,
        apSsid,
        apPass,
        portalTitle,
        accent: cleanColor(raw.accent),
        timeoutSeconds: Number.isFinite(timeout) ? Math.min(60, Math.max(3, Math.round(timeout))) : 12
    };
}

async function githubJson(url, options) {
    const response = await fetch(url, options);
    if (response.ok) return response;
    const details = await response.text();
    const error = new Error(`GitHub API error: ${response.status}`);
    error.status = response.status;
    error.details = details;
    throw error;
}

module.exports = async (req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST.'
        });
    }

    try {
        const { code, files, secrets, board, fqbn, timestamp, features, smartWifi } = req.body || {};
        const cleanCode = cleanText(code, MAX_CODE_BYTES, '');

        if (!cleanCode.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Code is required in request body'
            });
        }

        const cleanFiles = Array.isArray(files)
            ? files.slice(0, MAX_FILES).map(file => ({
                name: cleanFileName(file && file.name),
                content: cleanText(file && file.content, MAX_FILE_BYTES, '')
            })).filter(file => file.name)
            : [];

        const cleanSecrets = secrets && typeof secrets === 'object' ? {
            WIFI_SSID: cleanText(secrets.WIFI_SSID, 512, ''),
            WIFI_PASS: cleanText(secrets.WIFI_PASS, 512, '')
        } : null;
        const dispatchSecrets = cleanSecrets && (cleanSecrets.WIFI_SSID || cleanSecrets.WIFI_PASS)
            ? cleanSecrets
            : undefined;

        const cleanBoardName = cleanBoard(board);
        const cleanFeatures = {
            smartWifi: Boolean((features && features.smartWifi) || (smartWifi && smartWifi.enabled)) && cleanBoardName.startsWith('esp32')
        };
        const cleanSmartWifi = normalizeSmartWifi(smartWifi, cleanFeatures.smartWifi);

        const githubToken = process.env.MY_GITHUB_TOKEN;
        if (!githubToken) {
            return res.status(500).json({
                success: false,
                error: 'GitHub token not configured on server'
            });
        }

        const requestId = `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const requestPath = `.compile-requests/${requestId}.json`;
        const requestBody = JSON.stringify({
            code: cleanCode,
            files: cleanFiles,
            features: cleanFeatures,
            smartWifi: cleanSmartWifi
        });

        const headers = {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Arduino-Web-Compiler'
        };

        await githubJson(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${requestPath}`,
            {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    message: `Compile request: ${timestamp || new Date().toISOString()}`,
                    content: Buffer.from(requestBody, 'utf8').toString('base64'),
                    branch: REPO_BRANCH
                })
            }
        );

        const dispatchResponse = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    event_type: 'compile_cmd',
                    client_payload: {
                        request_id: requestId,
                        project_path: requestPath,
                        board: cleanBoardName,
                        fqbn: cleanFqbn(fqbn),
                        timestamp: timestamp || new Date().toISOString(),
                        source: 'web-interface',
                        features: cleanFeatures,
                        secrets: dispatchSecrets
                    }
                })
            }
        );

        if (dispatchResponse.status === 204) {
            return res.status(200).json({
                success: true,
                message: 'Compilation triggered successfully',
                repository: `${REPO_OWNER}/${REPO_NAME}`,
                request_id: requestId,
                timestamp: new Date().toISOString()
            });
        }

        const errorText = await dispatchResponse.text();
        return res.status(dispatchResponse.status).json({
            success: false,
            error: `GitHub API error: ${dispatchResponse.status}`,
            details: errorText
        });

    } catch (error) {
        console.error('Compilation API Error:', error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.status ? error.message : 'Internal server error',
            details: error.details,
            message: error.message
        });
    }
};
