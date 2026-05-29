const REPO_OWNER = process.env.GITHUB_OWNER || 'Narek-D8v';
const REPO_NAME = process.env.GITHUB_REPO || 'arduino-web-compiler';
const REPO_BRANCH = process.env.GITHUB_BRANCH || 'main';
const MAX_ZIP_BYTES = 12 * 1024 * 1024;

function setCors(res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
}

function cleanZipName(filename) {
    const clean = String(filename || '')
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/^\.+/, '')
        .slice(0, 80);
    return /\.zip$/i.test(clean) ? clean : '';
}

module.exports = async (req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    }

    try {
        const { filename, content } = req.body || {};
        const cleanFilename = cleanZipName(filename);

        if (!cleanFilename || !content) {
            return res.status(400).json({ success: false, error: 'valid .zip filename and content (base64) are required' });
        }

        const buffer = Buffer.from(String(content), 'base64');
        if (!buffer.length || buffer.length > MAX_ZIP_BYTES) {
            return res.status(400).json({ success: false, error: 'ZIP is empty or too large' });
        }

        if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
            return res.status(400).json({ success: false, error: 'Uploaded file is not a ZIP archive' });
        }

        const githubToken = process.env.MY_GITHUB_TOKEN;
        if (!githubToken) {
            return res.status(500).json({ success: false, error: 'GitHub token not configured on server' });
        }

        const path = `libraries/${cleanFilename}`;
        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
        const headers = {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Arduino-Web-Compiler'
        };

        let sha = null;
        const checkRes = await fetch(apiUrl, { headers });
        if (checkRes.status === 200) {
            const existing = await checkRes.json();
            sha = existing.sha;
        }

        const body = {
            message: `Add library: ${cleanFilename}`,
            content: buffer.toString('base64'),
            branch: REPO_BRANCH
        };
        if (sha) body.sha = sha;

        const uploadRes = await fetch(apiUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body)
        });

        if (uploadRes.status === 200 || uploadRes.status === 201) {
            return res.status(200).json({
                success: true,
                message: `Library "${cleanFilename}" uploaded to /libraries/`,
                filename: cleanFilename,
                updated: Boolean(sha)
            });
        }

        const details = await uploadRes.text();
        return res.status(uploadRes.status).json({
            success: false,
            error: `GitHub API error: ${uploadRes.status}`,
            details
        });

    } catch (error) {
        console.error('Upload Library Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
};
