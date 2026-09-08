/* global process */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

async function main() {
  const configPath = path.join(os.homedir(), ".railway", "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("Railway config not found");
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const token = config.user?.token || config.user?.accessToken;
  if (!token) {
    throw new Error("No Railway auth token found in config");
  }

  const projectId = "8f0140dc-f057-4fb9-99be-c17d1ad99df2";
  const environmentId = "3284dcb0-8d4b-4c0b-96dd-24205f2dba58";

  async function gql(query, variables = {}) {
    const res = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ query, variables })
    });
    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      console.warn("GraphQL notice/errors:", JSON.stringify(json.errors, null, 2));
    }
    return json.data;
  }

  console.log("1. Inspecting services in project supportive-flow...");
  const projectData = await gql(`
    query GetProject($id: String!) {
      project(id: $id) {
        services {
          edges {
            node {
              id
              name
              serviceInstances {
                edges {
                  node {
                    environmentId
                    domains {
                      serviceDomains {
                        domain
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `, { id: projectId });

  const services = projectData.project.services.edges.map(e => e.node);
  const apiService = services.find(s => s.name === "api");
  const webService = services.find(s => s.name === "web");

  if (!apiService || !webService) {
    throw new Error(`Could not find api or web service. Found: ${services.map(s => s.name).join(", ")}`);
  }

  console.log(`Found API Service: ${apiService.id}, Web Service: ${webService.id}`);

  console.log("2. Setting Dockerfile paths...");
  await gql(`
    mutation UpdateApi($envId: String, $sId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(environmentId: $envId, serviceId: $sId, input: $input)
    }
  `, {
    envId: environmentId,
    sId: apiService.id,
    input: { dockerfilePath: "apps/api/Dockerfile" }
  });
  console.log("API Dockerfile set to apps/api/Dockerfile");

  await gql(`
    mutation UpdateWeb($envId: String, $sId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(environmentId: $envId, serviceId: $sId, input: $input)
    }
  `, {
    envId: environmentId,
    sId: webService.id,
    input: { dockerfilePath: "apps/web/Dockerfile" }
  });
  console.log("Web Dockerfile set to apps/web/Dockerfile");

  console.log("3. Generating or retrieving public domains...");
  async function ensureDomain(service) {
    const inst = service.serviceInstances?.edges?.find(e => e.node.environmentId === environmentId)?.node;
    let domain = inst?.domains?.serviceDomains?.[0]?.domain;
    if (!domain) {
      const created = await gql(`
        mutation CreateDomain($input: ServiceDomainCreateInput!) {
          serviceDomainCreate(input: $input) {
            domain
          }
        }
      `, {
        input: {
          environmentId,
          serviceId: service.id
        }
      });
      domain = created?.serviceDomainCreate?.domain;
    }
    return domain;
  }

  let apiDomain = await ensureDomain(apiService);
  let webDomain = await ensureDomain(webService);

  console.log(`API Domain: https://${apiDomain}`);
  console.log(`Web Domain: https://${webDomain}`);

  console.log("4. Setting Environment Variables...");
  async function setVar(serviceId, name, value) {
    await gql(`
      mutation SetVar($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }
    `, {
      input: {
        projectId,
        environmentId,
        serviceId,
        name,
        value,
        skipDeploys: false
      }
    });
  }

  // API variables
  console.log("Setting API variables...");
  await setVar(apiService.id, "DATABASE_URL", "${{Postgres.DATABASE_URL}}");
  await setVar(apiService.id, "PORT", "4000");
  await setVar(apiService.id, "BETTER_AUTH_SECRET", "nomina-cloud-secreto-2026-super-seguro");
  await setVar(apiService.id, "CORS_ORIGIN", "*");
  await setVar(apiService.id, "SEED_ADMIN_ON_STARTUP", "true");
  await setVar(apiService.id, "BETTER_AUTH_URL", `https://${apiDomain}`);

  // Web variables
  console.log("Setting Web variables...");
  await setVar(webService.id, "NEXT_PUBLIC_API_URL", `https://${apiDomain}/api`);

  console.log("5. Triggering Deployments...");
  await gql(`
    mutation RedeployApi($envId: String!, $sId: String!) {
      serviceInstanceRedeploy(environmentId: $envId, serviceId: $sId)
    }
  `, {
    envId: environmentId,
    sId: apiService.id
  });

  await gql(`
    mutation RedeployWeb($envId: String!, $sId: String!) {
      serviceInstanceRedeploy(environmentId: $envId, serviceId: $sId)
    }
  `, {
    envId: environmentId,
    sId: webService.id
  });

  console.log("\n==========================================");
  console.log("DESPLIEGUE EN CURSO COMPLETAMENTE EXITOSO!");
  console.log(`Backend API: https://${apiDomain}`);
  console.log(`Frontend Web: https://${webDomain}`);
  console.log("==========================================\n");
}

main().catch(err => {
  console.error("Setup error:", err);
  process.exit(1);
});
