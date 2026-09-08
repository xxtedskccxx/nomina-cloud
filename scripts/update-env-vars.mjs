import fs from "node:fs";
import path from "node:path";
import os from "node:os";

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".railway", "config.json"), "utf-8"));
  const token = config.user?.token || config.user?.accessToken;
  const projectId = "8f0140dc-f057-4fb9-99be-c17d1ad99df2";
  const environmentId = "3284dcb0-8d4b-4c0b-96dd-24205f2dba58";

  const apiServiceId = "76c78c53-922e-4d3d-9bb2-4b004f48a7a3";
  const webServiceId = "631dd413-2ae5-4ccf-b078-5d80a74ce531";

  const apiDomain = "api-production-45a7.up.railway.app";
  const webDomain = "web-production-8c100.up.railway.app";

  async function setVar(serviceId, name, value) {
    const res = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        query: `
          mutation SetVar($input: VariableUpsertInput!) {
            variableUpsert(input: $input)
          }
        `,
        variables: {
          input: {
            projectId,
            environmentId,
            serviceId,
            name,
            value,
            skipDeploys: false
          }
        }
      })
    });
    console.log(`Set ${name}=${value}`);
  }

  console.log("Setting required production variables for API...");
  await setVar(apiServiceId, "PAYSLIP_STORAGE_DRIVER", "local");
  await setVar(apiServiceId, "PAYSLIP_STORAGE_ROOT", "storage/payslips");
  await setVar(apiServiceId, "WEB_URL", `https://${webDomain}`);
  await setVar(apiServiceId, "BETTER_AUTH_URL", `https://${apiDomain}`);
  await setVar(apiServiceId, "BETTER_AUTH_SECRET", "nomina-cloud-secreto-2026-super-seguro-token-auth");
  await setVar(apiServiceId, "TRUST_PROXY_HOPS", "1");
  await setVar(apiServiceId, "PORT", "4000");
  await setVar(apiServiceId, "API_PORT", "4000");
  await setVar(apiServiceId, "SEED_ADMIN_ON_STARTUP", "true");

  console.log("Variables set! Waiting for API deployment to restart...");
}

main().catch(console.error);
