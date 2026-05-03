// Vercel Serverless Function — загрузка библиотеки в GitHub репозиторий
// Принимает: { filename: "Animation.zip", content: "<base64>" }
// Пушит файл в /libraries/ ветки main

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    }

    try {
        const { filename, content } = req.body;

        if (!filename || !content) {
            return res.status(400).json({ success: false, error: 'filename and content (base64) are required' });
        }

        const githubToken = process.env.MY_GITHUB_TOKEN;
        if (!githubToken) {
            return res.status(500).json({ success: false, error: 'GitHub token not configured on server' });
        }

        const username = 'Narek-D8v';
        const repo     = 'arduino-web-compiler';
        const path     = `libraries/${filename}`;
        const apiUrl   = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
        const headers  = {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Arduino-Web-Compiler'
        };

        // Проверяем — файл уже существует? (нужен SHA для обновления)
        let sha = null;
        const checkRes = await fetch(apiUrl, { headers });
        if (checkRes.status === 200) {
            const existing = await checkRes.json();
            sha = existing.sha;
        }

        // Создаём или обновляем файл
        const body = {
            message: `Add library: ${filename}`,
            content: content,          // base64
            branch: 'main'
        };
        if (sha) body.sha = sha;       // обязательно при обновлении

        const uploadRes = await fetch(apiUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body)
        });

        if (uploadRes.status === 200 || uploadRes.status === 201) {
            return res.status(200).json({
                success: true,
                message: `Library "${filename}" uploaded to /libraries/`,
                updated: !!sha
            });
        } else {
            const err = await uploadRes.text();
            return res.status(uploadRes.status).json({
                success: false,
                error: `GitHub API error: ${uploadRes.status}`,
                details: err
            });
        }

    } catch (error) {
        console.error('Upload Library Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
};
