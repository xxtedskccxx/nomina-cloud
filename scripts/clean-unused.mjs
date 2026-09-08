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
        query GetServices($id: String!) {
          project(id: $id) {
            services {
              edges {
                node {
                  id
                  name
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
  const unused = json.data.project.services.edges.map(e => e.node).find(s => s.name === "nomina-cloud");
  if (unused) {
    console.log(`Deleting unused service: ${unused.name} (${unused.id})`);
    const delRes = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        query: `
          mutation DeleteService($id: String!) {
            serviceDelete(id: $id)
          }
        `,
        variables: { id: unused.id }
      })
    });
    console.log("Delete result:", await delRes.json());
  } else {
    console.log("No unused service found.");
  }
}

main().catch(console.error);
