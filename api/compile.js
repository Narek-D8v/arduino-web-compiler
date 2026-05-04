// Vercel Serverless Function для компиляции Arduino кода
// Переменная окружения MY_GITHUB_TOKEN должна быть настроена в Vercel Dashboard

module.exports = async (req, res) => {
    // Разрешаем CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Обработка preflight запроса
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Принимаем только POST запросы
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed. Use POST.' 
        });
    }

    try {
        // Получаем поля из тела запроса
        const { code, board, timestamp } = req.body;

        if (!code) {
            return res.status(400).json({ 
                success: false, 
                error: 'Code is required in request body' 
            });
        }

        // Проверяем наличие токена в переменных окружения
        const githubToken = process.env.MY_GITHUB_TOKEN;
        
        if (!githubToken) {
            return res.status(500).json({ 
                success: false, 
                error: 'GitHub token not configured on server' 
            });
        }

        // Данные репозитория
        const username = 'Narek-D8v';
        const repo = 'arduino-web-compiler';

        // Отправляем repository_dispatch запрос в GitHub
        const response = await fetch(
            `https://api.github.com/repos/${username}/${repo}/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Arduino-Web-Compiler'
                },
                body: JSON.stringify({
                    event_type: 'compile_cmd',
                    client_payload: {
                        code:      code,
                        board:     board || 'uno',
                        timestamp: timestamp || new Date().toISOString(),
                        source:    'web-interface'
                    }
                })
            }
        );

        // GitHub API возвращает 204 при успехе
        if (response.status === 204) {
            return res.status(200).json({ 
                success: true, 
                message: 'Compilation triggered successfully',
                repository: `${username}/${repo}`,
                timestamp: new Date().toISOString()
            });
        } else {
            const errorText = await response.text();
            return res.status(response.status).json({ 
                success: false, 
                error: `GitHub API error: ${response.status}`,
                details: errorText
            });
        }

    } catch (error) {
        console.error('Compilation API Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: error.message 
        });
    }
};
