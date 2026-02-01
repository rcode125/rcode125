const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function fetchContributions(username, token) {
  try {
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

    const response = await axios.post(
      'https://api.github.com/graphql',
      {
        query,
        variables: { userName: username }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching contributions:', error);
    throw error;
  }
}

function generate3DSvg(contributions, username) {
  const weeks = contributions.data.user.contributionCalendar.weeks;
  const totalContributions = contributions.data.user.contributionCalendar.totalContributions;

  // Define color scheme based on contribution count
  const getColor = (count) => {
    if (count === 0) return '#0d1117';
    if (count < 5) return '#0e4429';
    if (count < 10) return '#006d32';
    if (count < 20) return '#26a641';
    if (count < 50) return '#39d353';
    return '#56d364';
  };

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      .animate { animation: pulse 2s infinite; }
    </style>
  </defs>
  <rect width="1200" height="400" fill="#0d1117"/>
  <text x="600" y="30" font-size="24" fill="#c9d1d9" text-anchor="middle" font-weight="bold">
    ${username}'s GitHub Contributions
  </text>
  <text x="600" y="60" font-size="16" fill="#8b949e" text-anchor="middle">
    Total: ${totalContributions} contributions
  </text>
`;

  let x = 50;
  let y = 100;
  const cellSize = 15;
  const spacing = 2;

  weeks.forEach((week, weekIndex) => {
    if (weekIndex % 2 === 0) x = 50;
    
    week.contributionDays.forEach((day, dayIndex) => {
      const color = getColor(day.contributionCount);
      const isAnimated = day.contributionCount > 0 ? ' animate' : '';
      
      svg += `
  <rect x="${x + weekIndex * (cellSize + spacing)}" y="${y + dayIndex * (cellSize + spacing)}" 
        width="${cellSize}" height="${cellSize}" fill="${color}" rx="2"${isAnimated ? ` class="${isAnimated.trim()}"` : ''}
        title="${day.date}: ${day.contributionCount} contributions"/>
      `;
    });
  });

  svg += `\n</svg>`;
  return svg;
}

async function main() {
  const username = process.env.GITHUB_ACTOR;
  const token = process.env.GITHUB_TOKEN;

  console.log(`Generating 3D contribution visualization for ${username}...`);

  const contributions = await fetchContributions(username, token);
  const svg = generate3DSvg(contributions, username);

  // Ensure directory exists
  const dir = path.join(process.cwd(), 'profile-3d-contrib');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write SVG file
  const filePath = path.join(dir, 'profile-green-animate.svg');
  fs.writeFileSync(filePath, svg);
  console.log(`✓ SVG generated successfully at ${filePath}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
