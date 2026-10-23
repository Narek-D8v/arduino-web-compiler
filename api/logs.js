// Vercel Serverless Function for fetching GitHub Actions job logs.

const REPO_OWNER = process.env.GITHUB_OWNER || 'Narek-D8v';
const REPO_NAME = process.env.GITHUB_REPO || 'arduino-web-compiler';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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

    const { job_id, run_id } = req.query;
    if (!job_id && !run_id) {
        return res.status(400).json({
            success: false,
            error: 'job_id or run_id query parameter required'
        });
    }

    try {
        const githubToken = process.env.MY_GITHUB_TOKEN;
        if (!githubToken) {
            return res.status(500).json({
                success: false,
                error: 'GitHub token not configured on server'
            });
        }

        let url;
        if (job_id) {
            url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/jobs/${job_id}/logs`;
        } else {
            url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${run_id}/logs`;
        }

        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Arduino-Web-Compiler'
            }
        });

        if (response.status !== 200) {
            return res.status(response.status).json({
                success: false,
                error: `GitHub API error: ${response.status}`
            });
        }

        const text = await response.text();

        // Parse log text into structured error/warning entries
        const entries = [];
        const lines = text.split('\n');
        const errorPattern = /^(?:.*\/)?([^:]+):(\d+):(\d+):\s*(error|warning|fatal error):\s*(.+)$/mi;

        for (const line of lines) {
            const match = line.match(errorPattern);
            if (match) {
                entries.push({
                    file: match[1],
                    line: parseInt(match[2]),
                    column: parseInt(match[3]),
                    type: match[4] === 'fatal error' ? 'error' : match[4],
                    message: match[5],
                    raw: line.trim()
                });
            }
        }

        // If no structured errors, return last 50 lines as context
        const tail = entries.length === 0
            ? lines.slice(-50).join('\n')
            : '';

        // Parse Arduino CLI memory usage from logs
        let memory = null;
        const flashMatch = text.match(/Sketch uses (\d+) bytes \((\d+)%\) of program storage space\. Maximum is (\d+) bytes\./i);
        const ramMatch = text.match(/Global variables use (\d+) bytes \((\d+)%\) of dynamic memory, leaving (\d+) bytes for local variables\. Maximum is (\d+) bytes\./i);
        if (flashMatch || ramMatch) {
            memory = {};
            if (flashMatch) {
                memory.flash = {
                    used: parseInt(flashMatch[1], 10),
                    percent: parseInt(flashMatch[2], 10),
                    max: parseInt(flashMatch[3], 10)
                };
            }
            if (ramMatch) {
                memory.ram = {
                    used: parseInt(ramMatch[1], 10),
                    percent: parseInt(ramMatch[2], 10),
                    max: parseInt(ramMatch[4], 10)
                };
            }
        }

        return res.status(200).json({
            success: true,
            entries,
            tail,
            totalLines: lines.length,
            memory
        });

    } catch (error) {
        console.error('Logs API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};
