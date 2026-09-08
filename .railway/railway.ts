import { defineRailway, github, postgres, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const nominaCloud = github("xxtedskccxx/nomina-cloud", { checkSuites: false });

  const Postgres = postgres("Postgres", { region: "iad" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "iad", sizeMB: 500 });
  const web = service("web", {
    source: nominaCloud,
    replicas: { "iad": 1 },
  });
  const api = service("api", {
    source: nominaCloud,
    replicas: { "iad": 1 },
  });

  return project("supportive-flow", {
    resources: [Postgres, web, api, postgresVolume],
  });
});
