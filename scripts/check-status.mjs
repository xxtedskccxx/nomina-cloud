import fs from "node:fs";
import path from "node:path";
import os from "node:os";

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".railway", "config.json"), "utf-8"));
  const token = config.user?.token || config.user?.accessToken;
  const projectId = "8f0140dc-f057-4fb9-99be-c17d1ad99df2";

  const res = await fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        query GetDeployments($id: String!) {
          project(id: $id) {
            services {
              edges {
                node {
                  name
                  serviceInstances {
                    edges {
                      node {
                        latestDeployment {
                          id
                          status
                          createdAt
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: { id: projectId }
    })
  });

  const json = await res.json();
  for (const edge of json.data.project.services.edges) {
    const s = edge.node;
    const dep = s.serviceInstances.edges[0]?.node?.latestDeployment;
    console.log(`Service [${s.name}]: Status = ${dep?.status ?? "NONE"}, Created = ${dep?.createdAt ?? "N/A"}`);
  }
}

main().catch(console.error);
