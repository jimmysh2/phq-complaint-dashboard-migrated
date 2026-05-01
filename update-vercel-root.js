const token = 'vca_6wXQgrg1EOgYaIwWLEg5zexwQsX0WpW03RVxrb1M67JDH7ULR31hYT1M';
const teamId = 'team_LFptVDR1sFKvC4p8MuAfN3CP';

const updateProject = async (name, rootDirectory) => {
  const res = await fetch(`https://api.vercel.com/v9/projects/${name}?teamId=${teamId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ rootDirectory })
  });
  const data = await res.json();
  console.log(`${name} updated rootDirectory to: ${data.rootDirectory}`);
};

updateProject('frontend', 'frontend');
updateProject('backend', 'backend');
