// scripts/generate-3d-contrib.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function fetchContributions(username, token) {
  const query = `
    query($userName:String!) {
      user(login: $userName) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      'https://api.github.com/graphql',
      { query, variables: { userName: username } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'github-actions-contrib-script'
        },
        timeout: 15000
      }
    );

    // Debug output to help CI logs
    console.log('GraphQL response keys:', Object.keys(response.data || {}));
    if (response.data && response.data.errors) {
      console.error('GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
    }

    return response.data;
  } catch (err) {
    console.error('Network or request error while fetching contributions:', err.message || err);
    throw err;
  }
}

function getColor(count) {
  if (count === 0) return '#0d1117';
  if (count < 5) return '#0e4429';
  if (count < 10) return '#006d32';
  if (count < 20) return '#26a641';
  if (count < 50) return '#39d353';
  return '#56d364';
}

function generate3DSvg(contributions, username) {
  // Validate structure
  if (!contributions || !contributions.data || !contributions.data.user || !contributions.data.user.contributionsCollection) {
    throw new Error('Invalid API response structure. Missing contributionsCollection.');
  }

  const calendar = contributions.data.user.contributionsCollection.contributionCalendar;
  if (!calendar || !Array.isArray(calendar.weeks)) {
    throw new Error('Invalid contributionCalendar structure or missing weeks array.');
  }

  const weeks = calendar.weeks;
  const totalContributions = calendar.totalContributions || 0;

  const width = 1200;
  const height = 400;
  const cellSize = 15;
  const spacing = 2;
  const startX = 50;
  const startY = 100;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      .animate { animation: pulse 2s infinite; }
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="#0d1117"/>
  <text x="${width / 2}" y="30" font-size="24" fill="#c9d1d9" text-anchor="middle" font-weight="bold">
    ${username}'s GitHub Contributions
  </text>
  <text x="${width / 2}" y="60" font-size="16" fill="#8b949e" text-anchor="middle">
    Total: ${totalContributions} contributions
  </text>
`;

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day, dayIndex) => {
      const color = getColor(day.contributionCount || 0);
      const animated = (day.contributionCount || 0) > 0 ? 'animate' : '';
      const x = startX + weekIndex * (cellSize + spacing);
      const y = startY + dayIndex * (cellSize + spacing);

      // Use data-* attributes for accessibility and debugging
      svg += `  <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="2" class="${animated}"
        data-date="${day.date}" data-count="${day.contributionCount}"/>\n`;
    });
  });

  svg += `</svg>\n`;
  return svg;
}

async function main() {
  const username = process.env.GITHUB_ACTOR;
  const token = process.env.GITHUB_TOKEN;

  if (!username) {
    console.error('GITHUB_ACTOR is not set. Aborting.');
    process.exit(1);
  }
  if (!token) {
    console.error('GITHUB_TOKEN is not set. Provide a PAT in the workflow as GH_PAT and map it to GITHUB_TOKEN.');
    process.exit(1);
  }

  console.log(`Generating 3D contribution visualization for ${username}...`);

  try {
    const contributions = await fetchContributions(username, token);

    // If GraphQL returned errors or no data, fail with helpful log
    if (!contributions || !contributions.data || !contributions.data.user) {
      console.error('No user data returned from GitHub GraphQL API. Full response:');
      console.error(JSON.stringify(contributions, null, 2));
      process.exit(1);
    }

    const svg = generate3DSvg(contributions, username);

    const dir = path.join(process.cwd(), 'profile-3d-contrib');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, 'profile-green-animate.svg');
    fs.writeFileSync(filePath, svg, 'utf8');
    console.log(`✓ SVG generated successfully at ${filePath}`);
  } catch (err) {
    console.error('Fatal error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
