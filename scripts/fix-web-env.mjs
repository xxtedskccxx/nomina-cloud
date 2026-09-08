import fs from "node:fs";
import path from "node:path";
import os from "node:os";

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".railway", "config.json"), "utf-8"));
  const token = config.user?.token || config.user?.accessToken;
  const projectId = "8f0140dc-f057-4fb9-99be-c17d1ad99df2";
  const environmentId = "3284dcb0-8d4b-4c0b-96dd-24205f2dba58";
  const webServiceId = "631dd413-2ae5-4ccf-b078-5d80a74ce531";
  const apiDomain = "api-production-45a7.up.railway.app";

  async function setVar(name, value) {
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
            serviceId: webServiceId,
            name,
            value,
            skipDeploys: false
          }
        }
      })
    });
    console.log(`Set Web ${name}=${value}`);
  }

  await setVar("PORT", "3000");
  await setVar("HOSTNAME", "0.0.0.0");
  await setVar("NEXT_PUBLIC_API_URL", `https://${apiDomain}/api`);
}

main().catch(console.error);
