// Vercel Serverless Function for cancelling a GitHub Actions run.

const REPO_OWNER = process.env.GITHUB_OWNER || 'Narek-D8v';
const REPO_NAME = process.env.GITHUB_REPO || 'arduino-web-compiler';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
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
        const { run_id } = req.body || {};
        if (!run_id) {
            return res.status(400).json({
                success: false,
                error: 'run_id is required'
            });
        }

        const githubToken = process.env.MY_GITHUB_TOKEN;
        if (!githubToken) {
            return res.status(500).json({
                success: false,
                error: 'GitHub token not configured on server'
            });
        }

        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${run_id}/cancel`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Arduino-Web-Compiler'
                }
            }
        );

        if (response.status === 202 || response.status === 204) {
            return res.status(200).json({
                success: true,
                message: 'Build cancelled successfully'
            });
        }

        const errorText = await response.text();
        return res.status(response.status).json({
            success: false,
            error: `GitHub API error: ${response.status}`,
            details: errorText
        });

    } catch (error) {
        console.error('Cancel API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};
