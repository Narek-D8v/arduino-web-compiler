// Vercel Serverless Function for reading GitHub Actions build status.

const username = process.env.GITHUB_OWNER || 'Narek-D8v';
const repo = process.env.GITHUB_REPO || 'arduino-web-compiler';
const workflowFile = 'compile.yml';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use GET.'
        });
    }

    try {
        const requestId = String(req.query.request_id || '').trim();
        if (!requestId) {
            return res.status(400).json({
                success: false,
                error: 'request_id is required'
            });
        }

        const githubToken = process.env.MY_GITHUB_TOKEN;
        if (!githubToken) {
            return res.status(500).json({
                success: false,
                error: 'GitHub token not configured on server'
            });
        }

        const headers = {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Arduino-Web-Compiler'
        };

        const runsUrl = `https://api.github.com/repos/${username}/${repo}/actions/workflows/${workflowFile}/runs?event=repository_dispatch&per_page=30`;
        const runsResponse = await fetch(runsUrl, { headers });
        if (!runsResponse.ok) {
            const details = await runsResponse.text();
            return res.status(runsResponse.status).json({
                success: false,
                error: `GitHub runs API error: ${runsResponse.status}`,
                details
            });
        }

        const runsData = await runsResponse.json();
        const run = (runsData.workflow_runs || []).find(item =>
            String(item.display_title || '').includes(requestId) ||
            String(item.name || '').includes(requestId)
        );

        if (!run) {
            return res.status(200).json({
                success: true,
                found: false,
                status: 'waiting',
                conclusion: null,
                message: 'Waiting for GitHub Actions run to appear'
            });
        }

        const jobsResponse = await fetch(run.jobs_url, { headers });
        let jobs = [];
        if (jobsResponse.ok) {
            const jobsData = await jobsResponse.json();
            jobs = (jobsData.jobs || []).map(job => ({
                name: job.name,
                status: job.status,
                conclusion: job.conclusion,
                html_url: job.html_url,
                steps: (job.steps || []).map(step => ({
                    name: step.name,
                    status: step.status,
                    conclusion: step.conclusion,
                    number: step.number
                }))
            }));
        }

        return res.status(200).json({
            success: true,
            found: true,
            request_id: requestId,
            run_id: run.id,
            status: run.status,
            conclusion: run.conclusion,
            html_url: run.html_url,
            created_at: run.created_at,
            updated_at: run.updated_at,
            jobs
        });
    } catch (error) {
        console.error('Status API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};
